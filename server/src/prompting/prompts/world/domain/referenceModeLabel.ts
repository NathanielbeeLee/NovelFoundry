import type { WorldReferenceMode } from "@novelfoundry/shared/types/worldWizard";

export function buildReferenceModeLabel(mode: WorldReferenceMode | null | undefined): string {
  switch (mode) {
    case "extract_base":
      return "提取原作世界基底";
    case "tone_rebuild":
      return "借用原作气质与结构重建";
    case "adapt_world":
    default:
      return "基于原作做架空改造";
  }
}
