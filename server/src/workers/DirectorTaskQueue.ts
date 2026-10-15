import { prisma } from "../db/prisma";
import { CommandLeaseAuthority, runWithCommandAuthority } from "../services/novel/director/commands/leases";
import os from "node:os";
import { DirectorCommandService } from "../services/novel/director/commands/DirectorCommandService";
import { resourceClassForCommand } from "../services/novel/director/commands/DirectorCommandServiceHelpers";
import { taskDispatcher } from "./TaskDispatcher";

const ACTIVE_COMMAND_STATUSES = ["leased", "running"] as const;

function resolveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveDefaultSlots(): number {
  return Math.max(4, os.cpus().length);
}

class ResourceGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.limit <= 0) return;
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const grant = () => { signal?.removeEventListener("abort", cancel); resolve(); };
      const cancel = () => {
        const index = this.waiters.indexOf(grant);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(signal?.reason);
      };
      this.waiters.push(grant);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }

  release(): void {
    if (this.limit <= 0) return;
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) {
      this.active += 1;
      next();
    }
  }
}

const PER_NOVEL_RESOURCE_LIMITS: Record<string, number> = {
  planner: 2,
  writer: 2,
  repair: 2,
  state_resolution: 2,
};

export interface DirectorTaskQueueOptions {
  workerId?: string;
  leaseMs?: number;
  staleScanMs?: number;
  executionSlots?: number;
  pollMs?: number;
}

export interface LeasedTask {
  command: NonNullable<Awaited<ReturnType<DirectorCommandService["leaseNextCommand"]>>>;
}

export class DirectorTaskQueue {
  readonly workerId: string;
  readonly leaseMs: number;
  readonly staleScanMs: number;
  readonly executionSlots: number;
  readonly pollMs: number;

  private readonly gates = new Map<string, ResourceGate>();
  private readonly commandService: DirectorCommandService;
  private lastStaleScan = 0;

  constructor(
    options: DirectorTaskQueueOptions = {},
    commandService = new DirectorCommandService(),
  ) {
    this.workerId = options.workerId
      ?? process.env.DIRECTOR_WORKER_ID?.trim()
      ?? `director-worker-${os.hostname()}-${process.pid}`;
    this.leaseMs = resolveNumberEnv("DIRECTOR_WORKER_LEASE_MS", options.leaseMs ?? 120_000);
    this.staleScanMs = resolveNumberEnv("DIRECTOR_WORKER_STALE_SCAN_MS", options.staleScanMs ?? 30_000);
    this.executionSlots = resolveNumberEnv("DIRECTOR_WORKER_EXECUTION_SLOTS", options.executionSlots ?? resolveDefaultSlots());
    this.pollMs = resolveNumberEnv("DIRECTOR_WORKER_POLL_MS", options.pollMs ?? 5_000);
    this.commandService = commandService;
  }

  async leaseNext(slotId: string): Promise<LeasedTask | null> {
    await this.maybeScanStale();
    const command = await this.commandService.leaseNextCommand({
      workerId: `${this.workerId}:${slotId}`,
      leaseMs: this.leaseMs,
    });
    return command ? { command } : null;
  }

  async acquireResourceGate(novelId: string | null | undefined, commandType: string, signal?: AbortSignal): Promise<void> {
    const resourceClass = resourceClassForCommand(commandType);
    const key = `${novelId?.trim() || "_global"}:${resourceClass}`;
    let gate = this.gates.get(key);
    if (!gate) {
      const envName = `DIRECTOR_WORKER_RESOURCE_${resourceClass.toUpperCase()}_LIMIT`;
      gate = new ResourceGate(resolveNumberEnv(envName, PER_NOVEL_RESOURCE_LIMITS[resourceClass] ?? 2));
      this.gates.set(key, gate);
    }
    await gate.acquire(signal);
  }

  releaseResourceGate(novelId: string | null | undefined, commandType: string): void {
    const resourceClass = resourceClassForCommand(commandType);
    const key = `${novelId?.trim() || "_global"}:${resourceClass}`;
    this.gates.get(key)?.release();
  }

  startLeaseRenewal(command: LeasedTask["command"], slotId: string): { authority: CommandLeaseAuthority; stop: () => void } {
    const owner = `${this.workerId}:${slotId}`;
    const authority = new CommandLeaseAuthority({ commandId: command.id, owner, attempt: command.attempt }, command.leaseExpiresAt ?? 0);
    if (command.leaseOwner !== owner || !Number.isInteger(command.attempt)) authority.revoke();
    let stopped = false;
    let renewing = false;
    const renew = async () => {
      if (stopped || renewing || authority.signal.aborted) return;
      renewing = true;
      const requestedAt = Date.now();
      try {
        authority.assertLive();
        const renewed = await this.commandService.renewLease(command.id, owner, this.leaseMs, command.attempt);
        if (!renewed) authority.revoke();
        else if (!stopped) authority.confirmRenewal(requestedAt + this.leaseMs);
      } catch (error) {
        // Keep the last confirmed deadline; exceptions never grant extra time.
        console.warn(`[task-queue] failed to renew command lease commandId=${command.id}`, error);
      } finally { renewing = false; }
    };
    void renew();
    const timer = setInterval(() => void renew(), Math.max(10, Math.floor(this.leaseMs / 3)));
    return { authority, stop: () => { stopped = true; clearInterval(timer); authority.revoke(); } };
  }

  async markRunning(commandId: string, slotId: string, authority: CommandLeaseAuthority): Promise<void> {
    authority.assertLive();
    await this.commandService.markCommandRunning(commandId, `${this.workerId}:${slotId}`, this.leaseMs, authority.identity.attempt);
    authority.assertLive();
  }

  async completeTask(commandId: string, slotId: string, authority: CommandLeaseAuthority): Promise<void> {
    await runWithCommandAuthority(authority, () => prisma.$transaction(async () => {
      await this.commandService.markCommandSucceeded(commandId, `${this.workerId}:${slotId}`, authority.identity.attempt);
    }));
    const command = await this.commandService.getCommandById(commandId);
    taskDispatcher.notify({ taskId: command?.taskId });
  }

  async cancelTask(commandId: string, slotId: string, authority: CommandLeaseAuthority): Promise<void> {
    await runWithCommandAuthority(authority, () => prisma.$transaction(async () => {
      await this.commandService.markCommandCancelled(commandId, `${this.workerId}:${slotId}`, authority.identity.attempt);
    }));
  }

  async failTask(commandId: string, slotId: string, error: unknown, authority: CommandLeaseAuthority): Promise<void> {
    await runWithCommandAuthority(authority, () => prisma.$transaction(async () => {
      await this.commandService.markCommandFailed(commandId, `${this.workerId}:${slotId}`, error, authority.identity.attempt);
    }));
  }

  async waitForWork(): Promise<void> {
    await taskDispatcher.waitForSignal(this.pollMs);
  }

  private async maybeScanStale(): Promise<void> {
    const now = Date.now();
    if (now - this.lastStaleScan < this.staleScanMs) {
      return;
    }
    this.lastStaleScan = now;
    const recovered = await this.commandService.recoverStaleLeases(new Date());
    if (recovered > 0) {
      taskDispatcher.notify();
    }
  }
}
