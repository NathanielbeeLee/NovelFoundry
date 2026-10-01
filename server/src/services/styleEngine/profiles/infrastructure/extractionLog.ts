export function formatRuntimeLogValue(value: unknown): string {
  if (value == null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

export function logStyleExtractionRuntimeEvent(event: string, payload: Record<string, unknown>): void {
  const parts = ["[style.extraction.runtime]", `event=${event}`];
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${formatRuntimeLogValue(value)}`);
  }
  console.info(parts.join(" "));
}
