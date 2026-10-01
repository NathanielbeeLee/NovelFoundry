import type { CharacterExpressionData, CharacterSheetData, ComicCharacter } from "@/api/comic";

export function parseSheetData(character: ComicCharacter): CharacterSheetData {
  try {
    return character.sheetData ? JSON.parse(character.sheetData) : { status: "idle" };
  } catch {
    return { status: "idle" };
  }
}

export function getExpressionData(sheetData: CharacterSheetData): CharacterExpressionData {
  return sheetData.assets?.expression ?? { status: "idle" };
}

export function getVisualAnchorText(character: ComicCharacter): string {
  if (!character.visualAnchor) return "";

  try {
    const parsed = JSON.parse(character.visualAnchor) as Record<string, unknown>;
    if (typeof parsed.description === "string") return parsed.description;
    if (typeof parsed.hint === "string") return parsed.hint;
  } catch {
    // Free-form visual anchors are still valid input from older projects.
  }

  return character.visualAnchor;
}

export function buildRecommendedSheetPrompt(character: ComicCharacter): string {
  const visualAnchorText = getVisualAnchorText(character);
  const lines = [
    "professional character design reference sheet, single image",
    "LEFT THIRD: close-up portrait of the character's face, frontal view, detailed facial features, natural expression",
    "RIGHT TWO-THIRDS: full-body character turnaround showing three views side by side: front view, side view, back view",
    "all four views depict the SAME character with IDENTICAL costume, hairstyle, and color scheme",
    "white background, clean studio lighting, no text or watermarks",
    "manga/webtoon illustration style, clean line art, vibrant colors",
  ];
  if (character.persona) lines.push(`character personality: ${character.persona}`);
  if (visualAnchorText) lines.push(`appearance: ${visualAnchorText}`);
  lines.push("consistent character design, high quality illustration");
  return lines.join(", ");
}

export function getFaceShapeOverride(character: ComicCharacter): string {
  if (!character.visualAnchor) return "";
  try {
    const parsed = JSON.parse(character.visualAnchor) as Record<string, unknown>;
    const spec = parsed.visualSpec as Record<string, unknown> | undefined;
    if (spec && typeof spec.faceShapeOverride === "string") return spec.faceShapeOverride;
  } catch { /* ignore */ }
  return "";
}
