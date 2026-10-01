import type { CreativeHubStreamFrame, CreativeHubRunTerminal } from "@novelfoundry/shared/types/api";

export type CreativeHubStreamInterruptionReason = "eof" | "aborted" | "transport" | "protocol";

export class CreativeHubStreamInterruptedError extends Error {
  readonly reason: CreativeHubStreamInterruptionReason;

  constructor(reason: CreativeHubStreamInterruptionReason, options?: ErrorOptions) {
    super(reason === "aborted"
      ? "回复接收已停止，任务仍可能在执行。请刷新任务状态确认结果。"
      : "本轮回复连接中断，任务结果尚未确认。请刷新任务状态后再继续。", options);
    this.name = "CreativeHubStreamInterruptedError";
    this.reason = reason;
  }
}

class CreativeHubSseBuffer {
  private buffer = "";
  private dataLines: string[] = [];

  append(text: string, flush = false): string[] {
    this.buffer += text;
    const events: string[] = [];
    const dispatch = () => {
      const data = this.dataLines.join("\n");
      this.dataLines = [];
      if (data.trim()) events.push(data);
    };
    while (true) {
      const boundary = this.buffer.search(/[\r\n]/);
      if (boundary === -1) break;
      if (!flush && this.buffer[boundary] === "\r" && boundary === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, boundary);
      const width = this.buffer[boundary] === "\r" && this.buffer[boundary + 1] === "\n" ? 2 : 1;
      this.buffer = this.buffer.slice(boundary + width);
      if (!line) dispatch();
      else if (line.startsWith("data:")) this.dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    if (flush) {
      if (this.buffer.startsWith("data:")) this.dataLines.push(this.buffer.slice(5).replace(/^ /, ""));
      this.buffer = "";
      dispatch();
    }
    return events;
  }
}

function parseFrame(rawData: string): CreativeHubStreamFrame {
  const parsed: unknown = JSON.parse(rawData);
  if (!parsed || typeof parsed !== "object" || !("event" in parsed) || typeof parsed.event !== "string" || !("data" in parsed)) {
    throw new CreativeHubStreamInterruptedError("protocol");
  }
  return parsed as CreativeHubStreamFrame;
}

function validateTerminal(terminal: CreativeHubRunTerminal, threadId: string, runId: string | null): void {
  if (!terminal || terminal.threadId !== threadId
    || !["completed", "waiting_approval", "failed", "cancelled"].includes(terminal.status)
    || (runId && terminal.runId !== runId)) {
    throw new CreativeHubStreamInterruptedError("protocol");
  }
  if (terminal.status === "completed" || terminal.status === "waiting_approval") {
    if (typeof terminal.runId !== "string" || !terminal.runId.trim()
      || typeof terminal.checkpointId !== "string" || !terminal.checkpointId.trim()) {
      throw new CreativeHubStreamInterruptedError("protocol");
    }
  }
}

export async function* readCreativeHubStream(
  body: ReadableStream<Uint8Array>,
  threadId: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<CreativeHubStreamFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const buffer = new CreativeHubSseBuffer();
  let exhausted = false;
  let observedRunId: string | null = null;
  let cancelPromise: Promise<void> | undefined;
  const cancelReader = () => cancelPromise ??= reader.cancel().then(() => undefined, () => undefined);
  const onAbort = () => { void cancelReader(); };
  abortSignal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (abortSignal?.aborted) throw new CreativeHubStreamInterruptedError("aborted");
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        throw new CreativeHubStreamInterruptedError(abortSignal?.aborted ? "aborted" : "transport", { cause: error });
      }
      if (abortSignal?.aborted) throw new CreativeHubStreamInterruptedError("aborted");
      exhausted = chunk.done;
      let rawFrames: string[];
      try {
        rawFrames = buffer.append(chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true }), chunk.done);
      } catch (error) {
        throw new CreativeHubStreamInterruptedError("protocol", { cause: error });
      }
      for (const rawFrame of rawFrames) {
        let frame: CreativeHubStreamFrame;
        try {
          frame = parseFrame(rawFrame);
        } catch (error) {
          throw new CreativeHubStreamInterruptedError("protocol", { cause: error });
        }
        if (frame.event === "creative_hub/run_status" && typeof frame.data.runId === "string") {
          observedRunId ??= frame.data.runId;
        }
        if (frame.event === "creative_hub/run_terminal") {
          validateTerminal(frame.data, threadId, observedRunId);
          yield frame;
          return;
        }
        yield frame;
        if (frame.event === "creative_hub/error" || frame.event === "error") return;
      }
      if (chunk.done) throw new CreativeHubStreamInterruptedError("eof");
    }
  } finally {
    abortSignal?.removeEventListener("abort", onAbort);
    if (!exhausted) await cancelReader();
    else if (cancelPromise) await cancelPromise;
    reader.releaseLock();
  }
}
