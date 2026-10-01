import type { ResolvedLLMClientOptions } from "../../factory";
import type { StructuredOutputProfile, StructuredOutputStrategy } from "../../structuredOutput";

export interface StructuredAttemptTarget {
  provider: ResolvedLLMClientOptions["provider"];
  model: string;
  apiKey?: string;
  baseURL?: string;
  authMode?: ResolvedLLMClientOptions["authMode"];
  reasoningEnabled?: boolean;
  temperature: number;
  maxTokens?: number;
  profile: StructuredOutputProfile;
  requestProtocol: ResolvedLLMClientOptions["requestProtocol"];
  preferredStrategy: StructuredOutputStrategy | null;
  resolvedOptions: ResolvedLLMClientOptions;
}

export interface PreparedStructuredAttempt {
  strategy: StructuredOutputStrategy;
  resolved?: ResolvedLLMClientOptions;
  preparationError?: unknown;
  repairResolved?: ResolvedLLMClientOptions;
  repairPreparationError?: unknown;
}

export interface PreparedStructuredTarget {
  target: StructuredAttemptTarget;
  attempts: PreparedStructuredAttempt[];
}

// Contains credentials in memory. Only identityDigest may be persisted or logged.
export interface PreparedStructuredInvocation {
  primary: PreparedStructuredTarget;
  fallback: PreparedStructuredTarget | null;
  fallbackEnabled: boolean;
  fallbackPreparationError?: unknown;
  identityDigest: string;
  cacheable: boolean;
}
