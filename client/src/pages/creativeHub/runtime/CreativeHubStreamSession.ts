import type { LangChainMessage } from "@assistant-ui/react-langgraph";
import type { AgentRunStatus } from "@novelfoundry/shared/types/agent";
import type { CreativeHubRunTerminal, CreativeHubStreamFrame } from "@novelfoundry/shared/types/api";
import type { CreativeHubThreadStatus } from "@novelfoundry/shared/types/creativeHub";

export interface CreativeHubRefreshedRun {
  id: string;
  status: AgentRunStatus;
  error?: string | null;
}

export interface CreativeHubStateRefreshResult {
  run: CreativeHubRefreshedRun | null;
  hasActiveRun: boolean;
}

export interface CreativeHubRuntimeLoadedState {
  messages: LangChainMessage[];
  checkpointId?: string | null;
  latestRunId?: string | null;
  threadStatus?: CreativeHubThreadStatus;
}

export type CreativeHubRunOutcome =
  | { status: "completed"; terminal: CreativeHubRunTerminal }
  | { status: "waiting_approval"; terminal: CreativeHubRunTerminal }
  | { status: "failed"; message: string; terminal?: CreativeHubRunTerminal }
  | { status: "cancelled"; message: string; terminal?: CreativeHubRunTerminal }
  | { status: "unknown"; message: string };

export function mergeCreativeHubObservedMessages(
  persisted: LangChainMessage[],
  observed: LangChainMessage[],
  preferObserved: (message: LangChainMessage) => boolean = () => false,
): LangChainMessage[] {
  const merged = persisted.slice();
  for (const message of observed) {
    const matchingIndex = merged.findIndex((item) => message.id && item.id
      ? item.id === message.id
      : JSON.stringify(item) === JSON.stringify(message));
    if (matchingIndex === -1) merged.push(message);
    else if (preferObserved(message)) merged[matchingIndex] = message;
  }
  return merged;
}

export class CreativeHubStreamSession {
  readonly threadId: string;
  readonly sessionId: number;
  readonly initialCheckpointId: string | null;
  runId: string | null = null;
  outcome: CreativeHubRunOutcome | null = null;
  private observedMessages: LangChainMessage[];
  private readonly initialMessageIds: Set<string | undefined>;

  constructor(
    threadId: string,
    sessionId: number,
    initialCheckpointId: string | null,
    initialMessages: LangChainMessage[],
  ) {
    this.threadId = threadId;
    this.sessionId = sessionId;
    this.initialCheckpointId = initialCheckpointId;
    this.observedMessages = initialMessages.slice();
    this.initialMessageIds = new Set(initialMessages.map((message) => message.id));
  }

  isCurrent(sessionId: number, threadId: string): boolean {
    return this.sessionId === sessionId && this.threadId === threadId;
  }

  observeMessages(messages: LangChainMessage[]): void {
    for (const message of messages) {
      const index = message.id ? this.observedMessages.findIndex((item) => item.id === message.id) : -1;
      if (index === -1) this.observedMessages.push(message);
      else this.observedMessages[index] = message;
    }
  }

  accept(frame: CreativeHubStreamFrame, currentSessionId: number, currentThreadId: string): boolean {
    if (!this.isCurrent(currentSessionId, currentThreadId)) return false;
    if (frame.event === "creative_hub/run_status" && frame.data.runId) this.runId = frame.data.runId;
    if (frame.event === "messages/partial" || frame.event === "messages/complete") {
      this.observeMessages(frame.data as unknown as LangChainMessage[]);
    }
    if (frame.event === "creative_hub/run_terminal") {
      this.runId = frame.data.runId;
      const status = frame.data.status;
      this.outcome = status === "completed" || status === "waiting_approval"
        ? { status, terminal: frame.data }
        : { status, terminal: frame.data, message: frame.data.message || (status === "failed" ? "本轮任务执行失败，请查看任务状态。" : "本轮任务已取消，请查看保存结果。") };
    }
    if (frame.event === "creative_hub/error" || frame.event === "error") {
      this.outcome ??= { status: "failed", message: frame.data.message };
    }
    return true;
  }

  fail(error: unknown): void {
    if (this.outcome) return;
    const aborted = error instanceof Error && (error.name === "AbortError" || "reason" in error && error.reason === "aborted");
    this.outcome = {
      status: "unknown",
      message: aborted
        ? "回复接收已停止，任务仍可能在执行。请刷新任务状态确认结果。"
        : "本轮任务结果尚未确认。请先刷新任务状态，查看保存结果后再继续。",
    };
  }

  finish(): CreativeHubRunOutcome {
    if (!this.outcome) this.fail(undefined);
    return this.outcome!;
  }

  reconcile(state: CreativeHubRuntimeLoadedState, refreshed: CreativeHubStateRefreshResult): {
    messages: LangChainMessage[];
    blocked: boolean;
    outcome: CreativeHubRunOutcome;
  } {
    this.runId ??= refreshed.run?.id ?? null;
    const run = refreshed.run;
    const matchingCheckpoint = this.runId && run?.id === this.runId && state.latestRunId === this.runId
      && state.checkpointId && state.checkpointId !== this.initialCheckpointId;
    if (this.outcome?.status === "unknown" && matchingCheckpoint && run) {
      if (run.status === "succeeded" && state.threadStatus === "idle"
        || run.status === "waiting_approval" && state.threadStatus === "interrupted") {
        const status = run.status === "succeeded" ? "completed" : "waiting_approval";
        this.outcome = { status, terminal: { threadId: this.threadId, runId: this.runId!, checkpointId: state.checkpointId!, status } };
      }
    }
    if (this.outcome?.status === "unknown" && run?.id === this.runId && run && (run.status === "failed" || run.status === "cancelled")) {
      this.outcome = {
        status: run.status,
        message: run.error || (run.status === "failed" ? "本轮任务执行失败，请查看任务状态后再继续。" : "本轮任务已取消，请查看保存结果后再继续。"),
      };
    }
    const outcome = this.finish();
    const hasSavedTerminal = outcome.status === "completed" || outcome.status === "waiting_approval";
    const persistedIds = new Set(state.messages.map((message) => message.id));
    const isUnconfirmedReply = (message: LangChainMessage) => !matchingCheckpoint && !hasSavedTerminal
      && message.type === "ai" && !this.initialMessageIds.has(message.id);
    const messages = mergeCreativeHubObservedMessages(state.messages, this.observedMessages, isUnconfirmedReply).map((message) => {
      if (outcome.status !== "completed" && outcome.status !== "waiting_approval" && message.type === "ai"
        && !this.initialMessageIds.has(message.id) && (isUnconfirmedReply(message) || !persistedIds.has(message.id))) {
        return { ...message, status: { type: "incomplete" as const, reason: "error" as const, error: { message: outcome.message } } };
      }
      return message;
    });
    // A successful agent action can precede checkpoint persistence. It cannot
    // unlock a disconnected turn until the matching saved result is available.
    const missingSuccessfulCheckpoint = !hasSavedTerminal && run?.status === "succeeded"
      && (!matchingCheckpoint || state.threadStatus !== "idle");
    const persistedApproval = run?.status === "waiting_approval" && state.latestRunId === run.id
      && state.threadStatus === "interrupted" && Boolean(state.checkpointId);
    const blocked = refreshed.hasActiveRun && !persistedApproval
      || missingSuccessfulCheckpoint;
    const reportedOutcome = missingSuccessfulCheckpoint && (outcome.status === "failed" || outcome.status === "cancelled")
      ? { ...outcome, message: `${outcome.message} 部分操作可能已保存，请刷新任务状态确认结果。` }
      : outcome;
    return { messages, blocked: Boolean(blocked), outcome: reportedOutcome };
  }
}
