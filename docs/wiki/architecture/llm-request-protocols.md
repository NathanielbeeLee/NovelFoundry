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

## Request lifetime and concurrency

Provider/model limits count active requests through complete stream consumption,
failure, cancellation or iterator return. Returning a stream object does not end
the request. Queued calls honor their abort signal without starting a provider
request, and permits are released once. Batch adapters that call `invoke` per
item use those individual permits; an additional batch permit would deadlock a
limit of one. LangChain's disabled-stream adapter can reuse its own stream
permit for its single internal invocation.

Logging and usage observers preserve cancellation, iterator return and stream
chunks. Cancellation closes the underlying stream before releasing its permit,
including when the consumer never requested a chunk. A caller that opens a
stream must consume it, cancel it or return its iterator; abandoning a live
stream without any of these actions can retain its permit. Request deadlines
remain a transport guard; they do not replace the caller's ownership of an
unconsumed iterator.

Anthropic-compatible calls retain the timeout and caller abort subscription
through JSON body consumption or streaming completion. `message_stop` confirms
completion; EOF without it is interrupted even if a preceding event contained a
stop reason. Usage and stop-reason chunks remain available to consumers. A
confirmed terminal event closes the body without waiting for the server to close
the socket. Completion, errors, early return and cancellation dispose the
deadline and caller subscription.
