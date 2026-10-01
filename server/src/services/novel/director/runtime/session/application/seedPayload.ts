import type { DirectorAutoExecutionPlan, DirectorConfirmRequest, DirectorLLMOptions, DirectorProjectContextInput } from "@novelfoundry/shared/types/novelDirector";
import { normalizeDirectorAutoApprovalConfig, type DirectorAutoApprovalConfig } from "@novelfoundry/shared/types/autoDirectorApproval";
import type { DirectorWorkflowSeedPayload } from "../contracts/seedPayload";

export function buildWorkflowSeedPayload(
  input: DirectorProjectContextInput & Pick<DirectorLLMOptions, "provider" | "model" | "temperature" | "runMode"> & {
    idea: string;
    autoExecutionPlan?: DirectorAutoExecutionPlan;
    autoApproval?: DirectorAutoApprovalConfig;
  },
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const basicForm = {
    title: input.title?.trim() || "",
    description: input.description?.trim() || "",
    targetAudience: input.targetAudience?.trim() || "",
    bookSellingPoint: input.bookSellingPoint?.trim() || "",
    competingFeel: input.competingFeel?.trim() || "",
    first30ChapterPromise: input.first30ChapterPromise?.trim() || "",
    commercialTagsText: input.commercialTags?.join("，") || "",
    genreId: input.genreId ?? "",
    primaryStoryModeId: input.primaryStoryModeId ?? "",
    secondaryStoryModeId: input.secondaryStoryModeId ?? "",
    worldId: input.worldId ?? "",
    worldSetupMode: input.worldId ? "auto_generate" : input.worldSetupMode ?? "auto_generate",
    writingMode: input.writingMode ?? "original",
    projectMode: input.projectMode ?? "co_pilot",
    readerChannelPreference: input.readerChannelPreference ?? "ai_judge",
    writingPlatformPreference: input.writingPlatformPreference ?? "ai_recommend",
    narrativePov: input.narrativePov ?? "third_person",
    pacePreference: input.pacePreference ?? "balanced",
    styleTone: input.styleTone?.trim() || "",
    emotionIntensity: input.emotionIntensity ?? "medium",
    aiFreedom: input.aiFreedom ?? "medium",
    postGenerationStyleReviewEnabled: input.postGenerationStyleReviewEnabled ?? true,
    defaultChapterLength: input.defaultChapterLength ?? 2800,
    estimatedChapterCount: input.estimatedChapterCount ?? null,
    projectStatus: input.projectStatus ?? "not_started",
    storylineStatus: input.storylineStatus ?? "not_started",
    outlineStatus: input.outlineStatus ?? "not_started",
    resourceReadyScore: input.resourceReadyScore ?? 0,
    sourceNovelId: input.sourceNovelId ?? "",
    sourceKnowledgeDocumentId: input.sourceKnowledgeDocumentId ?? "",
    continuationBookAnalysisId: input.continuationBookAnalysisId ?? "",
    continuationBookAnalysisSections: input.continuationBookAnalysisSections ?? [],
  };
  const autoApproval = Object.prototype.hasOwnProperty.call(input, "autoApproval")
    ? normalizeDirectorAutoApprovalConfig(input.autoApproval)
    : null;
  return {
    title: basicForm.title || null,
    description: basicForm.description || null,
    targetAudience: basicForm.targetAudience || null,
    bookSellingPoint: basicForm.bookSellingPoint || null,
    competingFeel: basicForm.competingFeel || null,
    first30ChapterPromise: basicForm.first30ChapterPromise || null,
    commercialTags: input.commercialTags ?? [],
    genreId: basicForm.genreId || null,
    primaryStoryModeId: basicForm.primaryStoryModeId || null,
    secondaryStoryModeId: basicForm.secondaryStoryModeId || null,
    worldId: basicForm.worldId || null,
    worldSetupMode: basicForm.worldId ? undefined : basicForm.worldSetupMode,
    writingMode: basicForm.writingMode,
    projectMode: basicForm.projectMode,
    readerChannelPreference: basicForm.readerChannelPreference,
    writingPlatformPreference: basicForm.writingPlatformPreference,
    narrativePov: basicForm.narrativePov,
    pacePreference: basicForm.pacePreference,
    styleTone: basicForm.styleTone || null,
    styleProfileId: input.styleProfileId?.trim() || null,
    styleIntentSummary: input.styleIntentSummary ?? null,
    emotionIntensity: basicForm.emotionIntensity,
    aiFreedom: basicForm.aiFreedom,
    postGenerationStyleReviewEnabled: basicForm.postGenerationStyleReviewEnabled,
    provider: input.provider ?? null,
    model: input.model?.trim() || null,
    temperature: typeof input.temperature === "number" ? input.temperature : null,
    runMode: input.runMode ?? "auto_to_ready",
    ...(input.autoExecutionPlan ? { autoExecutionPlan: input.autoExecutionPlan } : {}),
    ...(autoApproval ? { autoApproval } : {}),
    estimatedChapterCount: basicForm.estimatedChapterCount,
    idea: input.idea.trim(),
    basicForm,
    ...extra,
  };
}

export function buildDirectorWorkflowSeedPayload(
  input: DirectorConfirmRequest,
  novelId: string | null,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const directorSessionPhase = extra?.directorSession
    && typeof extra.directorSession === "object"
    && "phase" in extra.directorSession
    ? (extra.directorSession as { phase?: unknown }).phase
    : null;
  const shouldClearCandidateStage = Boolean(novelId)
    || (
      typeof directorSessionPhase === "string"
      && directorSessionPhase !== "candidate_selection"
    );
  const nextCandidateStage = shouldClearCandidateStage
    ? null
    : (Object.prototype.hasOwnProperty.call(extra ?? {}, "candidateStage")
        ? (extra as { candidateStage?: unknown }).candidateStage
        : undefined);

  return buildWorkflowSeedPayload(input, {
    novelId,
    candidate: input.candidate,
    batch: {
      id: input.batchId,
      round: input.round,
    },
    directorInput: input,
    ...extra,
    candidateStage: nextCandidateStage,
  });
}

export function getDirectorInputFromSeedPayload(
  seedPayload: DirectorWorkflowSeedPayload | null | undefined,
): DirectorConfirmRequest | null {
  const directorInput = seedPayload?.directorInput;
  if (!directorInput || typeof directorInput !== "object") {
    return null;
  }
  return directorInput as DirectorConfirmRequest;
}

export function getDirectorLlmOptionsFromSeedPayload(
  seedPayload: DirectorWorkflowSeedPayload | null | undefined,
): Pick<DirectorLLMOptions, "provider" | "model" | "temperature"> | null {
  if (!seedPayload) {
    return null;
  }
  const directorInput = getDirectorInputFromSeedPayload(seedPayload);
  const provider = seedPayload.provider ?? directorInput?.provider ?? undefined;
  const model = typeof seedPayload.model === "string"
    ? (seedPayload.model.trim() || undefined)
    : (directorInput?.model?.trim() || undefined);
  const temperature = typeof seedPayload.temperature === "number"
    ? seedPayload.temperature
    : directorInput?.temperature;
  if (!provider && !model && typeof temperature !== "number") {
    return null;
  }
  return {
    provider,
    model,
    temperature,
  };
}

export function applyDirectorLlmOverride(
  seedPayload: DirectorWorkflowSeedPayload | null | undefined,
  llmOverride: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">,
): DirectorWorkflowSeedPayload | null {
  if (!seedPayload) {
    return null;
  }
  const directorInput = getDirectorInputFromSeedPayload(seedPayload);
  const nextModel = llmOverride.model?.trim()
    || (typeof seedPayload.model === "string" ? seedPayload.model.trim() : directorInput?.model?.trim() || null);
  const nextTemperature = typeof llmOverride.temperature === "number"
    ? llmOverride.temperature
    : (typeof seedPayload.temperature === "number" ? seedPayload.temperature : directorInput?.temperature ?? null);
  const nextProvider = llmOverride.provider ?? seedPayload.provider ?? directorInput?.provider ?? null;
  return {
    ...seedPayload,
    provider: nextProvider,
    model: nextModel,
    temperature: nextTemperature,
    directorInput: directorInput
      ? {
        ...directorInput,
        provider: nextProvider ?? directorInput.provider,
        model: nextModel || directorInput.model,
        temperature: typeof nextTemperature === "number"
          ? nextTemperature
          : directorInput.temperature,
      }
      : undefined,
  };
}
