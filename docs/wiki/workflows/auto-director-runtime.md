# AI Director Runtime

The director converts a confirmed book direction into durable planning and
production work. It is a checkpointed command runtime, not a chat transcript.

## Stage contract

The stage sequence is direction alignment, book framing, story macro, contract
and constraints, world, characters, volume strategy, skeleton, beat sheet,
chapter list, synchronization, chapter detail, and handoff to the chapter
runtime.

Each stage defines input, structured output, progress, persistence, approval
policy, and recovery behavior. Task projections read the runtime snapshot and
must not infer a second state source from URL parameters or stale caches.

## Commands and recovery

Continue, retry, takeover, replan, cancel, and approval actions are explicit
commands with idempotency and a lease. A read-only projection never records a
resume event. A worker restart or stale lease is handled through the task
recovery path.

Automatic continuation pauses for provider failure, quota exhaustion, an
explicit replan decision, unusable output, or data and runtime safety failure.
A local chapter quality issue is repair work or quality debt and remains
non-blocking when usable content exists.

When a terminal chapter pipeline job exists, whole-book completion requires a
successful result. Saved prose alone does not prove that post-write
synchronization, quality records, and task finalization succeeded. If the final
pipeline job fails or is cancelled after saving prose, keep the prose and the
failed job reference, expose a chapter-batch recovery checkpoint, and leave the
director incomplete. A resumed run with that failed job still must not mark the
book complete.

## Ownership rules

Director routes and Creative Hub may start commands, but they do not own prose
generation, repair, timeline writes, or a second fact ledger. Chapter work is
delegated to the shared chapter runtime. The director consumes projections and
checkpoints from that runtime.
