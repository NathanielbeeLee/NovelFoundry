import type { CreationExperience } from "./project.js";

export type SimpleCreationShelfChapterStatus =
  | "waiting_planning"
  | "waiting_writing"
  | "generating"
  | "reviewing"
  | "completed"
  | "error";

export interface SimpleCreationShelfProjection {
  novel: {
    id: string;
    title: string;
    creationExperience: CreationExperience;
    estimatedChapterCount: number | null;
  };
  progress: {
    directorTaskId: string | null;
    percent: number;
    completedChapters: number;
    totalChapters: number;
    currentAction: string;
    status: "queued" | "running" | "paused" | "failed" | "completed";
    canRetry: boolean;
    safetyMessage?: string | null;
  };
  chapters: Array<{
    id: string;
    order: number;
    title: string;
    status: SimpleCreationShelfChapterStatus;
    wordCount: number;
    content: string | null;
    updatedAt: string;
  }>;
  materials: {
    description: string | null;
    characterCount: number;
    volumeCount: number;
    openQualityDebtCount: number;
    story: {
      coreSellingPoint: string | null;
      readingPromise: string | null;
      first30ChapterPromise: string | null;
      protagonistFantasy: string | null;
    };
    world: {
      name: string;
      summary: string | null;
    } | null;
    characters: Array<{
      id: string;
      name: string;
      role: string;
      storyFunction: string | null;
      currentGoal: string | null;
      personality: string | null;
    }>;
    volumes: Array<{
      id: string;
      order: number;
      title: string;
      summary: string | null;
      mainPromise: string | null;
      chapterCount: number;
    }>;
  };
}
