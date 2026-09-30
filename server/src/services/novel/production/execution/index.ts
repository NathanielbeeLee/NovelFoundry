import { isChapterEmptyContentError } from "../../runtime/chapterEmptyContentError";
import type { PipelineRuntimeHooks, PipelineRuntimeInput, PipelineRuntimeResult } from "../../runtime/chapterRuntimePipeline";

/** One retry shared by empty generation and quality repair. Transport errors
 * never replay a writer; its partial output belongs to stream recovery. */
export async function executeChapterWithRetryBudget(input: {
  run: (options: PipelineRuntimeInput, hooks: PipelineRuntimeHooks) => Promise<PipelineRuntimeResult>;
  options: PipelineRuntimeInput;
  hooks: PipelineRuntimeHooks;
}): Promise<PipelineRuntimeResult> {
  const limit = Math.max(0, Math.min(input.options.maxRetries ?? 1, 1));
  let emptyRetries = 0;
  while (true) {
    const remaining = limit - emptyRetries;
    try {
      const result = await input.run({ ...input.options, maxRetries: remaining }, {
        ...input.hooks,
        onEmptyContent: (event) => input.hooks.onEmptyContent?.({
          ...event, attempt: emptyRetries + 1, willRetry: remaining > 0,
        }) ?? Promise.resolve(),
      });
      return { ...result, retryCountUsed: result.retryCountUsed + emptyRetries };
    } catch (error) {
      if (!isChapterEmptyContentError(error) || remaining <= 0) throw error;
      await input.hooks.onCheckCancelled?.();
      emptyRetries += 1;
    }
  }
}
