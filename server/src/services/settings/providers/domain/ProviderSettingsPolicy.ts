import { z } from "zod";
import { MODEL_ROUTE_REQUEST_PROTOCOLS } from "@novelfoundry/shared/types/novel";
import { PROVIDER_AUTH_MODES, REASONING_EFFORTS } from "@novelfoundry/shared/types/llm";
import { llmProviderSchema } from "../../../../llm/providerSchema";

const MAX_PROVIDER_CONCURRENCY_LIMIT = 100;
const MAX_PROVIDER_REQUEST_INTERVAL_MS = 3_600_000;

export const providerSchema = z.object({
  provider: llmProviderSchema,
});

export const upsertApiKeySchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  key: z.string().trim().optional(),
  model: z.string().trim().optional(),
  imageModel: z.string().trim().optional(),
  baseURL: z.union([z.string().trim().url("API URL 格式不正确。"), z.literal("")]).optional(),
  authMode: z.enum(PROVIDER_AUTH_MODES).optional(),
  requestProtocol: z.enum(MODEL_ROUTE_REQUEST_PROTOCOLS).optional(),
  isActive: z.boolean().optional(),
  reasoningEnabled: z.boolean().optional(),
  reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
  hiddenModels: z.array(z.string().trim().min(1).max(240)).max(200).optional(),
  concurrencyLimit: z.coerce.number().int().min(0).max(MAX_PROVIDER_CONCURRENCY_LIMIT).optional(),
  requestIntervalMs: z.coerce.number().int().min(0).max(MAX_PROVIDER_REQUEST_INTERVAL_MS).optional(),
});
