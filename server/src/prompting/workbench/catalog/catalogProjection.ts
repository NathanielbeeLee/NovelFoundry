import { buildPromptAssetKey } from "../../core/promptTypes";

import { derivePromptContextRequirements } from "../../context/promptContextResolution";

import { getPromptCatalogDescription, getPromptCatalogShortDescription } from "../../addendums/PromptAddendumService";

import type { PromptSlotDef } from "../../slots/slotTypes";

import { type UnknownPromptAsset, type PromptCatalogItem, type PromptCatalogFilter } from "../application/contracts";

export const LOCKED_PROMPT_FIELDS = [
  "outputSchema",
  "postValidate",
  "postValidateFailureRecovery",
  "semanticRetryPolicy",
  "taskType",
  "mode",
  "contextPolicy",
  "toolCatalog",
  "approvalBoundary",
];

export function toCatalogItem(asset: UnknownPromptAsset): PromptCatalogItem {
  const contextRequirements = derivePromptContextRequirements(asset);
  const slots: PromptSlotDef[] = asset.slots ?? [];
  const slotSupported = slots.length > 0;
  const prosePrompt = Boolean(asset.management?.proseGeneration);
  const managementStatus: PromptCatalogItem["managementStatus"] = contextRequirements.length === 0
    ? "missing_context_requirements"
    : !slotSupported
      ? "missing_slots"
      : prosePrompt && !asset.management?.editModes.includes("advanced_template")
        ? "missing_advanced_template"
      : "complete";
  return {
    key: buildPromptAssetKey(asset),
    id: asset.id,
    version: asset.version,
    taskType: asset.taskType,
    mode: asset.mode,
    language: asset.language,
    family: asset.id.split(".")[0] ?? asset.id,
    shortDescription: getPromptCatalogShortDescription(asset.id, asset.taskType),
    description: getPromptCatalogDescription(asset.id, asset.taskType),
    outputType: asset.mode === "structured" ? "structured" : "text",
    contextPolicy: asset.contextPolicy,
    contextRequirements,
    slots,
    slotSupported,
    lockedFields: LOCKED_PROMPT_FIELDS,
    managementStatus,
    management: asset.management,
    capabilities: {
      hasOutputSchema: Boolean(asset.outputSchema),
      hasPostValidate: Boolean(asset.postValidate),
      hasSemanticRetryPolicy: Boolean(asset.semanticRetryPolicy),
      hasRepairPolicy: Boolean(asset.repairPolicy),
      hasStructuredOutputHint: Boolean(asset.structuredOutputHint),
      supportsAdvancedTemplate: Boolean(asset.management?.editModes.includes("advanced_template")),
      isProductPrompt: Boolean(asset.management?.productPrompt),
      isProseGeneration: prosePrompt,
    },
  };
}

export function matchesCatalogFilter(item: PromptCatalogItem, filter?: PromptCatalogFilter): boolean {
  if (filter?.taskType && item.taskType !== filter.taskType) {
    return false;
  }
  if (filter?.mode && item.mode !== filter.mode) {
    return false;
  }
  const keyword = filter?.keyword?.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  return [
    item.key,
    item.id,
    item.description,
    item.version,
    item.taskType,
    item.mode,
    item.language,
    item.contextRequirements.map((requirement) => requirement.group).join(" "),
    item.slots.map((slot) => `${slot.key} ${slot.label}`).join(" "),
  ].some((value) => value.toLowerCase().includes(keyword));
}

export function sortCatalogItems(left: PromptCatalogItem, right: PromptCatalogItem): number {
  const leftIsWriterPrompt = left.capabilities.isProseGeneration;
  const rightIsWriterPrompt = right.capabilities.isProseGeneration;
  if (leftIsWriterPrompt !== rightIsWriterPrompt) {
    return leftIsWriterPrompt ? -1 : 1;
  }
  if (left.slotSupported !== right.slotSupported) {
    return left.slotSupported ? -1 : 1;
  }
  return left.key.localeCompare(right.key);
}
