# Prompting Registry

`server/src/prompting/` is the only product-level entry point for adding a new
prompt. A prompt is a registered `PromptAsset`, not an inline string in a
service.

## Required asset fields

Every product prompt declares an id, version, task type, mode, language,
context policy, and either an output schema or text post-validation. Structured
prompts may also declare bounded JSON repair and semantic retry policies.

Prompts live under `prompts/<family>/` and are registered in `registry.ts`.
Use the registered runner and Context Broker so required context, diagnostics,
telemetry, and schema validation remain consistent.

## Guardrails

Prompt Workbench can edit declared slots or controlled prose templates. It
cannot remove required context, change a schema, task type, approval boundary,
or context policy. Product prompts must not call raw `getLLM()` from business
services.

Approved exceptions are JSON repair, connectivity probes, and temporary stream
bridges documented in the project boundary contract. When an old inline prompt
is touched, migrate it into the registry before extending it.

## Runner choices

- `runStructuredPrompt` for schema-validated output;
- `runTextPrompt` for plain text;
- `streamTextPrompt` and `streamStructuredPrompt` for streams.

Keep the service public method, persistence, and response shape stable while
moving prompt construction behind the registry.
