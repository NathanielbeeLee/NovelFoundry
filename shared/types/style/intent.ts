import type { LanguageRules, CharacterRules } from "./rules.js";
import type { StyleProfile } from "./profile.js";

export interface StyleIntentSummary {
  source: "style_profile" | "style_tone";
  styleProfileId?: string | null;
  styleProfileName?: string | null;
  headline: string;
  readingFeel?: string | null;
  languageFocus?: string | null;
  dialogueFocus?: string | null;
  emotionFocus?: string | null;
  antiAiFocus: string[];
  stageSummaryLines: string[];
}

function compactText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function firstNonEmptyText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = compactText(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function formatBooleanHint(value: boolean | null | undefined, positive: string, negative: string): string | null {
  if (value === true) {
    return positive;
  }
  if (value === false) {
    return negative;
  }
  return null;
}

function buildLanguageFocus(languageRules: LanguageRules): string | null {
  return firstNonEmptyText(
    languageRules.summary,
    [
      compactText(languageRules.register),
      typeof languageRules.roughness === "number" ? `粗粝度 ${Math.round(languageRules.roughness)}` : "",
      compactText(languageRules.sentenceVariation),
      formatBooleanHint(languageRules.allowIncompleteSentences, "允许不完整句", "句子尽量完整"),
      formatBooleanHint(languageRules.allowSwearing, "允许口语脏字", "避免粗口"),
    ].filter(Boolean).join("，"),
  );
}

function buildDialogueFocus(characterRules: CharacterRules): string | null {
  return firstNonEmptyText(
    characterRules.dialogueStyle,
    [
      compactText(characterRules.summary),
      compactText(characterRules.emotionExpression),
    ].filter(Boolean).join("，"),
  );
}

function buildEmotionFocus(characterRules: CharacterRules): string | null {
  return firstNonEmptyText(
    characterRules.emotionExpression,
    [
      Array.isArray(characterRules.defenseMechanisms) && characterRules.defenseMechanisms.length > 0
        ? `防御机制：${characterRules.defenseMechanisms.join("、")}`
        : "",
      formatBooleanHint(characterRules.allowSelfReflection, "允许明确自省", "少做直白自省"),
      formatBooleanHint(characterRules.facePriority, "优先保住体面", "不强求体面"),
    ].filter(Boolean).join("，"),
  );
}

function buildAntiAiFocus(profile: Pick<StyleProfile, "antiAiRules"> | null | undefined): string[] {
  const antiAiRules = profile?.antiAiRules ?? [];
  return antiAiRules
    .map((rule) => firstNonEmptyText(rule.promptInstruction, rule.rewriteSuggestion, rule.description, rule.name))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
}

export function buildStyleIntentSummary(input: {
  styleProfile?: Pick<
    StyleProfile,
    "id"
    | "name"
    | "description"
    | "narrativeRules"
    | "characterRules"
    | "languageRules"
    | "rhythmRules"
    | "antiAiRules"
  > | null;
  styleTone?: string | null;
}): StyleIntentSummary | null {
  const styleTone = compactText(input.styleTone);
  const styleProfile = input.styleProfile ?? null;

  if (!styleProfile && !styleTone) {
    return null;
  }

  const readingFeel = firstNonEmptyText(
    styleProfile?.description,
    styleProfile?.narrativeRules.summary,
    styleProfile?.rhythmRules.summary,
    styleProfile ? null : styleTone,
  );
  const languageFocus = styleProfile ? buildLanguageFocus(styleProfile.languageRules) : null;
  const dialogueFocus = styleProfile ? buildDialogueFocus(styleProfile.characterRules) : null;
  const emotionFocus = styleProfile ? buildEmotionFocus(styleProfile.characterRules) : null;
  const antiAiFocus = buildAntiAiFocus(styleProfile);
  const headline = firstNonEmptyText(styleProfile?.name, styleProfile ? null : styleTone) ?? "未命名写法";
  const stageSummaryLines = [
    readingFeel ? `读感承诺：${readingFeel}` : "",
    languageFocus ? `语言密度：${languageFocus}` : "",
    dialogueFocus ? `对白风格：${dialogueFocus}` : "",
    emotionFocus ? `情绪外显：${emotionFocus}` : "",
    antiAiFocus.length > 0 ? `反 AI 约束：${antiAiFocus.join("；")}` : "",
    !styleProfile && styleTone ? `文风关键词：${styleTone}` : "",
  ].filter(Boolean);

  return {
    source: styleProfile ? "style_profile" : "style_tone",
    styleProfileId: styleProfile?.id ?? null,
    styleProfileName: styleProfile?.name ?? null,
    headline,
    readingFeel,
    languageFocus,
    dialogueFocus,
    emotionFocus,
    antiAiFocus,
    stageSummaryLines,
  };
}
