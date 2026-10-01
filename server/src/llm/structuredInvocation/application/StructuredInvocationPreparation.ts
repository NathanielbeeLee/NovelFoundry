import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import { resolveLLMClientOptions, type ResolvedLLMClientOptions } from "../../factory";
import { resolveModel, toStructuredOutputStrategy } from "../../modelRouter";
import { getStructuredFallbackSettings } from "../../structuredFallbackSettings";
import { resolveStructuredOutputProfile, selectStructuredOutputStrategy, type StructuredOutputStrategy } from "../../structuredOutput";
import type { StructuredInvokeInput } from "../../structuredInvoke";
import type { PreparedStructuredInvocation, PreparedStructuredTarget, StructuredAttemptTarget } from "../domain/PreparedInvocation";

export function buildStrategySequence<T>(profile: StructuredAttemptTarget["profile"], schema: ZodType<T>): StructuredOutputStrategy[] {
  const first = selectStructuredOutputStrategy(profile, schema);
  return Array.from(new Set([
    first,
    ...(first === "json_schema" && profile.nativeJsonObject ? ["json_object" as const] : []),
    ...(first !== "prompt_json" ? ["prompt_json" as const] : []),
  ]));
}

export function computeAttemptTemperature(baseTemperature: number, strategyIndex: number): number {
  return strategyIndex === 0 ? baseTemperature : Math.min(baseTemperature, 0.2);
}

export async function resolveAttemptTarget(input: Omit<StructuredInvokeInput<unknown>, "schema" | "label">): Promise<StructuredAttemptTarget> {
  const shouldResolveRoutePreference = Boolean(input.taskType && input.provider == null && input.model == null && input.structuredStrategy == null);
  const route = shouldResolveRoutePreference ? await resolveModel(input.taskType!) : null;
  const resolved = await resolveLLMClientOptions(input.provider, {
    fallbackProvider: "deepseek", apiKey: input.apiKey, baseURL: input.baseURL,
    authMode: input.authMode, reasoningEnabled: input.reasoningEnabled, model: input.model,
    temperature: input.temperature, maxTokens: input.maxTokens, taskType: input.taskType ?? "planner",
    requestProtocol: input.requestProtocol, structuredStrategy: input.structuredStrategy, executionMode: "plain",
  });
  const preferredStrategy = input.structuredStrategy ?? (route && resolved.provider === route.provider && resolved.model === route.model
    ? toStructuredOutputStrategy(route.structuredResponseFormat) : null);
  const maxTokens = typeof input.maxTokensCap === "number" && input.maxTokensCap > 0
    ? Math.min(resolved.maxTokens ?? input.maxTokensCap, input.maxTokensCap) : resolved.maxTokens;
  return {
    provider: resolved.provider, model: resolved.model, apiKey: input.apiKey,
    baseURL: resolved.baseURL, authMode: resolved.authMode, reasoningEnabled: input.reasoningEnabled,
    temperature: resolved.temperature, maxTokens, requestProtocol: resolved.requestProtocol, preferredStrategy,
    resolvedOptions: resolved,
    profile: resolveStructuredOutputProfile({ provider: resolved.provider, model: resolved.model,
      baseURL: resolved.baseURL, executionMode: "structured", requestProtocol: resolved.requestProtocol }),
  };
}

async function prepareTarget<T>(input: StructuredInvokeInput<T>, target: StructuredAttemptTarget): Promise<PreparedStructuredTarget> {
  const sequence = buildStrategySequence(target.profile, input.schema);
  const strategies = target.preferredStrategy
    ? [target.preferredStrategy, ...sequence.filter((strategy) => strategy !== target.preferredStrategy)] : sequence;
  const attempts: PreparedStructuredTarget["attempts"] = [];
  for (const [index, strategy] of strategies.entries()) {
    const attempt: PreparedStructuredTarget["attempts"][number] = { strategy };
    try {
      attempt.resolved = await resolveLLMClientOptions(target.provider, {
        fallbackProvider: "deepseek", apiKey: target.resolvedOptions.apiKey, baseURL: target.baseURL,
        authMode: target.authMode, reasoningEnabled: input.reasoningEnabled,
        model: target.model, temperature: computeAttemptTemperature(target.temperature, index),
        maxTokens: target.maxTokens, timeoutMs: input.timeoutMs, taskType: input.taskType ?? "planner",
        promptMeta: input.promptMeta, executionMode: "structured", structuredStrategy: strategy,
        requestProtocol: target.requestProtocol,
      });
      if ((input.maxRepairAttempts ?? 1) > 0) {
        try {
          attempt.repairResolved = await resolveLLMClientOptions(target.provider, {
            apiKey: attempt.resolved.apiKey, baseURL: attempt.resolved.baseURL, authMode: attempt.resolved.authMode,
            reasoningEnabled: input.reasoningEnabled, model: target.model, temperature: 0.15,
            maxTokens: attempt.resolved.maxTokens, timeoutMs: input.timeoutMs, taskType: input.taskType ?? "planner",
            requestProtocol: target.requestProtocol, executionMode: "structured", structuredStrategy: "prompt_json",
          });
        } catch (error) { attempt.repairPreparationError = error; }
      }
    } catch (error) { attempt.preparationError = error; }
    attempts.push(attempt);
  }
  return { target, attempts };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clientIdentity(options: ResolvedLLMClientOptions | undefined): unknown {
  if (!options) return null;
  return {
    provider: options.provider, model: options.model, temperature: options.temperature,
    endpointDigest: digest(options.baseURL), credentialDigest: digest(options.apiKey ?? null), authMode: options.authMode,
    maxTokens: options.maxTokens ?? null, maxRetries: options.maxRetries ?? null, timeoutMs: options.timeoutMs ?? null,
    reasoningEnabled: options.reasoningEnabled, reasoningEffort: options.reasoningEffort,
    modelKwargs: options.modelKwargs ?? null, includeRawResponse: options.includeRawResponse,
    requestProtocol: options.requestProtocol, executionMode: options.executionMode,
    structuredProfile: options.structuredProfile, structuredStrategy: options.structuredStrategy,
  };
}

function targetIdentity(target: PreparedStructuredTarget | null): unknown {
  return target?.attempts.map((attempt) => ({
    strategy: attempt.strategy, resolved: clientIdentity(attempt.resolved), repair: clientIdentity(attempt.repairResolved),
    preparationFailed: Boolean(attempt.preparationError), repairPreparationFailed: Boolean(attempt.repairPreparationError),
  })) ?? null;
}

export async function prepareStructuredLlmInvocation<T>(input: StructuredInvokeInput<T>): Promise<PreparedStructuredInvocation> {
  const primaryTarget = await resolveAttemptTarget({ ...input, temperature: input.temperature ?? 0.3 });
  const settings = input.disableFallbackModel ? null : await getStructuredFallbackSettings();
  const fallbackEnabled = Boolean(settings?.enabled && settings.model.trim()
    && !(settings.provider === primaryTarget.provider && settings.model === primaryTarget.model));
  const primary = await prepareTarget(input, primaryTarget);
  let fallback: PreparedStructuredTarget | null = null;
  let fallbackPreparationError: unknown;
  if (fallbackEnabled && settings) {
    try {
      const target = await resolveAttemptTarget({ provider: settings.provider, model: settings.model,
        temperature: settings.temperature, maxTokens: settings.maxTokens ?? undefined,
        maxTokensCap: input.maxTokensCap, taskType: input.taskType ?? "planner" });
      fallback = await prepareTarget(input, target);
    } catch (error) { fallbackPreparationError = error; }
  }
  const cacheable = !fallbackPreparationError && [...primary.attempts, ...(fallback?.attempts ?? [])]
    .every((attempt) => !attempt.preparationError && !attempt.repairPreparationError);
  return {
    primary, fallback, fallbackEnabled, fallbackPreparationError, cacheable,
    identityDigest: digest({ version: 1, primary: targetIdentity(primary), fallback: targetIdentity(fallback),
      fallbackEnabled, fallbackSettings: settings, fallbackPreparationFailed: Boolean(fallbackPreparationError) }),
  };
}
