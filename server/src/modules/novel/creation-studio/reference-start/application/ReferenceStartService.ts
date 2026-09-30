import { randomUUID } from "node:crypto";
import type {
  CreationStudioConfirmRequest, CreationStudioRegenerateRequest, ReferenceStartProjection, ReferenceStartRequest,
} from "@novelfoundry/shared/types/creationStudio";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../../prompting/core/promptRunner";
import { referenceAbstractPrompt, referenceBriefPrompt, referenceOriginalityReviewPrompt } from "../../../../../prompting/prompts/creation/referenceCreation.prompts";
import { NovelWorkflowService } from "../../../../../services/novel/workflow/NovelWorkflowService";
import { novelCreateResourceRecommendationService } from "../../../../../services/novel/NovelCreateResourceRecommendationService";
import {
  approvedBriefFingerprint, assertReferenceConfirmation,
  type ReferenceTaskSeed, type ReferenceSourceSnapshot,
} from "../domain/referenceStartContract";
import { readReferenceSource } from "../infrastructure/referenceSourceReader";
import { changeReferenceAttempt, lockReferenceTask, parseReferenceSeed } from "../infrastructure/referenceTaskStore";
import { generateIsolatedReferenceBrief } from "./referenceBriefPipeline";

const stageLabels = { extracting: "正在提炼可借鉴的写法", generating: "正在设计原创故事方向", reviewing: "正在检查人物与情节的独立性" };

export class ReferenceStartService {
  private readonly workflow = new NovelWorkflowService();
  private readonly active = new Set<string>();
  private readonly confirming = new Set<string>();

  async start(input: ReferenceStartRequest): Promise<string> {
    this.validateRequest(input);
    const source = await readReferenceSource(input);
    const attemptId = randomUUID();
    const task = await this.workflow.bootstrapTask({
      lane: "creation_studio", title: "参考写法，创作原创长篇", forceNew: true,
      seedPayload: {
        idea: "",
        referenceStart: {
          schemaVersion: 1, request: input, sourceTitle: source.title,
          sourceFingerprint: source.fingerprint, documentVersionId: source.documentVersionId,
          attemptId, status: "extracting", mechanisms: [],
        },
      },
    });
    this.schedule(task.id, attemptId, source, input);
    return task.id;
  }

  async regenerate(taskId: string, input?: CreationStudioRegenerateRequest): Promise<void> {
    if (this.active.has(taskId)) throw new AppError("原创方向正在生成，请稍候。", 409);
    const attemptId = randomUUID();
    const prepared = await prisma.$transaction(async (tx) => {
      const { row, seed, reference } = await lockReferenceTask(tx, taskId);
      const confirmation = await tx.creationStudioConfirmation.findUnique({ where: { workflowTaskId: taskId } });
      if (row.novelId || confirmation) throw new AppError("创作方向已进入确认，请继续原有作品。", 409);
      if (input?.narrativeForm && input.narrativeForm !== "long_novel") throw new AppError("参考开书用于创作原创长篇。", 400);
      const request: ReferenceStartRequest = {
        ...reference.request,
        ...(input ? {
          targetWordCount: input.targetWordCount,
          writingPlatformPreference: input.writingPlatformPreference,
          instruction: [reference.request.instruction, input.feedback].filter(Boolean).join("\n").slice(0, 4000),
        } : {}),
      };
      this.validateRequest(request);
      const source = await readReferenceSource(request, tx);
      seed.referenceStart = {
        schemaVersion: 1, request, sourceTitle: source.title, sourceFingerprint: source.fingerprint,
        documentVersionId: source.documentVersionId, attemptId, status: "extracting", mechanisms: [],
      };
      await tx.novelWorkflowTask.update({ where: { id: taskId }, data: {
        status: "queued", lastError: null, cancelRequestedAt: null, finishedAt: null,
        seedPayloadJson: JSON.stringify(seed), currentItemLabel: stageLabels.extracting,
      } });
      return { request, source };
    });
    this.schedule(taskId, attemptId, prepared.source, prepared.request);
  }

  projection(taskId: string, seed: ReferenceTaskSeed): ReferenceStartProjection | undefined {
    const state = seed.referenceStart;
    if (!state) return undefined;
    return {
      sourceTitle: state.sourceTitle, status: state.status, mechanisms: state.status === "ready" ? state.mechanisms : [],
      intentVersionId: state.status === "ready" ? state.approvedIntentVersionId ?? null : null,
      briefHash: state.status === "ready" ? state.approvedBriefHash ?? null : null,
      canRetry: !this.active.has(taskId) && !this.confirming.has(taskId) && state.status !== "ready",
    };
  }

  /** Called before any production write. The row lock also excludes regeneration. */
  async claimConfirmation(taskId: string, input: CreationStudioConfirmRequest): Promise<void> {
    if (this.confirming.has(taskId)) throw new AppError("确认请求正在处理中，请稍候。", 409);
    this.confirming.add(taskId);
    try {
      await prisma.$transaction(async (tx) => {
        const { row, seed, reference } = await lockReferenceTask(tx, taskId);
        const existing = await tx.creationStudioConfirmation.findUnique({ where: { workflowTaskId: taskId } });
        if (row.status === "cancelled" || row.cancelRequestedAt) throw new AppError("该创作任务已取消，请重新开始。", 409);
        if (existing && existing.idempotencyKey !== input.idempotencyKey) throw new AppError("请继续已确认的方向。", 409);
        if (existing?.status === "claimed" && reference.confirmationLeaseUntil
          && Date.parse(reference.confirmationLeaseUntil) > Date.now()) {
          throw new AppError("确认请求正在处理中，请稍后重试。", 409);
        }
        const intent = reference.approvedIntentVersionId
          ? await tx.novelIntentVersion.findUnique({ where: { id: reference.approvedIntentVersionId } }) : null;
        if (!intent || seed.currentIntentVersionId !== intent.id || intent.workflowTaskId !== taskId) {
          throw new AppError("请先重新生成原创方向。", 409);
        }
        // Once the first confirmation is accepted, retries use that immutable snapshot.
        const sourceFingerprint = existing
          ? reference.sourceFingerprint : (await readReferenceSource(reference.request, tx)).fingerprint;
        try {
          assertReferenceConfirmation({ state: reference, intentId: intent.id, idea: seed.idea ?? "",
            interpretation: JSON.parse(intent.structuredIntentJson), sourceFingerprint, confirmation: input });
        } catch (error) {
          throw new AppError(error instanceof Error ? error.message : "原创方向需要重新确认。", 409);
        }
        if (!reference.productionTaskId) {
          const productionTaskId = randomUUID();
          await tx.novelWorkflowTask.create({ data: {
            id: productionTaskId, lane: "auto_director", title: "原创长篇创作", status: "queued",
            // No reference envelope or source metadata is copied to this task.
            seedPayloadJson: JSON.stringify({ idea: seed.idea }),
          } });
          reference.productionTaskId = productionTaskId;
        }
        reference.confirmedDirectionId = input.directionId;
        reference.confirmationLeaseUntil = new Date(Date.now() + 120_000).toISOString();
        await tx.novelWorkflowTask.update({ where: { id: taskId }, data: { seedPayloadJson: JSON.stringify(seed) } });
        await tx.creationStudioConfirmation.upsert({
          where: { workflowTaskId: taskId },
          create: { workflowTaskId: taskId, idempotencyKey: input.idempotencyKey, narrativeForm: "long_novel", status: "claimed" },
          update: { status: "claimed" },
        });
      });
    } catch (error) {
      this.confirming.delete(taskId);
      throw error;
    }
  }

  finishConfirmation(taskId: string): void { this.confirming.delete(taskId); }

  private validateRequest(input: ReferenceStartRequest): void {
    if (input.targetWordCount !== undefined && (!Number.isInteger(input.targetWordCount)
      || input.targetWordCount < 50_000 || input.targetWordCount > 3_000_000)) {
      throw new AppError("原创长篇目标字数需在 50000～3000000 字之间。", 400);
    }
    if (input.writingPlatformPreference === "zhihu_story") throw new AppError("请选择支持长篇的平台。", 400);
  }

  private schedule(taskId: string, attemptId: string, source: ReferenceSourceSnapshot, request: ReferenceStartRequest): void {
    this.active.add(taskId);
    setImmediate(() => {
      void this.generate(taskId, attemptId, source, request).finally(() => this.active.delete(taskId));
    });
  }

  private async generate(taskId: string, attemptId: string, source: ReferenceSourceSnapshot, request: ReferenceStartRequest): Promise<void> {
    const options = { taskId, stage: "creation_intent", entrypoint: "creation_studio", temperature: 0.7 };
    try {
      const result = await generateIsolatedReferenceBrief(source, {
        stage: async (stage) => changeReferenceAttempt(taskId, attemptId, (seed) => { seed.referenceStart!.status = stage; }, {
          status: "running", currentStage: "理解创作想法", currentItemKey: `reference_${stage}`,
          currentItemLabel: stageLabels[stage], progress: stage === "extracting" ? 0.03 : stage === "generating" ? 0.06 : 0.09,
          lastError: null, startedAt: new Date(),
        }),
        abstract: async (snapshot, retry) => (await runStructuredPrompt({
          asset: referenceAbstractPrompt,
          promptInput: { sections: snapshot.sections, instruction: request.instruction ?? "请推荐适合新手的原创长篇方向。", retry },
          options: { ...options, itemKey: "reference_abstract" },
        })).output,
        generate: async (abstract) => (await runStructuredPrompt({
          asset: referenceBriefPrompt,
          promptInput: { abstract, targetWordCount: request.targetWordCount, writingPlatformPreference: request.writingPlatformPreference },
          options: { ...options, itemKey: "reference_brief" },
        })).output,
        review: async (snapshot, abstract, brief) => (await runStructuredPrompt({
          asset: referenceOriginalityReviewPrompt,
          promptInput: { sourceSections: snapshot.sections, abstract, brief },
          options: { ...options, temperature: 0.1, itemKey: "reference_originality_review" },
        })).output.decision === "pass",
      });
      const { brief, abstract } = result;
      const foundation = await novelCreateResourceRecommendationService.resolveRequired({
        title: brief.interpretation.directions[0].title,
        description: brief.originalIdea, bookSellingPoint: brief.interpretation.directions[0].coreExperience,
        styleTone: brief.interpretation.directions[0].styleKeywords.join("、"), writingMode: "original", projectMode: "auto_pipeline",
      });
      const interpretation = { ...brief.interpretation, productionFoundation: foundation.recommendation };
      await prisma.$transaction(async (tx) => {
        const { row, seed, reference } = await lockReferenceTask(tx, taskId);
        if (row.novelId || row.status === "cancelled" || row.cancelRequestedAt || reference.attemptId !== attemptId) throw new AppError("生成结果已失效。", 409);
        const currentSource = await readReferenceSource(request, tx);
        if (currentSource.fingerprint !== source.fingerprint) throw new AppError("参考分析有更新，请重新生成原创方向。", 409);
        const latest = await tx.novelIntentVersion.findFirst({ where: { workflowTaskId: taskId }, orderBy: { version: "desc" } });
        if (latest) await tx.novelIntentVersion.update({ where: { id: latest.id }, data: { status: "superseded" } });
        const intent = await tx.novelIntentVersion.create({ data: {
          workflowTaskId: taskId, previousVersionId: latest?.id, version: (latest?.version ?? 0) + 1,
          status: "proposed", source: "reference", originalExpression: brief.originalIdea,
          structuredIntentJson: JSON.stringify(interpretation),
        } });
        seed.idea = brief.originalIdea;
        seed.currentIntentVersionId = intent.id;
        reference.status = "ready";
        reference.mechanisms = abstract.mechanisms;
        reference.approvedIntentVersionId = intent.id;
        reference.approvedBriefHash = approvedBriefFingerprint(brief.originalIdea, interpretation);
        await tx.novelWorkflowTask.update({ where: { id: taskId }, data: {
          status: "waiting_approval", seedPayloadJson: JSON.stringify(seed), progress: 0.12,
          checkpointType: null, checkpointSummary: "请选择一个原创方向继续。",
          currentItemKey: "direction_confirmation", currentItemLabel: "原创方向已准备好，请选择一个继续",
          resumeTargetJson: JSON.stringify({ route: "/create", taskId, lane: "creation_studio" }), lastError: null,
        } });
      });
    } catch (error) {
      const message = error instanceof AppError ? error.message : "原创方向暂未通过生成与独立性检查，请重试。";
      // An old/cancelled attempt may never overwrite a newer task or expose source-bearing model errors.
      await changeReferenceAttempt(taskId, attemptId, (seed) => { seed.referenceStart!.status = "failed"; }, {
        status: "failed", lastError: message, currentItemLabel: "原创方向生成未完成，可以重试", finishedAt: new Date(),
      }).catch(() => undefined);
    }
  }
}

export const referenceStartService = new ReferenceStartService();
export { parseReferenceSeed };
