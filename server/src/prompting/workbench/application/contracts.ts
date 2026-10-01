import type { LLMProvider } from "@novelfoundry/shared/types/llm";

import type { TaskType } from "../../../llm/modelRouter";

import type { LlmTokenUsageSnapshot } from "../../../llm/usageTracking";

import { type PromptAsset, type PromptContextRequirement, type PromptRunTrace } from "../../core/promptTypes";

import { ContextBroker } from "../../context/ContextBroker";

import type { PromptExecutionContext } from "../../context/types";

import type { PromptSlotDef } from "../../slots/slotTypes";

import type { PromptTemplateDiagnostics, PromptTemplateJson } from "../../templates/templateTypes";

import { type PromptWorkbenchPreviewDb } from "../previewContextBuilder";

import { serializePromptContext } from "../projections/messageSerialization";

export type UnknownPromptAsset = PromptAsset<unknown, unknown, unknown>;

export type PromptWorkbenchDb = PromptWorkbenchPreviewDb;

export interface PromptCatalogItem {
  key: string;
  id: string;
  version: string;
  taskType: TaskType;
  mode: string;
  language: string;
  family: string;
  shortDescription: string;
  description: string;
  outputType: "structured" | "text";
  contextPolicy: UnknownPromptAsset["contextPolicy"];
  contextRequirements: PromptContextRequirement[];
  slots: PromptSlotDef[];
  slotSupported: boolean;
  lockedFields: string[];
  managementStatus: "complete" | "missing_context_requirements" | "missing_slots" | "missing_advanced_template";
  management: UnknownPromptAsset["management"];
  capabilities: {
    hasOutputSchema: boolean;
    hasPostValidate: boolean;
    hasSemanticRetryPolicy: boolean;
    hasRepairPolicy: boolean;
    hasStructuredOutputHint: boolean;
    supportsAdvancedTemplate: boolean;
    isProductPrompt: boolean;
    isProseGeneration: boolean;
  };
}

export interface PromptCatalogFilter {
  taskType?: TaskType;
  mode?: "structured" | "text";
  keyword?: string;
}

export interface PromptPreviewInput {
  promptKey?: string;
  id?: string;
  version?: string;
  promptInput?: unknown;
  executionContext: PromptExecutionContext;
  contextRequirements?: PromptContextRequirement[];
  maxContextTokens?: number;
  contextMode?: "snapshot" | "fresh" | "hybrid";
  slotOverrides?: Record<string, unknown>;
  templateDraft?: PromptTemplateJson;
}

export interface PromptPreviewMessage {
  role: string;
  content: string;
}

export interface PromptPreviewResult {
  prompt: PromptCatalogItem;
  messages: PromptPreviewMessage[];
  context: ReturnType<typeof serializePromptContext>;
  brokerResolution: Awaited<ReturnType<ContextBroker["resolve"]>>;
  diagnostics: {
    entrypoint: string;
    missingRequiredGroups: string[];
    resolverErrors: Awaited<ReturnType<ContextBroker["resolve"]>>["resolverErrors"];
    tracePreview: PromptRunTrace;
    notes: string[];
    template?: {
      mode: "official" | "draft" | "custom";
      activeVersionNo?: number;
      diagnostics: PromptTemplateDiagnostics;
    };
  };
}

export interface PromptTestRunInput extends PromptPreviewInput {
  llm?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  };
}

export interface PromptTestRunResult {
  prompt: PromptCatalogItem;
  outputType: "structured" | "text";
  output: unknown;
  outputText: string;
  messages: PromptPreviewMessage[];
  context: ReturnType<typeof serializePromptContext>;
  meta: {
    provider?: LLMProvider;
    model?: string;
    latencyMs: number;
    tokenUsage?: LlmTokenUsageSnapshot | null;
    repairUsed?: boolean;
    repairAttempts?: number;
  };
  diagnostics: {
    missingRequiredGroups: string[];
    resolverErrors: Awaited<ReturnType<ContextBroker["resolve"]>>["resolverErrors"];
    notes: string[];
    structured?: unknown;
    template?: PromptPreviewResult["diagnostics"]["template"];
  };
}

export interface PromptContextReferencesInput {
  promptId: string;
  novelId?: string;
  chapterId?: string;
  entrypoint?: string;
}
