import { buildContentHash } from "../../../novel/artifacts/persistence";

/** Summary regeneration can change retrieval content without changing the chapter body. */
export function buildSummarySourceHash(summary: {
  summary: string; keyEvents?: string | null; characterStates?: string | null; hook?: string | null;
}): string {
  return buildContentHash(JSON.stringify([
    summary.summary, summary.keyEvents ?? null, summary.characterStates ?? null, summary.hook ?? null,
  ]));
}
