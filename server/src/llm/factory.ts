import type { LLMProvider, ProviderAuthMode, ReasoningEffort } from "@novelfoundry/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@novelfoundry/shared/types/novel";
import type { ChatOpenAI } from "@langchain/openai";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import { secretStore } from "../services/settings/secretStore";
import { resolveModelTemperature } from "./capabilities";
import { createAnthropicLLM } from "./anthropicClient";
import { attachLLMDebugLogging } from "./debugLogging";
import { attachLLMRequestLimiter } from "./requestLimiter";
import { attachLLMRequestGuard } from "./requestGuard";
import { resolveProviderReasoningBehavior } from "./reasoning";
import {
  createOpenAIProtocolClient,
  normalizeModelRequestProtocol,
  resolveEffectiveModelRequestProtocol,
  type EffectiveModelRequestProtocol,
} from "./protocols";
import {
  resolveStructuredOutputProfile,
  type StructuredExecutionMode,
  type StructuredOutputProfile,
  type StructuredOutputStrategy,
} from "./structuredOutput";
import { attachLLMUsageTracking } from "./usageTracking";
import { resolveModel, toStructuredOutputStrategy, type TaskType } from "./modelRouter";
import {
  getProviderEnvApiKey,
  getProviderEnvModel,
  isBuiltInProvider,
  providerRequiresApiKey,
  PROVIDERS,
  resolveProviderBaseUrl,
} from "./providers";

interface LLMOptions {
  model?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  maxTokens?: number;
  maxRetries?: number;
  timeoutMs?: number;
  reasoningEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  executionMode?: StructuredExecutionMode;
  structuredStrategy?: StructuredOutputStrategy;
  requestProtocol?: ModelRouteRequestProtocol;
  modelKwargs?: Record<string, unknown>;
  fallbackProvider?: LLMProvider;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
  modelRoute?: string;
  routeDegraded?: boolean;
}

export interface ProviderSecret {
  key?: string;
  model?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  requestProtocol?: ModelRouteRequestProtocol;
  displayName?: string;
  reasoningEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
}

export interface ResolvedLLMClientOptions {
  provider: LLMProvider;
  providerName: string;
  model: string;
  temperature: number;
  apiKey?: string;
  baseURL: string;
  authMode: ProviderAuthMode;
  maxTokens?: number;
  maxRetries?: number;
  timeoutMs?: number;
  concurrencyLimit: number;
  requestIntervalMs: number;
  reasoningEnabled: boolean;
  reasoningEffort: ReasoningEffort | null;
  modelKwargs?: Record<string, unknown>;
  includeRawResponse: boolean;
  requestProtocol: EffectiveModelRequestProtocol;
  executionMode: StructuredExecutionMode;
  structuredProfile?: StructuredOutputProfile | null;
  structuredStrategy?: StructuredOutputStrategy | null;
  reasoningForcedOff: boolean;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
  modelRoute?: string;
  routeDegraded?: boolean;
}

const providerSecrets = new Map<LLMProvider, ProviderSecret>();
const RESOLVED_LLM_OPTIONS = Symbol("RESOLVED_LLM_OPTIONS");

type ChatOpenAIWithResolvedOptions = ChatOpenAI & {
  [RESOLVED_LLM_OPTIONS]?: ResolvedLLMClientOptions;
};

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalTimeoutMs(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeProviderAuthMode(value: unknown): ProviderAuthMode {
  return value === "x-api-key" || value === "none" ? value : "bearer";
}

function normalizeProviderSecret(secret: ProviderSecret): ProviderSecret {
  return {
    key: normalizeOptionalText(secret.key),
    model: normalizeOptionalText(secret.model),
    baseURL: normalizeOptionalText(secret.baseURL),
    requestProtocol: normalizeModelRequestProtocol(secret.requestProtocol),
    authMode: normalizeProviderAuthMode(secret.authMode),
    reasoningEffort: secret.reasoningEffort,
    displayName: normalizeOptionalText(secret.displayName),
    reasoningEnabled: secret.reasoningEnabled ?? true,
    concurrencyLimit: normalizeLimitValue(secret.concurrencyLimit),
    requestIntervalMs: normalizeLimitValue(secret.requestIntervalMs),
  };
}

function normalizeLimitValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function toProviderSecret(item: {
  key?: string | null;
  model?: string | null;
  baseURL?: string | null;
  authMode?: string | null;
  reasoningEffort?: string | null;
  requestProtocol?: string | null;
  displayName?: string | null;
  reasoningEnabled?: boolean | null;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
}): ProviderSecret {
  return normalizeProviderSecret({
    key: item.key ?? undefined,
    model: item.model ?? undefined,
    baseURL: item.baseURL ?? undefined,
    requestProtocol: normalizeModelRequestProtocol(item.requestProtocol),
    authMode: normalizeProviderAuthMode(item.authMode),
    reasoningEffort: item.reasoningEffort === "low" || item.reasoningEffort === "high" || item.reasoningEffort === "max" ? item.reasoningEffort : undefined,
    displayName: item.displayName ?? undefined,
    reasoningEnabled: item.reasoningEnabled ?? undefined,
    concurrencyLimit: normalizeLimitValue(item.concurrencyLimit),
    requestIntervalMs: normalizeLimitValue(item.requestIntervalMs),
  });
}

export async function loadProviderApiKeys(): Promise<void> {
  try {
    const keys = await secretStore.listProviders({ onlyActive: true });
    providerSecrets.clear();
    for (const item of keys) {
      providerSecrets.set(item.provider as LLMProvider, toProviderSecret(item));
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      return;
    }
    throw error;
  }
}

export function setProviderSecretCache(provider: LLMProvider, secret: ProviderSecret | null): void {
  if (!secret) {
    providerSecrets.delete(provider);
    return;
  }
  providerSecrets.set(provider, normalizeProviderSecret(secret));
}

async function resolveProviderSecret(provider: LLMProvider): Promise<ProviderSecret | undefined> {
  const cached = providerSecrets.get(provider);
  if (cached) {
    return cached;
  }
  try {
    const secret = await secretStore.getProvider(provider);
    if (!secret || !secret.isActive) {
      return undefined;
    }
    const value = toProviderSecret(secret);
    providerSecrets.set(provider, value);
    return value;
  } catch (error) {
    if (isMissingTableError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function resolveLLMClientOptions(
  provider?: LLMProvider,
  rawOptions: LLMOptions = {},
): Promise<ResolvedLLMClientOptions> {
  const options: LLMOptions = { ...rawOptions };
  let resolvedProvider = provider ?? options.fallbackProvider ?? "deepseek";
  let resolvedModel = normalizeOptionalText(options.model);
  let resolvedTemperature: number | undefined = options.temperature;
  let resolvedMaxTokens: number | undefined = options.maxTokens;
  let resolvedModelRoute: string | undefined;
  let resolvedRouteDegraded = false;

  if (options.taskType) {
    const hasExplicitProvider = provider != null;
    const hasExplicitModel = options.model != null;
    const shouldUseRouteProvider = !hasExplicitProvider && !hasExplicitModel;
    const route = await resolveModel(options.taskType, {
      ...(shouldUseRouteProvider ? {} : { provider: resolvedProvider }),
      ...(options.model != null ? { model: options.model } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.maxTokens != null ? { maxTokens: options.maxTokens } : {}),
    });
    if (shouldUseRouteProvider) {
      resolvedProvider = route.provider;
    }
    if (options.model == null && shouldUseRouteProvider) {
      resolvedModel = normalizeOptionalText(route.model);
    }
    if (options.temperature == null) {
      resolvedTemperature = route.temperature;
    }
    if (options.maxTokens == null) {
      resolvedMaxTokens = route.maxTokens;
    }
    if (options.requestProtocol == null) {
      options.requestProtocol = route.requestProtocol;
    }
    if (options.structuredStrategy == null) {
      const routeStructuredStrategy = toStructuredOutputStrategy(route.structuredResponseFormat);
      if (routeStructuredStrategy) {
        options.structuredStrategy = routeStructuredStrategy;
      }
    }
    resolvedModelRoute = route.routeKey;
    resolvedRouteDegraded = route.routeDegraded;
  }

  const dbSecret = await resolveProviderSecret(resolvedProvider);
  const providerName = isBuiltInProvider(resolvedProvider)
    ? PROVIDERS[resolvedProvider].name
    : dbSecret?.displayName ?? resolvedProvider;
  const apiKey = normalizeOptionalText(options.apiKey)
    ?? dbSecret?.key
    ?? getProviderEnvApiKey(resolvedProvider);

  if (!apiKey && providerRequiresApiKey(resolvedProvider)) {
    throw new Error(`未配置 ${providerName} 的 API Key。`);
  }

  const model = resolvedModel
    ?? dbSecret?.model
    ?? getProviderEnvModel(resolvedProvider)
    ?? (isBuiltInProvider(resolvedProvider) ? PROVIDERS[resolvedProvider].defaultModel : undefined);
  if (!model) {
    throw new Error(`未配置 ${providerName} 的默认模型。`);
  }

  const baseURL = resolveProviderBaseUrl(
    resolvedProvider,
    options.baseURL ?? dbSecret?.baseURL,
    dbSecret?.baseURL,
  );
  if (!baseURL) {
    throw new Error(`未配置 ${providerName} 的 API URL。`);
  }

  const authMode = normalizeProviderAuthMode(options.authMode ?? dbSecret?.authMode);
  if (authMode === "x-api-key" && !apiKey) {
    throw new Error("x-api-key 鉴权需要填写 API Key。");
  }

  const temperature = resolveModelTemperature(resolvedProvider, model, resolvedTemperature);
  const timeoutMs = normalizeOptionalTimeoutMs(options.timeoutMs);
  const concurrencyLimit = normalizeLimitValue(dbSecret?.concurrencyLimit);
  const requestIntervalMs = normalizeLimitValue(dbSecret?.requestIntervalMs);
  const requestProtocol = resolveEffectiveModelRequestProtocol({
    requestProtocol: normalizeModelRequestProtocol(options.requestProtocol),
    providerRequestProtocol: dbSecret?.requestProtocol,
  });
  const structuredStrategy = options.structuredStrategy;
  const executionMode = options.executionMode ?? "plain";
  const structuredProfile = executionMode === "structured"
    ? resolveStructuredOutputProfile({
      provider: resolvedProvider,
      model,
      baseURL,
      executionMode,
      requestProtocol,
    })
    : null;
  const usesNativeStructured = structuredStrategy != null && structuredStrategy !== "prompt_json";
  const requestedReasoningEnabled = options.reasoningEnabled ?? dbSecret?.reasoningEnabled ?? true;
  const shouldForceDisableReasoning = Boolean(
    structuredProfile
      && structuredProfile.requiresNonThinkingForStructured
      && structuredProfile.supportsReasoningToggle,
  );
  const reasoningEnabled = shouldForceDisableReasoning ? false : requestedReasoningEnabled;
  let effectiveMaxTokens = resolvedMaxTokens;
  if (structuredProfile && usesNativeStructured && structuredProfile.omitMaxTokensForNativeStructured) {
    effectiveMaxTokens = undefined;
  } else if (
    structuredProfile
    && typeof structuredProfile.safeStructuredMaxTokens === "number"
    && typeof effectiveMaxTokens === "number"
  ) {
    effectiveMaxTokens = Math.min(effectiveMaxTokens, structuredProfile.safeStructuredMaxTokens);
  }
  const usesEnableThinkingFlag = Boolean(
    shouldForceDisableReasoning
      && structuredProfile?.family.includes("qwen"),
  );
  const baseModelKwargs: Record<string, unknown> = {
    ...(options.modelKwargs ?? {}),
    ...(usesEnableThinkingFlag ? { enable_thinking: false } : {}),
  };
  const reasoningBehavior = resolveProviderReasoningBehavior({
    provider: resolvedProvider,
    baseURL,
    model,
    reasoningEnabled,
    reasoningEffort: options.reasoningEffort ?? dbSecret?.reasoningEffort ?? "high",
  });
  const modelKwargs = {
    ...(reasoningBehavior.modelKwargs ?? {}),
    ...baseModelKwargs,
  };

  return {
    provider: resolvedProvider,
    providerName,
    model,
    temperature,
    apiKey,
    baseURL,
    authMode,
    maxTokens: effectiveMaxTokens,
    maxRetries: options.maxRetries,
    timeoutMs,
    concurrencyLimit,
    requestIntervalMs,
    reasoningEnabled: reasoningBehavior.reasoningEnabled,
    reasoningEffort: reasoningBehavior.reasoningEffort,
    modelKwargs: Object.keys(modelKwargs).length > 0 ? modelKwargs : undefined,
    includeRawResponse: reasoningBehavior.includeRawResponse,
    requestProtocol,
    executionMode,
    structuredProfile,
    structuredStrategy: structuredStrategy ?? null,
    reasoningForcedOff: shouldForceDisableReasoning && requestedReasoningEnabled,
    taskType: options.taskType,
    promptMeta: options.promptMeta,
    modelRoute: resolvedModelRoute,
    routeDegraded: resolvedRouteDegraded,
  };
}

export function buildOpenAICompatibleDefaultHeaders(authMode: ProviderAuthMode, apiKey?: string): Record<string, string | null> | undefined {
  if (authMode === "bearer") return undefined;
  return { Authorization: null, ...(authMode === "x-api-key" && apiKey ? { "x-api-key": apiKey } : {}) };
}

// LangChain normalizes defaultHeaders and drops null values, so authentication
// removal must also happen at the final fetch boundary for anonymous gateways.
export function buildOpenAICompatibleFetch(authMode: ProviderAuthMode, apiKey?: string): typeof fetch | undefined {
  if (authMode === "bearer") return undefined;
  return async (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.delete("authorization");
    headers.delete("x-api-key");
    if (authMode === "x-api-key" && apiKey) headers.set("x-api-key", apiKey);
    return globalThis.fetch(input, { ...init, headers });
  };
}

export function createLLMFromResolvedOptions(resolved: ResolvedLLMClientOptions): ChatOpenAI {
  const llm = resolved.requestProtocol === "anthropic"
    ? createAnthropicLLM({
      apiKey: resolved.apiKey,
      authMode: isBuiltInProvider(resolved.provider) ? "x-api-key" : resolved.authMode,
      model: resolved.model,
      baseURL: resolved.baseURL,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      timeoutMs: resolved.timeoutMs,
    }) as ChatOpenAI
    : createOpenAIProtocolClient({
      apiKey: resolved.apiKey ?? "ollama",
      model: resolved.model,
      modelName: resolved.model,
      temperature: resolved.temperature,
      maxTokens: resolved.maxTokens,
      timeout: resolved.timeoutMs,
      maxRetries: resolved.maxRetries,
      modelKwargs: resolved.modelKwargs,
      __includeRawResponse: resolved.includeRawResponse,
      configuration: {
        baseURL: resolved.baseURL,
        defaultHeaders: buildOpenAICompatibleDefaultHeaders(resolved.authMode, resolved.apiKey),
        fetch: buildOpenAICompatibleFetch(resolved.authMode, resolved.apiKey),
      },
    }, resolved.requestProtocol);
  const meta = {
    provider: resolved.provider,
    model: resolved.model,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    timeoutMs: resolved.timeoutMs,
    taskType: resolved.taskType,
    modelRoute: resolved.modelRoute,
    routeDegraded: resolved.routeDegraded,
    requestProtocol: resolved.requestProtocol,
    baseURL: resolved.baseURL,
    promptMeta: resolved.promptMeta,
  };
  const decorated = attachLLMDebugLogging(attachLLMUsageTracking(attachLLMRequestGuard(llm, meta), meta), meta);
  const limited = attachLLMRequestLimiter(decorated, {
    provider: resolved.provider,
    model: resolved.model,
    concurrencyLimit: resolved.concurrencyLimit,
    requestIntervalMs: resolved.requestIntervalMs,
  });
  (limited as ChatOpenAIWithResolvedOptions)[RESOLVED_LLM_OPTIONS] = resolved;
  return limited;
}

export async function getLLM(provider?: LLMProvider, options: LLMOptions = {}): Promise<ChatOpenAI> {
  const resolved = await resolveLLMClientOptions(provider, options);
  return createLLMFromResolvedOptions(resolved);
}

export function getResolvedLLMClientOptionsFromInstance(llm: ChatOpenAI): ResolvedLLMClientOptions | undefined {
  return (llm as ChatOpenAIWithResolvedOptions)[RESOLVED_LLM_OPTIONS];
}
