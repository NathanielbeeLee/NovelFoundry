export const CHARACTER_IMPORTANCE_TIERS = ["lead", "major", "named", "extra"] as const;
export type CharacterImportanceTier = typeof CHARACTER_IMPORTANCE_TIERS[number];

export function inferCharacterImportanceTier(
  explicit: string | null | undefined,
  castRole: string | null | undefined,
): CharacterImportanceTier {
  if (CHARACTER_IMPORTANCE_TIERS.includes(explicit as CharacterImportanceTier)) {
    return explicit as CharacterImportanceTier;
  }
  if (castRole === "protagonist") return "lead";
  if (["antagonist", "ally", "mentor", "love_interest", "pressure_source"].includes(castRole ?? "")) return "major";
  return "named";
}

export function characterImportanceRank(value: string | null | undefined): number {
  return { lead: 0, major: 1, named: 2, extra: 3 }[value ?? "named"] ?? 2;
}

export function characterContextLimit(value: string | null | undefined): number {
  return { lead: 1200, major: 800, named: 360, extra: 120 }[value ?? "named"] ?? 360;
}
