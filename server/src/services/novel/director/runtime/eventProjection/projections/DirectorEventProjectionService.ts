import type { DirectorChapterExecutionProgressSummary, DirectorRuntimeProjection, DirectorRuntimeSnapshot, DirectorTaskFactSummary } from "@novelfoundry/shared/types/directorRuntime";
import { latestStep, latestEvent, statusFromStep, resolveBlockedReason, timestampOf } from "./eventStatus";
import { buildHeadline, buildDetail, formatNextAction, buildScopeSummary, buildProgressSummary } from "./labels";
import { buildProgressBreakdown } from "./progress";
import { buildQualityDebtSummary, buildQualityBudgetSummary, readLatestQualityLoopAssessment } from "./quality";
import { buildRecoveryDecision, isAutomaticPolicy, buildVisibleRiskBadges } from "./recovery";

export class DirectorEventProjectionService {
  buildSnapshotProjection(
    snapshot: DirectorRuntimeSnapshot | null,
    options?: {
      chapterProgress?: DirectorChapterExecutionProgressSummary | null;
      factSummary?: DirectorTaskFactSummary | null;
      currentFactStep?: {
        stepId: string;
        stepLabel: string;
        evidence?: Record<string, unknown> | null;
        nextActionLabel?: string | null;
      } | null;
    },
  ): DirectorRuntimeProjection | null {
    if (!snapshot) {
      return null;
    }
    const step = latestStep(snapshot.steps);
    const event = latestEvent(snapshot.events);
    const status = statusFromStep(step, options?.factSummary ?? null);
    const requiresUserAction = status === "waiting_approval" || status === "blocked";
    const blockedReason = resolveBlockedReason(step, event);
    const inventory = snapshot.lastWorkspaceAnalysis?.inventory ?? null;
    const recommendation = snapshot.lastWorkspaceAnalysis?.recommendation
      ?? snapshot.lastWorkspaceAnalysis?.interpretation?.recommendedAction
      ?? null;
    const headline = buildHeadline({ status, step, event });
    const progressBreakdown = buildProgressBreakdown(
      snapshot,
      inventory,
      options?.chapterProgress ?? null,
      options?.factSummary ?? null,
    );
    const qualityDebtSummary = buildQualityDebtSummary(snapshot.events);
    const qualityBudgetSummary = buildQualityBudgetSummary(snapshot.events);
    const qualityRootCause = readLatestQualityLoopAssessment(snapshot.events);
    const recoveryDecision = buildRecoveryDecision({
      status,
      inventory,
      blockedReason,
      qualityDebtCount: qualityDebtSummary?.deferredChapterCount ?? 0,
    });
    const isAutopilotRecoverable = isAutomaticPolicy(snapshot)
      && recoveryDecision !== "requires_manual_recovery"
      && status !== "completed"
      && status !== "idle";
    const visibleRiskBadges = buildVisibleRiskBadges({
      status,
      blockedReason,
      inventory,
      events: snapshot.events,
    });
    const recentEvents = [...snapshot.events]
      .sort((left, right) => timestampOf(right.occurredAt) - timestampOf(left.occurredAt))
      .slice(0, 8)
      .map((item) => ({
        eventId: item.eventId,
        type: item.type,
        summary: item.summary,
        nodeKey: item.nodeKey,
        artifactType: item.artifactType,
        severity: item.severity,
        occurredAt: item.occurredAt,
      }));

    return {
      runId: snapshot.runId,
      novelId: snapshot.novelId,
      status,
      currentNodeKey: step?.nodeKey ?? event?.nodeKey ?? null,
      currentLabel: step?.label ?? event?.summary ?? null,
      currentFactStepId: options?.currentFactStep?.stepId ?? null,
      currentFactStepLabel: options?.currentFactStep?.stepLabel ?? null,
      currentFactEvidence: options?.currentFactStep?.evidence ?? null,
      factSummary: options?.factSummary ?? null,
      headline,
      detail: buildDetail({ status, step, event, blockedReason }),
      lastEventSummary: event?.summary ?? null,
      requiresUserAction,
      blockedReason,
      blockingReason: blockedReason,
      nextActionLabel: options?.currentFactStep?.nextActionLabel ?? formatNextAction(recommendation),
      recommendedAction: recommendation,
      recoveryDecision,
      isAutopilotRecoverable,
      scopeSummary: buildScopeSummary(inventory),
      progressSummary: buildProgressSummary(snapshot, inventory, options?.factSummary ?? null),
      progressBreakdown,
      chapterExecutionProgress: options?.chapterProgress ?? null,
      visibleRiskBadges,
      rootCauseCode: qualityRootCause.rootCauseCode,
      blockingObligations: qualityRootCause.blockingObligations,
      qualityDebtSummary,
      qualityBudgetSummary,
      policyMode: snapshot.policy.mode,
      updatedAt: snapshot.updatedAt,
      recentEvents,
    };
  }
}
