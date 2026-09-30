import type { WorldBindingSupport, WorldStructuredData } from "@novelfoundry/shared/types/world";
import { normalizeWorldBindingSupport } from "../domain/bindingSupport";
import { normalizeWorldStructuredData } from "../domain/normalizeStructure";

export function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function parseWorldStructurePayload(
  structureJson: string | null | undefined,
  bindingSupportJson: string | null | undefined,
): {
  structure: WorldStructuredData;
  bindingSupport: WorldBindingSupport;
  hasStructuredData: boolean;
} {
  const hasStructuredData = Boolean(structureJson?.trim());
  const structure = normalizeWorldStructuredData(safeParseJSON<unknown>(structureJson, null));
  const bindingSupport = normalizeWorldBindingSupport(safeParseJSON<unknown>(bindingSupportJson, null));
  return { structure, bindingSupport, hasStructuredData };
}
