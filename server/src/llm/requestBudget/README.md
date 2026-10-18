# Nested request budget

This module owns a process-local network request counter for a chapter's audit,
local repair, and recheck phase. A chapter pipeline creates one budget (eight
requests by default) and shares it between acceptance assessment and prose repair.
Only the acceptance assessor and local prose repair execute inside that scope.
Initial writing, continuation, timeline finalization, and artifact extraction or
synchronization are outside it. A standalone acceptance assessment creates its
own budget. Nested scopes reuse their active parent rather than refreshing it.

OpenAI-compatible and Anthropic transport adapters consume the counter immediately
before each actual fetch. Transport retries, endpoint fallback, structured JSON
repair, semantic retry, and model fallback therefore share the same cap. Cache
hits make no network request and consume nothing. Exhaustion is terminal for
request retry mechanisms, but the chapter runtime records an unscored local
quality debt when usable prose exists; it does not require global replanning.

The counter is not persisted in checkpoints and is not a crash-durable spending
limit. Explicit retry, resume, or process restart creates a new invocation and a
fresh budget. Existing outer runtime retry limits still bound automatic re-entry.
Unavailable or unscored acceptance results must not be reused as a valid cached
audit, including when loaded from persisted artifact checkpoints. A future
cross-invocation spending limit needs its own durable owner and transaction
contract; this module must not be described as providing one.

Callers use this directory's facade. Do not consume a request at invoke/stream
decorators: one invocation may perform several network attempts, and charging
both layers would count an attempt twice.
