import { normalizeModelRequestProtocol } from "../../../../llm/protocols";
import { type ModelRouteRequestProtocol } from "@novelfoundry/shared/types/novel";
import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { type BuiltinLLMProvider, type LLMProvider, type ProviderAuthMode, type ReasoningEffort } from "@novelfoundry/shared/types/llm";
import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import { setProviderSecretCache } from "../../../../llm/factory";
import { evictSharedLimiters } from "../../../../llm/requestLimiter";
import { filterHiddenModels, parseHiddenModels, refreshProviderModels, serializeHiddenModels } from "../../../../llm/modelCatalog";
import { isDeepSeekThinkingModeProvider, normalizeReasoningEffort } from "../../../../llm/reasoning";
import { getProviderEnvApiKey, getProviderEnvBaseUrl, getProviderEnvModel, isBuiltInProvider, providerRequiresApiKey, PROVIDERS } from "../../../../llm/providers";
import { AppError } from "../../../../middleware/errorHandler";
import { secretStore } from "../../secretStore";
import { getDefaultImageModel, getImageModelOptions, getProviderImageModelMap, saveProviderImageModel } from "../../ProviderImageSettingsService";
import { getLLMSelectionSettings } from "../../LLMSelectionSettingsService";
import { getRagEmbeddingSettings } from "../../RagSettingsService";
import { getRagRuntimeSettings } from "../../RagRuntimeSettingsService";
import { upsertApiKeySchema } from "../domain/ProviderSettingsPolicy";
type APIKeyRecordLike = {
  provider: string;
  displayName: string | null;
  key: string | null;
  model: string | null;
  baseURL: string | null;
  authMode: string;
  requestProtocol?: string | null;
  isActive: boolean;
  reasoningEnabled?: boolean | null;
  reasoningEffort?: string | null;
  hiddenModels?: string | null;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
};

type BuiltInProviderStatus = {
  provider: BuiltinLLMProvider;
  kind: "builtin";
  name: string;
  displayName?: string;
  currentModel: string;
  currentImageModel: string | null;
  currentBaseURL: string;
  currentAuthMode: ProviderAuthMode;
  requestProtocol: ModelRouteRequestProtocol;
  models: string[];
  imageModels: string[];
  defaultModel: string;
  defaultImageModel: string | null;
  defaultBaseURL: string;
  requiresApiKey: boolean;
  isConfigured: boolean;
  isActive: boolean;
  reasoningEnabled: boolean;
  reasoningEffort: ReasoningEffort | null;
  supportsReasoningEffort: boolean;
  hiddenModels: string[];
  concurrencyLimit: number;
  requestIntervalMs: number;
  supportsImageGeneration: boolean;
};

type CustomProviderStatus = {
  provider: string;
  kind: "custom";
  name: string;
  displayName?: string;
  currentModel: string;
  currentImageModel: string | null;
  currentBaseURL: string;
  currentAuthMode: ProviderAuthMode;
  requestProtocol: ModelRouteRequestProtocol;
  models: string[];
  imageModels: string[];
  defaultModel: string;
  defaultImageModel: null;
  defaultBaseURL: string;
  requiresApiKey: boolean;
  isConfigured: boolean;
  isActive: boolean;
  reasoningEnabled: boolean;
  reasoningEffort: ReasoningEffort | null;
  supportsReasoningEffort: boolean;
  hiddenModels: string[];
  concurrencyLimit: number;
  requestIntervalMs: number;
  supportsImageGeneration: boolean;
};

export function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeProviderLimit(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

export function normalizeProviderAuthMode(value: unknown): ProviderAuthMode {
  return value === "x-api-key" || value === "none" ? value : "bearer";
}

export function getFallbackModels(provider: LLMProvider, currentModel?: string): string[] {
  const models = isBuiltInProvider(provider) ? PROVIDERS[provider].models : [];
  return Array.from(new Set([...models, currentModel ?? ""].filter(Boolean)));
}

export function buildBuiltInProviderStatus(
  provider: BuiltinLLMProvider,
  item: {
    displayName?: string | null;
    key?: string | null;
    model?: string | null;
    baseURL?: string | null;
    requestProtocol?: string | null;
    isActive?: boolean;
    reasoningEnabled?: boolean | null;
    reasoningEffort?: string | null;
    hiddenModels?: string | null;
    concurrencyLimit?: number | null;
    requestIntervalMs?: number | null;
  } | undefined,
  imageModel: string | undefined,
): BuiltInProviderStatus {
  const savedKey = normalizeOptionalText(item?.key);
  const envKey = getProviderEnvApiKey(provider);
  const effectiveKey = savedKey ?? envKey;
  const savedBaseURL = normalizeOptionalText(item?.baseURL);
  const configuredModel = normalizeOptionalText(item?.model) ?? getProviderEnvModel(provider);
  const currentBaseURL = savedBaseURL
    ?? getProviderEnvBaseUrl(provider)
    ?? PROVIDERS[provider].baseURL;
  const requiresApiKey = providerRequiresApiKey(provider);
  const hiddenModels = parseHiddenModels(item?.hiddenModels);
  const fallbackModels = getFallbackModels(provider, configuredModel);
  const currentModel = configuredModel ?? fallbackModels[0] ?? "";
  const models = filterHiddenModels(fallbackModels, hiddenModels, currentModel);
  const currentImageModel = imageModel ?? getDefaultImageModel(provider) ?? null;
  const isConfigured = requiresApiKey ? Boolean(effectiveKey && currentModel) : Boolean(currentModel && currentBaseURL);
  const supportsReasoningEffort = isDeepSeekThinkingModeProvider(provider, currentBaseURL, currentModel);

  return {
    provider,
    kind: "builtin",
    name: PROVIDERS[provider].name,
    displayName: undefined,
    currentModel,
    currentImageModel,
    currentBaseURL,
    currentAuthMode: "bearer",
    requestProtocol: normalizeModelRequestProtocol(item?.requestProtocol),
    models,
    imageModels: Array.from(new Set([...getImageModelOptions(provider), currentImageModel ?? ""].filter(Boolean))),
    defaultModel: PROVIDERS[provider].defaultModel,
    defaultImageModel: getDefaultImageModel(provider) ?? null,
    defaultBaseURL: PROVIDERS[provider].baseURL,
    requiresApiKey,
    isConfigured,
    isActive: item?.isActive ?? isConfigured,
    reasoningEnabled: item?.reasoningEnabled ?? true,
    reasoningEffort: supportsReasoningEffort ? normalizeReasoningEffort(item?.reasoningEffort) : null,
    supportsReasoningEffort,
    hiddenModels,
    concurrencyLimit: normalizeProviderLimit(item?.concurrencyLimit),
    requestIntervalMs: normalizeProviderLimit(item?.requestIntervalMs),
    supportsImageGeneration: Boolean(currentImageModel),
  };
}

export function buildCustomProviderStatus(item: {
  provider: string;
  displayName: string | null;
  key: string | null;
  model: string | null;
  baseURL: string | null;
  authMode: string;
  requestProtocol?: string | null;
  isActive: boolean;
  reasoningEnabled?: boolean | null;
  reasoningEffort?: string | null;
  hiddenModels?: string | null;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
}, imageModel: string | undefined): CustomProviderStatus {
  const currentModel = normalizeOptionalText(item.model) ?? "";
  const currentBaseURL = normalizeOptionalText(item.baseURL) ?? "";
  const currentAuthMode = normalizeProviderAuthMode(item.authMode);
  const hiddenModels = parseHiddenModels(item.hiddenModels);
  const models = filterHiddenModels(currentModel ? [currentModel] : [], hiddenModels, currentModel);
  const supportsReasoningEffort = isDeepSeekThinkingModeProvider(item.provider, currentBaseURL, currentModel);
  return {
    provider: item.provider,
    kind: "custom",
    name: normalizeOptionalText(item.displayName) ?? item.provider,
    displayName: normalizeOptionalText(item.displayName) ?? item.provider,
    currentModel,
    currentImageModel: imageModel ?? null,
    currentBaseURL,
    currentAuthMode,
    requestProtocol: normalizeModelRequestProtocol(item.requestProtocol),
    models,
    imageModels: imageModel ? [imageModel] : [],
    defaultModel: currentModel,
    defaultImageModel: null,
    defaultBaseURL: currentBaseURL,
    requiresApiKey: false,
    isConfigured: Boolean(currentModel && currentBaseURL),
    isActive: item.isActive,
    reasoningEnabled: item.reasoningEnabled ?? true,
    reasoningEffort: supportsReasoningEffort ? normalizeReasoningEffort(item.reasoningEffort) : null,
    supportsReasoningEffort,
    hiddenModels,
    concurrencyLimit: normalizeProviderLimit(item.concurrencyLimit),
    requestIntervalMs: normalizeProviderLimit(item.requestIntervalMs),
    supportsImageGeneration: Boolean(imageModel),
  };
}


export async function saveProviderSettings(provider: LLMProvider, body: z.infer<typeof upsertApiKeySchema>) {
  const existing = await secretStore.getProvider(provider);
  const existingRecord = existing as APIKeyRecordLike | null;
  if (!isBuiltInProvider(provider) && !existing) {
    throw new AppError("没有找到这个自定义厂商。", 404);
  }

  const nextKey = normalizeOptionalText(body.key) ?? normalizeOptionalText(existingRecord?.key);
  const envKey = getProviderEnvApiKey(provider);
  const effectiveKey = nextKey ?? envKey;
  const nextModel = normalizeOptionalText(body.model) ?? normalizeOptionalText(existingRecord?.model);
  const nextBaseURL = body.baseURL !== undefined
    ? normalizeOptionalText(body.baseURL)
    : normalizeOptionalText(existingRecord?.baseURL);
  const nextAuthMode = isBuiltInProvider(provider)
    ? "bearer"
    : normalizeProviderAuthMode(body.authMode ?? existingRecord?.authMode);
  const nextDisplayName = !isBuiltInProvider(provider)
    ? normalizeOptionalText(body.displayName) ?? normalizeOptionalText(existingRecord?.displayName) ?? provider
    : undefined;
  const nextReasoningEnabled = body.reasoningEnabled ?? existingRecord?.reasoningEnabled ?? true;
  const nextReasoningEffort = normalizeReasoningEffort(body.reasoningEffort ?? existingRecord?.reasoningEffort);
  const nextHiddenModels = body.hiddenModels ?? parseHiddenModels(existingRecord?.hiddenModels);
  const nextConcurrencyLimit = body.concurrencyLimit ?? normalizeProviderLimit(existingRecord?.concurrencyLimit);
  const nextRequestIntervalMs = body.requestIntervalMs ?? normalizeProviderLimit(existingRecord?.requestIntervalMs);
  const requiresApiKey = providerRequiresApiKey(provider);
  const effectiveCurrentModel = nextModel
    ?? getProviderEnvModel(provider)
    ?? (isBuiltInProvider(provider) ? PROVIDERS[provider].defaultModel : undefined);

  if (body.isActive === false) {
    const [routeInUse, selection, ragSettings, ragRuntimeSettings] = await Promise.all([
      prisma.modelRouteConfig.findFirst({ where: { provider }, select: { taskType: true } }),
      getLLMSelectionSettings(),
      getRagEmbeddingSettings(),
      getRagRuntimeSettings(),
    ]);
    if (routeInUse) {
      throw new AppError(`模型路由 ${routeInUse.taskType} 正在使用这个厂商，请先改用其他厂商。`, 400);
    }
    if (selection?.provider === provider) {
      throw new AppError("顶部默认模型正在使用这个厂商，请先切换默认模型。", 400);
    }
    if (ragRuntimeSettings.enabled && ragSettings.embeddingProvider === provider) {
      throw new AppError("知识库正在使用这个向量服务，请先切换向量服务或暂停资料检索。", 400);
    }
  }

  if (requiresApiKey && !effectiveKey) {
    throw new AppError("请先填写 API Key。", 400);
  }
  if (!isBuiltInProvider(provider) && !nextModel) {
    throw new AppError("请先为自定义厂商选择或填写默认模型。", 400);
  }
  if (!isBuiltInProvider(provider) && !nextBaseURL) {
    throw new AppError("请先填写自定义厂商的 API URL。", 400);
  }
  if (!isBuiltInProvider(provider) && nextAuthMode === "x-api-key" && !effectiveKey) {
    throw new AppError("x-api-key 鉴权需要填写 API Key。", 400);
  }
  if (effectiveCurrentModel && nextHiddenModels.includes(effectiveCurrentModel)) {
    throw new AppError("当前使用的模型不能隐藏，请先切换模型。", 400);
  }

  const data = (isBuiltInProvider(provider)
    ? await secretStore.upsertProvider(provider, {
      key: nextKey ?? null,
      model: nextModel ?? null,
      baseURL: nextBaseURL ?? null,
      authMode: nextAuthMode,
      requestProtocol: body.requestProtocol !== undefined ? normalizeModelRequestProtocol(body.requestProtocol) : normalizeModelRequestProtocol(existingRecord?.requestProtocol),
      isActive: body.isActive ?? true,
      reasoningEnabled: nextReasoningEnabled,
      reasoningEffort: nextReasoningEffort,
      hiddenModels: serializeHiddenModels(nextHiddenModels),
      concurrencyLimit: nextConcurrencyLimit,
      requestIntervalMs: nextRequestIntervalMs,
    })
    : await secretStore.updateProvider(provider, {
      displayName: nextDisplayName,
      key: nextKey ?? null,
      model: nextModel ?? null,
      baseURL: nextBaseURL ?? null,
      authMode: nextAuthMode,
      requestProtocol: body.requestProtocol !== undefined ? normalizeModelRequestProtocol(body.requestProtocol) : normalizeModelRequestProtocol(existingRecord?.requestProtocol),
      isActive: body.isActive ?? existingRecord?.isActive ?? true,
      reasoningEnabled: nextReasoningEnabled,
      reasoningEffort: nextReasoningEffort,
      hiddenModels: serializeHiddenModels(nextHiddenModels),
      concurrencyLimit: nextConcurrencyLimit,
      requestIntervalMs: nextRequestIntervalMs,
    })) as APIKeyRecordLike;

  const currentImageModel = body.imageModel !== undefined
    ? await saveProviderImageModel(provider, body.imageModel)
    : await getProviderImageModelMap([provider]).then((map) => map.get(provider) ?? null);
  const imageModels = Array.from(new Set([
    ...getImageModelOptions(provider),
    currentImageModel ?? "",
  ].filter(Boolean)));

  setProviderSecretCache(provider, data.isActive ? {
    displayName: data.displayName ?? undefined,
    key: data.key ?? undefined,
    model: data.model ?? undefined,
    baseURL: data.baseURL ?? undefined,
    authMode: normalizeProviderAuthMode(data.authMode),
    requestProtocol: normalizeModelRequestProtocol(data.requestProtocol),
    reasoningEnabled: data.reasoningEnabled ?? true,
    reasoningEffort: data.reasoningEffort === "low" || data.reasoningEffort === "max" ? data.reasoningEffort : "high",
    concurrencyLimit: data.concurrencyLimit ?? 0,
    requestIntervalMs: data.requestIntervalMs ?? 0,
  } : null);
  evictSharedLimiters(provider);

  const hiddenModels = parseHiddenModels(data.hiddenModels);
  let models = filterHiddenModels(getFallbackModels(provider, data.model ?? undefined), hiddenModels, data.model ?? undefined);
  let message = "厂商配置已保存。";
  try {
    models = filterHiddenModels(
      await refreshProviderModels(
        provider,
        effectiveKey,
        nextBaseURL ?? getProviderEnvBaseUrl(provider),
        nextAuthMode,
      ),
      hiddenModels,
      data.model ?? undefined,
    );
  } catch {
    message = "厂商配置已保存，但模型列表刷新失败。可以稍后在厂商卡片中刷新。";
  }

  return ({
    success: true,
    data: {
      provider: data.provider,
      displayName: data.displayName,
      model: data.model,
      imageModel: currentImageModel ?? null,
      baseURL: data.baseURL,
      authMode: normalizeProviderAuthMode(data.authMode),
      requestProtocol: normalizeModelRequestProtocol(data.requestProtocol),
      isActive: data.isActive,
      reasoningEnabled: data.reasoningEnabled ?? true,
      reasoningEffort: isDeepSeekThinkingModeProvider(provider, data.baseURL ?? undefined, data.model ?? undefined)
        ? normalizeReasoningEffort(data.reasoningEffort)
        : null,
      supportsReasoningEffort: isDeepSeekThinkingModeProvider(provider, data.baseURL ?? undefined, data.model ?? undefined),
      hiddenModels,
      concurrencyLimit: normalizeProviderLimit(data.concurrencyLimit),
      requestIntervalMs: normalizeProviderLimit(data.requestIntervalMs),
      models,
      imageModels,
      supportsImageGeneration: Boolean(currentImageModel),
    },
    message,
  } satisfies ApiResponse<{
    provider: string;
    displayName: string | null;
    model: string | null;
    imageModel: string | null;
    baseURL: string | null;
    authMode: ProviderAuthMode;
    requestProtocol: ModelRouteRequestProtocol;
    isActive: boolean;
    reasoningEnabled: boolean;
    reasoningEffort: ReasoningEffort | null;
    supportsReasoningEffort: boolean;
    hiddenModels: string[];
    concurrencyLimit: number;
    requestIntervalMs: number;
    models: string[];
    imageModels: string[];
    supportsImageGeneration: boolean;
  }>);
}
