import type { GenerationContextPackage } from "@novelfoundry/shared/types/chapterRuntime";
import { polishPrisma as prisma } from "../../../modules/novel/quality/polishPersistence";
import {
  ChapterAcceptanceAssessmentService,
  type AcceptanceAssessmentService,
  type ChapterAcceptanceAssessmentResult,
} from "./ChapterAcceptanceAssessmentService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import { hashContent, rememberCacheValue } from "./chapterRuntimePackageBuilders";
import { parseCachedAcceptanceResult } from "./acceptance";

export interface ChapterQualityGateServiceDeps {
  acceptanceAssessmentService?: AcceptanceAssessmentService;
}

export interface RunChapterQualityGatesInput {
  novelId: string;
  chapterId: string;
  contextPackage: GenerationContextPackage;
  content: string;
  request: ChapterRuntimeRequestInput;
}

interface GateIdentity {
  artifactType: string;
  contentHash: string;
  requestKey: string;
  syncMode: string;
}

interface PersistedAcceptancePayload {
  schemaVersion: 2;
  gate: "acceptance";
  contentHash: string;
  requestKey: string;
  result: ChapterAcceptanceAssessmentResult;
}

type CacheInput = { novelId: string; chapterId: string; identity: GateIdentity };

export class ChapterQualityGateService {
  private readonly acceptanceAssessmentService: AcceptanceAssessmentService;
  private readonly acceptanceGateCache = new Map<string, ChapterAcceptanceAssessmentResult>();
  // Pending work must not be evicted by the bounded completed-result cache.
  private readonly acceptanceInFlight = new Map<string, Promise<ChapterAcceptanceAssessmentResult>>();

  constructor(deps: ChapterQualityGateServiceDeps) {
    this.acceptanceAssessmentService = deps.acceptanceAssessmentService ?? new ChapterAcceptanceAssessmentService();
  }

  async runAcceptanceGate(input: RunChapterQualityGatesInput): Promise<ChapterAcceptanceAssessmentResult> {
    return this.traceChapterGate({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.contextPackage.chapter.order,
      stage: "acceptance",
      blocking: true,
      contentHash: hashContent(input.content),
      promptAssetKey: "novel.chapter.acceptance_assessment",
      run: () => this.loadAcceptanceAssessment(input),
    });
  }

  private checkpointWhere(input: CacheInput) {
    return {
      novelId_chapterId_contentHash_artifactType_syncMode: {
        novelId: input.novelId, chapterId: input.chapterId,
        contentHash: input.identity.contentHash, artifactType: input.identity.artifactType,
        syncMode: input.identity.syncMode,
      },
    };
  }

  private async readPersistentGateCache(input: CacheInput): Promise<ChapterAcceptanceAssessmentResult | null> {
    try {
      const row = await prisma.chapterArtifactSyncCheckpoint.findUnique({
        where: this.checkpointWhere(input), select: { status: true, metadataJson: true },
      });
      if (row?.status !== "succeeded" || !row.metadataJson) return null;
      const payload = JSON.parse(row.metadataJson) as PersistedAcceptancePayload;
      if (payload.schemaVersion !== 2 || payload.gate !== "acceptance"
        || payload.contentHash !== input.identity.contentHash || payload.requestKey !== input.identity.requestKey) return null;
      const result = parseCachedAcceptanceResult(payload.result);
      return result && this.isCacheableAcceptanceResult(result) ? result : null;
    } catch (error) {
      this.warnCacheFailure("read", input, error);
      return null;
    }
  }

  private async writePersistentGateCache(input: CacheInput & { result: ChapterAcceptanceAssessmentResult }): Promise<void> {
    const payload: PersistedAcceptancePayload = {
      schemaVersion: 2, gate: "acceptance", contentHash: input.identity.contentHash,
      requestKey: input.identity.requestKey, result: input.result,
    };
    const data = {
      status: "succeeded", sourceType: "chapter_quality_gate", sourceStage: "acceptance",
      metadataJson: JSON.stringify(payload),
    };
    try {
      await prisma.chapterArtifactSyncCheckpoint.upsert({
        where: this.checkpointWhere(input),
        create: {
          novelId: input.novelId, chapterId: input.chapterId, contentHash: input.identity.contentHash,
          artifactType: input.identity.artifactType, syncMode: input.identity.syncMode, ...data,
        },
        update: data,
      });
    } catch (error) {
      this.warnCacheFailure("write", input, error);
    }
  }

  private warnCacheFailure(operation: "read" | "write", input: CacheInput, error: unknown): void {
    console.warn(`[chapter-runtime] quality gate cache ${operation} skipped`, {
      novelId: input.novelId, chapterId: input.chapterId, gate: "acceptance",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private isCacheableAcceptanceResult(result: ChapterAcceptanceAssessmentResult): boolean {
    return Boolean(result?.assessment && Array.isArray(result.assessment.riskTags)
      && Array.isArray(result.assessment.blockingIssues) && Array.isArray(result.issues) && Array.isArray(result.auditReports))
      && !result.assessment.riskTags.includes("acceptance_gate_unavailable")
      && !result.assessment.blockingIssues.some((issue) => issue.code === "acceptance_gate_unavailable");
  }

  private async loadAcceptanceAssessment(input: RunChapterQualityGatesInput): Promise<ChapterAcceptanceAssessmentResult> {
    const assessmentInput = {
      novelId: input.novelId, chapterId: input.chapterId,
      novelTitle: input.contextPackage.bookContract?.title ?? input.contextPackage.chapter.title,
      chapterTitle: input.contextPackage.chapter.title, chapterOrder: input.contextPackage.chapter.order,
      targetWordCount: input.contextPackage.chapter.targetWordCount ?? null, content: input.content,
      contextPackage: input.contextPackage, provider: input.request.provider,
      model: input.request.model, temperature: input.request.temperature,
    };
    const prepared = await this.acceptanceAssessmentService.prepare?.(assessmentInput);
    const requestKey = prepared?.identityDigest;
    // Legacy/custom assessors without a verifiable prepared contract remain usable.
    if (!requestKey) return this.acceptanceAssessmentService.assess(assessmentInput, prepared);
    const identity: GateIdentity = {
      artifactType: "quality_gate_acceptance", contentHash: hashContent(input.content), requestKey,
      syncMode: `prepared_v2_${requestKey}`,
    };
    const key = [input.novelId, input.chapterId, identity.contentHash, requestKey].join(":");
    const cached = this.acceptanceGateCache.get(key);
    if (cached) return cached;
    const pending = this.acceptanceInFlight.get(key);
    if (pending) return pending;
    const cacheInput: CacheInput = { novelId: input.novelId, chapterId: input.chapterId, identity };
    const assessmentPromise = Promise.resolve().then(async () => {
      const persisted = await this.readPersistentGateCache(cacheInput);
      if (persisted) {
        rememberCacheValue(this.acceptanceGateCache, key, persisted);
        return persisted;
      }
      const result = await this.acceptanceAssessmentService.assess(assessmentInput, prepared);
      if (this.isCacheableAcceptanceResult(result)) {
        await this.writePersistentGateCache({ ...cacheInput, result });
        rememberCacheValue(this.acceptanceGateCache, key, result);
      }
      return result;
    });
    this.acceptanceInFlight.set(key, assessmentPromise);
    try {
      return await assessmentPromise;
    } finally {
      if (this.acceptanceInFlight.get(key) === assessmentPromise) this.acceptanceInFlight.delete(key);
    }
  }

  private async traceChapterGate<T>(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    stage: string;
    blocking: boolean;
    contentHash: string;
    promptAssetKey: string;
    retryReason?: string;
    run: () => Promise<T>;
  }): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await input.run();
      console.info("[chapter-runtime-trace]", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        attemptNo: 1,
        stage: input.stage,
        blocking: input.blocking,
        contentHash: input.contentHash,
        durationMs: Date.now() - startedAt,
        promptAssetKey: input.promptAssetKey,
        retryReason: input.retryReason ?? null,
        status: "succeeded",
      });
      return result;
    } catch (error) {
      console.warn("[chapter-runtime-trace]", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        attemptNo: 1,
        stage: input.stage,
        blocking: input.blocking,
        contentHash: input.contentHash,
        durationMs: Date.now() - startedAt,
        promptAssetKey: input.promptAssetKey,
        retryReason: input.retryReason ?? null,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
