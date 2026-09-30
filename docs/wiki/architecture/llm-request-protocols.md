# LLM Request Protocols

The LLM layer supports explicit OpenAI Responses, OpenAI-compatible Chat Completions, and Anthropic-compatible requests. Provider defaults, task overrides, and call-level protocol choices have a documented precedence.

Connection probes test the protocol that will actually be used. Responses compatibility normalizes incomplete gateway events without inventing missing content. Formal writing requests do not silently replay through another protocol.
