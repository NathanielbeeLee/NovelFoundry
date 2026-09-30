import type { Response } from "express";
import type { BaseMessageChunk } from "@langchain/core/messages";
import type { SSEFrame } from "@novelfoundry/shared/types/api";

export type WritableSSEFrame = Extract<
  SSEFrame,
  {
    type:
    | "chunk"
    | "done"
    | "error"
    | "ping"
    | "reasoning"
    | "runtime_package"
    | "tool_call"
    | "tool_result"
    | "approval_required"
    | "approval_resolved"
    | "run_status";
  }
>;

export interface StreamDonePayload {
  fullContent?: string;
  frames?: WritableSSEFrame[];
}

export interface StreamDoneHelpers {
  signal?: AbortSignal;
  writeFrame: (payload: WritableSSEFrame) => void;
}

export function writeSSEFrame(res: Response, payload: WritableSSEFrame): void {
  if (res.writableEnded) {
    return;
  }
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeChunkContent(content: BaseMessageChunk["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part === "object" && part && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }

  return "";
}

export function initSSE(res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    writeSSEFrame(res, { type: "ping" });
  }, 15000);

  return () => clearInterval(heartbeat);
}

export async function streamToSSE(
  res: Response,
  stream: AsyncIterable<BaseMessageChunk>,
  onDone?: (
    fullContent: string,
    helpers: StreamDoneHelpers,
  ) => void | StreamDonePayload | Promise<void | StreamDonePayload>,
): Promise<void> {
  let disposeHeartbeat = () => {};
  let fullContent = "";
  let disconnected = false;
  const controller = new AbortController();
  const iterator = stream[Symbol.asyncIterator]();
  let rejectDisconnected!: (reason: Error) => void;
  const disconnectedPromise = new Promise<never>((_resolve, reject) => { rejectDisconnected = reject; });
  void disconnectedPromise.catch(() => undefined);
  const cancelSource = () => {
    const cancel = (stream as AsyncIterable<BaseMessageChunk> & { cancel?: () => void | Promise<void> }).cancel;
    if (cancel) void Promise.resolve(cancel()).catch(() => undefined);
    void iterator.return?.().catch(() => undefined);
  };
  const onClose = () => {
    if (res.writableEnded) return;
    disconnected = true;
    const error = new Error("Chapter stream connection closed.");
    error.name = "AbortError";
    controller.abort(error);
    cancelSource();
    rejectDisconnected(error);
  };
  if (res.destroyed || res.writableEnded) {
    cancelSource();
    return;
  }
  disposeHeartbeat = initSSE(res);
  res.once("close", onClose);

  try {
    while (true) {
      const next = await Promise.race([iterator.next(), disconnectedPromise]);
      if (next.done) break;
      const chunk = next.value;
      if (res.destroyed || res.writableEnded || disconnected) {
        cancelSource();
        return;
      }
      const text = normalizeChunkContent(chunk.content);
      if (!text) {
        continue;
      }
      fullContent += text;
      writeSSEFrame(res, { type: "chunk", content: text });
    }

    if (disconnected) return;
    const donePayload = await onDone?.(fullContent, {
      signal: controller.signal,
      writeFrame: (payload) => writeSSEFrame(res, payload),
    });
    if (disconnected) return;
    if (donePayload?.frames?.length) {
      for (const frame of donePayload.frames) {
        writeSSEFrame(res, frame);
      }
    }
    if (donePayload?.fullContent) {
      fullContent = donePayload.fullContent;
    }
    writeSSEFrame(res, { type: "done", fullContent });
  } catch (error) {
    if (!disconnected) writeSSEFrame(res, {
      type: "error",
      error: error instanceof Error ? error.message : "流式输出失败。",
    });
  } finally {
    res.removeListener("close", onClose);
    disposeHeartbeat();
    if (!res.writableEnded) {
      res.end();
    }
  }
}
