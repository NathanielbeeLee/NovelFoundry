import type { AiWorkspaceInterpretation, DirectorManualEditImpact, DirectorWorkspaceAnalysis } from "@novelfoundry/shared/types/directorRuntime";
import type { DirectorLLMOptions } from "@novelfoundry/shared/types/novelDirector";
import { runStructuredPrompt } from "../../../../../../prompting/core/promptRunner";
import { resolvePromptContextBlocksForAsset } from "../../../../../../prompting/context/promptContextResolution";
import { buildDirectorWorkspaceAnalysisContextBlocks, directorWorkspaceAnalysisPrompt } from "../../../../../../prompting/prompts/novel/directorWorkspaceAnalysis.prompts";
import { buildDirectorManualEditImpactContextBlocks, directorManualEditImpactPrompt } from "../../../../../../prompting/prompts/novel/directorManualEditImpact.prompts";
import { DirectorRuntimeStore } from "../../DirectorRuntimeStore";
import { buildManualEditFallbackDecision } from "../domain/manualEditInventory";
import { buildManualEditRecommendation } from "../domain/manualEditRecommendation";
import { computeWorkspaceInterpretation } from "../domain/workspaceInterpretation";
import { DirectorWorkspaceInventoryRepository } from "../infrastructure/DirectorWorkspaceInventoryRepository";

export class DirectorWorkspaceAnalyzer extends DirectorWorkspaceInventoryRepository {
  constructor(private readonly runtimeStore = new DirectorRuntimeStore()) { super(); }

  async analyze(input: {
    novelId: string;
    workflowTaskId?: string | null;
    includeAiInterpretation?: boolean;
    llm?: DirectorLLMOptions;
  }): Promise<DirectorWorkspaceAnalysis> {
    const inventory = await this.buildInventory(input.novelId);
    let interpretation: AiWorkspaceInterpretation | null = null;
    let promptMeta: DirectorWorkspaceAnalysis["prompt"] = null;

    if (input.includeAiInterpretation === true) {
      const fallbackContextBlocks = buildDirectorWorkspaceAnalysisContextBlocks({ inventory });
      const resolvedContext = await resolvePromptContextBlocksForAsset({
        asset: directorWorkspaceAnalysisPrompt,
        executionContext: {
          entrypoint: "auto_director",
          novelId: input.novelId,
          taskId: input.workflowTaskId ?? undefined,
          metadata: {
            workspaceInventory: inventory,
          },
        },
        fallbackBlocks: fallbackContextBlocks,
      });
      const result = await runStructuredPrompt({
        asset: directorWorkspaceAnalysisPrompt,
        promptInput: { inventory },
        contextBlocks: resolvedContext.blocks,
        options: {
          provider: input.llm?.provider,
          model: input.llm?.model,
          temperature: typeof input.llm?.temperature === "number" ? input.llm.temperature : 0.2,
          novelId: input.novelId,
          taskId: input.workflowTaskId ?? undefined,
          stage: "workspace_analysis",
          itemKey: "workspace_analyze",
          triggerReason: "director_runtime_workspace_analysis",
        },
      });
      interpretation = result.output;
      promptMeta = {
        promptId: result.meta.invocation.promptId,
        promptVersion: result.meta.invocation.promptVersion,
        provider: result.meta.provider,
        model: result.meta.model,
      };
    } else {
      interpretation = computeWorkspaceInterpretation(inventory);
    }

    const generatedAt = new Date().toISOString();
    const analysis: DirectorWorkspaceAnalysis = {
      novelId: input.novelId,
      inventory,
      interpretation,
      manualEditImpact: null,
      recommendation: interpretation?.recommendedAction ?? null,
      confidence: interpretation?.confidence ?? 0,
      evidenceRefs: interpretation?.evidenceRefs ?? ["workspace_inventory"],
      generatedAt,
      prompt: promptMeta,
    };

    if (input.workflowTaskId?.trim()) {
      await this.runtimeStore.recordWorkspaceAnalysis({
        taskId: input.workflowTaskId.trim(),
        analysis,
      });
    }

    return analysis;
  }

  async evaluateManualEditImpact(input: {
    novelId: string;
    workflowTaskId?: string | null;
    chapterId?: string | null;
    includeAiInterpretation?: boolean;
    llm?: DirectorLLMOptions;
  }): Promise<DirectorManualEditImpact> {
    const inventory = await this.buildInventory(input.novelId);
    const taskId = input.workflowTaskId?.trim() || null;
    const snapshot = taskId ? await this.runtimeStore.getSnapshot(taskId) : null;
    const previousArtifacts = snapshot?.lastWorkspaceAnalysis?.inventory.artifacts ?? snapshot?.artifacts ?? [];
    const editInventory = await this.buildManualEditInventory({
      novelId: input.novelId,
      inventory,
      previousArtifacts,
      focusedChapterId: input.chapterId,
      comparedAgainstTaskId: taskId,
    });

    let decision = buildManualEditFallbackDecision(editInventory);
    let promptMeta: DirectorManualEditImpact["prompt"] = null;

    if (input.includeAiInterpretation !== false && editInventory.changedChapters.length > 0) {
      const fallbackContextBlocks = buildDirectorManualEditImpactContextBlocks({ inventory, editInventory });
      const resolvedContext = await resolvePromptContextBlocksForAsset({
        asset: directorManualEditImpactPrompt,
        executionContext: {
          entrypoint: "auto_director",
          novelId: input.novelId,
          taskId: taskId ?? undefined,
          metadata: {
            workspaceInventory: inventory,
            manualEditInventory: editInventory,
          },
        },
        fallbackBlocks: fallbackContextBlocks,
      });
      const result = await runStructuredPrompt({
        asset: directorManualEditImpactPrompt,
        promptInput: { inventory, editInventory },
        contextBlocks: resolvedContext.blocks,
        options: {
          provider: input.llm?.provider,
          model: input.llm?.model,
          temperature: typeof input.llm?.temperature === "number" ? input.llm.temperature : 0.2,
          novelId: input.novelId,
          taskId: taskId ?? undefined,
          stage: "workspace_analysis",
          itemKey: "manual_edit_impact",
          triggerReason: "director_runtime_manual_edit_impact",
        },
      });
      decision = result.output;
      promptMeta = {
        promptId: result.meta.invocation.promptId,
        promptVersion: result.meta.invocation.promptVersion,
        provider: result.meta.provider,
        model: result.meta.model,
      };
    }

    const affectedArtifactIds = new Set([
      ...decision.affectedArtifactIds,
      ...editInventory.changedChapters.flatMap((chapter) => chapter.relatedArtifactIds),
    ]);
    const impact: DirectorManualEditImpact = {
      novelId: input.novelId,
      changedChapters: editInventory.changedChapters,
      affectedArtifacts: inventory.artifacts.filter((artifact) => affectedArtifactIds.has(artifact.id)),
      generatedAt: editInventory.generatedAt,
      ...decision,
      affectedArtifactIds: [...affectedArtifactIds],
      prompt: promptMeta,
    };

    if (taskId) {
      await this.runtimeStore.recordWorkspaceAnalysis({
        taskId,
        analysis: {
          novelId: input.novelId,
          inventory,
          interpretation: null,
          manualEditImpact: impact,
          recommendation: buildManualEditRecommendation(impact),
          confidence: impact.confidence,
          evidenceRefs: impact.evidenceRefs.length > 0 ? impact.evidenceRefs : ["manual_edit_inventory"],
          generatedAt: impact.generatedAt,
          prompt: promptMeta,
        },
      });
    }

    return impact;
  }
}
