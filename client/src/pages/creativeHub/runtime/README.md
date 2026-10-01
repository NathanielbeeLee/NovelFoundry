# Creative Hub Stream Coordination

This module projects a single client stream session. Consume it through
`index.ts`. The hook owns React state; `infrastructure/` owns read-only API and
query refresh; the API's `streaming/` module owns SSE decoding and reader cleanup.

A session records the observed run id, received messages, and explicit business
terminal. Connection closure without that terminal is unknown. Refresh confirms
the same run and a new saved checkpoint before declaring completion or approval;
it preserves partial messages while the outcome is pending. A successful action
without a matching checkpoint can still have committed writes, so new execution
remains blocked until its result can be read.

All stream and refresh results are guarded by thread and session identity.
Cancellation stops receiving; it does not prove that server tools stopped.
Recovery never automatically invokes a write, starts a director, edits the
previous request, or reloads it. This is client coordination of server-owned
state, not an alternative task runtime.
