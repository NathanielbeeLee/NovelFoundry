import { toText } from "./novelP0Utils";
import { StreamOutcomeError, type StrictStreamPolicy } from "../../llm/streamOutcome";
import { chapterLifecycleService } from "./runtime/lifecycle";
import { AIMessageChunk, type BaseMessageChunk } from "@langchain/core/messages";
import type {
  ChapterRuntimePackage,
  GenerationContextPackage,
} from "@novelfoundry/shared/types/chapterRuntime";
import type { LLMProvider } from "@novelfoundry/shared/types/llm";
import type { TaskType } from "../../llm/modelRouter";
import { createContextBlock } from "../../prompting/core/contextBudget";
import { runTextPrompt, streamTextPrompt } from "../../prompting/core/promptRunner";
import { resolvePromptContextBlocksForAsset } from "../../prompting/context/promptContextResolution";
import {
  buildChapterWriterContextBlocks,
  resolveTargetWordRange,
  sanitizeWriterContextBlocks,
} from "../../prompting/prompts/novel/chapterLayeredContext";
import { chapterWriterPrompt } from "../../prompting/prompts/novel/chapterWriter.prompts";
import { NovelContinuationService } from "./NovelContinuationService";
import { assertChapterContentNotEmpty } from "./runtime/chapterEmptyContentError";
import { prisma } from "../../db/prisma";
import type { WritingPlatformSnapshot } from "@novelfoundry/shared/types/writingPlatform";

async function loadWritingPlatformBlock(novelId: string) {
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { writingPlatformSnapshotJson: true },
  });
  let content = "沿用通用中文商业网文写法，保持情节推进、人物主动、因果清晰和章节回报。";
  if (novel?.writingPlatformSnapshotJson) {
    try {
      const snapshot = JSON.parse(novel.writingPlatformSnapshotJson) as WritingPlatformSnapshot;
      content = `${snapshot.label}（配置版本 ${snapshot.profileVersion}）：${snapshot.guidance.drafting}`;
    } catch { /* 旧数据继续使用通用合同。 */ }
  }
  return createContextBlock({ id: "writing_platform", group: "writing_platform", priority: 105, required: true, content });
}

export interface ChapterGraphLLMOptions {
  signal?: AbortSignal;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  taskType?: TaskType;
}

export interface ChapterGraphGenerateOptions extends ChapterGraphLLMOptions {
  previousChaptersSummary?: string[];
  deferArtifactBackgroundSync?: boolean;
}

interface ChapterRef {
  id: string;
  title: string;
  order: number;
  content?: string | null;
  expectation?: string | null;
  targetWordCount?: number | null;
}

type ContinuationPack = Awaited<ReturnType<NovelContinuationService["buildChapterContextPack"]>>;

interface ChapterGraphDeps {
  enforceOpeningDiversity: (
    novelId: string,
    chapterOrder: number,
    chapterTitle: string,
    content: string,
    options: ChapterGraphLLMOptions,
  ) => Promise<{ content: string; rewritten: boolean; maxSimilarity: number }>;
  saveDraftAndArtifacts: (
    novelId: string,
    chapterId: string,
    content: string,
    generationState: "drafted" | "repaired",
    options?: { scheduleBackgroundSync?: boolean; syncArtifacts?: boolean },
  ) => Promise<void>;
  logInfo: (message: string, meta?: Record<string, unknown>) => void;
  logWarn: (message: string, meta?: Record<string, unknown>) => void;
}

export interface ChapterStreamInput {
  novelId: string;
  novelTitle: string;
  chapter: ChapterRef;
  contextPackage?: GenerationContextPackage;
  options: ChapterGraphGenerateOptions;
}

const WRITER_STREAM_POLICY: StrictStreamPolicy = { requireTerminal: true, firstResponseTimeoutMs: 90_000, idleTimeoutMs: 60_000, totalTimeoutMs: 600_000 };

const continuationService = new NovelContinuationService();

function countChapterCharacters(content: string): number {
  return content.replace(/\s+/g, "").trim().length;
}

function buildLengthInstruction(targetWordCount?: number | null): {
  targetWordCount: number | null;
  minWordCount: number | null;
  maxWordCount: number | null;
  instruction: string;
} {
  const range = resolveTargetWordRange(targetWordCount);
  if (range.targetWordCount == null) {
    return {
      ...range,
      instruction: "Write a complete readable chapter with enough concrete events and scene substance; do not end abruptly or obviously too short.",
    };
  }
  return {
    ...range,
    instruction: `Write about ${range.targetWordCount} Chinese characters. Acceptable range: ${range.minWordCount}-${range.maxWordCount}. Do not end clearly below the minimum.`,
  };
}

function buildDraftContinuationBlock(content: string, targetWordCount: number, minWordCount: number): string {
  const trimmed = content.trim();
  const excerpt = trimmed.length > 1400 ? trimmed.slice(-1400) : trimmed;
  return [
    `Current saved draft length: ${countChapterCharacters(trimmed)} Chinese characters.`,
    `Target length: about ${targetWordCount} Chinese characters. Minimum acceptable length: ${minWordCount}.`,
    "Continue from the existing ending. Do not restart the chapter. Do not repeat already written events.",
    "Current draft tail (continue after this):",
    excerpt || "none",
  ].join("\n");
}

export class ChapterWritingGraph {
  constructor(private readonly deps: ChapterGraphDeps) {}

  private async continuityNode(
    novelId: string,
    chapter: ChapterRef,
    content: string,
    options: ChapterGraphLLMOptions,
    continuationPack: ContinuationPack,
  ): Promise<string> {
    options.signal?.throwIfAborted();
    const openingGuard = await this.deps.enforceOpeningDiversity(
      novelId,
      chapter.order,
      chapter.title,
      content,
      options,
    );
    if (openingGuard.rewritten) {
      this.deps.logInfo("Opening diversity rewrite applied", {
        chapterOrder: chapter.order,
        maxSimilarity: Number(openingGuard.maxSimilarity.toFixed(4)),
      });
    }

    options.signal?.throwIfAborted();
    const continuationGuard = await continuationService.rewriteIfTooSimilar({
      chapterTitle: chapter.title,
      content: openingGuard.content,
      continuationPack,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
    });
    if (continuationGuard.rewritten) {
      this.deps.logInfo("Continuation anti-copy rewrite applied", {
        chapterOrder: chapter.order,
        maxSimilarity: Number(continuationGuard.maxSimilarity.toFixed(4)),
      });
    }
    options.signal?.throwIfAborted();
    return continuationGuard.content;
  }

  private async enforceTargetLength(input: {
    novelId: string;
    novelTitle: string;
    chapter: ChapterRef;
    content: string;
    contextPackage: GenerationContextPackage;
    options: ChapterGraphLLMOptions;
    reason?: "output_limit";
  }): Promise<string> {
    const writeContext = input.contextPackage.chapterWriteContext;
    const lengthGoal = buildLengthInstruction(
      writeContext?.chapterMission.targetWordCount
      ?? input.contextPackage.chapter.targetWordCount
      ?? input.chapter.targetWordCount
      ?? null,
    );
    if (!writeContext || lengthGoal.targetWordCount == null || lengthGoal.minWordCount == null) {
      return input.content;
    }

    const currentLength = countChapterCharacters(input.content);
    if (!input.reason && currentLength >= lengthGoal.minWordCount) {
      return input.content;
    }

    const missingWordGap = Math.max(
      lengthGoal.targetWordCount - currentLength,
      lengthGoal.minWordCount - currentLength,
      input.reason === "output_limit" ? 400 : 0,
    );
    const builtBlocks = [await loadWritingPlatformBlock(input.novelId), ...buildChapterWriterContextBlocks(writeContext)];
    const sanitized = sanitizeWriterContextBlocks([
      createContextBlock({
        id: "current_draft_excerpt",
        group: "current_draft_excerpt",
        priority: 99,
        required: true,
        content: buildDraftContinuationBlock(
          input.content,
          lengthGoal.targetWordCount,
          lengthGoal.minWordCount,
        ),
      }),
      ...builtBlocks,
    ]);
    if (sanitized.removedBlockIds.length > 0) {
      this.deps.logWarn("Writer continuation blocks removed by guard", {
        chapterOrder: input.chapter.order,
        removedBlockIds: sanitized.removedBlockIds,
      });
    }
    const resolvedContext = await resolvePromptContextBlocksForAsset({
      asset: chapterWriterPrompt,
      executionContext: {
        entrypoint: "chapter_pipeline",
        novelId: input.novelId,
        chapterId: input.chapter.id,
        metadata: {
          chapterWriteContext: writeContext,
          chapterBlockMode: "full",
          ragContext: input.contextPackage.ragContext,
          extraContextBlocks: sanitized.allowedBlocks.filter((block) => block.group === "current_draft_excerpt"),
        },
      },
      fallbackBlocks: sanitized.allowedBlocks,
    });

    const completion = await runTextPrompt({
      asset: chapterWriterPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        chapterOrder: input.chapter.order,
        chapterTitle: input.chapter.title,
        mode: "continue",
        targetWordCount: lengthGoal.targetWordCount,
        minWordCount: lengthGoal.minWordCount,
        maxWordCount: lengthGoal.maxWordCount,
        missingWordGap,
      },
      contextBlocks: resolvedContext.blocks,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: input.options.temperature ?? 0.8,
        reasoningEnabled: false,
        maxTokens: input.reason === "output_limit" ? 3000 : 6000,
        signal: input.options.signal,
        streamPolicy: WRITER_STREAM_POLICY,
        novelId: input.novelId,
        chapterId: input.chapter.id,
        stage: "writer_extend",
        triggerReason: input.reason === "output_limit" ? "output_limit_recovery" : "length_recovery",
      },
    });
    const appended = completion.output.trim();
    if (!appended) {
      return input.content;
    }

    const merged = `${input.content.trim()}\n\n${appended}`.trim();
    this.deps.logInfo("Chapter draft auto-extended for target length", {
      chapterOrder: input.chapter.order,
      beforeLength: currentLength,
      afterLength: countChapterCharacters(merged),
      targetWordCount: lengthGoal.targetWordCount,
      minWordCount: lengthGoal.minWordCount,
    });
    return merged;
  }

  async createChapterStream(input: ChapterStreamInput): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string) => Promise<{
      finalContent: string;
      lengthControl?: ChapterRuntimePackage["lengthControl"];
      artifactsAlreadySynced?: boolean;
      backgroundSyncDeferred?: boolean;
    } | void>;
  }> {
    const continuationPack = (input.contextPackage?.continuation as ContinuationPack | undefined)
      ?? await continuationService.buildChapterContextPack(input.novelId);
    const chapterWriteContext = input.contextPackage?.chapterWriteContext;
    if (!input.contextPackage || !chapterWriteContext) {
      throw new Error("Chapter runtime context is required before chapter generation.");
    }
    const contextPackage = input.contextPackage;
    const targetRange = resolveTargetWordRange(chapterWriteContext.chapterMission.targetWordCount);
    const builtBlocks = [await loadWritingPlatformBlock(input.novelId), ...buildChapterWriterContextBlocks(chapterWriteContext)];
    const sanitized = sanitizeWriterContextBlocks(builtBlocks);
    if (sanitized.removedBlockIds.length > 0) {
      this.deps.logWarn("Writer context blocks removed by guard", {
        chapterOrder: input.chapter.order,
        removedBlockIds: sanitized.removedBlockIds,
      });
    }
    const resolvedContext = await resolvePromptContextBlocksForAsset({
      asset: chapterWriterPrompt,
      executionContext: {
        entrypoint: "chapter_pipeline",
        novelId: input.novelId,
        chapterId: input.chapter.id,
        metadata: {
          chapterWriteContext,
          chapterBlockMode: "full",
          ragContext: contextPackage.ragContext,
        },
      },
      fallbackBlocks: sanitized.allowedBlocks,
    });

    const cancellation = new AbortController();
    const signal = input.options.signal ? AbortSignal.any([input.options.signal, cancellation.signal]) : cancellation.signal;
    const streamed = await streamTextPrompt({
      asset: chapterWriterPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        chapterOrder: input.chapter.order,
        chapterTitle: input.chapter.title,
        mode: "draft",
        targetWordCount: chapterWriteContext.chapterMission.targetWordCount ?? null,
        minWordCount: targetRange.minWordCount,
        maxWordCount: targetRange.maxWordCount,
      },
      contextBlocks: resolvedContext.blocks,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: input.options.temperature ?? 0.8,
        reasoningEnabled: false,
        maxTokens: 6000,
        signal,
        streamPolicy: WRITER_STREAM_POLICY,
        novelId: input.novelId,
        chapterId: input.chapter.id,
        stage: "writer_draft",
        triggerReason: "chapter_initial_draft",
      },
    }).catch(async (error) => {
      await chapterLifecycleService.markChapterStatus(input.chapter.id, "pending_generation");
      throw error;
    });

    const graph = this;
    let completedContent: string | null = null;
    let streamError: unknown;
    let outputLimitRecovered = false;
    let latestDraft = "";
    let postProcessingStarted = false;
    const saveInterrupted = async (content: string) => {
      if (content.trim()) {
        await graph.deps.saveDraftAndArtifacts(input.novelId, input.chapter.id, content, "drafted", {
          scheduleBackgroundSync: false, syncArtifacts: false,
        });
        await chapterLifecycleService.markChapterStatus(input.chapter.id, "needs_repair");
      } else {
        await chapterLifecycleService.markChapterStatus(input.chapter.id, "pending_generation");
      }
    };
    const stream = {
      cancel: async () => {
        cancellation.abort(new StreamOutcomeError("cancelled"));
        // During/after onDone the phase owner preserves its latest draft; never replay raw stream text.
        if (!postProcessingStarted && completedContent !== null) await saveInterrupted(latestDraft);
      },
      async *[Symbol.asyncIterator]() {
        let partial = "";
        let streamFinished = false;
        try {
          try {
            for await (const chunk of streamed.stream) {
              partial += toText(Array.isArray(chunk.content)
                ? chunk.content.filter((part) => typeof part === "string" || part.type === "text" || part.type === "output_text")
                : chunk.content);
              yield chunk;
            }
            completedContent = (await streamed.complete).output;
            latestDraft = completedContent;
          } catch (error) {
            if (!(error instanceof StreamOutcomeError) || error.kind !== "output_limit" || signal.aborted || !error.partialContent.trim()) throw error;
            partial = error.partialContent;
            try {
              const extended = await graph.enforceTargetLength({
                novelId: input.novelId, novelTitle: input.novelTitle, chapter: input.chapter,
                content: partial, contextPackage, options: { ...input.options, signal }, reason: "output_limit",
              });
              if (extended === partial) throw error;
              outputLimitRecovered = true;
              completedContent = extended;
              latestDraft = extended;
              yield new AIMessageChunk(extended.slice(partial.trim().length));
            } catch (extensionError) {
              if (extensionError instanceof StreamOutcomeError && extensionError !== error) {
                extensionError.partialContent = `${partial.trim()}\n\n${extensionError.partialContent}`.trim();
              }
              throw extensionError;
            }
          }
          streamFinished = true;
        } catch (error) {
          streamError = error;
          await saveInterrupted(error instanceof StreamOutcomeError ? error.partialContent || partial : partial);
          throw error;
        } finally {
          if (!streamFinished && streamError === undefined) {
            cancellation.abort(new StreamOutcomeError("cancelled"));
            streamError = new StreamOutcomeError("cancelled", latestDraft || partial);
            await saveInterrupted(latestDraft || partial);
          }
        }
      },
    };
    return {
      stream,
      onDone: async (_fullContent: string) => {
        if (streamError) throw streamError;
        postProcessingStarted = true;
        let extensionBase: string | null = null;
        let savingFinalDraft = false;
        try {
          signal.throwIfAborted();
          latestDraft = completedContent ?? (await streamed.complete).output;
          latestDraft = await this.continuityNode(
            input.novelId, input.chapter, latestDraft, { ...input.options, signal }, continuationPack,
          );
          signal.throwIfAborted();
          if (!outputLimitRecovered) {
            extensionBase = latestDraft;
            latestDraft = await this.enforceTargetLength({
              novelId: input.novelId, novelTitle: input.novelTitle, chapter: input.chapter,
              content: latestDraft, contextPackage, options: { ...input.options, signal },
            });
            extensionBase = null;
          }
          signal.throwIfAborted();
          const safeContent = assertChapterContentNotEmpty(latestDraft, {
            novelId: input.novelId, chapterId: input.chapter.id, chapterOrder: input.chapter.order,
            source: "chapter_writer",
          });
          savingFinalDraft = true;
          await this.deps.saveDraftAndArtifacts(input.novelId, input.chapter.id, safeContent, "drafted", {
            scheduleBackgroundSync: !input.options.deferArtifactBackgroundSync, syncArtifacts: false,
          });
          signal.throwIfAborted();
          return {
            finalContent: safeContent,
            artifactsAlreadySynced: true,
            backgroundSyncDeferred: Boolean(input.options.deferArtifactBackgroundSync),
          };
        } catch (error) {
          if (extensionBase && error instanceof StreamOutcomeError && error.partialContent) {
            latestDraft = `${extensionBase}\n\n${error.partialContent}`;
          }
          if (!savingFinalDraft) await saveInterrupted(latestDraft);
          else await chapterLifecycleService.markChapterStatus(input.chapter.id, "needs_repair");
          throw error;
        }
      },
    };
  }
}
