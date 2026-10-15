import { createHash } from "node:crypto";
import { z } from "zod";
import { RESEARCH_INPUT_CHAR_LIMIT } from "@novelfoundry/shared/types/knowledgeResearch";
import { AppError } from "../../../../middleware/errorHandler";

export const researchContentHash = (content: string): string => createHash("sha256").update(content).digest("hex");
export const researchExtractionSchema = z.object({
  findings: z.array(z.object({
    claim: z.string().trim().min(1).max(400),
    quote: z.string().min(1).max(600),
    startOffset: z.number().int().min(0).nullable(), endOffset: z.number().int().min(1).nullable(),
    uncertainty: z.string().trim().min(1).max(300),
  }).strict()).max(5),
}).strict();
export function assertResearchInput(content: string): void {
  if (!content.trim() || content.length > RESEARCH_INPUT_CHAR_LIMIT) {
    throw new AppError(`单份资料须为 1～${RESEARCH_INPUT_CHAR_LIMIT} 个字符。请上传较短的独立资料后再提取；不会截取部分内容冒充全文。`, 400);
  }
}
function safeBoundary(content: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > content.length) return false;
  const previous = content.charCodeAt(offset - 1);
  const next = content.charCodeAt(offset);
  return !(previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF);
}
function exactQuote(content: string, quote: string, start: number, end: number): boolean {
  return end > start && safeBoundary(content, start) && safeBoundary(content, end)
    && content.slice(start, end) === quote;
}
export function groundResearchFindings(raw: unknown, content: string) {
  assertResearchInput(content);
  const parsed = researchExtractionSchema.parse(raw);
  return parsed.findings.map(finding => {
    let { startOffset, endOffset } = finding;
    const exact = startOffset !== null && endOffset !== null && exactQuote(content, finding.quote, startOffset, endOffset);
    if (!exact) {
      const index = content.indexOf(finding.quote);
      if (index < 0 || content.indexOf(finding.quote, index + 1) >= 0
        || !exactQuote(content, finding.quote, index, index + finding.quote.length)) {
        throw new AppError("提取结果的引文无法唯一对应原文，请重新提取。", 422);
      }
      startOffset = index;
      endOffset = index + finding.quote.length;
    }
    return { ...finding, startOffset: startOffset!, endOffset: endOffset! };
  });
}
export interface ResearchFreshnessSource {
  enabled: boolean; revision: string; contentHash: string; documentVersionId: string;
  documentVersion: { content: string; document: { status: string; activeVersionId: string | null } };
}
export function isResearchSourceFresh(source: ResearchFreshnessSource): boolean {
  return source.enabled && source.documentVersion.document.status === "enabled"
    && source.documentVersion.document.activeVersionId === source.documentVersionId
    && source.contentHash === researchContentHash(source.documentVersion.content);
}
export function isResearchFindingFresh(finding: {
  sourceRevision: string; contentHash: string; quote: string; startOffset: number; endOffset: number;
}, source: ResearchFreshnessSource): boolean {
  return isResearchSourceFresh(source) && finding.sourceRevision === source.revision
    && finding.contentHash === source.contentHash
    && exactQuote(source.documentVersion.content, finding.quote, finding.startOffset, finding.endOffset);
}
