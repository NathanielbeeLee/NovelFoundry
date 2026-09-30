import { createHash } from "node:crypto";
import { type BackupTables, sha256 } from "./archive";

/** Keep derivative offsets/hashes coherent only where an internal image URL actually changed. */
export function repairReferenceMetadata(source: BackupTables, target: BackupTables, ids: Map<string, string>): void {
  const rewrite = (text: string) => text.replace(/\/api\/images\/assets\/([A-Za-z0-9_-]+)\/file/g, (full, id: string) => ids.has(id) ? `/api/images/assets/${ids.get(id)}/file` : full);
  const versions = new Map((source.KnowledgeDocumentVersion ?? []).map((version) => [version.id, version]));
  for (const old of source.KnowledgeDocumentVersion ?? []) {
    const row = target.KnowledgeDocumentVersion.find((entry) => entry.id === ids.get(old.id))!;
    if (row.content === old.content) continue;
    const content = String(row.content);
    // KnowledgeService hashes its normalized stored text with SHA-256.
    row.contentHash = sha256(content.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim());
    row.charCount = content.length;
  }
  for (const old of source.DocumentChapter ?? []) {
    const version = versions.get(String(old.documentVersionId));
    if (!version || rewrite(String(version.content)) === version.content) continue;
    const row = target.DocumentChapter.find((entry) => entry.id === ids.get(old.id))!;
    row.startOffset = rewrite(String(version.content).slice(0, Number(old.startOffset))).length;
    row.endOffset = rewrite(String(version.content).slice(0, Number(old.endOffset))).length;
    row.charCount = Number(row.endOffset) - Number(row.startOffset);
  }
  for (const old of source.BookAnalysis ?? []) {
    const version = versions.get(String(old.documentVersionId));
    if (!version || rewrite(String(version.content)) === version.content) continue;
    const row = target.BookAnalysis.find((entry) => entry.id === ids.get(old.id))!;
    for (const key of ["sourceStartOffset", "sourceEndOffset"]) {
      if (typeof old[key] === "number") row[key] = rewrite(String(version.content).slice(0, old[key] as number)).length;
    }
  }
  for (const old of source.PromptTemplateVersion ?? []) {
    const row = target.PromptTemplateVersion.find((entry) => entry.id === ids.get(old.id))!;
    if (row.templateJson === old.templateJson) continue;
    // Prompt Registry hashPromptTemplate contract: SHA-1(JSON.stringify(template)), first 16 hex.
    row.compiledHash = createHash("sha1").update(JSON.stringify(JSON.parse(String(row.templateJson)))).digest("hex").slice(0, 16);
  }
}
