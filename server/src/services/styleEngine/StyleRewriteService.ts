import type { LLMProvider } from "@novelfoundry/shared/types/llm";
import type { StyleRewriteResult } from "@novelfoundry/shared/types/styleEngine";
import { runTextPrompt } from "../../prompting/core/promptRunner";
import { styleRewritePrompt } from "../../prompting/prompts/style/style.prompts";
import { buildWriterStyleContractText } from "./styleContractText";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";
import { redactStyleSourceReferences, resolveStyleGenerationProfile } from "./styleGenerationSanitizer";
import { buildAntiAiRuleDirectiveText, listPreviewAntiAiRules } from "./antiAiPreviewRules";
import { StyleRewritePreservationService } from "./rewrite";

interface RewriteInput {
  content: string;
  styleProfileId?: string;
  novelId?: string;
  chapterId?: string;
  taskStyleProfileId?: string;
  previewAntiAiRuleIds?: string[];
  issues: Array<{
    ruleName: string;
    excerpt: string;
    suggestion: string;
  }>;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
}

export class StyleRewriteService {
  private readonly resolver = new StyleRuntimeResolver();
  private readonly preservation = new StyleRewritePreservationService();

  async rewrite(input: RewriteInput): Promise<StyleRewriteResult> {
    input.signal?.throwIfAborted();
    const resolved = await this.resolver.resolve({
      styleProfileId: input.styleProfileId,
      novelId: input.novelId,
      chapterId: input.chapterId,
      taskStyleProfileId: input.taskStyleProfileId,
    });
    const previewRules = await listPreviewAntiAiRules(input.previewAntiAiRuleIds);
    const existingRuleIds = new Set(resolved.antiAiRules.map((rule) => rule.id));
    const extraPreviewRules = previewRules.filter((rule) => !existingRuleIds.has(rule.id));
    const generationProfile = resolveStyleGenerationProfile(resolved.context);

    const issuesBlock = redactStyleSourceReferences(input.issues.map((issue, index) => (
      `${index + 1}. ${issue.ruleName}\n片段：${issue.excerpt}\n修正建议：${issue.suggestion}`
    )).join("\n\n"), generationProfile);
    const styleContractText = [
      buildWriterStyleContractText(
        resolved.context.compiledBlocks?.contract ?? null,
        generationProfile?.writingGuidance,
      ),
      redactStyleSourceReferences(buildAntiAiRuleDirectiveText(extraPreviewRules), generationProfile),
    ].filter(Boolean).join("\n\n");

    input.signal?.throwIfAborted();
    const result = await runTextPrompt({
      asset: styleRewritePrompt,
      promptInput: {
        styleContractText,
        content: input.content,
        issuesBlock,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.5,
        signal: input.signal,
        novelId: input.novelId,
        chapterId: input.chapterId,
        entrypoint: "style-rewrite-preview",
      },
    });

    const content = result.output.trim();
    if (!content) throw new Error("AI 没有返回可用修订稿，请保留原文后重试。");
    return {
      content,
      originalContent: input.content,
      preservation: await this.preservation.check({
        originalContent: input.content,
        rewrittenContent: content,
        provider: input.provider,
        model: input.model,
        novelId: input.novelId,
        chapterId: input.chapterId,
        signal: input.signal,
      }),
    };
  }
}
