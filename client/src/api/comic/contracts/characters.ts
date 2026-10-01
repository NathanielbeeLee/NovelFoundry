import type { PanelReferenceImageMeta } from "./core";

// ─── Characters ───────────────────────────────────────────────────────────────

export interface CharacterSheetData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  assets?: {
    expression?: CharacterExpressionData;
  };
}

export interface CharacterExpressionData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  referenceImages?: PanelReferenceImageMeta[];
}

export interface GenerateCharacterSheetOptions {
  prompt?: string;
  useCurrentImageAsReference?: boolean;
  lockAppearance?: boolean;
  appearanceOverride?: string;
}

// ─── Character Assets ──────────────────────────────────────────────────────────

export type CharacterAssetType = "costume" | "weapon" | "item" | "vehicle" | "ability" | "other";

export type AssetImageStatus = "idle" | "generating" | "done" | "error";

export interface AssetImageData {
  status: AssetImageStatus;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  origin?: "generated" | "uploaded";
}

export interface ComicCharacterAsset {
  id: string;
  characterId: string;
  projectId: string;
  assetType: CharacterAssetType;
  name: string;
  description: string | null;
  imageData: string | null; // JSON AssetImageData
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetPayload {
  characterId: string;
  projectId: string;
  assetType: CharacterAssetType;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateAssetPayload {
  name?: string;
  description?: string;
  sortOrder?: number;
  assetType?: CharacterAssetType;
}

export interface UpdateVisualAnchorPayload {
  /** 主外貌描述 */
  appearance?: string;
  /** 脸型强覆盖（FINAL OVERRIDE）；当 appearance 含"锐利/尖锐"等冲突词时用此字段强压脸型 */
  faceShapeOverride?: string;
}

export interface VisualAnchorRewriteResult {
  appearance: string;
  faceShapeOverride?: string;
  rationale: string;
}
