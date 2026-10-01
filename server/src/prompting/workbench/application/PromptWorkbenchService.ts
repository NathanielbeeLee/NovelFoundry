import type { BaseMessage } from "@langchain/core/messages";

import { prisma } from "../../../db/prisma";

import { getLLM, getResolvedLLMClientOptionsFromInstance } from "../../../llm/factory";

import { invokeStructuredLlmDetailed } from "../../../llm/structuredInvoke";

import { extractLlmTokenUsage } from "../../../llm/usageTracking";

import { toText } from "../../../services/novel/novelP0Utils";

import { preparePromptExecution } from "../../core/promptRunner";

import { ContextBroker } from "../../context/ContextBroker";

import { createDefaultContextResolverRegistry } from "../../context/defaultContextRegistry";

import type { PromptExecutionContext } from "../../context/types";

import { findRegisteredPromptAssetById, listRegisteredPromptAssets } from "../../registry";

import { resolvePromptOverlays } from "../../slots/slotResolution";

import { promptSlotOverrideService } from "../../slots/PromptSlotOverrideService";

import type { PromptSlotDef } from "../../slots/slotTypes";

import { compilePromptTemplate, hasBlockingPromptTemplateDiagnostics } from "../../templates/templateCompiler";

import type { PromptTemplateReferenceCatalog } from "../../templates/templateTypes";

import { getRequiredTemplateContextGroups, supportsAdvancedPromptTemplate } from "../../templates/templateTypes";

import { prepareWorkbenchPreviewExecutionContext } from "../previewContextBuilder";

import { type PromptWorkbenchDb, type PromptCatalogFilter, type PromptCatalogItem, type UnknownPromptAsset, type PromptPreviewInput, type PromptPreviewResult, type PromptTestRunInput, type PromptTestRunResult, type PromptContextReferencesInput } from "./contracts";

import { toCatalogItem, matchesCatalogFilter, sortCatalogItems } from "../catalog/catalogProjection";

import { getAssetFromPreviewInput, resolvePreviewTemplate } from "../infrastructure/previewAssets";

import { formatPreviewRenderError, buildPromptTracePreview, buildPreviewNotes } from "../projections/previewDiagnostics";

import { serializeMessages, serializePromptContext } from "../projections/messageSerialization";

import { buildContextReferenceItems, buildPromptInputReferenceItems, buildSlotReferenceItems } from "../projections/contextReferences";

export class PromptWorkbenchService {
  private readonly contextBroker = new ContextBroker(createDefaultContextResolverRegistry());

  constructor(private readonly db: PromptWorkbenchDb = prisma) {}

  listCatalog(filter?: PromptCatalogFilter): PromptCatalogItem[] {
    return listRegisteredPromptAssets()
      .map(toCatalogItem)
      .filter((item) => matchesCatalogFilter(item, filter))
      .sort(sortCatalogItems);
  }

  private async preparePreviewExecutionContext(input: {
    asset: UnknownPromptAsset;
    executionContext: PromptExecutionContext;
  }): Promise<{
    executionContext: PromptExecutionContext;
    notes: string[];
  }> {
    return prepareWorkbenchPreviewExecutionContext({
      db: this.db,
      asset: input.asset,
      executionContext: input.executionContext,
    });
  }

  private async renderPreviewPrompt(input: PromptPreviewInput): Promise<{
    asset: UnknownPromptAsset;
    prompt: PromptCatalogItem;
    previewContext: {
      executionContext: PromptExecutionContext;
      notes: string[];
    };
    brokerResolution: Awaited<ReturnType<ContextBroker["resolve"]>>;
    prepared: ReturnType<typeof preparePromptExecution>;
    previewMessages: BaseMessage[];
    missingRequiredGroups: string[];
    templateDiagnosticPayload?: PromptPreviewResult["diagnostics"]["template"];
  }> {
    const asset = getAssetFromPreviewInput(input);
    const prompt = toCatalogItem(asset);
    const previewContext = await this.preparePreviewExecutionContext({
      asset,
      executionContext: input.executionContext,
    });
    const contextRequirements = input.contextRequirements ?? prompt.contextRequirements;
    const brokerResolution = await this.contextBroker.resolve({
      executionContext: previewContext.executionContext,
      requirements: contextRequirements,
      maxTokensBudget: input.maxContextTokens ?? asset.contextPolicy.maxTokensBudget,
      mode: input.contextMode,
    });

    // Resolve slot overlays: merge DB-saved overrides with any draft slotOverrides from the caller
    let resolvedSlots: import("../../slots/slotTypes").ResolvedSlots | undefined;
    let appendBlocks: import("../../core/promptTypes").PromptContextBlock[] = [];
    const slotDefs: PromptSlotDef[] = asset.slots ?? [];
    if (slotDefs.length > 0) {
      const maps = await promptSlotOverrideService.getOverrideMaps({
        promptId: asset.id,
        novelId: previewContext.executionContext.novelId,
      });

      // Draft overrides take priority over saved global overrides (per-slot, novel scope)
      const draftNovelOverrides: import("../../slots/slotTypes").PromptSlotOverrideMap = { ...maps.novel };
      if (input.slotOverrides) {
        for (const [key, value] of Object.entries(input.slotOverrides)) {
          const def = slotDefs.find((d) => d.key === key);
          if (!def) continue;
          const hash = (await import("../../slots/slotResolution")).hashSlotDefault(
            def.kind === "toggle" ? def.default : def.default,
          );
          draftNovelOverrides[key] = { value: value as string | boolean, baseHash: hash };
        }
      }

      const overlays = resolvePromptOverlays({
        slotDefs,
        globalOverrides: maps.global,
        novelOverrides: draftNovelOverrides,
      });
      resolvedSlots = overlays.inlineSlots;
      appendBlocks = overlays.appendBlocks;
    }

    const allBlocks = appendBlocks.length > 0
      ? [...brokerResolution.blocks, ...appendBlocks]
      : brokerResolution.blocks;

    let prepared: ReturnType<typeof preparePromptExecution>;
    let previewMessages: BaseMessage[];
    let templateDiagnosticPayload: PromptPreviewResult["diagnostics"]["template"] | undefined;
    try {
      prepared = preparePromptExecution({
        asset,
        promptInput: input.promptInput,
        contextBlocks: allBlocks,
          resolvedSlots,
        options: {
          entrypoint: previewContext.executionContext.entrypoint,
          novelId: previewContext.executionContext.novelId,
          chapterId: previewContext.executionContext.chapterId,
          taskId: previewContext.executionContext.taskId,
        },
      });
      previewMessages = prepared.messages;

      const templateSource = await resolvePreviewTemplate({
        asset,
        novelId: previewContext.executionContext.novelId,
        templateDraft: input.templateDraft,
      });
      if (templateSource) {
        const compiled = compilePromptTemplate({
          template: templateSource.template,
          promptInput: input.promptInput,
          context: prepared.context,
          slotDefs,
          slots: resolvedSlots,
          allowedContextGroups: prompt.contextRequirements.map((requirement) => requirement.group),
          requiredContextGroups: getRequiredTemplateContextGroups(asset.id),
        });
        if (hasBlockingPromptTemplateDiagnostics(compiled.diagnostics)) {
          const details = [
            compiled.diagnostics.invalidMessages.join("；"),
            compiled.diagnostics.unknownTokens.length > 0
              ? `未知 token：${compiled.diagnostics.unknownTokens.join("、")}`
              : "",
            compiled.diagnostics.missingRequiredGroups.length > 0
              ? `缺少必需上下文组：${compiled.diagnostics.missingRequiredGroups.join("、")}`
              : "",
          ].filter(Boolean).join("；");
          throw new Error(`高级模板预览失败：${details}`);
        }
        previewMessages = compiled.messages;
        templateDiagnosticPayload = {
          mode: templateSource.mode,
          activeVersionNo: templateSource.activeVersionNo,
          diagnostics: compiled.diagnostics,
        };
      }
    } catch (error) {
      throw formatPreviewRenderError(error, asset);
    }

    const missingRequiredGroups = [
      ...new Set([
        ...brokerResolution.missingRequiredGroups,
        ...(templateDiagnosticPayload?.diagnostics.missingRequiredGroups ?? []),
      ]),
    ];

    return {
      asset,
      prompt,
      previewContext,
      brokerResolution,
      prepared,
      previewMessages,
      missingRequiredGroups,
      templateDiagnosticPayload,
    };
  }

  async preview(input: PromptPreviewInput): Promise<PromptPreviewResult> {
    const rendered = await this.renderPreviewPrompt(input);

    return {
      prompt: rendered.prompt,
      messages: serializeMessages(rendered.previewMessages),
      context: serializePromptContext(rendered.prepared.context),
      brokerResolution: rendered.brokerResolution,
      diagnostics: {
        entrypoint: rendered.previewContext.executionContext.entrypoint,
        missingRequiredGroups: rendered.missingRequiredGroups,
        resolverErrors: rendered.brokerResolution.resolverErrors,
        tracePreview: buildPromptTracePreview({
          asset: rendered.asset,
          prepared: rendered.prepared,
          options: {
            ...input,
            executionContext: rendered.previewContext.executionContext,
          },
        }),
        notes: buildPreviewNotes({
          prompt: rendered.prompt,
          brokerResolution: rendered.brokerResolution,
          extraNotes: [
            ...rendered.previewContext.notes,
            ...(rendered.templateDiagnosticPayload?.diagnostics.fallbackRequiredGroups.length
              ? [`高级模板已自动追加必需上下文：${rendered.templateDiagnosticPayload.diagnostics.fallbackRequiredGroups.join("、")}。`]
              : []),
          ],
        }),
        template: rendered.templateDiagnosticPayload,
      },
    };
  }

  async testRun(input: PromptTestRunInput): Promise<PromptTestRunResult> {
    const rendered = await this.renderPreviewPrompt(input);
    const startedAt = Date.now();
    const serializedMessages = serializeMessages(rendered.previewMessages);
    const llmOptions = input.llm ?? {};

    if (rendered.asset.mode === "structured") {
      if (!rendered.asset.outputSchema) {
        throw new Error(`提示词没有结构化输出 schema：${rendered.asset.id}@${rendered.asset.version}`);
      }
      const result = await invokeStructuredLlmDetailed<unknown>({
        label: `${rendered.asset.id}@${rendered.asset.version}:workbench_test`,
        provider: llmOptions.provider,
        model: llmOptions.model,
        temperature: llmOptions.temperature,
        maxTokens: llmOptions.maxTokens,
        maxTokensCap: rendered.asset.maxOutputTokens,
        timeoutMs: llmOptions.timeoutMs,
        taskType: rendered.asset.taskType,
        messages: rendered.previewMessages,
        schema: rendered.asset.outputSchema,
        maxRepairAttempts: Math.max(0, rendered.asset.repairPolicy?.maxAttempts ?? 1),
        maxRepairSourceTokens: rendered.asset.repairPolicy?.maxSourceTokens,
      });
      const outputText = JSON.stringify(result.data, null, 2);
      return {
        prompt: rendered.prompt,
        outputType: "structured",
        output: result.data,
        outputText,
        messages: serializedMessages,
        context: serializePromptContext(rendered.prepared.context),
        meta: {
          provider: llmOptions.provider,
          model: llmOptions.model,
          latencyMs: Date.now() - startedAt,
          tokenUsage: result.tokenUsage,
          repairUsed: result.repairUsed,
          repairAttempts: result.repairAttempts,
        },
        diagnostics: {
          missingRequiredGroups: rendered.missingRequiredGroups,
          resolverErrors: rendered.brokerResolution.resolverErrors,
          notes: buildPreviewNotes({
            prompt: rendered.prompt,
            brokerResolution: rendered.brokerResolution,
            extraNotes: rendered.previewContext.notes,
          }),
          structured: result.diagnostics,
          template: rendered.templateDiagnosticPayload,
        },
      };
    }

    const llm = await getLLM(llmOptions.provider, {
      fallbackProvider: "deepseek",
      model: llmOptions.model,
      temperature: llmOptions.temperature,
      maxTokens: llmOptions.maxTokens,
      timeoutMs: llmOptions.timeoutMs,
      taskType: rendered.asset.taskType,
    });
    const resolved = getResolvedLLMClientOptionsFromInstance(llm);
    const result = await llm.invoke(rendered.previewMessages);
    const outputText = toText(result.content);

    return {
      prompt: rendered.prompt,
      outputType: "text",
      output: outputText,
      outputText,
      messages: serializedMessages,
      context: serializePromptContext(rendered.prepared.context),
      meta: {
        provider: resolved?.provider ?? llmOptions.provider,
        model: resolved?.model ?? llmOptions.model,
        latencyMs: Date.now() - startedAt,
        tokenUsage: extractLlmTokenUsage(result),
      },
      diagnostics: {
        missingRequiredGroups: rendered.missingRequiredGroups,
        resolverErrors: rendered.brokerResolution.resolverErrors,
        notes: buildPreviewNotes({
          prompt: rendered.prompt,
          brokerResolution: rendered.brokerResolution,
          extraNotes: rendered.previewContext.notes,
        }),
        template: rendered.templateDiagnosticPayload,
      },
    };
  }

  async contextReferences(input: PromptContextReferencesInput): Promise<PromptTemplateReferenceCatalog> {
    const asset = findRegisteredPromptAssetById(input.promptId);
    if (!asset) {
      throw new Error(`提示词未注册：${input.promptId}`);
    }
    if (!supportsAdvancedPromptTemplate(asset.id)) {
      throw new Error("该提示词不支持高级模板上下文引用。");
    }
    const prompt = toCatalogItem(asset);
    const previewContext = await this.preparePreviewExecutionContext({
      asset,
      executionContext: {
        entrypoint: input.entrypoint ?? "manual_test",
        novelId: input.novelId,
        chapterId: input.chapterId,
      },
    });
    const brokerResolution = await this.contextBroker.resolve({
      executionContext: previewContext.executionContext,
      requirements: prompt.contextRequirements,
      maxTokensBudget: asset.contextPolicy.maxTokensBudget,
    });
    return {
      promptId: asset.id,
      novelId: previewContext.executionContext.novelId,
      chapterId: previewContext.executionContext.chapterId,
      items: [
        ...buildContextReferenceItems({
          requirements: prompt.contextRequirements,
          blocks: brokerResolution.blocks,
          promptId: asset.id,
        }),
        ...buildPromptInputReferenceItems(asset.id),
        ...buildSlotReferenceItems(asset.slots ?? []),
      ],
      missingRequiredGroups: brokerResolution.missingRequiredGroups,
    };
  }
}

export const promptWorkbenchService = new PromptWorkbenchService();
