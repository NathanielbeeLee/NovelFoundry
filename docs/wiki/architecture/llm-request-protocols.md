# LLM Request Protocols

The LLM layer supports explicit OpenAI Responses, OpenAI-compatible Chat Completions, and Anthropic-compatible requests. Provider defaults, task overrides, and call-level protocol choices have a documented precedence.

Connection probes test the protocol that will actually be used. Responses compatibility normalizes incomplete gateway events without inventing missing content. Formal writing requests do not silently replay through another protocol.

## Provider reasoning controls

The reasoning policy maps configured preferences to provider-specific request
fields. For the built-in Ollama provider, disabling thinking sends
`reasoning_effort: "none"` through its OpenAI-compatible client. Enabling it leaves
the effort unspecified so the selected model retains its default. Do not infer
an Ollama provider from a custom endpoint URL or send the native `think` field
through Chat Completions. Support for the control depends on the Ollama version
and selected model.
