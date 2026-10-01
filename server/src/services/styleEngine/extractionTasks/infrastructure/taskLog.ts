export function formatLogValue(value: unknown): string {
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

export function writeTaskLog(
  level: "info" | "warn",
  event: string,
  payload: Record<string, unknown>,
): void {
  const parts = ["[style.extraction.task]", `event=${event}`];
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${formatLogValue(value)}`);
  }
  console[level](parts.join(" "));
}
