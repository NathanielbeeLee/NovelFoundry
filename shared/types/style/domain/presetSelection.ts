import type { StyleExtractionFeature, StyleExtractionPreset, StyleFeatureDecision } from "../extraction.js";

export function decideStyleFeatureDecision(
  feature: Pick<StyleExtractionFeature, "importance" | "imitationValue" | "transferability" | "fingerprintRisk">,
  presetKey: StyleExtractionPreset["key"],
): StyleFeatureDecision {
  if (presetKey === "imitate") {
    if (feature.imitationValue >= 0.45 || feature.importance >= 0.7) {
      return "keep";
    }
    return feature.fingerprintRisk >= 0.8 ? "weaken" : "keep";
  }

  if (presetKey === "transfer") {
    if (feature.transferability >= 0.7 && feature.fingerprintRisk <= 0.55) {
      return "keep";
    }
    if (feature.transferability >= 0.45 && feature.fingerprintRisk <= 0.75) {
      return "weaken";
    }
    return "remove";
  }

  if (feature.fingerprintRisk >= 0.8 && feature.transferability < 0.5) {
    return "remove";
  }
  if (feature.fingerprintRisk >= 0.55 || feature.transferability < 0.55) {
    return "weaken";
  }
  return "keep";
}

export function buildStyleExtractionPreset(
  features: StyleExtractionFeature[],
  presetKey: StyleExtractionPreset["key"],
): StyleExtractionPreset {
  const labels: Record<StyleExtractionPreset["key"], { label: string; summary: string }> = {
    imitate: {
      label: "高保真仿写",
      summary: "尽量保留高相似度特征，适合临摹、仿写和风格贴近试写。",
    },
    balanced: {
      label: "平衡保留",
      summary: "保住写法骨架，同时弱化原文指纹，适合大多数写作场景。",
    },
    transfer: {
      label: "写法迁移",
      summary: "优先保留可迁移规则，主动剥离高指纹风险特征，适合整书绑定。",
    },
  };

  return {
    key: presetKey,
    label: labels[presetKey].label,
    summary: labels[presetKey].summary,
    decisions: features.map((feature) => ({
      featureId: feature.id,
      decision: decideStyleFeatureDecision(feature, presetKey),
    })),
  };
}

export function buildStyleExtractionPresets(features: StyleExtractionFeature[]): StyleExtractionPreset[] {
  return [
    buildStyleExtractionPreset(features, "imitate"),
    buildStyleExtractionPreset(features, "balanced"),
    buildStyleExtractionPreset(features, "transfer"),
  ];
}
