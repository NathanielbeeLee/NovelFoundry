export const APPLY_TO_NOVEL_FIELDS = ["name", "role", "personality", "background", "development"] as const;

export type ApplyToNovelField = (typeof APPLY_TO_NOVEL_FIELDS)[number];

export type BaseCharacterRow = {
  id: string;
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
  appearance: string | null;
  weaknesses: string | null;
  interests: string | null;
  keyEvents: string | null;
  tags: string | null;
  category: string;
};

export type CharacterRow = {
  id: string;
  novelId: string;
  name: string;
  role: string;
  personality: string | null;
  background: string | null;
  development: string | null;
  currentState: string | null;
  currentGoal: string | null;
  baseCharacterId: string | null;
};
