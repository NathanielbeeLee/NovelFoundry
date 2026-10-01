import type { StyleRulePatch, StyleRuleSet } from "../rules.js";
import type { StyleExtractionFeature, StyleFeatureDecision, StyleProfileFeature } from "../extraction.js";

function isRuleRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeRuleObjects<T extends Record<string, unknown>>(base: T, patch: T): T {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    if (
      key === "summary"
      && typeof value === "string"
      && value.trim().length > 0
      && typeof next[key] === "string"
      && next[key].trim().length > 0
      && next[key] !== value
    ) {
      next[key] = `${next[key]}；${value}`;
      continue;
    }
    if (isRuleRecord(value) && isRuleRecord(next[key])) {
      next[key] = mergeRuleObjects(
        next[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }
    next[key] = value;
  }
  return next as T;
}

function ruleSectionHasContent(value: unknown): boolean {
  if (!isRuleRecord(value)) {
    return false;
  }
  return Object.values(value).some((item) => {
    if (item == null) {
      return false;
    }
    if (typeof item === "string") {
      return item.trim().length > 0;
    }
    if (typeof item === "number" || typeof item === "boolean") {
      return true;
    }
    if (Array.isArray(item)) {
      return item.length > 0;
    }
    if (isRuleRecord(item)) {
      return ruleSectionHasContent(item);
    }
    return false;
  });
}

export function hasStyleRulePatchContent(patch: StyleRulePatch | null | undefined): boolean {
  if (!patch) {
    return false;
  }
  return ruleSectionHasContent(patch.narrativeRules)
    || ruleSectionHasContent(patch.characterRules)
    || ruleSectionHasContent(patch.languageRules)
    || ruleSectionHasContent(patch.rhythmRules);
}

export function buildFallbackStyleRulePatch(
  feature: Pick<StyleExtractionFeature, "group" | "label" | "description">,
): StyleRulePatch {
  const summary = `${feature.label}：${feature.description}`.trim();
  if (!summary) {
    return {};
  }

  if (feature.group === "language") {
    return {
      languageRules: {
        summary,
      },
    };
  }

  if (feature.group === "dialogue") {
    return {
      characterRules: {
        summary,
      },
    };
  }

  if (feature.group === "rhythm") {
    return {
      rhythmRules: {
        summary,
      },
    };
  }

  return {
    narrativeRules: {
      summary,
    },
  };
}

export function resolveStyleFeatureRulePatch(
  feature: Pick<
    StyleExtractionFeature,
    "group" | "label" | "description" | "keepRulePatch" | "weakenRulePatch"
  >,
  decision?: StyleFeatureDecision,
): StyleRulePatch {
  const preferredPatch = decision === "weaken" && hasStyleRulePatchContent(feature.weakenRulePatch)
    ? feature.weakenRulePatch ?? {}
    : feature.keepRulePatch ?? {};
  if (hasStyleRulePatchContent(preferredPatch)) {
    return preferredPatch;
  }
  return buildFallbackStyleRulePatch(feature);
}

export function mergeStyleRuleSet(base: StyleRuleSet, patch: StyleRulePatch): StyleRuleSet {
  return {
    narrativeRules: patch.narrativeRules
      ? mergeRuleObjects(base.narrativeRules, patch.narrativeRules)
      : base.narrativeRules,
    characterRules: patch.characterRules
      ? mergeRuleObjects(base.characterRules, patch.characterRules)
      : base.characterRules,
    languageRules: patch.languageRules
      ? mergeRuleObjects(base.languageRules, patch.languageRules)
      : base.languageRules,
    rhythmRules: patch.rhythmRules
      ? mergeRuleObjects(base.rhythmRules, patch.rhythmRules)
      : base.rhythmRules,
  };
}

export function buildStyleRuleSetFromFeatures(
  features: Array<Pick<
    StyleProfileFeature,
    "enabled" | "selectedDecision" | "group" | "label" | "description" | "keepRulePatch" | "weakenRulePatch"
  >>,
): StyleRuleSet {
  let next: StyleRuleSet = {
    narrativeRules: {},
    characterRules: {},
    languageRules: {},
    rhythmRules: {},
  };

  for (const feature of features) {
    if (!feature.enabled) {
      continue;
    }
    next = mergeStyleRuleSet(next, resolveStyleFeatureRulePatch(feature, feature.selectedDecision));
  }

  return next;
}
