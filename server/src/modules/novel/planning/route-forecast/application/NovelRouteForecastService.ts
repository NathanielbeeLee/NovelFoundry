import { createHash } from "node:crypto";
import type {
  NovelRouteForecast,
  NovelRouteForecastRequest,
} from "@novelfoundry/shared/types/novelRouteForecast";
import { AppError } from "../../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../../prompting/core/promptRunner";
import { novelRouteForecastPrompt } from "../../../../../prompting/prompts/novel/routeForecast.prompts";
import { GenerationContextAssembler } from "../../../../../services/novel/runtime/GenerationContextAssembler";

function compactPayoffItem(item: unknown): string {
  if (!item || typeof item !== "object") {
    return String(item ?? "");
  }
  const record = item as Record<string, unknown>;
  return [record.title, record.summary, record.status, record.targetChapterOrder]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value).trim())
    .join("｜");
}

function buildFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export class NovelRouteForecastService {
  private readonly contextAssembler = new GenerationContextAssembler();

  async generate(
    novelId: string,
    chapterId: string,
    input: NovelRouteForecastRequest,
  ): Promise<NovelRouteForecast> {
    const candidateCount = input.candidateCount ?? 3;
    const horizon = input.horizon ?? 3;
    const assembled = await this.contextAssembler.assemble(novelId, chapterId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
    });
    const writeContext = assembled.contextPackage.chapterWriteContext;

    if (!writeContext) {
      throw new AppError("请先为本章生成执行计划，再推演后续剧情路线。", 400);
    }
    if (assembled.chapter.content?.trim()) {
      throw new AppError("本章已有正文。请在尚未开写的章节上推演剧情路线。", 400);
    }

    const participantIds = new Set(writeContext.participants.map((item) => item.id));
    const relevantHardFacts = writeContext.characterHardFacts
      .filter((item) => participantIds.size === 0 || participantIds.has(item.characterId))
      .slice(0, 12);
    const promptContext = {
      bookContract: writeContext.bookContract,
      macroConstraints: writeContext.macroConstraints,
      volumeWindow: writeContext.volumeWindow,
      chapterMission: writeContext.chapterMission,
      obligationContract: writeContext.obligationContract,
      chapterBoundary: writeContext.chapterBoundary ?? null,
      chapterStateGoal: writeContext.chapterStateGoal ?? null,
      participants: writeContext.participants.map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        currentGoal: item.currentGoal,
        currentState: item.currentState,
      })),
      characterHardFacts: relevantHardFacts,
      localStateSummary: writeContext.localStateSummary.slice(0, 4_000),
      openConflictSummaries: writeContext.openConflictSummaries.slice(0, 12),
      payoffItems: [
        ...writeContext.ledgerUrgentItems,
        ...writeContext.ledgerOverdueItems,
        ...writeContext.ledgerPendingItems,
      ].map(compactPayoffItem).filter(Boolean).slice(0, 12),
      recentChapterSummaries: writeContext.recentChapterSummaries
        .slice(0, 5)
        .map((item) => item.slice(0, 1_500)),
      previousChapterTail: (writeContext.previousChapterTail ?? "").slice(-1_500),
    };

    const generated = await runStructuredPrompt({
      asset: novelRouteForecastPrompt,
      promptInput: {
        candidateCount,
        horizon,
        authorIntent: input.authorIntent?.trim() ?? "",
        context: promptContext,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.55,
        novelId,
        chapterId,
        stage: "route_forecast",
        itemKey: "chapter_route_candidates",
        scope: "chapter_window",
        entrypoint: "chapter_workbench",
        triggerReason: "author_requested_route_forecast",
      },
    });

    return {
      novelId,
      chapterId,
      chapterOrder: assembled.chapter.order,
      horizon,
      recommendedRouteId: generated.output.recommendedRouteId,
      comparisonSummary: generated.output.comparisonSummary,
      routes: generated.output.routes,
      generatedAt: new Date().toISOString(),
      sourceFingerprint: buildFingerprint(promptContext),
    };
  }
}

export const novelRouteForecastService = new NovelRouteForecastService();
