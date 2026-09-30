import { createHash } from "node:crypto";

/** Same canonical whitespace identity as artifact checkpoints. */
export function buildContentHash(content: string): string {
  return createHash("sha256").update(String(content ?? "").replace(/\s+/g, " ").trim()).digest("hex").slice(0, 24);
}
