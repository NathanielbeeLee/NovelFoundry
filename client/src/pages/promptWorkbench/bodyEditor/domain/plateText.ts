import type { Descendant, Value } from "platejs";

export function toPlateValue(text: string): Value {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [""];
  return lines.map((line) => ({
    type: "p",
    children: [{ text: line }],
  }));
}

function nodeToText(node: Descendant): string {
  if ("text" in node && typeof node.text === "string") {
    return node.text;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map((child) => nodeToText(child as Descendant)).join("");
  }
  return "";
}

export function toPlainText(value: Value): string {
  return (value as Descendant[]).map((node) => nodeToText(node)).join("\n");
}

export function normalizeValuePayload(payload: unknown): Value {
  if (Array.isArray(payload)) {
    return payload as Value;
  }
  if (payload && typeof payload === "object" && "value" in payload) {
    const value = (payload as { value?: unknown }).value;
    if (Array.isArray(value)) {
      return value as Value;
    }
  }
  return [];
}
