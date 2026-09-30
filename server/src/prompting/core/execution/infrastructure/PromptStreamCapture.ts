import { AIMessageChunk, type BaseMessageChunk } from "@langchain/core/messages";
import { ReasoningStreamCollector, ThinkTagStreamFilter } from "../../../../llm/reasoning";
import { extractLlmTokenUsage, mergeStreamTokenUsage, type LlmTokenUsageSnapshot } from "../../../../llm/usageTracking";
import { StreamOutcomeError, readStreamTerminal, type StreamExecutionScope } from "../../../../llm/streamOutcome";
import { toText } from "../../../../services/novel/novelP0Utils";

export function captureStreamOutput(
  rawStream: AsyncIterable<BaseMessageChunk>,
  onChunk?: (content: string) => void,
  onReasoning?: (content: string) => void,
  scope?: StreamExecutionScope,
): {
  stream: AsyncIterable<BaseMessageChunk> & { cancel: () => void };
  completedText: Promise<string>;
  completedUsage: Promise<LlmTokenUsageSnapshot | null>;
} {
  let resolveText!: (value: string) => void;
  let rejectText!: (reason?: unknown) => void;
  let resolveUsage!: (value: LlmTokenUsageSnapshot | null) => void;
  const completedText = new Promise<string>((resolve, reject) => { resolveText = resolve; rejectText = reject; });
  const completedUsage = new Promise<LlmTokenUsageSnapshot | null>((resolve) => { resolveUsage = resolve; });
  // A caller may abandon its stream before awaiting completion. Both promises still settle.
  void completedText.catch(() => undefined);
  const bodyFilter = new ThinkTagStreamFilter();
  let contentSoFar = "";
  let usage: LlmTokenUsageSnapshot | null = null;
  let settled = false;
  const fail = (error: unknown): unknown => {
    if (scope) {
      const tail = bodyFilter.flush().text;
      contentSoFar += tail;
      if (tail) onChunk?.(tail);
    }
    const failure = scope
      ? error instanceof StreamOutcomeError ? error : new StreamOutcomeError("interrupted", "", null, { cause: error })
      : error;
    if (failure instanceof StreamOutcomeError) {
      failure.partialContent = contentSoFar;
      failure.tokenUsage = usage;
    }
    if (!settled) {
      settled = true;
      rejectText(failure);
      resolveUsage(usage);
    }
    return failure;
  };
  const onAbort = () => { fail(scope?.signal.reason); scope?.dispose(); };
  scope?.signal.addEventListener("abort", onAbort, { once: true });
  if (scope?.signal.aborted) onAbort();

  return {
    stream: {
      cancel: () => { scope?.abort("cancelled"); },
      async *[Symbol.asyncIterator]() {
        const reasoningCollector = new ReasoningStreamCollector();
        const iterator = rawStream[Symbol.asyncIterator]();
        let terminal: ReturnType<typeof readStreamTerminal> = null;
        let reachedEnd = false;
        try {
          while (true) {
            const next = scope ? await scope.race(iterator.next()) : await iterator.next();
            if (next.done) { reachedEnd = true; break; }
            const chunk = next.value;
            const rawContent = toText(scope && Array.isArray(chunk.content)
              ? chunk.content.filter((part) => typeof part === "string" || part.type === "text" || part.type === "output_text")
              : chunk.content);
            const reasoning = reasoningCollector.push(chunk, rawContent);
            onReasoning?.(reasoning);
            const content = scope ? bodyFilter.push(rawContent).text : rawContent;
            if (rawContent || reasoning) scope?.progress();
            contentSoFar += content;
            onChunk?.(content);
            usage = mergeStreamTokenUsage(usage, extractLlmTokenUsage(chunk));
            const observed = readStreamTerminal(chunk);
            // Once a failure terminal is seen a later metadata chunk cannot promote it.
            if (observed && (terminal === null || terminal === "success")) terminal = observed;
            yield scope ? new AIMessageChunk({ content, response_metadata: chunk.response_metadata, additional_kwargs: chunk.additional_kwargs, usage_metadata: "usage_metadata" in chunk ? (chunk as AIMessageChunk).usage_metadata : undefined }) : chunk;
          }
          onReasoning?.(reasoningCollector.flush());
          if (scope) {
            const tail = bodyFilter.flush().text;
            if (tail) {
              contentSoFar += tail;
              onChunk?.(tail);
              yield new AIMessageChunk(tail);
            }
            if (terminal !== "success") throw new StreamOutcomeError(terminal === "output_limit" ? "output_limit" : "interrupted");
          }
          settled = true;
          resolveText(contentSoFar);
          resolveUsage(usage);
        } catch (error) {
          throw fail(error);
        } finally {
          if (!settled) fail(new StreamOutcomeError("cancelled"));
          if (!reachedEnd) {
            scope?.abort("cancelled");
            // Some transports ignore cancellation; cleanup must not hang completion.
            void iterator.return?.().catch(() => undefined);
          }
          scope?.signal.removeEventListener("abort", onAbort);
          scope?.dispose();
        }
      },
    },
    completedText,
    completedUsage,
  };
}
