import type { CreationDirection } from "@novelfoundry/shared/types/creationStudio";

/** Explicit allowlist: never copy a reference request, source or task envelope into production. */
export function buildOriginalDirectorContext(idea: string, direction: CreationDirection) {
  return {
    idea,
    title: direction.title,
    description: direction.referenceDesign
      ? [direction.premise, `原创世界：${direction.referenceDesign.worldPremise}`, `开篇：${direction.referenceDesign.openingHook}`].join("\n")
      : direction.premise,
    first30ChapterPromise: direction.referenceDesign?.firstStagePromise,
    bookSellingPoint: direction.coreExperience,
    styleTone: direction.styleKeywords.join("、"),
  };
}
