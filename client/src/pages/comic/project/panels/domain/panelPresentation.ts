import type { ComicDialogue, ComicPanel } from "@/api/comic";

export function parseImageData(
  raw: string | null | undefined,
): {
  status?: string;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  referenceImages?: Array<{ kind: string; label: string; url: string }>;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const REF_KIND_LABEL: Record<string, string> = {
  character_sheet: "三视图",
  character_expression: "表情稿",
  character_face: "面部裁剪",
  asset: "资产",
  scene: "场景",
};

export const REF_KIND_COLOR: Record<string, string> = {
  character_sheet: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  character_expression: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/20 dark:text-pink-300",
  character_face: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  asset: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  scene: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
};

const DENSITY_BADGE: Record<string, { label: string; className: string }> = {
  low: { label: "低密度", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  medium: { label: "中密度", className: "border-sky-200 bg-sky-50 text-sky-700" },
  high: { label: "高密度", className: "border-amber-200 bg-amber-50 text-amber-700" },
};

export function densityBadge(value: string | null | undefined): { label: string; className: string } {
  return DENSITY_BADGE[value ?? ""] ?? { label: "未标注", className: "border-border bg-muted text-muted-foreground" };
}

export function parseLayoutData(raw: string | null | undefined): {
  layout?: string;
  subPanels?: Array<{ order?: number; beat?: string; visualPrompt?: string }>;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function isPanelImageStale(panel: ComicPanel, imageData: { status?: string; generatedAt?: string }): boolean {
  if (imageData.status !== "done" || !imageData.generatedAt || !panel.updatedAt) return false;
  const imageGeneratedAt = Date.parse(imageData.generatedAt);
  const panelUpdatedAt = Date.parse(panel.updatedAt);
  if (Number.isNaN(imageGeneratedAt) || Number.isNaN(panelUpdatedAt)) return false;
  return panelUpdatedAt > imageGeneratedAt + 1000;
}

export function parseDialogues(raw: string | null | undefined): ComicDialogue[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ComicDialogue[];
  } catch {
    return [];
  }
}
