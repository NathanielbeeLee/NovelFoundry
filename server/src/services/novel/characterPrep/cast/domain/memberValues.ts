export function toOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

export function fillIfMissing(existing: string | null | undefined, incoming: string | null | undefined): string | undefined {
  if (existing?.trim()) {
    return undefined;
  }
  return toOptionalText(incoming) ?? undefined;
}
