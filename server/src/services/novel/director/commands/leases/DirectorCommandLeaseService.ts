import { runWithExecutionWriteScope } from "../../../../../platform/db";
import { CommandLeaseLostError } from "./domain/CommandLeaseAuthority";
import { commandLeasePredicate } from "./infrastructure/commandWriteScope";
import crypto from "node:crypto";
import { prisma } from "../../../../../db/prisma";
import { taskDispatcher } from "../../../../../workers/TaskDispatcher";
import { NovelWorkflowService } from "../../../workflow/NovelWorkflowService";
import { parsePayload, resolveNumberEnv } from "../DirectorCommandServiceHelpers";

const DEFAULT_STALE_AUTO_RECOVERY_MAX_ATTEMPTS = 2;
const STALE_COMMAND_AUTO_RECOVERY_MESSAGE = "后台执行中断，系统已自动从最近进度继续。";
const STALE_COMMAND_MANUAL_RECOVERY_MESSAGE = "后台执行中断，任务已暂停。点击恢复后会从最近进度继续。";
const STALE_COMMAND_INTERNAL_MESSAGE = "Director Worker 租约过期，任务等待恢复。";
const CANCELLED_COMMAND_MESSAGE = "自动导演任务已取消。";

function isAutoRecoverableStaleCommand(command: {
  commandType: string;
  attempt: number;
  payloadJson?: string | null;
}): boolean {
  const defaultMaxAttempts = resolveNumberEnv(
    "DIRECTOR_WORKER_STALE_AUTO_RECOVERY_MAX_ATTEMPTS",
    DEFAULT_STALE_AUTO_RECOVERY_MAX_ATTEMPTS,
  );
  const payload = parsePayload(command.payloadJson ?? null);
  const payloadRunMode = payload.confirmRequest?.runMode ?? payload.takeoverRequest?.runMode ?? null;
  const isFullBookAutopilot = payloadRunMode === "full_book_autopilot";
  const maxAttempts = isFullBookAutopilot
    ? resolveNumberEnv(
      "DIRECTOR_WORKER_FULL_BOOK_STALE_AUTO_RECOVERY_MAX_ATTEMPTS",
      Math.max(defaultMaxAttempts, 5),
    )
    : defaultMaxAttempts;
  return command.attempt < maxAttempts
    && (
      isFullBookAutopilot
      || command.commandType === "continue"
      || command.commandType === "resume_from_checkpoint"
    );
}

export class DirectorCommandLeaseService {
  constructor(private readonly workflowService: NovelWorkflowService) {}

  async recoverStaleLeases(now = new Date(), options: {
    taskId?: string;
  } = {}): Promise<number> {
    const staleCommands = await prisma.directorRunCommand.findMany({
      where: {
        ...(options.taskId ? { taskId: options.taskId } : {}),
        status: { in: ["leased", "running"] },
        leaseExpiresAt: { lt: now },
      },
      select: {
        id: true,
        taskId: true,
        commandType: true,
        attempt: true,
        payloadJson: true,
        task: { select: { pendingManualRecovery: true } },
      },
    });
    if (staleCommands.length === 0) {
      return 0;
    }
    let recovered = 0;
    for (const command of staleCommands) {
      const auto = !command.task.pendingManualRecovery && isAutoRecoverableStaleCommand(command);
      const superseded = new Error("Stale command snapshot was superseded.");
      try {
        await runWithExecutionWriteScope({
          signal: new AbortController().signal,
          assertLive() {},
          async lock(tx) {
            const updated = await tx.directorRunCommand.updateMany({
              where: {
                id: command.id, attempt: command.attempt,
                status: { in: ["leased", "running"] }, leaseExpiresAt: { lt: now },
                task: { pendingManualRecovery: command.task.pendingManualRecovery },
              },
              data: auto ? {
                status: "queued", leaseOwner: null, leaseExpiresAt: null, runAfter: now,
                startedAt: null, finishedAt: null, errorMessage: STALE_COMMAND_AUTO_RECOVERY_MESSAGE,
              } : { status: "stale", finishedAt: now, errorMessage: STALE_COMMAND_INTERNAL_MESSAGE },
            });
            if (updated.count !== 1) throw superseded;
          },
        }, () => prisma.$transaction(async (tx) => {
          if (auto) {
            await tx.novelWorkflowTask.updateMany({
              where: { id: command.taskId, pendingManualRecovery: false },
              data: { status: "queued", pendingManualRecovery: false, lastError: null, heartbeatAt: now, finishedAt: null },
            });
          } else {
            await tx.directorStepRun.updateMany({
              where: { taskId: command.taskId, status: "running" },
              data: { status: "failed", finishedAt: now, error: STALE_COMMAND_INTERNAL_MESSAGE },
            });
            await this.workflowService.requeueTaskForRecovery(command.taskId, STALE_COMMAND_MANUAL_RECOVERY_MESSAGE);
          }
        }));
        recovered += 1;
      } catch (error) {
        if (error !== superseded) throw error;
      }
    }
    if (recovered) taskDispatcher.notify();
    return recovered;
  }

  async leaseNextCommand(input: {
    workerId: string;
    leaseMs: number;
  }) {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
    const candidate = await prisma.directorRunCommand.findFirst({
      where: {
        status: "queued",
        runAfter: { lte: now },
        task: { pendingManualRecovery: false },
      },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) {
      return null;
    }
    const claimed = await prisma.directorRunCommand.updateMany({
      where: {
        id: candidate.id,
        attempt: candidate.attempt,
        status: "queued",
        task: { pendingManualRecovery: false },
      },
      data: {
        status: "leased",
        leaseOwner: input.workerId,
        leaseExpiresAt,
        attempt: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      return null;
    }
    return { ...candidate, status: "leased", leaseOwner: input.workerId, leaseExpiresAt, attempt: candidate.attempt + 1 };
  }

  async markCommandRunning(commandId: string, workerId: string, leaseMs: number, attempt: number) {
    const now = new Date();
    const updated = await prisma.directorRunCommand.updateMany({
      where: {
        ...commandLeasePredicate({ commandId, owner: workerId, attempt }),
      },
      data: {
        status: "running",
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
      },
    });
    if (updated.count !== 1) throw new CommandLeaseLostError({ commandId, owner: workerId, attempt });
  }

  async renewLease(commandId: string, workerId: string, leaseMs: number, attempt: number): Promise<boolean> {
    const updated = await prisma.directorRunCommand.updateMany({
      where: {
        ...commandLeasePredicate({ commandId, owner: workerId, attempt }),
      },
      data: {
        leaseExpiresAt: new Date(Date.now() + leaseMs),
      },
    });
    return updated.count === 1;
  }

  async markCommandSucceeded(commandId: string, workerId: string, attempt: number): Promise<void> {
    await prisma.directorRunCommand.updateMany({
      where: {
        ...commandLeasePredicate({ commandId, owner: workerId, attempt }),
      },
      data: {
        status: "succeeded",
        leaseExpiresAt: null,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  async markCommandCancelled(commandId: string, workerId: string, attempt: number): Promise<void> {
    const finishedAt = new Date();
    const updated = await prisma.directorRunCommand.updateMany({
      where: {
        ...commandLeasePredicate({ commandId, owner: workerId, attempt }),
      },
      data: {
        status: "cancelled",
        leaseExpiresAt: null,
        finishedAt,
        errorMessage: CANCELLED_COMMAND_MESSAGE,
      },
    });
    if (updated.count !== 1) {
      return;
    }
    const command = await prisma.directorRunCommand.findUnique({ where: { id: commandId } });
    if (command) {
      await this.closeCancelledTaskRuntimeState(command.taskId, finishedAt);
    }
  }

  async markCommandFailed(commandId: string, workerId: string, error: unknown, attempt: number): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date();
    const updated = await prisma.directorRunCommand.updateMany({
      where: {
        ...commandLeasePredicate({ commandId, owner: workerId, attempt }),
      },
      data: {
        status: "failed",
        leaseExpiresAt: null,
        finishedAt: failedAt,
        errorMessage: message,
      },
    });
    if (updated.count !== 1) {
      return;
    }
    const command = await prisma.directorRunCommand.findUnique({ where: { id: commandId } });
    if (!command) {
      return;
    }
    await prisma.directorStepRun.updateMany({
      where: {
        taskId: command.taskId,
        status: "running",
      },
      data: {
        status: "failed",
        finishedAt: failedAt,
        error: message,
      },
    });
    await this.workflowService.requeueTaskForRecovery(command.taskId, message);
  }

  async closeCancelledTaskRuntimeState(taskId: string, now: Date): Promise<void> {
    await prisma.directorStepRun.updateMany({
      where: {
        taskId,
        status: "running",
      },
      data: {
        status: "failed",
        finishedAt: now,
        error: CANCELLED_COMMAND_MESSAGE,
      },
    });
    await prisma.generationJob.updateMany({
      where: {
        status: { in: ["queued", "running"] },
        payload: { contains: taskId },
      },
      data: {
        status: "cancelled",
        cancelRequestedAt: now,
        finishedAt: now,
        error: CANCELLED_COMMAND_MESSAGE,
      },
    });
    const run = await prisma.directorRun.findUnique({
      where: { taskId },
      select: { id: true, novelId: true },
    });
    if (!run) {
      return;
    }
    await prisma.directorEvent.create({
      data: {
        id: `${taskId}:run_cancelled:${crypto.randomUUID()}`,
        runId: run.id,
        taskId,
        novelId: run.novelId,
        type: "run_cancelled",
        summary: "自动导演已停止，后台运行状态已收束。",
        severity: "low",
        occurredAt: now,
      },
    });
  }

}
