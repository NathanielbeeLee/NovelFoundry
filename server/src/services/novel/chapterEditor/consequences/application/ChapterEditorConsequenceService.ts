import type { ChapterEditorConsequenceAdoptRequest, ChapterEditorConsequenceReport, ChapterEditorConsequenceRequest } from "@novelfoundry/shared/types/novel";
import { AppError } from "../../../../../middleware/errorHandler";
import { prepareStructuredPromptExecution, runPreparedStructuredPrompt } from "../../../../../prompting/core/promptRunner";
import { chapterEditorConsequencesPrompt } from "../../../../../prompting/prompts/novel/chapterEditor/consequences.prompts";
import { NovelCoreService } from "../../../NovelCoreService";
import { assertConsequenceRange, consequenceBinding, validateConsequenceEvidence, type ConsequenceInventory } from "../domain/consequencePolicy";
import { ConsequenceInventoryRepository } from "../infrastructure/ConsequenceInventoryRepository";
import { ConsequenceReceiptStore } from "../infrastructure/ConsequenceReceiptStore";

export class ChapterEditorConsequenceService {
  constructor(
    private readonly inventory = new ConsequenceInventoryRepository(),
    private readonly core: Pick<NovelCoreService, "updateChapter" | "createNovelSnapshot"> = new NovelCoreService(),
    private readonly receipts = new ConsequenceReceiptStore(),
    private readonly prepare = prepareStructuredPromptExecution,
    private readonly run = runPreparedStructuredPrompt,
  ) {}

  private prepareAssessment(novelId: string, chapterId: string, input: ChapterEditorConsequenceRequest, inventory: ConsequenceInventory) {
    assertConsequenceRange(input);
    if (inventory.savedContent !== input.expectedContent) {
      throw new AppError("已保存正文与当前评估来源不同，请刷新正文后重新评估。", 409);
    }
    return this.prepare({
      asset: chapterEditorConsequencesPrompt,
      promptInput: {
        currentText: input.contentSnapshot, selectedText: input.targetRange.text,
        candidateText: input.candidate.content, references: inventory.references, evidenceLimitations: inventory.limitations ?? [],
      },
      options: { provider: input.provider, model: input.model, temperature: 0.15, novelId, chapterId, stage: "editor_consequences" },
    });
  }

  async preview(novelId: string, chapterId: string, input: ChapterEditorConsequenceRequest): Promise<ChapterEditorConsequenceReport> {
    const inventory = await this.inventory.load(novelId, chapterId);
    const prepared = await this.prepareAssessment(novelId, chapterId, input, inventory);
    if (!prepared.identityDigest) throw new AppError("当前模型或提示配置无法绑定影响评估，请检查配置后重试。", 409);
    const result = await this.run(prepared);
    validateConsequenceEvidence(result.output, input, inventory.references);
    // Reject a result that became stale during its model call; preview never writes story data.
    const latest = await this.inventory.load(novelId, chapterId);
    if (latest.revision !== inventory.revision) throw new AppError("评估期间正文或后续计划发生变化，请重新评估。", 409);
    return {
      ...result.output,
      uncertainties: [...new Set([...result.output.uncertainties, ...(inventory.limitations ?? [])])],
      ...this.receipts.issue(consequenceBinding(novelId, chapterId, input, inventory.revision), prepared.identityDigest),
      sources: inventory.references.map(({ refId, label, chapterOrder }) => ({ refId, label, chapterOrder })),
      prompt: { id: prepared.asset.id, version: prepared.asset.version, provider: result.meta.provider ?? input.provider ?? "unknown", model: result.meta.model ?? input.model ?? "unknown" },
    };
  }

  async adopt(novelId: string, chapterId: string, request: ChapterEditorConsequenceAdoptRequest) {
    const { receipt, ...input } = request;
    const content = assertConsequenceRange(input);
    const inventory = await this.inventory.load(novelId, chapterId);
    const binding = consequenceBinding(novelId, chapterId, input, inventory.revision);
    this.receipts.verify(receipt, binding);
    // Configuration is re-prepared without model invocation; never run a fresh unbound assessment.
    const prepared = await this.prepareAssessment(novelId, chapterId, input, inventory);
    this.receipts.verify(receipt, binding, prepared.identityDigest);
    await this.core.createNovelSnapshot(novelId, "manual", `before-editor-consequence-${chapterId}`);
    let chapter: Awaited<ReturnType<NovelCoreService["updateChapter"]>>;
    try {
      chapter = await this.core.updateChapter(novelId, chapterId, {
        content, expectedContent: input.expectedContent,
        beforeChapterUpdate: async (tx) => {
          this.receipts.verify(receipt, binding, prepared.identityDigest);
          await this.inventory.verifyAndLock(novelId, chapterId, inventory, tx);
        },
      });
    } catch (error) {
      this.receipts.consume(receipt);
      // Serializable adoption must fail closed on concurrency; never retry an old assessment.
      const code = (error as { code?: string })?.code;
      const causeCode = (error as { cause?: { code?: string } })?.cause?.code;
      if (["P2034", "40001", "40P01"].includes(code ?? "") || ["40001", "40P01"].includes(causeCode ?? "")) {
        throw new AppError("评估依据在采纳时发生并发变化，请保留候选并重新评估。", 409);
      }
      throw error;
    }
    this.receipts.consume(receipt);
    return chapter;
  }
}
