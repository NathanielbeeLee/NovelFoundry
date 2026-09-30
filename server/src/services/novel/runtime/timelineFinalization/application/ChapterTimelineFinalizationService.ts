import type { GenerationContextPackage } from "@novelfoundry/shared/types/chapterRuntime";
import type { TimelineCheckResult, TimelineContextForChapter } from "@novelfoundry/shared/types/timeline";
import { artifactPrisma as prisma, buildContentHash, runWithChapterSource, StaleChapterSourceError } from "../../../artifacts/persistence";
import { storyTimelineService, timelineCheckerService, timelineContextService, timelineExtractorService, timelineRepository } from "../../../../../modules/timeline";
import { TimelineFinalizationCheckpointStore } from "../infrastructure/TimelineFinalizationCheckpointStore";
import { hashContent, chapterGoalFromContext, fallbackTimeLabel, openHookIds, plannedEventIds, forbiddenEventIds, type ChapterTimelineGateResult, type ChapterTimelineFinalizationResult, type TimelineFinalizationRequestOptions, type FinalizeCurrentContentInput } from "../domain/TimelineFinalizationContract";
export class ChapterTimelineFinalizationService {
  private readonly checkpoints = new TimelineFinalizationCheckpointStore();
  async hasCurrentFinalization(input: {
    novelId: string;
    chapterId: string;
    content: string;
  }): Promise<boolean> {
    return Boolean(await this.checkpoints.findCurrentFinalizationMode(input));
  }

  async ensurePreviousChapterFinalized(input: {
    novelId: string;
    currentChapterOrder: number;
    request?: TimelineFinalizationRequestOptions;
  }): Promise<ChapterTimelineFinalizationResult | null> {
    const previousChapter = await prisma.chapter.findFirst({
      where: {
        novelId: input.novelId,
        order: input.currentChapterOrder - 1,
        content: { not: null },
      },
      select: {
        id: true,
        title: true,
        order: true,
        content: true,
        expectation: true,
      },
    });
    const previousContent = previousChapter?.content?.trim();
    if (!previousChapter || !previousContent) {
      return null;
    }
    if (await this.hasCurrentFinalization({
      novelId: input.novelId,
      chapterId: previousChapter.id,
      content: previousContent,
    })) {
      return null;
    }
    const novel = await prisma.novel.findUnique({
      where: { id: input.novelId },
      select: { title: true },
    });
    const timelineContext = await timelineContextService.buildForChapter({
      novelId: input.novelId,
      chapterId: previousChapter.id,
      chapterIndex: previousChapter.order,
    }).catch(() => null);
    const contextPackage = {
      chapter: {
        id: previousChapter.id,
        title: previousChapter.title,
        order: previousChapter.order,
        content: previousContent,
        expectation: previousChapter.expectation,
        supportingContextText: "",
      },
      timelineContext,
      bookContract: novel?.title ? { title: novel.title } : null,
    } as unknown as GenerationContextPackage;
    return this.finalizeCurrentContent({
      novelId: input.novelId,
      chapterId: previousChapter.id,
      content: previousContent,
      contextPackage,
      request: input.request,
      sourceStage: "previous_chapter_guard",
      reason: "missing_current_timeline_finalization_checkpoint",
    });
  }

  async finalizeCurrentContent(input: FinalizeCurrentContentInput): Promise<ChapterTimelineFinalizationResult> {
    input.request?.signal?.throwIfAborted();
    try {
      return await this.finalizePreparedContent(input);
    } catch (error) {
      await this.checkpoints.markCheckpointFailed({
        novelId: input.novelId, chapterId: input.chapterId,
        contentHash: hashContent(input.content.trim()), syncMode: "stable", sourceStage: input.sourceStage,
        metadata: { reason: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  private async persistCurrentSource<T>(input: FinalizeCurrentContentInput, persist: () => Promise<T>): Promise<T> {
    return runWithChapterSource({
      novelId: input.novelId, chapterId: input.chapterId,
      contentHash: buildContentHash(input.content), signal: input.request?.signal,
    }, persist);
  }

  private async finalizePreparedContent(input: FinalizeCurrentContentInput): Promise<ChapterTimelineFinalizationResult> {
    if (input.timelineGate?.sourceContentHash !== buildContentHash(input.content)) {
      input = { ...input, timelineGate: null };
    }
    const content = input.content.trim();
    const contentHash = hashContent(content);
    const existingMode = await this.checkpoints.findCurrentFinalizationMode({
      novelId: input.novelId,
      chapterId: input.chapterId,
      content,
    });
    if (existingMode === "stable" || (existingMode === "degraded" && input.mode === "degraded")) {
      await this.persistCurrentSource(input, async () => undefined);
      return {
        syncMode: existingMode,
        contentHash,
        extractorSucceeded: existingMode === "stable",
        eventCount: 0,
        hookCount: 0,
        checkpointWritten: true,
      };
    }
    if (!content) {
      return this.finalizeDegraded({
        ...input,
        content,
        contentHash,
        reason: input.reason ?? "empty_final_content",
        timelineContext: input.contextPackage?.timelineContext ?? null,
        extractorSucceeded: false,
        eventCount: 0,
        hookCount: 0,
        anchorFallbackUsed: true,
      });
    }

    const chapter = input.contextPackage?.chapter;
    const chapterIndex = chapter?.order ?? await this.resolveChapterOrder(input.chapterId);
    const timelineContext = input.timelineGate?.timelineContext
      ?? input.contextPackage?.timelineContext
      ?? await timelineContextService.buildForChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex,
      }).catch(() => null);

    if (input.mode === "degraded") {
      return this.finalizeDegraded({
        ...input,
        content,
        contentHash,
        timelineContext,
        extractorSucceeded: input.timelineGate?.extractorSucceeded ?? false,
        eventCount: input.timelineGate?.extractedEvents.length ?? 0,
        hookCount: input.timelineGate?.extractedHooks.length ?? 0,
        anchorFallbackUsed: true,
      });
    }

    input.request?.signal?.throwIfAborted();
    const stableClaim = await this.checkpoints.claimCheckpoint({
      novelId: input.novelId,
      chapterId: input.chapterId,
      contentHash,
      syncMode: "stable",
      sourceStage: input.sourceStage,
      metadata: {
        reason: input.reason ?? "stable_timeline_finalization_started",
        sourceStage: input.sourceStage,
      },
    });
    input.request?.signal?.throwIfAborted();
    if (stableClaim === "already_done") {
      await this.persistCurrentSource(input, async () => undefined);
      return {
        syncMode: "stable",
        contentHash,
        extractorSucceeded: true,
        eventCount: 0,
        hookCount: 0,
        checkpointWritten: true,
      };
    }
    if (stableClaim === "running") {
      return {
        syncMode: "stable",
        contentHash,
        extractorSucceeded: false,
        eventCount: 0,
        hookCount: 0,
        checkpointWritten: false,
      };
    }

    const reusableGate = input.timelineGate?.sourceContentHash === buildContentHash(content) ? input.timelineGate : null;
    const gate = reusableGate ?? await this.extractAndCheck({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterIndex,
      chapterTitle: chapter?.title ?? `第 ${chapterIndex} 章`,
      novelTitle: input.contextPackage?.bookContract?.title ?? "当前小说",
      chapterGoal: chapterGoalFromContext(input.contextPackage),
      content,
      timelineContext,
      request: input.request,
    });

    input.request?.signal?.throwIfAborted();
    if (!gate.timelineContext || !gate.extractorSucceeded || gate.result.status === "failed") {
      await this.checkpoints.markCheckpointFailed({
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash,
        syncMode: "stable",
        sourceStage: input.sourceStage,
        metadata: {
          reason: input.reason ?? gate.extractorError ?? `timeline_${gate.result.status}`,
          sourceStage: input.sourceStage,
          extractorSucceeded: gate.extractorSucceeded,
        },
      });
      return this.finalizeDegraded({
        ...input,
        content,
        contentHash,
        timelineContext: gate.timelineContext ?? timelineContext,
        checkResult: gate.result,
        extractorSucceeded: gate.extractorSucceeded,
        eventCount: gate.extractedEvents.length,
        hookCount: gate.extractedHooks.length,
        anchorFallbackUsed: !gate.timeAnchor,
        reason: input.reason ?? gate.extractorError ?? `timeline_${gate.result.status}`,
      });
    }

    try {
      await this.persistCurrentSource(input, async () => {
        input.request?.signal?.throwIfAborted();
        await storyTimelineService.saveCheckReport({ novelId: input.novelId, chapterId: input.chapterId, chapterIndex, result: gate.result });
        await storyTimelineService.commitChapterTimeline({
          novelId: input.novelId,
          chapterId: input.chapterId,
          chapterIndex,
          timeAnchor: gate.timeAnchor ?? null,
          extractedEvents: gate.extractedEvents,
          extractedHooks: gate.extractedHooks,
          addressedHookIds: gate.addressedHookIds,
          resolvedHookIds: gate.resolvedHookIds,
          timelineContext: gate.timelineContext!,
        });
        await this.checkpoints.markCheckpoint({
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash,
          syncMode: "stable",
          sourceStage: input.sourceStage,
          metadata: {
            reason: input.reason ?? "stable_timeline_finalized",
            sourceStage: input.sourceStage,
            extractorSucceeded: true,
            eventCount: gate.extractedEvents.length,
            hookCount: gate.extractedHooks.length,
            anchorFallbackUsed: !gate.timeAnchor,
            qualityDebt: Boolean(input.qualityDebt),
          },
        });
      });
    } catch (error) {
      input.request?.signal?.throwIfAborted();
      if (error instanceof StaleChapterSourceError || (error instanceof Error && error.name === "AbortError")) throw error;
      await this.checkpoints.markCheckpointFailed({
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash,
        syncMode: "stable",
        sourceStage: input.sourceStage,
        metadata: {
          reason: `stable_commit_failed: ${error instanceof Error ? error.message : String(error)}`,
          sourceStage: input.sourceStage,
          extractorSucceeded: gate.extractorSucceeded,
        },
      });
      return this.finalizeDegraded({
        ...input,
        content,
        contentHash,
        timelineContext: gate.timelineContext,
        checkResult: gate.result,
        extractorSucceeded: gate.extractorSucceeded,
        eventCount: gate.extractedEvents.length,
        hookCount: gate.extractedHooks.length,
        anchorFallbackUsed: !gate.timeAnchor,
        reason: `stable_commit_failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return {
      syncMode: "stable",
      contentHash,
      extractorSucceeded: true,
      eventCount: gate.extractedEvents.length,
      hookCount: gate.extractedHooks.length,
      checkpointWritten: true,
    };
  }

  private async extractAndCheck(input: {
    novelId: string;
    chapterId: string;
    chapterIndex: number;
    novelTitle: string;
    chapterTitle: string;
    chapterGoal: string;
    content: string;
    timelineContext: TimelineContextForChapter | null;
    request?: TimelineFinalizationRequestOptions;
  }): Promise<ChapterTimelineGateResult> {
    if (!input.timelineContext) {
      return {
        sourceContentHash: buildContentHash(input.content),
        result: {
          status: "warning",
          score: 0.82,
          issues: [{
            type: "unclear_time_anchor",
            severity: "warning",
            message: "缺少时间线上下文，已降级提交最小 timeline checkpoint。",
            evidence: "timelineContext missing",
            suggestedFix: "重新组装章节上下文后补跑 timeline finalization。",
            relatedEventIds: [],
            relatedHookIds: [],
          }],
        },
        extractedEvents: [],
        extractedHooks: [],
        timeAnchor: null,
        addressedHookIds: [],
        resolvedHookIds: [],
        extractorSucceeded: false,
        extractorError: "timelineContext missing",
        timelineContext: null,
      };
    }
    try {
      const extracted = await timelineExtractorService.extractFromChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.chapterIndex,
        novelTitle: input.novelTitle,
        chapterTitle: input.chapterTitle,
        chapterGoal: input.chapterGoal,
        chapterContent: input.content,
        timelineContext: input.timelineContext,
        provider: input.request?.provider,
        model: input.request?.model,
        temperature: input.request?.temperature,
        signal: input.request?.signal,
      });
      input.request?.signal?.throwIfAborted();
      const extractedEvents = timelineExtractorService.normalizeEvents(extracted);
      const extractedHooks = timelineExtractorService.normalizeHooks(extracted);
      const result = timelineCheckerService.checkChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.chapterIndex,
        extractedEvents,
        timelineContext: input.timelineContext,
        chapterContent: input.content,
      });
      return {
        sourceContentHash: buildContentHash(input.content),
        result,
        extractedEvents,
        extractedHooks,
        timeAnchor: extracted.timeAnchor ?? null,
        addressedHookIds: extracted.addressedHookIds ?? [],
        resolvedHookIds: extracted.resolvedHookIds ?? [],
        extractorSucceeded: true,
        extractorError: null,
        timelineContext: input.timelineContext,
      };
    } catch (error) {
      input.request?.signal?.throwIfAborted();
      if (error instanceof Error && error.name === "AbortError") throw error;
      const message = error instanceof Error ? error.message : String(error);
      const result: TimelineCheckResult = {
        status: "warning",
        score: 0.82,
        issues: [{
          type: "unclear_time_anchor",
          severity: "warning",
          message: "时间线抽取或检测未完成，已降级提交最小 timeline checkpoint。",
          evidence: message,
          suggestedFix: "重试时间线检测；若仍失败，人工检查章节承接和未来事件泄漏。",
          relatedEventIds: [],
          relatedHookIds: [],
        }],
      };
      return {
        sourceContentHash: buildContentHash(input.content),
        result,
        extractedEvents: [],
        extractedHooks: [],
        timeAnchor: null,
        addressedHookIds: [],
        resolvedHookIds: [],
        extractorSucceeded: false,
        extractorError: message,
        timelineContext: input.timelineContext,
      };
    }
  }

  private async finalizeDegraded(input: FinalizeCurrentContentInput & {
    contentHash: string;
    checkResult?: TimelineCheckResult;
    timelineContext: TimelineContextForChapter | null;
    extractorSucceeded: boolean;
    eventCount: number;
    hookCount: number;
    anchorFallbackUsed: boolean;
  }): Promise<ChapterTimelineFinalizationResult> {
    const chapterIndex = input.contextPackage?.chapter.order ?? await this.resolveChapterOrder(input.chapterId);
    await this.persistCurrentSource(input, async () => {
      input.request?.signal?.throwIfAborted();
      const result = input.checkResult ?? input.timelineGate?.result;
      if (result) await storyTimelineService.saveCheckReport({ novelId: input.novelId, chapterId: input.chapterId, chapterIndex, result });
      await timelineRepository.upsertChapterTimeAnchor({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex,
        storyDayIndex: input.timelineContext?.currentTime?.storyDayIndex ?? null,
        timeLabel: fallbackTimeLabel({
          chapterIndex,
          contextPackage: input.contextPackage,
          timelineContext: input.timelineContext,
        }),
        startsAfterEventIds: input.timelineContext?.previousEvents?.slice(-3).map((event) => event.id) ?? [],
        plannedEventIds: plannedEventIds(input.timelineContext),
        endedWithEventIds: [],
        previousHookIds: openHookIds(input.timelineContext),
        nextHookIds: [],
        forbiddenEventIds: forbiddenEventIds(input.timelineContext),
      });
      if (input.qualityDebt || input.sourceStage === "defer_and_continue") {
        await timelineRepository.expireOverdueImmediateHooks({
          novelId: input.novelId,
          chapterId: input.chapterId,
          chapterIndex,
        });
      }
      await this.checkpoints.markCheckpoint({
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        syncMode: "degraded",
        sourceStage: input.sourceStage,
        metadata: {
          reason: input.reason ?? "degraded_timeline_finalized",
          sourceStage: input.sourceStage,
          extractorSucceeded: input.extractorSucceeded,
          eventCount: input.eventCount,
          hookCount: input.hookCount,
          anchorFallbackUsed: input.anchorFallbackUsed,
          qualityDebt: Boolean(input.qualityDebt),
        },
      });
    });
    return {
      syncMode: "degraded",
      contentHash: input.contentHash,
      extractorSucceeded: input.extractorSucceeded,
      eventCount: input.eventCount,
      hookCount: input.hookCount,
      checkpointWritten: true,
    };
  }

  private async resolveChapterOrder(chapterId: string): Promise<number> {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { order: true },
    });
    return chapter?.order ?? 0;
  }

}

export const chapterTimelineFinalizationService = new ChapterTimelineFinalizationService();
