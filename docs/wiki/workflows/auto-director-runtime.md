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

A retried step represents its current execution: starting clears its previous
error and finish timestamp; success clears any previous error. Historical
`node_failed` events remain available for diagnosis. Projections must not show
an old failure as the detail of a successfully recovered step.

Quality checkpoints use the normalized repair-risk decision from both the
notice and structured pipeline payload. Explicit replanning in the payload
requires `replan_required` even if the notice is absent or still describes a
local review issue. Automatic continuation, scope approval, and skipping local
repair cannot bypass that boundary.

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

Recovery checks cover process termination with persisted SQLite state,
expired leases, explicit application recovery, real invocation timeouts,
concurrent continue commands, and rejection of stale lease owners. Each test
process uses an independent schema fixture; these checks prove orchestration
and saved-state behavior, not the literary quality of a live full-book run.

## Ownership rules

Director routes and Creative Hub may start commands, but they do not own prose
generation, repair, timeline writes, or a second fact ledger. Chapter work is
delegated to the shared chapter runtime. The director consumes projections and
checkpoints from that runtime.

## Execution ownership and stale attempts

A command claim binds command id, worker/slot and an incrementing attempt. Worker
names alone are reusable and cannot authorize an earlier attempt. Renewal false
revokes execution authority immediately; renewal errors retain only the last
confirmed deadline. A late success cannot resurrect an expired attempt. Waiting
for a resource slot and model calls observe the authority signal. A provider that
ignores cancellation may still finish, so cancellation alone is insufficient.

`platform/db` supplies execution-scoped persistence; the director owns the lease
predicate. Each mutation or explicit transaction conditionally locks the current
command generation on the same connection before writing, holds the lock through
commit, and rolls back if authority is lost. Chapter source/hash checks still
apply independently. Do not instantiate raw clients or cache unscoped delegates
in command runtimes. Never hold a transaction across an AI request.

Scheduled director continuations register with the command scope. The executor
drains them while renewal is live; detached descendants lose write permission
when the attempt closes. Notifications run only after commit and outside the
write scope, and may write delivery logs only. Recovery compares the scanned
attempt again before requeueing; an old scan cannot reset a newer claim. Lease
loss is runtime ownership safety, not chapter quality debt or user cancellation.
Saved usable prose remains available to the rightful owner's recovery.

See [execution-scoped persistence](../../../server/src/platform/db/README.md).
