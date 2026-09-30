import type { GenerationContextPackage } from "@novelfoundry/shared/types/chapterRuntime";
import type { plannerService } from "../../../../planner/PlannerService";
import { parseJsonStringArray } from "../../../novelP0Utils";

export function mapRuntimePlan(plan: Awaited<ReturnType<typeof plannerService.getChapterPlan>>): GenerationContextPackage["plan"] {
  if (!plan) {
    return null;
  }
  return {
    id: plan.id,
    chapterId: plan.chapterId ?? null,
    planRole: plan.planRole ?? null,
    phaseLabel: plan.phaseLabel ?? null,
    title: plan.title,
    objective: plan.objective,
    participants: parseJsonStringArray(plan.participantsJson),
    reveals: parseJsonStringArray(plan.revealsJson),
    riskNotes: parseJsonStringArray(plan.riskNotesJson),
    mustAdvance: parseJsonStringArray(plan.mustAdvanceJson),
    mustPreserve: parseJsonStringArray(plan.mustPreserveJson),
    sourceIssueIds: parseJsonStringArray(plan.sourceIssueIdsJson),
    replannedFromPlanId: plan.replannedFromPlanId ?? null,
    hookTarget: plan.hookTarget ?? null,
    rawPlanJson: plan.rawPlanJson ?? null,
    scenes: plan.scenes.map((scene: (typeof plan.scenes)[number]) => ({
      id: scene.id,
      sortOrder: scene.sortOrder,
      title: scene.title,
      objective: scene.objective ?? null,
      conflict: scene.conflict ?? null,
      reveal: scene.reveal ?? null,
      emotionBeat: scene.emotionBeat ?? null,
    })),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
