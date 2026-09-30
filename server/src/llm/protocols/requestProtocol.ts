import type { LLMProvider } from "@novelfoundry/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@novelfoundry/shared/types/novel";

export type EffectiveModelRequestProtocol = Exclude<ModelRouteRequestProtocol, "auto">;
export type OpenAIRequestProtocol = Extract<
  EffectiveModelRequestProtocol,
  "openai_responses" | "openai_compatible"
>;

export const DEFAULT_MODEL_REQUEST_PROTOCOL: EffectiveModelRequestProtocol = "openai_compatible";

export function normalizeModelRequestProtocol(value?: string | null): ModelRouteRequestProtocol {
  if (
    value === "openai_responses"
    || value === "openai_compatible"
    || value === "anthropic"
  ) {
    return value;
  }
  return "auto";
}

export function isExplicitModelRequestProtocol(
  value: ModelRouteRequestProtocol,
): value is EffectiveModelRequestProtocol {
  return value !== "auto";
}

export function resolveEffectiveModelRequestProtocol(input: {
  requestProtocol?: string | null;
  providerRequestProtocol?: string | null;
}): EffectiveModelRequestProtocol {
  const requested = normalizeModelRequestProtocol(input.requestProtocol);
  if (isExplicitModelRequestProtocol(requested)) {
    return requested;
  }
  const providerDefault = normalizeModelRequestProtocol(input.providerRequestProtocol);
  return isExplicitModelRequestProtocol(providerDefault)
    ? providerDefault
    : DEFAULT_MODEL_REQUEST_PROTOCOL;
}

export function getAutomaticProtocolCandidates(input: {
  provider: LLMProvider;
  preferred?: EffectiveModelRequestProtocol;
}): EffectiveModelRequestProtocol[] {
  const fallbackOrder: EffectiveModelRequestProtocol[] = input.provider === "anthropic"
    ? ["anthropic", "openai_compatible", "openai_responses"]
    : ["openai_compatible", "openai_responses", "anthropic"];
  return [input.preferred, ...fallbackOrder]
    .filter((value): value is EffectiveModelRequestProtocol => value != null)
    .filter((value, index, values) => values.indexOf(value) === index);
}
