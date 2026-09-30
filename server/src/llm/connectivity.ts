import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { LLMProvider, ProviderAuthMode } from "@novelfoundry/shared/types/llm";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
  ModelRouteTaskType,
} from "@novelfoundry/shared/types/novel";
import { getLLM, resolveLLMClientOptions } from "./factory";
import {
  getAutomaticProtocolCandidates,
  isExplicitModelRequestProtocol,
  normalizeModelRequestProtocol,
  type EffectiveModelRequestProtocol,
} from "./protocols";
import {
  MODEL_ROUTE_TASK_TYPES,
  resolveModel,
  toStructuredOutputStrategy,
  upsertModelRouteConfig,
} from "./modelRouter";
import { invokeStructuredLlmDetailed, summarizeStructuredOutputFailure } from "./structuredInvoke";
import {
  resolveStructuredOutputProfile,
  selectStructuredOutputStrategy,
  type StructuredOutputStrategy,
} from "./structuredOutput";

export type ConnectivityProbeMode = "plain" | "structured" | "both";

const STRUCTURED_PROBE_SCHEMA = z.object({
  status: z.literal("ok"),
});

export interface ConnectivityProbeStatus {
  ok: boolean;
  latency: number | null;
  error: string | null;
  requestProtocol: ModelRouteRequestProtocol | null;
}

export interface StructuredConnectivityProbeStatus extends ConnectivityProbeStatus {
  strategy: string | null;
  reasoningForcedOff: boolean;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
  errorCategory: string | null;
  nativeJsonObject: boolean;
  nativeJsonSchema: boolean;
  profileFamily: string | null;
}

export interface LLMConnectivityStatus extends ConnectivityProbeStatus {
  provider: LLMProvider;
  model: string;
  plain: ConnectivityProbeStatus | null;
  structured: StructuredConnectivityProbeStatus | null;
}

export interface ModelRouteConnectivityStatus extends LLMConnectivityStatus {
  taskType: ModelRouteTaskType;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "连接测试失败。";
}

async function getProtocolCandidates(input: {
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  preferred?: ModelRouteRequestProtocol;
}): Promise<EffectiveModelRequestProtocol[]> {
  const preferred = normalizeModelRequestProtocol(input.preferred);
  if (isExplicitModelRequestProtocol(preferred)) {
    return [preferred];
  }
  try {
    const resolved = await resolveLLMClientOptions(input.provider, {
      model: input.model,
      apiKey: input.apiKey,
      authMode: input.authMode,
      baseURL: input.baseURL,
      requestProtocol: "auto",
    });
    return getAutomaticProtocolCandidates({
      provider: resolved.provider,
      preferred: resolved.requestProtocol,
    });
  } catch {
    return getAutomaticProtocolCandidates({ provider: input.provider });
  }
}

function getStructuredFormatCandidates(input: {
  provider: LLMProvider;
  model?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  requestProtocol: ModelRouteRequestProtocol;
  preferred?: ModelRouteStructuredResponseFormat;
}): ModelRouteStructuredResponseFormat[] {
  if (input.requestProtocol === "anthropic") {
    return ["prompt_json"];
  }
  const profile = resolveStructuredOutputProfile({
    provider: input.provider,
    model: input.model,
    baseURL: input.baseURL,
    requestProtocol: input.requestProtocol,
    executionMode: "structured",
  });
  const profileFirst = selectStructuredOutputStrategy(profile, STRUCTURED_PROBE_SCHEMA);
  const fallbackOrder: StructuredOutputStrategy[] = profileFirst === "json_schema"
    ? ["json_schema", "json_object", "prompt_json"]
    : profileFirst === "json_object"
      ? ["json_object", "prompt_json", "json_schema"]
      : ["prompt_json", "json_object", "json_schema"];
  const preferred = input.preferred;
  if (preferred === "json_schema" || preferred === "json_object" || preferred === "prompt_json") {
    return [preferred, ...fallbackOrder].filter((value, index, array) => array.indexOf(value) === index);
  }
  return fallbackOrder;
}

async function testPlainConnection(input: {
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  requestProtocol?: ModelRouteRequestProtocol;
}): Promise<LLMConnectivityStatus> {
  try {
    const resolved = await resolveLLMClientOptions(input.provider, {
      apiKey: input.apiKey,
      authMode: input.authMode,
      baseURL: input.baseURL,
      model: input.model,
      temperature: 0.1,
      maxTokens: 16,
      requestProtocol: input.requestProtocol,
    });
    const llm = await getLLM(input.provider, {
      apiKey: input.apiKey,
      authMode: input.authMode,
      baseURL: input.baseURL,
      model: resolved.model,
      temperature: 0.1,
      maxTokens: 16,
      requestProtocol: resolved.requestProtocol,
    });
    const start = Date.now();
    await llm.invoke([new HumanMessage("请只回复 ok")]);
    const plain = {
      ok: true,
      latency: Date.now() - start,
      error: null,
      requestProtocol: resolved.requestProtocol,
    };
    return {
      provider: resolved.provider,
      model: resolved.model,
      ok: plain.ok,
      latency: plain.latency,
      error: plain.error,
      requestProtocol: plain.requestProtocol,
      plain,
      structured: null,
    };
  } catch (error) {
    const plain = {
      ok: false,
      latency: null,
      error: toErrorMessage(error),
      requestProtocol: input.requestProtocol ?? null,
    };
    return {
      provider: input.provider,
      model: input.model?.trim() || "",
      ok: plain.ok,
      latency: plain.latency,
      error: plain.error,
      requestProtocol: plain.requestProtocol,
      plain,
      structured: null,
    };
  }
}

async function testStructuredConnection(input: {
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  requestProtocol?: ModelRouteRequestProtocol;
  structuredResponseFormat?: ModelRouteStructuredResponseFormat;
}): Promise<LLMConnectivityStatus> {
  let resolved: Awaited<ReturnType<typeof resolveLLMClientOptions>> | null = null;
  try {
    resolved = await resolveLLMClientOptions(input.provider, {
      apiKey: input.apiKey,
      authMode: input.authMode,
      baseURL: input.baseURL,
      model: input.model,
      temperature: 0.2,
      maxTokens: 256,
      requestProtocol: input.requestProtocol,
      structuredStrategy: toStructuredOutputStrategy(input.structuredResponseFormat ?? "auto") ?? undefined,
      executionMode: "plain",
    });
    const startedAt = Date.now();
    const result = await invokeStructuredLlmDetailed({
      provider: resolved.provider,
      model: resolved.model,
      apiKey: input.apiKey,
      authMode: input.authMode,
      baseURL: input.baseURL ?? resolved.baseURL,
      temperature: 0.2,
      maxTokens: 256,
      taskType: "planner",
      requestProtocol: resolved.requestProtocol,
      structuredStrategy: toStructuredOutputStrategy(input.structuredResponseFormat ?? "auto") ?? undefined,
      label: "llm.connectivity.structured_probe",
      schema: STRUCTURED_PROBE_SCHEMA,
      messages: [
        new SystemMessage("你正在执行结构化输出兼容性探针。必须只输出合法 JSON。"),
        new HumanMessage("请输出一个 JSON 对象，字段 status 的值必须是 ok。"),
      ],
      maxRepairAttempts: 1,
      disableFallbackModel: true,
    });
    const structured: StructuredConnectivityProbeStatus = {
      ok: true,
      latency: Date.now() - startedAt,
      error: null,
      requestProtocol: resolved.requestProtocol,
      strategy: result.diagnostics.strategy,
      reasoningForcedOff: result.diagnostics.reasoningForcedOff,
      fallbackAvailable: result.diagnostics.fallbackAvailable,
      fallbackUsed: result.diagnostics.fallbackUsed,
      errorCategory: null,
      nativeJsonObject: result.diagnostics.profile.nativeJsonObject,
      nativeJsonSchema: result.diagnostics.profile.nativeJsonSchema,
      profileFamily: result.diagnostics.profile.family,
    };
    return {
      provider: resolved.provider,
      model: resolved.model,
      ok: structured.ok,
      latency: structured.latency,
      error: structured.error,
      requestProtocol: structured.requestProtocol,
      plain: null,
      structured,
    };
  } catch (error) {
    const summary = summarizeStructuredOutputFailure({
      error,
      fallbackAvailable: false,
    });
    const structured: StructuredConnectivityProbeStatus = {
      ok: false,
      latency: null,
      error: toErrorMessage(error),
      requestProtocol: input.requestProtocol ?? resolved?.requestProtocol ?? null,
      strategy: null,
      reasoningForcedOff: false,
      fallbackAvailable: false,
      fallbackUsed: false,
      errorCategory: summary.category,
      nativeJsonObject: false,
      nativeJsonSchema: false,
      profileFamily: null,
    };
    return {
      provider: resolved?.provider ?? input.provider,
      model: resolved?.model ?? input.model?.trim() ?? "",
      ok: structured.ok,
      latency: structured.latency,
      error: structured.error,
      requestProtocol: structured.requestProtocol,
      plain: null,
      structured,
    };
  }
}

async function mergeProbeStatuses(input: {
  provider: LLMProvider;
  model?: string;
  plain: LLMConnectivityStatus | null;
  structured: LLMConnectivityStatus | null;
}): Promise<LLMConnectivityStatus> {
  const provider = input.plain?.provider ?? input.structured?.provider ?? input.provider;
  const model = input.plain?.model ?? input.structured?.model ?? input.model?.trim() ?? "";
  const top = input.plain?.plain ?? input.structured?.structured ?? {
    ok: false,
    latency: null,
    error: "连接测试失败。",
    requestProtocol: null,
  };
  return {
    provider,
    model,
    ok: top.ok,
    latency: top.latency,
    error: top.error,
    requestProtocol: top.requestProtocol,
    plain: input.plain?.plain ?? null,
    structured: input.structured?.structured ?? null,
  };
}

async function testConnection(input: {
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  authMode?: ProviderAuthMode;
  probeMode?: ConnectivityProbeMode;
  requestProtocol?: ModelRouteRequestProtocol;
  structuredResponseFormat?: ModelRouteStructuredResponseFormat;
}): Promise<LLMConnectivityStatus> {
  const probeMode = input.probeMode ?? "both";
  const protocolCandidates = await getProtocolCandidates({
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    authMode: input.authMode,
    baseURL: input.baseURL,
    preferred: input.requestProtocol,
  });
  let bestResult: {
    plain: LLMConnectivityStatus | null;
    structured: LLMConnectivityStatus | null;
    successCount: number;
  } | null = null;
  const requiredSuccessCount = probeMode === "both" ? 2 : 1;

  for (const requestProtocol of protocolCandidates) {
    const plain = probeMode === "plain" || probeMode === "both"
      ? await testPlainConnection({ ...input, requestProtocol })
      : null;
    let structured: LLMConnectivityStatus | null = null;
    if (probeMode === "structured" || probeMode === "both") {
      for (const structuredResponseFormat of getStructuredFormatCandidates({
        provider: input.provider,
        model: input.model,
        baseURL: input.baseURL,
        requestProtocol,
        preferred: input.structuredResponseFormat,
      })) {
        structured = await testStructuredConnection({ ...input, requestProtocol, structuredResponseFormat });
        if (structured.ok) {
          break;
        }
      }
    }

    const successCount = Number(plain?.ok === true) + Number(structured?.ok === true);
    if (!bestResult || successCount > bestResult.successCount) {
      bestResult = { plain, structured, successCount };
    }
    if (successCount === requiredSuccessCount) {
      break;
    }
  }

  return mergeProbeStatuses({
    provider: input.provider,
    model: input.model,
    plain: bestResult?.plain ?? null,
    structured: bestResult?.structured ?? null,
  });
}

async function testModelRoutes(taskTypes: readonly ModelRouteTaskType[] = MODEL_ROUTE_TASK_TYPES): Promise<{
  testedAt: string;
  statuses: ModelRouteConnectivityStatus[];
}> {
  const resolvedRoutes = await Promise.all(taskTypes.map(async (taskType) => ({
    taskType,
    ...(await resolveModel(taskType)),
  })));

  const dedupedChecks = new Map<string, Promise<LLMConnectivityStatus>>();
  for (const route of resolvedRoutes) {
    const key = [
      route.provider,
      route.model,
      route.requestProtocol,
      route.structuredResponseFormat,
    ].join("::");
    if (!dedupedChecks.has(key)) {
      dedupedChecks.set(key, testConnection({
        provider: route.provider,
        model: route.model,
        requestProtocol: route.requestProtocol,
        structuredResponseFormat: route.structuredResponseFormat,
        probeMode: "both",
      }));
    }
  }

  const statuses = await Promise.all(resolvedRoutes.map(async (route) => {
    const key = [
      route.provider,
      route.model,
      route.requestProtocol,
      route.structuredResponseFormat,
    ].join("::");
    const result = await dedupedChecks.get(key)!;
    const effectiveProtocol = result.structured?.requestProtocol ?? result.plain?.requestProtocol ?? route.requestProtocol;
    const effectiveFormat = (
      result.structured?.strategy === "json_schema"
      || result.structured?.strategy === "json_object"
      || result.structured?.strategy === "prompt_json"
    )
      ? result.structured.strategy
      : route.structuredResponseFormat;
    const shouldPersistProbeResult = result.structured?.ok === true
      && (effectiveProtocol !== route.requestProtocol || effectiveFormat !== route.structuredResponseFormat);
    if (shouldPersistProbeResult) {
      await upsertModelRouteConfig(route.taskType, {
        provider: route.provider,
        model: route.model,
        temperature: route.temperature,
        maxTokens: route.maxTokens,
        requestProtocol: effectiveProtocol,
        structuredResponseFormat: effectiveFormat,
      });
    }
    return {
      taskType: route.taskType,
      provider: route.provider,
      model: route.model,
      ok: result.ok,
      latency: result.latency,
      error: result.error,
      requestProtocol: result.requestProtocol,
      plain: result.plain,
      structured: result.structured,
    };
  }));

  return {
    testedAt: new Date().toISOString(),
    statuses,
  };
}

export const llmConnectivityService = {
  testConnection,
  testModelRoutes,
};
