// ─── Scenes ────────────────────────────────────────────────────────────────────

export type SceneType = "interior" | "exterior" | "landscape" | "abstract" | "other";

export type SceneSheetStatus = "idle" | "generating" | "done" | "error";

export interface SceneBible {
  palette?: string;
  keyElements?: string;
  materials?: string;
  ambiance?: string;
  layout?: string;
}

export interface SceneSheetData {
  status: SceneSheetStatus;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  origin?: "generated" | "uploaded";
}

export interface ComicScene {
  id: string;
  projectId: string;
  name: string;
  sceneType: SceneType;
  bible: string | null; // JSON SceneBible
  sheetData: string | null; // JSON SceneSheetData
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScenePayload {
  projectId: string;
  name: string;
  sceneType?: SceneType;
  bible?: SceneBible;
  sortOrder?: number;
}

export interface UpdateScenePayload {
  name?: string;
  sceneType?: SceneType;
  bible?: SceneBible;
  sortOrder?: number;
}
