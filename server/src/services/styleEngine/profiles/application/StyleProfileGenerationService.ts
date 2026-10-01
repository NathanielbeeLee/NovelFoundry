import type { StyleExtractionDraft } from "@novelfoundry/shared/types/styleEngine";

import { prisma } from "../../../../db/prisma";

import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";

import { styleProfileAntiAiSelectionPrompt, styleProfileExtractionPrompt, styleProfileFromBookAnalysisPrompt, styleProfileFromBriefPrompt, styleProfileMetadataPrompt } from "../../../../prompting/prompts/style/style.prompts";

import { mapAntiAiRuleRow } from "../../helpers";

import { buildAntiAiCatalogText, buildStyleAntiAiRiskDigest, buildStyleMetadataDigest, normalizeStyleAntiAiSelectionDraft, normalizeStyleMetadataDraft, type StyleCreationCoreDraft } from "../../styleCreation";

import { type LlmInput, type GeneratedStyleCorePayload, type GeneratedStylePayload } from "../domain/contracts";

import { logStyleExtractionRuntimeEvent } from "../infrastructure/extractionLog";

import { STYLE_EXTRACTION_MAX_TOKENS, countExtractionFeatures, buildGeneratedCoreDraftSummary, STYLE_METADATA_MAX_TOKENS, STYLE_ANTI_AI_SELECTION_MAX_TOKENS, isRecord, normalizeOptionalText, normalizeRuleRecord } from "../domain/extractionPolicy";

export class StyleProfileGenerationService {

  protected async generateStructuredStyle(
    promptInput: {
      analysisTitle: string;
      name: string;
      sourceText: string;
    },
    llmInput: LlmInput,
  ): Promise<GeneratedStyleCorePayload> {
    const result = await runStructuredPrompt({
      asset: styleProfileFromBookAnalysisPrompt,
      promptInput,
      options: {
        provider: llmInput.provider ?? "deepseek",
        model: llmInput.model,
        temperature: llmInput.temperature ?? 0.5,
        timeoutMs: llmInput.timeoutMs,
        signal: llmInput.signal,
      },
    });
    return this.normalizeGeneratedStyleCorePayload(result.output, promptInput.name);
  }

  protected async generateStructuredStyleFromBrief(
    promptInput: {
      brief: string;
      name?: string;
      category?: string;
    },
    llmInput: LlmInput,
  ): Promise<GeneratedStyleCorePayload> {
    const result = await runStructuredPrompt({
      asset: styleProfileFromBriefPrompt,
      promptInput,
      options: {
        provider: llmInput.provider ?? "deepseek",
        model: llmInput.model,
        temperature: llmInput.temperature ?? 0.6,
        timeoutMs: llmInput.timeoutMs,
        signal: llmInput.signal,
      },
    });
    return this.normalizeGeneratedStyleCorePayload(
      result.output,
      promptInput.name?.trim() || "AI 生成写法",
    );
  }

  protected async generateStructuredExtractionCore(input: {
    name: string;
    sourceText: string;
    category?: string;
  } & LlmInput): Promise<unknown> {
    logStyleExtractionRuntimeEvent("extract_start", {
      name: input.name,
      category: input.category ?? null,
      provider: input.provider ?? "deepseek",
      model: input.model ?? null,
      temperature: input.temperature ?? 0.5,
      maxTokens: STYLE_EXTRACTION_MAX_TOKENS,
      timeoutMs: input.timeoutMs ?? null,
      sourceTextChars: input.sourceText.length,
    });
    const initialStartedAt = Date.now();
    const initialResult = await runStructuredPrompt({
      asset: styleProfileExtractionPrompt,
      promptInput: {
        name: input.name,
        category: input.category,
        sourceText: input.sourceText,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.5,
        maxTokens: STYLE_EXTRACTION_MAX_TOKENS,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      },
    });
    const initialFeatureCount = countExtractionFeatures(initialResult.output);
    const initialHasUsableFeatures = this.hasUsableExtractionFeatures(initialResult.output);
    logStyleExtractionRuntimeEvent("extract_initial_result", {
      name: input.name,
      latencyMs: Date.now() - initialStartedAt,
      featureCount: initialFeatureCount,
      hasUsableFeatures: initialHasUsableFeatures,
    });
    if (initialHasUsableFeatures) {
      return initialResult.output;
    }

    logStyleExtractionRuntimeEvent("extract_retry_for_features", {
      name: input.name,
      reason: "empty_or_unusable_features",
    });
    const retryStartedAt = Date.now();
    const retriedResult = await runStructuredPrompt({
      asset: styleProfileExtractionPrompt,
      promptInput: {
        name: input.name,
        category: input.category,
        sourceText: input.sourceText,
        retryForFeatures: true,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.5,
        maxTokens: STYLE_EXTRACTION_MAX_TOKENS,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      },
    });
    logStyleExtractionRuntimeEvent("extract_retry_result", {
      name: input.name,
      latencyMs: Date.now() - retryStartedAt,
      featureCount: countExtractionFeatures(retriedResult.output),
      hasUsableFeatures: this.hasUsableExtractionFeatures(retriedResult.output),
    });
    return retriedResult.output;
  }

  protected async enrichExtractionDraft(
    coreDraft: StyleExtractionDraft,
    llmInput: {
      category?: string;
    } & LlmInput,
  ): Promise<StyleExtractionDraft> {
    const summaryInput: StyleCreationCoreDraft = {
      name: coreDraft.name,
      description: coreDraft.description,
      summary: coreDraft.summary,
      analysisMarkdown: coreDraft.analysisMarkdown,
      features: coreDraft.features,
    };
    const metadataStartedAt = Date.now();
    const antiAiStartedAt = Date.now();
    const [metadataResult, antiAiResult] = await Promise.allSettled([
      this.generateStyleMetadata({
        name: coreDraft.name,
        sourceType: "from_text",
        preferredCategory: llmInput.category ?? coreDraft.category ?? undefined,
        coreDraft: summaryInput,
        llmInput,
      }),
      this.selectAntiAiRuleKeys({
        name: coreDraft.name,
        summary: coreDraft.summary,
        coreDraft: summaryInput,
        llmInput,
      }),
    ]);

    const metadata = metadataResult.status === "fulfilled"
      ? metadataResult.value
      : normalizeStyleMetadataDraft({}, llmInput.category ?? coreDraft.category ?? null);
    if (metadataResult.status === "fulfilled") {
      logStyleExtractionRuntimeEvent("extract_metadata_result", {
        name: coreDraft.name,
        latencyMs: Date.now() - metadataStartedAt,
        category: metadata.category ?? null,
        tagsCount: metadata.tags.length,
        genreCount: metadata.applicableGenres.length,
      });
    } else {
      console.warn("[style.profile.metadata] fallback_to_empty_metadata", {
        name: coreDraft.name,
        error: metadataResult.reason instanceof Error ? metadataResult.reason.message : String(metadataResult.reason),
      });
    }

    const antiAiRuleKeys = antiAiResult.status === "fulfilled"
      ? antiAiResult.value
      : [];
    if (antiAiResult.status === "fulfilled") {
      logStyleExtractionRuntimeEvent("extract_anti_ai_result", {
        name: coreDraft.name,
        latencyMs: Date.now() - antiAiStartedAt,
        antiAiRuleCount: antiAiRuleKeys.length,
      });
    } else {
      console.warn("[style.profile.anti_ai] fallback_to_empty_selection", {
        name: coreDraft.name,
        error: antiAiResult.reason instanceof Error ? antiAiResult.reason.message : String(antiAiResult.reason),
      });
    }

    return {
      ...coreDraft,
      category: metadata.category ?? coreDraft.category ?? (llmInput.category?.trim() || null),
      tags: metadata.tags,
      applicableGenres: metadata.applicableGenres,
      antiAiRuleKeys,
    };
  }

  protected async enrichGeneratedStylePayload(input: {
    sourceType: "from_brief" | "from_book_analysis";
    preferredCategory?: string | null;
    llmInput: LlmInput;
    core: GeneratedStyleCorePayload;
    fallbackName: string;
  }): Promise<GeneratedStylePayload> {
    const name = input.core.name?.trim() || input.fallbackName;
    const summaryInput = buildGeneratedCoreDraftSummary({
      name,
      description: input.core.description,
      analysisMarkdown: input.core.analysisMarkdown,
      narrativeRules: input.core.narrativeRules,
      characterRules: input.core.characterRules,
      languageRules: input.core.languageRules,
      rhythmRules: input.core.rhythmRules,
    });
    const [metadataResult, antiAiResult] = await Promise.allSettled([
      this.generateStyleMetadata({
        name,
        sourceType: input.sourceType,
        preferredCategory: input.preferredCategory ?? undefined,
        coreDraft: summaryInput,
        llmInput: input.llmInput,
      }),
      this.selectAntiAiRuleKeys({
        name,
        summary: input.core.description ?? undefined,
        coreDraft: summaryInput,
        llmInput: input.llmInput,
      }),
    ]);

    if (metadataResult.status === "rejected") {
      console.warn("[style.profile.metadata] fallback_to_empty_metadata", {
        name,
        error: metadataResult.reason instanceof Error ? metadataResult.reason.message : String(metadataResult.reason),
      });
    }
    if (antiAiResult.status === "rejected") {
      console.warn("[style.profile.anti_ai] fallback_to_empty_selection", {
        name,
        error: antiAiResult.reason instanceof Error ? antiAiResult.reason.message : String(antiAiResult.reason),
      });
    }

    const metadata = metadataResult.status === "fulfilled"
      ? metadataResult.value
      : normalizeStyleMetadataDraft({}, input.preferredCategory ?? null);
    const antiAiRuleKeys = antiAiResult.status === "fulfilled" ? antiAiResult.value : [];

    return {
      ...input.core,
      name,
      category: metadata.category ?? input.preferredCategory ?? null,
      tags: metadata.tags,
      applicableGenres: metadata.applicableGenres,
      antiAiRuleKeys,
    };
  }

  protected async generateStyleMetadata(input: {
    name: string;
    sourceType: "from_text" | "from_brief" | "from_book_analysis";
    preferredCategory?: string;
    coreDraft: StyleCreationCoreDraft;
    llmInput: LlmInput;
  }) {
    const result = await runStructuredPrompt({
      asset: styleProfileMetadataPrompt,
      promptInput: {
        name: input.name,
        sourceType: input.sourceType,
        preferredCategory: input.preferredCategory,
        styleDigest: buildStyleMetadataDigest(input.coreDraft),
      },
      options: {
        provider: input.llmInput.provider ?? "deepseek",
        model: input.llmInput.model,
        temperature: 0.2,
        maxTokens: STYLE_METADATA_MAX_TOKENS,
        timeoutMs: input.llmInput.timeoutMs,
        signal: input.llmInput.signal,
      },
    });
    return normalizeStyleMetadataDraft(result.output, input.preferredCategory ?? null);
  }

  protected async selectAntiAiRuleKeys(input: {
    name: string;
    summary?: string;
    coreDraft: StyleCreationCoreDraft;
    llmInput: LlmInput;
  }): Promise<string[]> {
    const antiAiRules = await this.listEnabledAntiAiRules();
    if (antiAiRules.length === 0) {
      return [];
    }

    const result = await runStructuredPrompt({
      asset: styleProfileAntiAiSelectionPrompt,
      promptInput: {
        name: input.name,
        summary: input.summary,
        styleDigest: buildStyleMetadataDigest(input.coreDraft),
        riskDigest: buildStyleAntiAiRiskDigest(input.coreDraft),
        catalogText: buildAntiAiCatalogText(antiAiRules),
        maxRuleCount: 4,
      },
      options: {
        provider: input.llmInput.provider ?? "deepseek",
        model: input.llmInput.model,
        temperature: 0.2,
        maxTokens: STYLE_ANTI_AI_SELECTION_MAX_TOKENS,
        timeoutMs: input.llmInput.timeoutMs,
        signal: input.llmInput.signal,
      },
    });

    const rawKeys = isRecord(result.output) && Array.isArray(result.output.antiAiRuleKeys)
      ? result.output.antiAiRuleKeys.filter((item): item is string => typeof item === "string")
      : [];
    const normalized = normalizeStyleAntiAiSelectionDraft(
      result.output,
      antiAiRules.map((rule) => rule.key),
    );
    const droppedKeys = rawKeys.filter((key) => !normalized.antiAiRuleKeys.includes(key));
    if (droppedKeys.length > 0) {
      console.warn("[style.profile.anti_ai] dropped_invalid_rule_keys", {
        name: input.name,
        droppedKeys,
      });
    }
    return normalized.antiAiRuleKeys;
  }

  protected async listEnabledAntiAiRules() {
    const rows = await prisma.antiAiRule.findMany({
      where: { enabled: true },
      orderBy: [{ type: "asc" }, { severity: "desc" }, { name: "asc" }],
    });
    return rows.map((row) => mapAntiAiRuleRow(row));
  }

  protected normalizeGeneratedStyleCorePayload(
    value: GeneratedStyleCorePayload,
    fallbackName: string,
  ): GeneratedStyleCorePayload {
    return {
      name: value.name?.trim() || fallbackName,
      description: normalizeOptionalText(value.description),
      analysisMarkdown: normalizeOptionalText(value.analysisMarkdown),
      narrativeRules: normalizeRuleRecord(value.narrativeRules),
      characterRules: normalizeRuleRecord(value.characterRules),
      languageRules: normalizeRuleRecord(value.languageRules),
      rhythmRules: normalizeRuleRecord(value.rhythmRules),
    };
  }

  protected hasUsableExtractionFeatures(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return [record.features, record.extractedFeatures, record.featurePool]
      .some((candidate) => Array.isArray(candidate) && candidate.length > 0);
  }
}
