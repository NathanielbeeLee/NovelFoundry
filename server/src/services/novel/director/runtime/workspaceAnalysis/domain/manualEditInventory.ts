import type { AiManualEditImpactDecision, DirectorArtifactRef, DirectorManualEditInventory } from "@novelfoundry/shared/types/directorRuntime";

function timestampOf(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function resolveRelatedArtifactIds(artifacts: DirectorArtifactRef[], chapterId: string): string[] {
  const directIds = new Set(
    artifacts
      .filter((artifact) => artifact.targetType === "chapter" && artifact.targetId === chapterId)
      .map((artifact) => artifact.id),
  );
  const related = new Set(directIds);
  for (const artifact of artifacts) {
    if (artifact.dependsOn?.some((dependency) => directIds.has(dependency.artifactId))) {
      related.add(artifact.id);
    }
  }
  return [...related];
}

export function buildManualEditInventoryFromArtifacts(input: {
  novelId: string;
  artifacts: DirectorArtifactRef[];
  previousArtifacts?: DirectorArtifactRef[] | null;
  focusedChapterId?: string | null;
  comparedAgainstTaskId?: string | null;
  chapterMetaById?: Record<string, {
    title: string;
    order: number;
    changedAt?: string | null;
  }>;
  generatedAt?: string;
}): DirectorManualEditInventory {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const previousById = new Map((input.previousArtifacts ?? []).map((artifact) => [artifact.id, artifact]));
  const currentDrafts = input.artifacts
    .filter((artifact) => artifact.artifactType === "chapter_draft" && artifact.targetType === "chapter" && artifact.targetId)
    .sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt));
  const hasBaseline = previousById.size > 0;
  const candidates = currentDrafts.filter((artifact) => {
    if (input.focusedChapterId && artifact.targetId !== input.focusedChapterId) {
      return false;
    }
    if (input.focusedChapterId) {
      return true;
    }
    const previous = previousById.get(artifact.id);
    return hasBaseline
      ? Boolean(previous?.contentHash && artifact.contentHash && previous.contentHash !== artifact.contentHash)
      : Boolean(artifact.protectedUserContent);
  });
  const selected = hasBaseline || input.focusedChapterId
    ? candidates
    : candidates.slice(0, 3);

  return {
    novelId: input.novelId,
    comparedAgainstTaskId: input.comparedAgainstTaskId ?? null,
    generatedAt,
    changedChapters: selected.map((artifact) => {
      const chapterId = artifact.targetId as string;
      const meta = input.chapterMetaById?.[chapterId];
      const previous = previousById.get(artifact.id);
      return {
        chapterId,
        title: meta?.title ?? `章节 ${chapterId}`,
        order: meta?.order ?? 0,
        changedAt: meta?.changedAt ?? artifact.updatedAt ?? null,
        contentHash: artifact.contentHash ?? null,
        previousContentHash: previous?.contentHash ?? null,
        relatedArtifactIds: resolveRelatedArtifactIds(input.artifacts, chapterId),
      };
    }),
  };
}

export function buildManualEditFallbackDecision(editInventory: DirectorManualEditInventory): AiManualEditImpactDecision {
  if (editInventory.changedChapters.length === 0) {
    return {
      impactLevel: "none",
      affectedArtifactIds: [],
      minimalRepairPath: [],
      safeToContinue: true,
      requiresApproval: false,
      summary: "没有检测到需要处理的手动正文改动。",
      riskNotes: [],
      evidenceRefs: ["manual_edit_inventory"],
      confidence: 0.65,
    };
  }
  const affectedArtifactIds = [...new Set(editInventory.changedChapters.flatMap((chapter) => chapter.relatedArtifactIds))];
  const affectedScope = editInventory.changedChapters
    .map((chapter) => `chapter:${chapter.chapterId}`)
    .join(",");
  return {
    impactLevel: editInventory.changedChapters.length > 2 ? "medium" : "low",
    affectedArtifactIds,
    minimalRepairPath: [{
      action: "review_recent_chapters",
      label: "复查最近修改章节",
      reason: "用户改过正文后，先确认本章审校结果、连续性和后续任务单是否仍然可用。",
      affectedScope,
      requiresApproval: false,
    }],
    safeToContinue: true,
    requiresApproval: false,
    summary: "检测到章节正文发生变化，建议先做局部复查，再继续自动导演。",
    riskNotes: [],
    evidenceRefs: ["manual_edit_inventory"],
    confidence: 0.6,
  };
}
