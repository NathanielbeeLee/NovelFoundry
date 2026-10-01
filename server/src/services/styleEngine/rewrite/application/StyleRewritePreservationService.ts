import type { StyleRewritePreservationResult } from "@novelfoundry/shared/types/styleEngine";
import type { LLMProvider } from "@novelfoundry/shared/types/llm";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { styleRewritePreservationPrompt } from "../../../../prompting/prompts/style/style.prompts";
import {
  STYLE_REWRITE_PRESERVATION_MAX_COMBINED_CHARS,
  STYLE_REWRITE_PRESERVATION_TIMEOUT_MS,
  unverifiedStyleRewritePreservation,
} from "../domain/preservationPolicy";

interface PreservationInput {
  originalContent: string;
  rewrittenContent: string;
  provider?: LLMProvider;
  model?: string;
  novelId?: string;
  chapterId?: string;
  signal?: AbortSignal;
}

export class StyleRewritePreservationService {
  async check(input: PreservationInput): Promise<StyleRewritePreservationResult> {
    if (input.signal?.aborted) return unverifiedStyleRewritePreservation("cancelled");
    if (!input.originalContent.trim() || !input.rewrittenContent.trim()) {
      return unverifiedStyleRewritePreservation("invalid_result");
    }
    if (input.originalContent.length + input.rewrittenContent.length > STYLE_REWRITE_PRESERVATION_MAX_COMBINED_CHARS) {
      return unverifiedStyleRewritePreservation("input_limit");
    }

    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException("Preservation review timed out", "TimeoutError")),
      STYLE_REWRITE_PRESERVATION_TIMEOUT_MS);
    timer.unref();
    const signal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal;
    let onAbort: (() => void) | undefined;
    try {
      signal.throwIfAborted();
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const result = await Promise.race([
        runStructuredPrompt({
          asset: styleRewritePreservationPrompt,
          promptInput: { originalContent: input.originalContent, rewrittenContent: input.rewrittenContent },
          options: {
            provider: input.provider ?? "deepseek",
            model: input.model,
            temperature: 0.1,
            timeoutMs: STYLE_REWRITE_PRESERVATION_TIMEOUT_MS,
            signal,
            novelId: input.novelId,
            chapterId: input.chapterId,
            entrypoint: "style-rewrite-preview",
            stage: "preservation",
          },
        }),
        aborted,
      ]);
      signal.throwIfAborted();
      const review = result.output;
      if (review.coverage !== "complete" || review.status === "uncertain") {
        return {
          ...unverifiedStyleRewritePreservation(review.coverage !== "complete" ? "incomplete_review" : "model_uncertain"),
          summary: review.summary,
          findings: review.findings,
        };
      }
      return { status: review.status, summary: review.summary, findings: review.findings };
    } catch (error) {
      if (input.signal?.aborted) return unverifiedStyleRewritePreservation("cancelled");
      if (deadline.signal.aborted) return unverifiedStyleRewritePreservation("timeout");
      const kind = (error as { promptQualityFailureKind?: string } | null)?.promptQualityFailureKind;
      return unverifiedStyleRewritePreservation(
        kind === "post_validate_failed" || kind === "schema_repair_failed" ? "invalid_result" : "unavailable",
      );
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }
}
