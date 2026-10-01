// ─── 生图前确认弹窗用 ─────────────────────────────────────────────────────────

export interface ImageGenerationPreview {
  kind: string;
  title: string;
  prompt: string;
  negativePrompt?: string;
  referenceImages: Array<{ kind: string; label: string; url: string; assetId?: string }>;
  provider: string;
  size: string;
  availableProviders?: Array<{ value: string; label: string }>;
  availableSizes?: string[];
}

export interface ImageGenerationOverrides {
  promptOverride?: string;
  providerOverride?: string;
  sizeOverride?: string;
  negativePromptOverride?: string;
  excludedReferenceImageUrls?: string[];
}

// ─── Batch jobs ───────────────────────────────────────────────────────────────

export interface BatchProgress {
  total: number;
  done: number;
  failed: number;
  failedPanelIds: string[];
  status: "running" | "completed" | "partial";
}

export interface StartBatchPayload {
  provider?: string;
  concurrency?: number;
  skipDone?: boolean;
}

export interface BatchCostEstimate {
  totalPanels: number;
  pendingPanels: number;
  estimatedCentsCost: number;
  providerNote: string;
}
