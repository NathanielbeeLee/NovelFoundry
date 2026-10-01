import type { StoryPlanLevel } from "../../novel";

export interface DirectorPlanScene {
  title: string;
  objective: string;
  conflict?: string;
  reveal?: string;
  emotionBeat?: string;
}

export interface DirectorChapterSeed {
  title: string;
  objective: string;
  expectation: string;
  planRole: "setup" | "progress" | "pressure" | "turn" | "payoff" | "cooldown";
  hookTarget?: string;
  participants: string[];
  reveals: string[];
  riskNotes: string[];
  mustAdvance: string[];
  mustPreserve: string[];
  scenes: DirectorPlanScene[];
}

export interface DirectorArcSeed {
  title: string;
  objective: string;
  summary: string;
  phaseLabel: string;
  hookTarget?: string;
  participants: string[];
  reveals: string[];
  riskNotes: string[];
  chapters: DirectorChapterSeed[];
}

export interface DirectorPlanBlueprint {
  bookPlan: {
    title: string;
    objective: string;
    hookTarget?: string;
    participants: string[];
    reveals: string[];
    riskNotes: string[];
  };
  arcs: DirectorArcSeed[];
}

export interface DirectorPlanDigest {
  level: StoryPlanLevel;
  id: string;
  title: string;
  objective: string;
  chapterId?: string | null;
  externalRef?: string | null;
  rawPlanJson?: string | null;
}
