# LLM Stream Lifecycle

This module owns transport shutdown across the request limiter and the usage and
debug observers. It does not select models, retry requests, change chunks, charge
request budgets, or infer semantic stream outcomes.

`holdStreamPermit` returns LangChain's `IterableReadableStream` with its async
iterator, reader and pipe APIs. Its zero high-water mark avoids consuming the
provider stream ahead of the caller. The permit stays occupied through setup,
consumption, errors and awaited cancellation. Cancellation aborts the request's
derived transport signal before awaiting iterator shutdown; an SDK iterator's
`return()` can otherwise wait behind an unfinished network read. Caller abort
listeners are removed when the permit finishes. Release is idempotent.

`observeStream` binds one source iterator to one lazy observer. Its explicit
`cancel()` and iterator `return()` reach that source even before the observer's
first `next()`. Usage still records the cumulative chunks it observed once in its
existing finalizer; debug response/error handling remains in its existing owner.
Native streams with an active reader close through their iterator, because
`ReadableStream.cancel()` cannot cancel a locked stream.

The request limiter owns cancellable FIFO admission and request start spacing.
Each batch item acquires its own invoke permit through the installed LangChain
and Anthropic batch implementations; a batch never holds an outer permit. The
LangChain disabled-stream adapter may share its outer stream permit with its one
internal invocation of the same input. That scoped exception expires at release.

Callers must consume, cancel or return streams. A source that ignores transport
abort and never settles its cleanup retains its permit; admitting more requests
while that source is still live would violate the concurrency contract.
