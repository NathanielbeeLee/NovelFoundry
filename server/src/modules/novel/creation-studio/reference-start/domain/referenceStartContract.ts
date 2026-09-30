import { createHash } from "node:crypto";
import type { CreationIntentInterpretation, CreationStudioConfirmRequest, ReferenceStartRequest } from "@novelfoundry/shared/types/creationStudio";

export interface ReferenceSourceSnapshot {
  analysisId: string;
  title: string;
  documentVersionId: string;
  fingerprint: string;
  sections: Array<{ key: string; content: string }>;
}

export interface ReferenceMechanisms {
  mechanisms: string[];
  creativeConstraints: string;
}

export interface OriginalReferenceBrief {
  originalIdea: string;
  interpretation: CreationIntentInterpretation;
}

export interface ReferenceStartState {
  schemaVersion: 1;
  request: ReferenceStartRequest;
  sourceTitle: string;
  sourceFingerprint: string;
  documentVersionId: string;
  attemptId: string;
  status: "extracting" | "generating" | "reviewing" | "ready" | "failed";
  mechanisms: string[];
  approvedBriefHash?: string;
  approvedIntentVersionId?: string;
  productionTaskId?: string;
  confirmedDirectionId?: string;
  confirmationLeaseUntil?: string;
}

export interface ReferenceTaskSeed extends Record<string, unknown> {
  idea?: string;
  currentIntentVersionId?: string;
  referenceStart?: ReferenceStartState;
}

export function contentFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Only approved creative fields belong in production. Source metadata is never spread. */
export function approvedBriefFingerprint(idea: string, interpretation: CreationIntentInterpretation): string {
  return contentFingerprint({ idea, interpretation });
}

export function assertReferenceConfirmation(input: {
  state: ReferenceStartState;
  intentId: string;
  idea: string;
  interpretation: CreationIntentInterpretation;
  sourceFingerprint: string;
  confirmation: CreationStudioConfirmRequest;
}): void {
  const { state, confirmation } = input;
  if (state.status !== "ready" || state.approvedIntentVersionId !== input.intentId
    || confirmation.expectedIntentVersionId !== input.intentId
    || !state.approvedBriefHash || confirmation.expectedBriefHash !== state.approvedBriefHash
    || approvedBriefFingerprint(input.idea, input.interpretation) !== state.approvedBriefHash) {
    throw new Error("原创方向有更新，请刷新并重新确认。");
  }
  if (state.sourceFingerprint !== input.sourceFingerprint) {
    throw new Error("参考分析有更新，请重新生成原创方向后再确认。");
  }
  if (!input.interpretation.directions.some((direction) => direction.id === confirmation.directionId)
    || (state.confirmedDirectionId && state.confirmedDirectionId !== confirmation.directionId)) {
    throw new Error("请继续已确认的原创方向。");
  }
  if (confirmation.narrativeForm !== "long_novel"
    || confirmation.targetWordCount !== input.interpretation.recommendedTargetWordCount
    || confirmation.writingPlatform !== input.interpretation.recommendedWritingPlatform) {
    throw new Error("请先按所选规模与平台重新生成原创方向。");
  }
}
