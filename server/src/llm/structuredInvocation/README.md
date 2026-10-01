# Prepared Structured Invocation

`structuredInvoke.ts` remains the public invocation facade. This owned module
prepares model configuration for callers that need an exact reusable identity.
It does not choose product intent or add business prompts.

## Preparation and execution

Preparation resolves the primary strategy sequence, optional fallback settings
and target, and each bounded JSON repair client. It performs configuration reads
without creating a live invocation or contacting a model. Actual attempts use
the prepared `ResolvedLLMClientOptions` through the existing client factory;
semantic retries reuse the same plan. Per-attempt invocation metadata is updated
without resolving provider settings again.

Optional fallback and later-strategy preparation errors are deferred until that
path is needed. A broken optional fallback must not stop a healthy primary.
Any unresolved path disables cache reuse. Cancellation and usage-budget guards
still stop retries and fallback through the existing invocation policy.

## Identity and sensitive data

The plan contains credentials and endpoints only in memory. Its public digest
includes effective provider, model, protocol, authentication, endpoint and
credential hashes, reasoning behavior, temperature, output limits, strategies,
repair clients, and fallback settings. Never serialize the plan or log its full
configuration. A cache may persist only the opaque digest and its result.

The legacy invocation path remains available for callers that do not need a
prepared identity. It preserves its lazy configuration resolution behavior.
