import type { LlmLiveEvent, LlmLiveSessionSnapshot, LlmLiveStreamFrame } from "@novelfoundry/shared/types/llmLive";

const MAX_PREVIEW_CHARS = 16_000;

export function updateSession(
  current: LlmLiveSessionSnapshot | undefined,
  event: LlmLiveEvent,
): LlmLiveSessionSnapshot | null {
  if (current && event.seq <= current.seq) {
    return current;
  }
  if (event.type === "session_started") {
    return {
      context: event.context,
      seq: event.seq,
      phase: "requesting",
      phaseMessage: "正在连接模型",
      preview: "",
      totalChars: 0,
      reasoning: "",
      totalReasoningChars: 0,
      firstResponseAt: null,
      tokenUsage: null,
      startedAt: event.at,
      updatedAt: event.at,
      completedAt: null,
    };
  }
  if (!current) {
    return null;
  }
  if (event.type === "output_delta") {
    const preview = current.preview + event.content;
    return {
      ...current,
      seq: event.seq,
      phase: current.phase === "requesting" ? "streaming" : current.phase,
      phaseMessage: current.phase === "requesting" ? "模型正在返回内容" : current.phaseMessage,
      preview: preview.length > MAX_PREVIEW_CHARS ? preview.slice(-MAX_PREVIEW_CHARS) : preview,
      totalChars: event.totalChars,
      firstResponseAt: current.firstResponseAt ?? event.at,
      updatedAt: event.at,
    };
  }
  if (event.type === "reasoning_delta") {
    return {
      ...current,
      seq: event.seq,
      phase: current.phase === "requesting" ? "streaming" : current.phase,
      phaseMessage: current.phase === "requesting" ? "模型正在思考" : current.phaseMessage,
      reasoning: current.reasoning + event.content,
      totalReasoningChars: event.totalReasoningChars,
      firstResponseAt: current.firstResponseAt ?? event.at,
      updatedAt: event.at,
    };
  }
  if (event.type === "usage_updated") {
    return {
      ...current,
      seq: event.seq,
      tokenUsage: event.tokenUsage,
      updatedAt: event.at,
    };
  }
  if (event.type === "phase_changed") {
    return {
      ...current,
      seq: event.seq,
      phase: event.phase,
      phaseMessage: event.message,
      updatedAt: event.at,
      completedAt: event.phase === "completed" || event.phase === "failed" || event.phase === "cancelled"
        ? event.at
        : null,
    };
  }
  if (event.type === "session_completed") {
    return {
      ...current,
      seq: event.seq,
      phase: "completed",
      phaseMessage: "模型结果已准备完成",
      totalChars: event.totalChars,
      updatedAt: event.at,
      completedAt: event.at,
    };
  }
  return {
    ...current,
    seq: event.seq,
    phase: "failed",
    phaseMessage: event.message,
    updatedAt: event.at,
    completedAt: event.at,
  };
}

export function mergeLlmLiveFrames(
  previous: Record<string, LlmLiveSessionSnapshot>,
  frames: LlmLiveStreamFrame[],
  hiddenIds: Set<string>,
): Record<string, LlmLiveSessionSnapshot> {
  const next = { ...previous };
  for (const frame of frames) {
    if (frame.type === "snapshot") {
      for (const session of frame.sessions) {
        const id = session.context.interactionId;
        if (!hiddenIds.has(id) && (!next[id] || next[id].seq < session.seq)) next[id] = session;
      }
    } else if (frame.type === "event") {
      const event = frame.event;
      const id = event.type === "session_started" ? event.context.interactionId : event.interactionId;
      if (hiddenIds.has(id)) continue;
      const updated = updateSession(next[id], event);
      if (updated) next[id] = updated;
    }
  }
  const terminal = Object.values(next)
    .filter((session) => ["completed", "failed", "cancelled"].includes(session.phase))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const session of terminal.slice(30)) delete next[session.context.interactionId];
  return next;
}
