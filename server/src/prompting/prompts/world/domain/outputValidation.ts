import type { z } from "zod";
import type { WorldStructureSectionPromptInput } from "../world.promptTypes";
import type { worldStructureSectionOutputSchema } from "../../../../services/world/worldSchemas";

export function sanitizeLooseWorldObject(value: unknown, allowedKeys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须返回 JSON 对象。`);
  }

  const record = value as Record<string, unknown>;
  const normalizedAllowedKeys = new Set(allowedKeys.map((key) => key.trim()).filter(Boolean));
  if (normalizedAllowedKeys.size === 0) {
    throw new Error(`${label} 缺少允许字段配置。`);
  }

  const filteredEntries = Object.entries(record).filter(([key, fieldValue]) => {
    if (!normalizedAllowedKeys.has(key)) {
      return false;
    }
    return fieldValue != null;
  });

  if (filteredEntries.length === 0) {
    throw new Error(`${label} 没有返回任何允许字段。`);
  }

  return Object.fromEntries(filteredEntries);
}

export function normalizeWorldStructureSectionPayload(
  value: z.infer<typeof worldStructureSectionOutputSchema>,
  input: WorldStructureSectionPromptInput,
): z.infer<typeof worldStructureSectionOutputSchema> {
  const arraySections = new Set(["locations"]);
  const shouldReturnArray = arraySections.has(input.section);

  if (shouldReturnArray) {
    if (!Array.isArray(value)) {
      throw new Error(`world.structure.generate 在 section=${input.section} 时必须返回数组。`);
    }
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`world.structure.generate 在 section=${input.section} 时必须返回对象。`);
  }
  if (input.section === "factions") {
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.factions) && !Array.isArray(record.forces)) {
      throw new Error("world.structure.generate 在 section=factions 时必须返回包含 factions 或 forces 数组的对象。");
    }
  }
  return value;
}
