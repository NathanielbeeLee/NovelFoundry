/** Bind an AI plan's explicit references without fuzzy matching or name guessing. */
export function resolvePlanParticipants<T extends { id: string; name: string }>(
  references: readonly string[],
  roster: readonly T[],
): { characters: T[]; unresolved: string[] } {
  const selected = new Set<string>();
  const unresolved: string[] = [];
  for (const token of new Set(references)) {
    const idMatches = roster.filter((item) => item.id === token);
    const matches = idMatches.length ? idMatches : roster.filter((item) => item.name === token);
    if (matches.length === 1) selected.add(matches[0].id);
    else unresolved.push(token);
  }
  return { characters: roster.filter((item) => selected.has(item.id)), unresolved };
}
