import { getRegisteredPromptAsset } from "../../registry";

import { promptTemplateOverrideService } from "../../templates/PromptTemplateOverrideService";

import type { PromptTemplateJson } from "../../templates/templateTypes";

import { supportsAdvancedPromptTemplate } from "../../templates/templateTypes";

import { type PromptPreviewInput, type UnknownPromptAsset } from "../application/contracts";

export function getAssetFromPreviewInput(input: PromptPreviewInput): UnknownPromptAsset {
  if (input.promptKey) {
    const separatorIndex = input.promptKey.lastIndexOf("@");
    if (separatorIndex <= 0 || separatorIndex === input.promptKey.length - 1) {
      throw new Error("promptKey must use the format id@version.");
    }
    const id = input.promptKey.slice(0, separatorIndex);
    const version = input.promptKey.slice(separatorIndex + 1);
    const asset = getRegisteredPromptAsset(id, version);
    if (!asset) {
      throw new Error(`Prompt asset not found: ${input.promptKey}`);
    }
    return asset;
  }

  if (!input.id || !input.version) {
    throw new Error("Provide promptKey or both id and version.");
  }

  const asset = getRegisteredPromptAsset(input.id, input.version);
  if (!asset) {
    throw new Error(`Prompt asset not found: ${input.id}@${input.version}`);
  }
  return asset;
}

export async function resolvePreviewTemplate(input: {
  asset: UnknownPromptAsset;
  novelId?: string;
  templateDraft?: PromptTemplateJson;
}): Promise<{
  mode: "draft" | "custom";
  template: PromptTemplateJson;
  activeVersionNo?: number;
} | null> {
  if (!supportsAdvancedPromptTemplate(input.asset.id) || !input.novelId) {
    return null;
  }
  if (input.templateDraft) {
    return {
      mode: "draft",
      template: input.templateDraft,
    };
  }
  const active = await promptTemplateOverrideService.getActiveCustomTemplate({
    promptId: input.asset.id,
    novelId: input.novelId,
  });
  if (!active) {
    return null;
  }
  return {
    mode: "custom",
    template: active.template,
    activeVersionNo: active.versionNo,
  };
}
