import { createHash } from "node:crypto";
import type { ChapterEditorConsequenceAssessment, ChapterEditorConsequenceRequest } from "@novelfoundry/shared/types/novel";
import { AppError } from "../../../../../middleware/errorHandler";

export interface ConsequenceReference { refId: string; label: string; text: string; chapterOrder?: number; freshness?: "current" | "unverified"; }
export interface ConsequenceRevisionGuard {
  model: "chapter" | "storyPlan" | "volumeChapterPlan" | "storyStateSnapshot" | "characterState" | "characterResourceLedgerItem" | "payoffLedgerItem";
  id: string;
  updatedAt: string;
}
export interface ConsequenceInventory {
  savedContent: string | null;
  references: ConsequenceReference[];
  guards: ConsequenceRevisionGuard[];
  revision: string;
  limitations?: string[];
}

/** Exact UTF-8 identity: whitespace, null, order and range bytes are significant. */
export function consequenceDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertConsequenceRange(input: ChapterEditorConsequenceRequest): string {
  const { from, to, text } = input.targetRange;
  if (from < 0 || to <= from || to > input.contentSnapshot.length || input.contentSnapshot.slice(from, to) !== text) {
    throw new AppError("选区或正文已变化，请重新选择候选并评估。", 409);
  }
  return input.contentSnapshot.slice(0, from) + input.candidate.content + input.contentSnapshot.slice(to);
}

export function consequenceBinding(novelId: string, chapterId: string, input: ChapterEditorConsequenceRequest, revision: string): string {
  assertConsequenceRange(input);
  return consequenceDigest({ novelId, chapterId, input, revision });
}

export function validateConsequenceEvidence(assessment: ChapterEditorConsequenceAssessment, input: ChapterEditorConsequenceRequest, references: ConsequenceReference[]): void {
  const available = new Map(references.map((reference) => [reference.refId, reference]));
  for (const finding of assessment.findings) {
    if (!finding.currentQuote.trim() || !finding.candidateQuote.trim() || !input.contentSnapshot.includes(finding.currentQuote) || !input.candidate.content.includes(finding.candidateQuote)) {
      throw new AppError("影响评估的正文引文未通过核对，请重新评估。", 422);
    }
    for (const evidence of finding.dependencies) {
      if (!evidence.quote.trim() || !available.get(evidence.refId)?.text.includes(evidence.quote)) {
        throw new AppError("影响评估引用了未提供的依据，请重新评估。", 422);
      }
    }
    if (finding.kind === "conflict" && (finding.confidence !== "supported" || finding.dependencies.length === 0
      || finding.dependencies.some((evidence) => available.get(evidence.refId)?.freshness === "unverified"))) {
      throw new AppError("影响评估缺少冲突依据，请重新评估。", 422);
    }
    if (finding.kind === "possible_effect" && finding.confidence !== "uncertain") {
      throw new AppError("后续影响须标明不确定性，请重新评估。", 422);
    }
  }
}
