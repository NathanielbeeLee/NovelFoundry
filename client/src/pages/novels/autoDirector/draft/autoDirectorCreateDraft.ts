import { DIRECTOR_RUN_MODES, type DirectorRunMode, type DirectorWorldSetupMode } from "@novelfoundry/shared/types/novelDirector";
import type { NovelBasicFormState } from "../../novelBasicInfo.shared";
import type { AutoDirectorCreateStageKey } from "../directorCreateStages";

/**
 * Device-local draft of the auto-director opening wizard before a director
 * task exists. Once a task is created, the server task owns the opening state
 * and this draft is cleared.
 */
export const AUTO_DIRECTOR_CREATE_DRAFT_KEY = "novelfoundry.auto-director-create.draft.v1";

const DRAFT_STAGES: readonly AutoDirectorCreateStageKey[] = ["idea", "basic", "world_style", "model_run"];
const WORLD_SETUP_MODES: readonly DirectorWorldSetupMode[] = ["auto_generate", "skip"];

export interface AutoDirectorCreateDraft {
  idea: string;
  basicForm: Partial<NovelBasicFormState>;
  activeStage: AutoDirectorCreateStageKey;
  completedStages: AutoDirectorCreateStageKey[];
  /** Null when the saved value is missing or no longer a valid run mode. */
  runMode: DirectorRunMode | null;
  worldSetupMode: DirectorWorldSetupMode;
  selectedStyleProfileId: string;
  savedAt: string;
}

export type AutoDirectorCreateDraftInput = Omit<AutoDirectorCreateDraft, "savedAt">;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDraftStage(value: unknown): value is AutoDirectorCreateStageKey {
  return typeof value === "string" && (DRAFT_STAGES as readonly string[]).includes(value);
}

/** Keeps only fields whose type matches the current form defaults. */
function sanitizeBasicForm(value: unknown, defaults: NovelBasicFormState): Partial<NovelBasicFormState> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const candidate = value[key];
    if (candidate === undefined) {
      continue;
    }
    const matches = Array.isArray(fallback)
      ? Array.isArray(candidate) && candidate.every((item) => typeof item === "string")
      : typeof candidate === typeof fallback && (typeof candidate !== "number" || Number.isFinite(candidate));
    if (matches) {
      result[key] = candidate;
    }
  }
  return result as Partial<NovelBasicFormState>;
}

export function hasAutoDirectorCreateDraftContent(input: AutoDirectorCreateDraftInput): boolean {
  return input.idea.trim().length > 0 || input.completedStages.length > 0 || input.activeStage !== "idea";
}

export function saveAutoDirectorCreateDraft(storage: DraftStorage, input: AutoDirectorCreateDraftInput): void {
  try {
    if (!hasAutoDirectorCreateDraftContent(input)) {
      storage.removeItem(AUTO_DIRECTOR_CREATE_DRAFT_KEY);
      return;
    }
    const draft: AutoDirectorCreateDraft = {
      ...input,
      activeStage: isDraftStage(input.activeStage) ? input.activeStage : "model_run",
      completedStages: input.completedStages.filter(isDraftStage),
      savedAt: new Date().toISOString(),
    };
    storage.setItem(AUTO_DIRECTOR_CREATE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // The wizard stays usable when local storage is full or unavailable.
  }
}

export function loadAutoDirectorCreateDraft(
  storage: DraftStorage,
  defaults: NovelBasicFormState,
): AutoDirectorCreateDraft | null {
  try {
    const raw = storage.getItem(AUTO_DIRECTOR_CREATE_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.idea !== "string") {
      return null;
    }
    return {
      idea: value.idea,
      basicForm: sanitizeBasicForm(value.basicForm, defaults),
      activeStage: isDraftStage(value.activeStage) ? value.activeStage : "idea",
      completedStages: Array.isArray(value.completedStages) ? value.completedStages.filter(isDraftStage) : [],
      runMode: typeof value.runMode === "string" && (DIRECTOR_RUN_MODES as readonly string[]).includes(value.runMode)
        ? value.runMode as DirectorRunMode
        : null,
      worldSetupMode: typeof value.worldSetupMode === "string" && (WORLD_SETUP_MODES as readonly string[]).includes(value.worldSetupMode)
        ? value.worldSetupMode as DirectorWorldSetupMode
        : "auto_generate",
      selectedStyleProfileId: typeof value.selectedStyleProfileId === "string" ? value.selectedStyleProfileId : "",
      savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function clearAutoDirectorCreateDraft(storage: DraftStorage): void {
  try {
    storage.removeItem(AUTO_DIRECTOR_CREATE_DRAFT_KEY);
  } catch {
    // Nothing else to clean when storage is unavailable.
  }
}
