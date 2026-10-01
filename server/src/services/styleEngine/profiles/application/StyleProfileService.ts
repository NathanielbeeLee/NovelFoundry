import type { StyleExtractionDraft, StyleFeatureDecision, StyleProfile, StyleSourceType, StyleTemplate } from "@novelfoundry/shared/types/styleEngine";

import { prisma } from "../../../../db/prisma";

import { ensureStyleEngineSeedData } from "../../StyleEngineSeedService";

import { mapStyleProfileRow, mapStyleTemplateRow, serializeJson } from "../../helpers";

import { buildExtractionAnalysisMarkdown, buildProfileFeaturesFromDraft, buildRuleSetFromExtraction, buildRuleSetFromProfileFeatures, normalizeStyleExtractionDraft, normalizeStyleProfileFeatures } from "../../styleExtraction";

import { StyleProfileGenerationService } from "./StyleProfileGenerationService";

import { type ManualProfileInput, type LlmInput, type TextExtractionSourceType, type GeneratedStylePayload } from "../domain/contracts";

import { DEFAULT_EXTRACTION_PRESET_KEY, AI_STYLE_BRIEF_SOURCE_PREFIX } from "../domain/extractionPolicy";

export class StyleProfileService extends StyleProfileGenerationService {
  async listProfiles(): Promise<StyleProfile[]> {
    await ensureStyleEngineSeedData();
    const rows = await prisma.styleProfile.findMany({
      include: {
        antiAiBindings: {
          where: { enabled: true },
          include: { antiAiRule: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => mapStyleProfileRow(row));
  }

  async getProfileById(id: string): Promise<StyleProfile | null> {
    await ensureStyleEngineSeedData();
    const row = await prisma.styleProfile.findUnique({
      where: { id },
      include: {
        antiAiBindings: {
          where: { enabled: true },
          include: { antiAiRule: true },
        },
      },
    });
    return row ? mapStyleProfileRow(row) : null;
  }

  async createManualProfile(input: ManualProfileInput): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const row = await prisma.styleProfile.create({
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        tagsJson: serializeJson(input.tags ?? []),
        applicableGenresJson: serializeJson(input.applicableGenres ?? []),
        sourceType: input.sourceType ?? "manual",
        sourceRefId: input.sourceRefId,
        sourceContent: input.sourceContent,
        extractedFeaturesJson: serializeJson(input.extractedFeatures ?? []),
        extractionPresetsJson: serializeJson(input.extractionPresets ?? []),
        extractionAntiAiRuleKeysJson: serializeJson(input.extractionAntiAiRuleKeys ?? []),
        selectedExtractionPresetKey: input.selectedExtractionPresetKey ?? null,
        analysisMarkdown: input.analysisMarkdown,
        narrativeRulesJson: serializeJson(input.narrativeRules ?? {}),
        characterRulesJson: serializeJson(input.characterRules ?? {}),
        languageRulesJson: serializeJson(input.languageRules ?? {}),
        rhythmRulesJson: serializeJson(input.rhythmRules ?? {}),
        antiAiBindings: input.antiAiRuleIds?.length
          ? {
              create: input.antiAiRuleIds.map((antiAiRuleId) => ({
                antiAiRuleId,
                enabled: true,
              })),
            }
          : undefined,
      },
      include: {
        antiAiBindings: {
          include: { antiAiRule: true },
        },
      },
    });
    return mapStyleProfileRow(row);
  }

  async updateProfile(
    id: string,
    input: Omit<ManualProfileInput, "sourceType"> & { status?: string },
  ): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const normalizedExtractedFeatures = input.extractedFeatures
      ? normalizeStyleProfileFeatures(input.extractedFeatures)
      : null;
    const compiledRuleSet = normalizedExtractedFeatures
      ? buildRuleSetFromProfileFeatures(normalizedExtractedFeatures)
      : null;
    const hasExplicitNarrativeRules = Object.prototype.hasOwnProperty.call(input, "narrativeRules");
    const hasExplicitCharacterRules = Object.prototype.hasOwnProperty.call(input, "characterRules");
    const hasExplicitLanguageRules = Object.prototype.hasOwnProperty.call(input, "languageRules");
    const hasExplicitRhythmRules = Object.prototype.hasOwnProperty.call(input, "rhythmRules");
    await prisma.styleProfile.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        tagsJson: input.tags ? serializeJson(input.tags) : undefined,
        applicableGenresJson: input.applicableGenres ? serializeJson(input.applicableGenres) : undefined,
        sourceRefId: input.sourceRefId,
        sourceContent: input.sourceContent,
        extractedFeaturesJson: normalizedExtractedFeatures ? serializeJson(normalizedExtractedFeatures) : undefined,
        analysisMarkdown: input.analysisMarkdown,
        narrativeRulesJson: hasExplicitNarrativeRules
          ? serializeJson(input.narrativeRules ?? {})
          : (compiledRuleSet ? serializeJson(compiledRuleSet.narrativeRules) : undefined),
        characterRulesJson: hasExplicitCharacterRules
          ? serializeJson(input.characterRules ?? {})
          : (compiledRuleSet ? serializeJson(compiledRuleSet.characterRules) : undefined),
        languageRulesJson: hasExplicitLanguageRules
          ? serializeJson(input.languageRules ?? {})
          : (compiledRuleSet ? serializeJson(compiledRuleSet.languageRules) : undefined),
        rhythmRulesJson: hasExplicitRhythmRules
          ? serializeJson(input.rhythmRules ?? {})
          : (compiledRuleSet ? serializeJson(compiledRuleSet.rhythmRules) : undefined),
        status: input.status,
      },
    });

    if (input.antiAiRuleIds) {
      await prisma.styleProfileAntiAiRule.deleteMany({
        where: { styleProfileId: id },
      });
      if (input.antiAiRuleIds.length > 0) {
        await prisma.styleProfileAntiAiRule.createMany({
          data: input.antiAiRuleIds.map((antiAiRuleId) => ({
            styleProfileId: id,
            antiAiRuleId,
            enabled: true,
          })),
        });
      }
    }

    const updated = await this.getProfileById(id);
    if (!updated) {
      throw new Error("写法资产不存在。");
    }
    return updated;
  }

  async deleteProfile(id: string): Promise<void> {
    await prisma.styleProfile.delete({ where: { id } });
  }

  async listTemplates(): Promise<StyleTemplate[]> {
    await ensureStyleEngineSeedData();
    const rows = await prisma.styleTemplate.findMany({
      orderBy: { name: "asc" },
    });
    return rows.map((row) => mapStyleTemplateRow(row));
  }

  async createFromTemplate(input: { templateId: string; name?: string }): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const template = await prisma.styleTemplate.findUnique({ where: { id: input.templateId } });
    if (!template) {
      throw new Error("写法模板不存在。");
    }
    const antiRules = await prisma.antiAiRule.findMany({
      where: {
        key: {
          in: JSON.parse(template.defaultAntiAiRuleKeysJson ?? "[]"),
        },
      },
      orderBy: { name: "asc" },
    });
    return this.createManualProfile({
      name: input.name?.trim() || template.name,
      description: template.description,
      category: template.category,
      tags: JSON.parse(template.tagsJson ?? "[]"),
      applicableGenres: JSON.parse(template.applicableGenresJson ?? "[]"),
      sourceType: "manual",
      analysisMarkdown: template.analysisMarkdown ?? undefined,
      narrativeRules: JSON.parse(template.narrativeRulesJson ?? "{}"),
      characterRules: JSON.parse(template.characterRulesJson ?? "{}"),
      languageRules: JSON.parse(template.languageRulesJson ?? "{}"),
      rhythmRules: JSON.parse(template.rhythmRulesJson ?? "{}"),
      antiAiRuleIds: antiRules.map((rule) => rule.id),
    });
  }

  async createFromText(input: {
    name: string;
    sourceText: string;
    category?: string;
  } & LlmInput): Promise<StyleProfile> {
    const draft = await this.extractFromText(input);
    const balancedPreset = draft.presets.find((item) => item.key === DEFAULT_EXTRACTION_PRESET_KEY)
      ?? draft.presets[0];
    return this.createProfileFromExtraction({
      name: input.name,
      sourceText: input.sourceText,
      category: input.category,
      draft,
      presetKey: DEFAULT_EXTRACTION_PRESET_KEY,
      decisions: balancedPreset?.decisions ?? draft.features.map((feature) => ({
        featureId: feature.id,
        decision: "keep" as StyleFeatureDecision,
      })),
    });
  }

  async extractFromText(input: {
    name: string;
    sourceText: string;
    category?: string;
  } & LlmInput): Promise<StyleExtractionDraft> {
    await ensureStyleEngineSeedData();
    const coreDraft = normalizeStyleExtractionDraft(
      await this.generateStructuredExtractionCore(input),
      input.name,
      input.category,
    );
    return this.enrichExtractionDraft(coreDraft, input);
  }

  async createProfileFromExtraction(input: {
    name: string;
    sourceText: string;
    category?: string;
    draft: StyleExtractionDraft;
    decisions: Array<{ featureId: string; decision: StyleFeatureDecision }>;
    presetKey?: "imitate" | "balanced" | "transfer";
    sourceType?: TextExtractionSourceType;
    sourceRefId?: string;
  }): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const sourceType = input.sourceType ?? "from_text";
    const normalizedDraft = normalizeStyleExtractionDraft(input.draft, input.name, input.category);
    const ruleSet = buildRuleSetFromExtraction(normalizedDraft, input.decisions, input.presetKey);
    const extractedFeatures = buildProfileFeaturesFromDraft(normalizedDraft).map((feature) => ({
      ...feature,
      selectedDecision: input.decisions.find((item) => item.featureId === feature.id)?.decision ?? "keep",
      enabled: (input.decisions.find((item) => item.featureId === feature.id)?.decision ?? "keep") !== "remove",
    }));
    const antiAiRuleIds = await this.resolveAntiAiRuleIds(normalizedDraft.antiAiRuleKeys);

    return this.createManualProfile({
      name: input.name.trim() || normalizedDraft.name,
      description: normalizedDraft.description
        ?? `${sourceType === "from_knowledge_document" ? "基于知识库原文提取生成" : "基于文本提取生成"}，保留 ${input.decisions.filter((item) => item.decision === "keep").length} 项特征，弱化 ${input.decisions.filter((item) => item.decision === "weaken").length} 项特征。`,
      category: input.category?.trim() || normalizedDraft.category || undefined,
      tags: normalizedDraft.tags,
      applicableGenres: normalizedDraft.applicableGenres,
      sourceType,
      sourceRefId: input.sourceRefId,
      sourceContent: input.sourceText,
      extractedFeatures,
      extractionPresets: normalizedDraft.presets,
      extractionAntiAiRuleKeys: normalizedDraft.antiAiRuleKeys,
      selectedExtractionPresetKey: input.presetKey ?? DEFAULT_EXTRACTION_PRESET_KEY,
      analysisMarkdown: normalizedDraft.analysisMarkdown
        ?? buildExtractionAnalysisMarkdown(normalizedDraft, input.decisions, input.presetKey),
      narrativeRules: ruleSet.narrativeRules,
      characterRules: ruleSet.characterRules,
      languageRules: ruleSet.languageRules,
      rhythmRules: ruleSet.rhythmRules,
      antiAiRuleIds,
    });
  }

  async createFromBookAnalysis(input: {
    bookAnalysisId: string;
    name: string;
  } & LlmInput): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const section = await prisma.bookAnalysisSection.findFirst({
      where: {
        analysisId: input.bookAnalysisId,
        sectionKey: "style_technique",
      },
      include: {
        analysis: true,
      },
    });
    if (!section) {
      throw new Error("未找到可用于生成写法的拆书文风与技法小节。");
    }
    const sourceText = section.editedContent?.trim() || section.aiContent?.trim();
    if (!sourceText) {
      throw new Error("拆书文风与技法小节为空，无法生成写法资产。");
    }
    const generatedCore = await this.generateStructuredStyle(
      {
        analysisTitle: section.analysis.title,
        name: input.name,
        sourceText,
      },
      input,
    );
    const generated = await this.enrichGeneratedStylePayload({
      sourceType: "from_book_analysis",
      preferredCategory: null,
      llmInput: input,
      core: generatedCore,
      fallbackName: input.name,
    });
    return this.persistGeneratedProfile({
      inputName: input.name,
      sourceType: "from_book_analysis",
      sourceRefId: input.bookAnalysisId,
      sourceContent: sourceText,
      generated,
    });
  }

  async createFromBrief(input: {
    brief: string;
    name?: string;
    category?: string;
  } & LlmInput): Promise<StyleProfile> {
    await ensureStyleEngineSeedData();
    const generatedCore = await this.generateStructuredStyleFromBrief(
      {
        brief: input.brief,
        name: input.name?.trim() || undefined,
        category: input.category?.trim() || undefined,
      },
      input,
    );
    const generated = await this.enrichGeneratedStylePayload({
      sourceType: "from_brief",
      preferredCategory: input.category?.trim() || null,
      llmInput: input,
      core: generatedCore,
      fallbackName: input.name?.trim() || generatedCore.name?.trim() || "AI 生成写法",
    });
    return this.persistGeneratedProfile({
      inputName: input.name?.trim() || generated.name?.trim() || "AI 生成写法",
      sourceType: "manual",
      sourceRefId: `${AI_STYLE_BRIEF_SOURCE_PREFIX}${Date.now()}`,
      sourceContent: input.brief,
      generated,
    });
  }

  private async persistGeneratedProfile(input: {
    inputName: string;
    sourceType: StyleSourceType;
    sourceRefId?: string;
    sourceContent: string;
    generated: GeneratedStylePayload;
  }): Promise<StyleProfile> {
    const antiAiRuleIds = await this.resolveAntiAiRuleIds(input.generated.antiAiRuleKeys ?? []);
    return this.createManualProfile({
      name: input.generated.name?.trim() || input.inputName,
      description: input.generated.description ?? undefined,
      category: input.generated.category ?? undefined,
      tags: input.generated.tags ?? [],
      applicableGenres: input.generated.applicableGenres ?? [],
      sourceType: input.sourceType,
      sourceRefId: input.sourceRefId,
      sourceContent: input.sourceContent,
      extractionAntiAiRuleKeys: input.generated.antiAiRuleKeys ?? [],
      analysisMarkdown: input.generated.analysisMarkdown ?? undefined,
      narrativeRules: input.generated.narrativeRules,
      characterRules: input.generated.characterRules,
      languageRules: input.generated.languageRules,
      rhythmRules: input.generated.rhythmRules,
      antiAiRuleIds,
    });
  }

  private async resolveAntiAiRuleIds(ruleKeys: string[]): Promise<string[]> {
    if (ruleKeys.length === 0) {
      return [];
    }
    const normalizedRuleKeys = Array.from(new Set(ruleKeys.map((key) => key.trim()).filter(Boolean)));
    const antiRules = await prisma.antiAiRule.findMany({
      where: { key: { in: normalizedRuleKeys } },
    });
    const matchedKeySet = new Set(antiRules.map((rule) => rule.key));
    const droppedKeys = normalizedRuleKeys.filter((key) => !matchedKeySet.has(key));
    if (droppedKeys.length > 0) {
      console.warn("[style.profile.anti_ai] unresolved_rule_keys", {
        droppedKeys,
      });
    }
    return antiRules.map((rule) => rule.id);
  }
}
