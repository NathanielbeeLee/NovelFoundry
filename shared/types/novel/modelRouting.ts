export type ModelRouteTaskType =
  | "planner"
  | "writer"
  | "review"
  | "light_review"
  | "critical_review"
  | "repair"
  | "replan"
  | "state_resolution"
  | "summary"
  | "fact_extraction"
  | "chat";

export interface ModelRouteConfig {
  taskType: ModelRouteTaskType;
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number | null;
  requestProtocol?: ModelRouteRequestProtocol;
  structuredResponseFormat?: ModelRouteStructuredResponseFormat;
}

export const MODEL_ROUTE_REQUEST_PROTOCOLS = [
  "auto",
  "openai_responses",
  "openai_compatible",
  "anthropic",
] as const;

export type ModelRouteRequestProtocol = typeof MODEL_ROUTE_REQUEST_PROTOCOLS[number];

export const MODEL_ROUTE_STRUCTURED_RESPONSE_FORMATS = [
  "auto",
  "json_schema",
  "json_object",
  "prompt_json",
] as const;

export type ModelRouteStructuredResponseFormat = typeof MODEL_ROUTE_STRUCTURED_RESPONSE_FORMATS[number];
