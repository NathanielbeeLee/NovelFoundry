import type { ModelRouteRequestProtocol } from "@novelfoundry/shared/types/novel";

export const REQUEST_PROTOCOL_OPTIONS: ReadonlyArray<{
  value: ModelRouteRequestProtocol;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "自动",
    description: "路由会继承厂商设置；厂商未指定时优先使用 Chat Completions。",
  },
  {
    value: "openai_responses",
    label: "Responses API",
    description: "固定调用 /v1/responses，适合 OpenAI 新接口或支持该接口的本地网关。",
  },
  {
    value: "openai_compatible",
    label: "Chat Completions（OpenAI 兼容）",
    description: "固定调用 /v1/chat/completions，兼容 Qwen、Kimi、DeepSeek、Ollama 等常见网关。",
  },
  {
    value: "anthropic",
    label: "Anthropic Messages",
    description: "固定使用 Anthropic Messages 协议。",
  },
];

export function getRequestProtocolLabel(value?: ModelRouteRequestProtocol | null): string {
  return REQUEST_PROTOCOL_OPTIONS.find((option) => option.value === value)?.label ?? "自动";
}

export function getRequestProtocolDescription(value?: ModelRouteRequestProtocol | null): string {
  return REQUEST_PROTOCOL_OPTIONS.find((option) => option.value === value)?.description
    ?? REQUEST_PROTOCOL_OPTIONS[0].description;
}

interface ProtocolProbeStatus {
  ok: boolean;
  requestProtocol: ModelRouteRequestProtocol | null;
}

export function getSharedSuccessfulRequestProtocol(input: {
  plain?: ProtocolProbeStatus | null;
  structured?: ProtocolProbeStatus | null;
}): Exclude<ModelRouteRequestProtocol, "auto"> | null {
  if (!input.plain?.ok || !input.structured?.ok) {
    return null;
  }
  const plainProtocol = input.plain.requestProtocol;
  const structuredProtocol = input.structured.requestProtocol;
  if (
    !plainProtocol
    || plainProtocol === "auto"
    || plainProtocol !== structuredProtocol
  ) {
    return null;
  }
  return plainProtocol;
}
