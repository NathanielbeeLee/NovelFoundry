import { useEffect, useMemo, useRef, useState } from "react";
import {
  getExternalStoreMessages,
  useExternalMessageConverter,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import {
  appendLangChainChunk,
  convertLangChainMessages,
  useLangGraphMessages,
  type LangChainMessage,
  type LangGraphInterruptState,
  type LangGraphStreamCallback,
} from "@assistant-ui/react-langgraph";
import type { FailureDiagnostic } from "@novelfoundry/shared/types/agent";
import type {
  CreativeHubInterrupt,
  CreativeHubMessage,
  CreativeHubResourceBinding,
  CreativeHubThreadStatus,
  CreativeHubTurnSummary,
} from "@novelfoundry/shared/types/creativeHub";
import type { CreativeHubStreamFrame } from "@novelfoundry/shared/types/api";
import { toast } from "@/components/ui/toast";
import { streamCreativeHubRun } from "@/api/creativeHub";
import {
  buildInlineStateMessages,
  buildRunArtifactMessages,
  createRunArtifactEvent,
  type CreativeHubRunArtifacts,
  mergeDisplayMessages,
} from "../lib/creativeHubSyntheticMessages";
import { CreativeHubStreamSession, type CreativeHubStateRefreshResult } from "../runtime";

type RunSettings = {
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number;
};

interface LoadThreadResult {
  messages: LangChainMessage[];
  interrupts?: CreativeHubInterrupt[];
  checkpointId?: string | null;
  latestRunId?: string | null;
  threadStatus?: CreativeHubThreadStatus;
  latestTurnSummary?: import("@novelfoundry/shared/types/creativeHub").CreativeHubTurnSummary | null;
}

interface UseCreativeHubRuntimeOptions {
  threadId: string;
  resourceBindings: CreativeHubResourceBinding;
  runSettings: RunSettings;
  loadThread: (threadId: string) => Promise<LoadThreadResult>;
  getCheckpointId?: (threadId: string, parentMessages: LangChainMessage[]) => Promise<string | null>;
  onEvent?: (event: CreativeHubStreamFrame) => void;
  onCheckpointChange?: (checkpointId: string | null) => void;
  onRefreshState?: (runId: string | null) => Promise<CreativeHubStateRefreshResult>;
  diagnostics?: FailureDiagnostic;
  defaultRuntimeDetailsCollapsed: boolean;
}

function toLangGraphInterrupt(interrupt?: CreativeHubInterrupt | null): LangGraphInterruptState | undefined {
  if (!interrupt) return undefined;
  return {
    value: interrupt,
    resumable: interrupt.resumable ?? true,
    when: "during",
    ns: interrupt.id ? [interrupt.id] : undefined,
  };
}

function getMessageContent(msg: any): string | Array<Record<string, unknown>> {
  const parts = [
    ...msg.content,
    ...(msg.attachments?.flatMap((item: any) => item.content) ?? []),
  ];
  const normalized = parts.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    if (part.type === "image") {
      return { type: "image_url", image_url: { url: part.image } };
    }
    return {
      type: "file",
      data: part.data,
      mime_type: part.mimeType,
      metadata: {
        filename: part.filename ?? "file",
      },
      source_type: "base64",
    };
  });
  if (normalized.length === 1 && normalized[0]?.type === "text") {
    return normalized[0].text as string;
  }
  return normalized;
}

function truncateLangChainMessages(threadMessages: any[], parentId: string | null) {
  if (parentId === null) return [] as LangChainMessage[];
  const parentIndex = threadMessages.findIndex((message: any) => message.id === parentId);
  if (parentIndex === -1) return [] as LangChainMessage[];
  const truncated: LangChainMessage[] = [];
  for (let index = 0; index <= parentIndex && index < threadMessages.length; index += 1) {
    truncated.push(...(getExternalStoreMessages(threadMessages[index]) as LangChainMessage[]));
  }
  return truncated;
}

function toCreativeHubMessages(messages: LangChainMessage[]): CreativeHubMessage[] {
  return messages as unknown as CreativeHubMessage[];
}

function normalizeStreamFrame(frame: CreativeHubStreamFrame) {
  if (frame.event === "messages/partial" || frame.event === "messages/complete") {
    return {
      event: frame.event,
      data: frame.data as unknown as LangChainMessage[],
    };
  }
  if (frame.event === "creative_hub/error" || frame.event === "error") {
    return {
      // The library's generic error event marks the last AI message, which may
      // belong to a previous turn. This run owns its notice and reconciliation.
      event: "creative_hub/error" as const,
      data: frame.data,
    };
  }
  return frame;
}

async function requireCheckpointIdForBranch(
  threadId: string,
  parentMessages: LangChainMessage[],
  getCheckpointId?: (threadId: string, parentMessages: LangChainMessage[]) => Promise<string | null>,
): Promise<string | null> {
  if (!getCheckpointId) {
    return null;
  }
  const checkpointId = await getCheckpointId(threadId, parentMessages);
  if (checkpointId || parentMessages.length === 0) {
    return checkpointId;
  }
  const message = "未能匹配到对应的历史检查点，当前消息无法生成新分支。";
  toast.error(message);
  throw new Error(message);
}

export function useCreativeHubRuntime({
  threadId,
  resourceBindings,
  runSettings,
  loadThread,
  getCheckpointId,
  onEvent,
  onCheckpointChange,
  onRefreshState,
  diagnostics,
  defaultRuntimeDetailsCollapsed,
}: UseCreativeHubRuntimeOptions) {
  const checkpointRef = useRef<string | null>(null);
  const streamSessionRef = useRef(0);
  const latestThreadIdRef = useRef(threadId);
  const currentRunIdRef = useRef<string | null>(null);
  const debugEntrySeqRef = useRef(0);
  const sendInFlightRef = useRef(false);
  const activeStreamRef = useRef<CreativeHubStreamSession | null>(null);
  const refreshInFlightRef = useRef(false);
  const [runProblem, setRunProblem] = useState<{ threadId: string; sessionId: number; message: string; blocked: boolean } | null>(null);
  const [isRefreshingRun, setIsRefreshingRun] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runArtifacts, setRunArtifacts] = useState<CreativeHubRunArtifacts[]>([]);
  const [loadedThreadId, setLoadedThreadId] = useState("");
  const [threadLoadFailure, setThreadLoadFailure] = useState<{
    threadId: string;
    message: string;
  } | null>(null);
  const [threadLoadRevision, setThreadLoadRevision] = useState(0);
  const isThreadReady = threadId.trim().length > 0;
  const isCurrentThreadLoaded = isThreadReady && loadedThreadId === threadId;
  const threadLoadError = threadLoadFailure?.threadId === threadId
    ? threadLoadFailure.message
    : null;

  latestThreadIdRef.current = threadId;

  const updateRunArtifacts = (
    runId: string,
    updater: (existing: CreativeHubRunArtifacts | undefined) => CreativeHubRunArtifacts,
  ) => {
    setRunArtifacts((previous) => {
      const index = previous.findIndex((item) => item.runId === runId);
      if (index === -1) {
        return [...previous, updater(undefined)];
      }
      const next = previous.slice();
      next[index] = updater(previous[index]);
      return next;
    });
  };

  const stream = useMemo<LangGraphStreamCallback<LangChainMessage>>(
    () =>
      async function* streamCallback(messages, config) {
        if (!isThreadReady) {
          throw new Error("创作中枢线程尚未初始化。");
        }
        const streamSessionId = streamSessionRef.current;
        const streamThreadId = threadId;
        const session = activeStreamRef.current;
        if (!session?.isCurrent(streamSessionId, streamThreadId)) return;
        session.observeMessages(messages);
        const streamGenerator = streamCreativeHubRun(
          threadId,
          {
            messages: toCreativeHubMessages(messages),
            checkpointId: config.checkpointId ?? checkpointRef.current,
            resourceBindings,
            provider: runSettings.provider,
            model: runSettings.model,
            temperature: runSettings.temperature,
            maxTokens: runSettings.maxTokens,
          },
          config.abortSignal,
        );

        try {
          for await (const frame of streamGenerator) {
            if (streamSessionId !== streamSessionRef.current || streamThreadId !== latestThreadIdRef.current) {
              break;
            }
            if (!session.accept(frame, streamSessionRef.current, latestThreadIdRef.current)) break;
            if (frame.event === "creative_hub/run_status" && frame.data.runId) {
              currentRunIdRef.current = frame.data.runId;
            }
            if (frame.event === "creative_hub/turn_summary") {
              currentRunIdRef.current = frame.data.runId;
              updateRunArtifacts(frame.data.runId, (existing) => ({
                runId: frame.data.runId,
                debugEntries: existing?.debugEntries ?? [],
                turnSummary: frame.data,
              }));
            }
            const runArtifactEvent = createRunArtifactEvent(frame, currentRunIdRef.current, debugEntrySeqRef.current + 1);
            if (runArtifactEvent) {
              debugEntrySeqRef.current += 1;
              updateRunArtifacts(runArtifactEvent.runId, (existing) => ({
                runId: runArtifactEvent.runId,
                turnSummary: existing?.turnSummary,
                debugEntries: [...(existing?.debugEntries ?? []), runArtifactEvent.entry].slice(-16),
              }));
            }
            onEvent?.(frame);
            if (frame.event === "metadata" && typeof frame.data === "object" && frame.data && "checkpointId" in frame.data) {
              const nextCheckpointId = typeof frame.data.checkpointId === "string"
                ? frame.data.checkpointId
                : null;
              checkpointRef.current = nextCheckpointId;
              onCheckpointChange?.(nextCheckpointId);
            }
            yield normalizeStreamFrame(frame);
          }
        } catch (error) {
          session.fail(error);
          throw error;
        } finally {
          session.finish();
        }
      },
    [isThreadReady, onCheckpointChange, onEvent, resourceBindings, runSettings.maxTokens, runSettings.model, runSettings.provider, runSettings.temperature, threadId],
  );

  const {
    interrupt,
    messages,
    messageMetadata,
    sendMessage,
    cancel,
    setInterrupt,
    setMessages,
  } = useLangGraphMessages<LangChainMessage>({
    appendMessage: appendLangChainChunk,
    stream,
    eventHandlers: {
      onCustomEvent: async (type, data) => {
        if (type === "creative_hub/interrupt") {
          const nextInterrupt = data as CreativeHubInterrupt;
          setInterrupt(toLangGraphInterrupt(nextInterrupt));
        }
        if (type === "creative_hub/approval_resolved") {
          setInterrupt(undefined);
        }
      },
      onMetadata: async (metadata) => {
        if (typeof metadata === "object" && metadata && "checkpointId" in metadata) {
          const nextCheckpointId = typeof metadata.checkpointId === "string"
            ? metadata.checkpointId
            : null;
          checkpointRef.current = nextCheckpointId;
          onCheckpointChange?.(nextCheckpointId);
        }
      },
      onError: async () => {
        setInterrupt((prev) => prev);
      },
    },
  });

  const currentInterrupt = isCurrentThreadLoaded ? interrupt : undefined;
  const currentMessages = useMemo(
    () => (isCurrentThreadLoaded ? messages : []),
    [isCurrentThreadLoaded, messages],
  );
  const currentRunArtifacts = useMemo(
    () => (isCurrentThreadLoaded ? runArtifacts : []),
    [isCurrentThreadLoaded, runArtifacts],
  );
  const currentRunProblem = runProblem?.threadId === threadId && runProblem.sessionId === streamSessionRef.current ? runProblem : null;

  const refreshRunResult = async (session = activeStreamRef.current) => {
    if (!session?.isCurrent(streamSessionRef.current, latestThreadIdRef.current) || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setIsRefreshingRun(true);
    try {
      if (!onRefreshState) throw new Error("请刷新当前任务状态后再继续。");
      const refreshed = await onRefreshState(session.runId);
      const state = await loadThread(session.threadId);
      if (!session.isCurrent(streamSessionRef.current, latestThreadIdRef.current)) return;
      const result = session.reconcile(state, refreshed);
      setMessages(result.messages);
      checkpointRef.current = state.checkpointId ?? null;
      onCheckpointChange?.(state.checkpointId ?? null);
      setInterrupt(toLangGraphInterrupt(state.interrupts?.[0] ?? null));
      if (state.latestTurnSummary?.runId === session.runId) {
        updateRunArtifacts(state.latestTurnSummary.runId, (existing) => ({
          runId: state.latestTurnSummary!.runId,
          turnSummary: state.latestTurnSummary!,
          debugEntries: existing?.debugEntries ?? [],
        }));
      }
      setRunProblem(result.outcome.status === "completed" || result.outcome.status === "waiting_approval" ? null : {
        threadId: session.threadId, sessionId: session.sessionId, message: result.outcome.message, blocked: result.blocked,
      });
    } catch {
      if (!session.isCurrent(streamSessionRef.current, latestThreadIdRef.current)) return;
      const outcome = session.finish();
      setRunProblem({
        threadId: session.threadId, sessionId: session.sessionId, blocked: true,
        message: outcome.status === "completed" || outcome.status === "waiting_approval"
          ? "本轮回复已保存，任务状态读取失败。请刷新任务状态。"
          : `${outcome.message} 任务状态读取失败，请再次刷新。`,
      });
    } finally {
      if (session.isCurrent(streamSessionRef.current, latestThreadIdRef.current)) {
        refreshInFlightRef.current = false;
        setIsRefreshingRun(false);
      }
    }
  };

  const inlineStateMessages = useMemo(
    () => buildInlineStateMessages(currentInterrupt?.value as CreativeHubInterrupt | undefined, diagnostics),
    [currentInterrupt?.value, diagnostics],
  );
  const runArtifactMessages = useMemo(
    () => buildRunArtifactMessages(currentRunArtifacts, defaultRuntimeDetailsCollapsed),
    [currentRunArtifacts, defaultRuntimeDetailsCollapsed],
  );

  const displayMessages = useMemo(
    () => mergeDisplayMessages(currentMessages, inlineStateMessages, runArtifactMessages),
    [currentMessages, inlineStateMessages, runArtifactMessages],
  );

  const threadMessages = useExternalMessageConverter({
    callback: convertLangChainMessages,
    messages: displayMessages,
    isRunning,
  });
  const baseThreadMessages = useExternalMessageConverter({
    callback: convertLangChainMessages,
    messages: currentMessages,
    isRunning,
  });
  const threadMessagesRef = useRef(baseThreadMessages);
  threadMessagesRef.current = baseThreadMessages;

  const handleSend = async (nextMessages: LangChainMessage[], config: { checkpointId?: string | null; runConfig?: unknown }) => {
    if (sendInFlightRef.current || !isCurrentThreadLoaded || currentRunProblem?.blocked) {
      return;
    }
    const sendSessionId = ++streamSessionRef.current;
    const sendThreadId = threadId;
    if (sendThreadId !== latestThreadIdRef.current) {
      return;
    }
    const session = new CreativeHubStreamSession(sendThreadId, sendSessionId, checkpointRef.current, currentMessages);
    activeStreamRef.current = session;
    try {
      sendInFlightRef.current = true;
      setRunProblem(null);
      setRunArtifacts([]);
      currentRunIdRef.current = null;
      debugEntrySeqRef.current = 0;
      setIsRunning(true);
      await sendMessage(nextMessages, {
        ...(config.checkpointId ? { checkpointId: config.checkpointId } : {}),
        ...(config.runConfig ? { runConfig: config.runConfig } : {}),
      });
    } catch (error) {
      session.fail(error);
    } finally {
      if (sendSessionId === streamSessionRef.current && sendThreadId === latestThreadIdRef.current) {
        const outcome = session.finish();
        if (outcome.status === "completed" || outcome.status === "waiting_approval") {
          try { await onRefreshState?.(session.runId); } catch { /* A read failure cannot undo a saved terminal. */ }
        } else {
          setRunProblem({ threadId: sendThreadId, sessionId: sendSessionId, message: outcome.message, blocked: true });
          await refreshRunResult(session);
        }
        if (!session.isCurrent(streamSessionRef.current, latestThreadIdRef.current)) return;
        sendInFlightRef.current = false;
        setIsRunning(false);
      }
    }
  };

  const sendPrompt = async (prompt: string) => {
    const content = prompt.trim();
    if (!content) {
      return;
    }
    return handleSend([
      {
        type: "human",
        content: content as any,
      },
    ], {});
  };

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages: threadMessages,
    onNew: async (msg) => {
      return handleSend([
        {
          type: "human",
          content: getMessageContent(msg) as any,
        },
      ], {
        runConfig: msg.runConfig,
      });
    },
    onEdit: getCheckpointId
      ? async (msg) => {
        if (sendInFlightRef.current || currentRunProblem) return;
        const branchSessionId = streamSessionRef.current;
        const truncated = truncateLangChainMessages(threadMessagesRef.current, msg.parentId);
        const checkpointId = await requireCheckpointIdForBranch(threadId, truncated, getCheckpointId);
        if (branchSessionId !== streamSessionRef.current || threadId !== latestThreadIdRef.current) {
          return;
        }
        setMessages(truncated);
        setInterrupt(undefined);
        setRunArtifacts([]);
        currentRunIdRef.current = null;
        return handleSend([
          {
            type: "human",
            content: getMessageContent(msg) as any,
          },
        ], {
          checkpointId,
          runConfig: msg.runConfig,
        });
      }
      : undefined,
    onReload: getCheckpointId
      ? async (parentId, config) => {
        if (sendInFlightRef.current || currentRunProblem) return;
        const branchSessionId = streamSessionRef.current;
        const truncated = truncateLangChainMessages(threadMessagesRef.current, parentId);
        const checkpointId = await requireCheckpointIdForBranch(threadId, truncated, getCheckpointId);
        if (branchSessionId !== streamSessionRef.current || threadId !== latestThreadIdRef.current) {
          return;
        }
        setMessages(truncated);
        setInterrupt(undefined);
        setRunArtifacts([]);
        currentRunIdRef.current = null;
        return handleSend([], {
          checkpointId,
          runConfig: config.runConfig,
        });
      }
      : undefined,
    onCancel: async () => {
      cancel();
      const session = activeStreamRef.current;
      if (session?.isCurrent(streamSessionRef.current, latestThreadIdRef.current)) {
        const error = new Error("Reply reception cancelled");
        error.name = "AbortError";
        session.fail(error);
        const outcome = session.finish();
        if (outcome.status !== "completed" && outcome.status !== "waiting_approval") {
          setRunProblem({ threadId: session.threadId, sessionId: session.sessionId, message: outcome.message, blocked: true });
        }
      }
      setIsRunning(false);
    },
    extras: {
      creativeHub: true,
      interrupt: currentInterrupt,
      messageMetadata,
      runOutcome: activeStreamRef.current?.outcome,
    },
  });

  useEffect(() => {
    return () => {
      streamSessionRef.current += 1;
      cancel();
      sendInFlightRef.current = false;
      refreshInFlightRef.current = false;
      activeStreamRef.current = null;
      setIsRunning(false);
    };
  }, [threadId, cancel]);

  useEffect(() => {
    let disposed = false;
    setRunProblem(null);
    setIsRefreshingRun(false);
    if (!isThreadReady) {
      checkpointRef.current = null;
      setMessages([]);
      setInterrupt(undefined);
      setIsRunning(false);
      setRunArtifacts([]);
      setLoadedThreadId("");
      setThreadLoadFailure(null);
      currentRunIdRef.current = null;
      debugEntrySeqRef.current = 0;
      return () => {
        disposed = true;
      };
    }
    checkpointRef.current = null;
    setMessages([]);
    setInterrupt(undefined);
    setRunArtifacts([]);
    setLoadedThreadId("");
    setThreadLoadFailure(null);
    currentRunIdRef.current = null;
    debugEntrySeqRef.current = 0;
    void loadThread(threadId)
      .then((state) => {
        if (disposed) return;
        checkpointRef.current = state.checkpointId ?? null;
        onCheckpointChange?.(state.checkpointId ?? null);
        setMessages(state.messages);
        setInterrupt(toLangGraphInterrupt(state.interrupts?.[0] ?? null));
        setRunArtifacts(state.latestTurnSummary ? [{
          runId: state.latestTurnSummary.runId,
          turnSummary: state.latestTurnSummary,
          debugEntries: [],
        }] : []);
        setLoadedThreadId(threadId);
        setThreadLoadFailure(null);
        currentRunIdRef.current = state.latestTurnSummary?.runId ?? null;
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setMessages([]);
        setInterrupt(undefined);
        setRunArtifacts([]);
        setLoadedThreadId("");
        setThreadLoadFailure({
          threadId,
          message: error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "当前线程内容加载失败。",
        });
      });
    return () => {
      disposed = true;
    };
  }, [isThreadReady, loadThread, onCheckpointChange, setInterrupt, setMessages, threadId, threadLoadRevision]);

  return {
    runtime,
    interrupt: currentInterrupt?.value as CreativeHubInterrupt | undefined,
    checkpointId: isCurrentThreadLoaded ? checkpointRef.current : null,
    messageMetadata,
    isRunning,
    isThreadLoading: isThreadReady && !isCurrentThreadLoaded && !threadLoadError,
    threadLoadError,
    retryThreadLoad: () => {
      setThreadLoadFailure(null);
      setThreadLoadRevision((value) => value + 1);
    },
    setInterrupt,
    messages: currentMessages,
    sendPrompt,
    runResultNotice: currentRunProblem?.message ?? null,
    isRunResultPending: Boolean(currentRunProblem?.blocked || sendInFlightRef.current && !isRunning),
    isRefreshingRun,
    refreshRunResult: () => { void refreshRunResult(); },
    latestTurnSummary: isCurrentThreadLoaded
      ? (currentRunArtifacts[currentRunArtifacts.length - 1]?.turnSummary ?? null) as CreativeHubTurnSummary | null
      : undefined,
  };
}
