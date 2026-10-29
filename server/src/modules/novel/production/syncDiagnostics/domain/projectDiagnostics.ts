import type { ChapterSyncDiagnosticItem, ChapterSyncDiagnosticKey, ChapterSyncDiagnosticStatus, ChapterSyncDiagnosticsResponse } from "@novelfoundry/shared/types/novel";
import { buildContentHash } from "../../../../../services/novel/artifacts/persistence";
import { ARTIFACT_SYNC_RUNNING_STALE_MS, SOURCE_FRESHNESS_VERSION } from "../../../../../services/novel/artifacts/sourcePolicy";
import { hashContent, TIMELINE_FINALIZATION_RUNNING_STALE_MS } from "../../../../../services/novel/runtime/timelineFinalization/sourceIdentity";
import { buildSummarySourceHash } from "../../../../../services/rag/indexing/sourceIdentity";
import type { ChapterSyncSnapshot, SyncCheckpoint } from "./contracts";
import { parseEvidence, sourceRevision } from "./sourceIdentity";

const keys: ChapterSyncDiagnosticKey[] = ["summary", "artifacts", "timeline", "ragChapter", "ragSummary"];

function item(key: ChapterSyncDiagnosticKey, status: ChapterSyncDiagnosticStatus, detail: string,
  updatedAt: Date | null = null, matchesCurrentSource: boolean | null = null): ChapterSyncDiagnosticItem {
  return { key, status, detail, updatedAt: updatedAt?.toISOString() ?? null, matchesCurrentSource };
}

function checkpointState(key: ChapterSyncDiagnosticKey, checkpoint: SyncCheckpoint | undefined,
  currentHash: string, now: Date, timeout: number): ChapterSyncDiagnosticItem {
  if (!checkpoint) return item(key, "unknown", "尚无可核对的同步记录；手动保存的章节也可能处于此状态。");
  if (checkpoint.contentHash !== currentHash) return item(key, "stale", "同步记录对应其他正文版本，不能确认本次保存的内容。", checkpoint.updatedAt, false);
  if (checkpoint.status === "running") {
    return now.getTime() - checkpoint.updatedAt.getTime() >= timeout
      ? item(key, "stale", "同步记录长时间没有更新，无法确认任务是否仍在执行。", checkpoint.updatedAt, true)
      : item(key, "running", "正在同步本次保存的正文。", checkpoint.updatedAt, true);
  }
  if (checkpoint.status === "failed") return item(key, "failed", "本次正文的同步尝试未完成；此提示不代表整书写作失败。", checkpoint.updatedAt, true);
  return item(key, "unknown", "记录缺少当前正文的完整来源证据，暂不能确认同步完成。", checkpoint.updatedAt);
}

function projectArtifacts(snapshot: ChapterSyncSnapshot, contentHash: string, now: Date): ChapterSyncDiagnosticItem {
  const rows = snapshot.checkpoints.filter((row) => row.artifactType === "artifact_delta");
  const complete = rows.find((row) => row.contentHash === contentHash && row.status === "succeeded"
    && parseEvidence(row.metadataJson).sourceFreshnessVersion === SOURCE_FRESHNESS_VERSION
    && snapshot.summary?.sourceContentHash === contentHash
    && snapshot.summary.updatedAt.getTime() <= row.updatedAt.getTime());
  if (complete) return item("artifacts", "current", "角色与状态资料的同步记录匹配本次正文；需要人工确认的提案仍按原流程处理。", complete.updatedAt, true);
  return checkpointState("artifacts", rows[0], contentHash, now, ARTIFACT_SYNC_RUNNING_STALE_MS);
}

function projectTimeline(snapshot: ChapterSyncSnapshot, contentHash: string, now: Date): ChapterSyncDiagnosticItem {
  const timelineHash = hashContent((snapshot.chapter.content ?? "").trim());
  const rows = snapshot.checkpoints.filter((row) => row.artifactType === "timeline_finalization");
  const current = rows.filter((row) => row.contentHash === timelineHash && row.status === "succeeded"
    && parseEvidence(row.metadataJson).sourceContentHash === contentHash);
  const stable = current.find((row) => row.syncMode === "stable");
  if (stable) return item("timeline", "current", "时间线收尾记录匹配本次正文。", stable.updatedAt, true);
  const degraded = current.find((row) => row.syncMode === "degraded");
  if (degraded) return item("timeline", "degraded", "时间线通过保底方式完成收尾，部分细节可后续补充；不阻断后续章节。", degraded.updatedAt, true);
  return checkpointState("timeline", rows[0], timelineHash, now, TIMELINE_FINALIZATION_RUNNING_STALE_MS);
}

function projectIndex(snapshot: ChapterSyncSnapshot, ownerType: "chapter" | "chapter_summary", contentHash: string): ChapterSyncDiagnosticItem {
  const key = ownerType === "chapter" ? "ragChapter" : "ragSummary";
  const summary = snapshot.summary;
  if (ownerType === "chapter_summary" && (!summary || summary.sourceContentHash !== contentHash)) {
    return item(key, summary ? "stale" : "unknown", "需先有匹配本次正文的摘要，才能确认摘要检索资料。", summary?.updatedAt ?? null, summary ? false : null);
  }
  const revision = sourceRevision(snapshot.chapter, summary);
  const jobs = snapshot.jobs.filter((row) => row.ownerType === ownerType);
  const currentJob = jobs.find((row) => parseEvidence(row.payloadJson).sourceRevision === revision);
  if (currentJob?.status === "queued" || currentJob?.status === "running" || currentJob?.status === "failed") {
    const detail = currentJob.status === "queued" ? "本次正文的检索更新已排队。"
      : currentJob.status === "running" ? "检索更新记录显示正在执行；此处不检测后台进程是否存活。"
        : "本次正文的检索更新尝试未完成；可继续写作。";
    return item(key, currentJob.status, detail, currentJob.updatedAt, true);
  }
  if (snapshot.truncatedChunkOwners.includes(ownerType)) {
    return item(key, "unknown", "检索资料超出本次检查范围，暂不能确认全部资料的版本。");
  }
  const chunks = snapshot.chunks.filter((row) => row.ownerType === ownerType);
  if (chunks.length) {
    if (chunks.some((row) => row.indexedAt === null)) {
      return item(key, "unknown", "本地检索资料缺少完成时间，暂不能确认索引完成。");
    }
    const matches = chunks.every((row) => {
      const metadata = parseEvidence(row.metadataJson);
      return metadata.sourceContentHash === contentHash
        && (ownerType === "chapter"
          ? metadata.updatedAt === snapshot.chapter.updatedAt.toISOString()
          : metadata.sourceSummaryHash === buildSummarySourceHash(summary!));
    });
    const latest = new Date(Math.max(...chunks.map((row) => row.indexedAt!.getTime())));
    return matches
      ? item(key, "current", "本地检索资料匹配本次保存内容；此检查不验证外部向量服务的连通性。", latest, true)
      : item(key, "stale", "本地检索资料缺少当前版本证据，或仍包含其他版本的内容。", latest, false);
  }
  if (currentJob?.status === "succeeded") return item(key, "unknown", "更新任务已结束，但没有可核对的本地检索资料，暂不能确认可检索。", currentJob.updatedAt);
  const latestJob = jobs[0];
  if (latestJob && typeof parseEvidence(latestJob.payloadJson).sourceRevision === "string") {
    return item(key, "stale", "仅找到其他保存版本的检索任务，尚不能确认本次内容。", latestJob.updatedAt, false);
  }
  return item(key, "unknown", "尚无可核对的当前版本检索资料。", latestJob?.updatedAt ?? null);
}

export function projectChapterSyncDiagnostics(snapshot: ChapterSyncSnapshot, now: Date, sourceUnchanged: boolean): ChapterSyncDiagnosticsResponse {
  const { chapter, summary } = snapshot;
  const contentHash = buildContentHash(chapter.content ?? "");
  const hasContent = Boolean(chapter.content?.trim());
  const items = !sourceUnchanged
    ? keys.map((key) => item(key, "unknown", "检查期间正文或摘要发生变化，请刷新后查看保存版本的同步情况。"))
    : !hasContent
      ? keys.map((key) => item(key, "not_applicable", "章节尚无正文，无需检查正文同步。"))
      : [
        !summary ? item("summary", "unknown", "尚无可核对的章节摘要。")
          : summary.sourceContentHash === contentHash
            ? item("summary", "current", "章节摘要匹配本次保存的正文。", summary.updatedAt, true)
            : item("summary", "stale", "摘要尚未匹配本次保存的正文。", summary.updatedAt, false),
        projectArtifacts(snapshot, contentHash, now),
        projectTimeline(snapshot, contentHash, now),
        projectIndex(snapshot, "chapter", contentHash),
        projectIndex(snapshot, "chapter_summary", contentHash),
      ];
  return {
    novelId: chapter.novelId, chapterId: chapter.id, checkedAt: now.toISOString(),
    source: { chapterUpdatedAt: chapter.updatedAt.toISOString(), contentHash, hasContent },
    consistency: sourceUnchanged ? "consistent" : "changed_during_read", items,
  };
}
