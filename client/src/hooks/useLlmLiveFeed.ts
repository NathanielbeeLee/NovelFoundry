import { mergeLlmLiveFrames } from "@/lib/llmLive";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LlmLiveSessionSnapshot,
  LlmLiveStreamFrame,
} from "@novelfoundry/shared/types/llmLive";
import { API_BASE_URL } from "@/lib/constants";
import {
  clearLlmLiveCache,
  llmLiveCacheKey,
  loadLlmLiveCache,
  saveLlmLiveCache,
} from "@/lib/storage/llmLiveCache";

const RECONNECT_DELAY_MS = 2_000;

export function useLlmLiveFeed(input: {
  taskId?: string | null;
  enabled?: boolean;
}) {
  const [sessionsById, setSessionsById] = useState<Record<string, LlmLiveSessionSnapshot>>({});
  const [connected, setConnected] = useState(false);
  const pendingFramesRef = useRef<LlmLiveStreamFrame[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenSessionIdsRef = useRef(new Set<string>());
  const cacheKey = llmLiveCacheKey(input.taskId);
  const cacheGenerationRef = useRef(0);
  const cacheReadyRef = useRef<string | null>(null);

  useEffect(() => {
    const taskId = input.taskId?.trim();
    cacheReadyRef.current = null;
    hiddenSessionIdsRef.current = new Set();
    const generation = ++cacheGenerationRef.current;
    if (input.enabled === false) {
      setSessionsById({});
      setConnected(false);
      return;
    }

    const controller = new AbortController();
    setSessionsById({});
    void loadLlmLiveCache(cacheKey).then((cachedSessions) => {
      if (controller.signal.aborted) {
        return;
      }
      cacheReadyRef.current = cacheKey;
      if (generation !== cacheGenerationRef.current) {
        for (const session of cachedSessions) hiddenSessionIdsRef.current.add(session.context.interactionId);
        return;
      }
      setSessionsById((current) => mergeLlmLiveFrames(
        current,
        [{ type: "snapshot", sessions: cachedSessions }],
        hiddenSessionIdsRef.current,
      ));
    }).catch(() => {
      if (!controller.signal.aborted) cacheReadyRef.current = cacheKey;
    });
    const flush = () => {
      flushTimerRef.current = null;
      const frames = pendingFramesRef.current.splice(0);
      if (frames.length === 0) {
        return;
      }
      setSessionsById((previous) => mergeLlmLiveFrames(previous, frames, hiddenSessionIdsRef.current));
    };
    const enqueue = (frame: LlmLiveStreamFrame) => {
      if (controller.signal.aborted) return;
      if (frame.type === "ping") {
        return;
      }
      pendingFramesRef.current.push(frame);
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flush, 80);
      }
    };

    const connect = async () => {
      while (!controller.signal.aborted) {
        try {
          const streamUrl = taskId
            ? API_BASE_URL + "/llm-live/stream?taskId=" + encodeURIComponent(taskId)
            : API_BASE_URL + "/llm-live/stream";
          const response = await fetch(
            streamUrl,
            { signal: controller.signal },
          );
          if (!response.ok || !response.body) {
            throw new Error("生成实况连接失败");
          }
          if (controller.signal.aborted) break;
          setConnected(true);
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          try {
            while (!controller.signal.aborted) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const frames = buffer.split("\n\n");
              buffer = frames.pop() ?? "";
              for (const rawFrame of frames) {
                const dataLine = rawFrame.split("\n").find((line) => line.startsWith("data: "));
                if (!dataLine) {
                  continue;
                }
                enqueue(JSON.parse(dataLine.slice(6)) as LlmLiveStreamFrame);
              }
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
        } catch {
          // 断线后由下方统一重连。
        } finally {
          if (!controller.signal.aborted) {
            setConnected(false);
          }
        }
        if (!controller.signal.aborted) {
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              controller.signal.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(finish, RECONNECT_DELAY_MS);
            controller.signal.addEventListener("abort", finish, { once: true });
          });
        }
      }
    };

    void connect();
    return () => {
      controller.abort();
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingFramesRef.current = [];
      setConnected(false);
    };
  }, [cacheKey, input.enabled, input.taskId]);

  useEffect(() => {
    if (cacheReadyRef.current !== cacheKey) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveLlmLiveCache(cacheKey, Object.values(sessionsById)).catch(() => undefined);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [cacheKey, sessionsById]);

  const sessions = useMemo(
    () => Object.values(sessionsById).sort((left, right) => left.startedAt.localeCompare(right.startedAt)),
    [sessionsById],
  );
  const clearSessions = () => {
    cacheGenerationRef.current += 1;
    pendingFramesRef.current = [];
    void clearLlmLiveCache(cacheKey).catch(() => undefined);
    setSessionsById((previous) => {
      for (const interactionId of Object.keys(previous)) {
        hiddenSessionIdsRef.current.add(interactionId);
      }
      return {};
    });
  };
  return {
    connected,
    sessions,
    latestSession: sessions[sessions.length - 1] ?? null,
    clearSessions,
  };
}
