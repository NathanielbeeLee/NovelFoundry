# Director Runtime Ownership

The runtime coordinates checkpointed preparation, node execution, continuation,
and takeover. Chapter generation and repair remain with the shared chapter
runtime; director state and artifact projections describe that work rather than
creating another writer or fact ledger.

## Responsibility map

| Directory | Owner |
| --- | --- |
| `commands/` | Candidate continuation, candidate confirmation, book framing, and validation of already structured command requests |
| `execution/` | Node execution, policy gates, workflow-step orchestration, and the runtime application service |
| `state/` | Runtime snapshots, persistence deltas, legacy snapshot merging, blueprint persistence, and AI resolution of pending state proposals |
| `artifacts/` | Artifact identity, dependency reconciliation, inventory construction, and the persisted artifact gateway |
| `projections/` | Read-only artifact, usage, and chapter-progress queries |
| `automation/` | Memory reservations, circuit-breaker and quality-loop budget rules, and automation ledger events |
| `recovery/` | Approved continuation, asset-first resume decisions, and recovery/cancellation error contracts |
| `session/` | Candidate and session contracts, deterministic processing of structured inputs, seed payload assembly, and candidate title enrichment |
| `takeover/` | Takeover planning, readiness, state loading, execution handoff, and explicitly requested restart/reset operations |
| `workspaceAnalysis/` | Persisted workspace inventory and manual-edit analysis |
| `eventProjection/` | Runtime event read models and quality/recovery projections |
| `pipeline/` | Preparation phase order and the approved chapter-execution handoff |
| `usage/` | The existing book token-budget capability |

## Entry and dependency rules

The files directly under this directory are compatibility facades. Existing
routes, workflow stages, chapter services, and tests keep their established
imports. Use a responsibility directory's `index.ts` or its existing public
compatibility entry; do not add a deep import into another responsibility's
`application/`, `domain/`, or `infrastructure/` implementation.

Within one responsibility, implementations may reference its own files directly.
Cross-responsibility references use the individual compatibility entry, which
avoids loading unrelated capabilities through a broad barrel. Internal domain
rules remain separate from database, prompt, and workflow orchestration owners.
`directorSubsystem.ts` is the broader director facade for routes and workers.

## Runtime invariants

Preserve task and run identities, step idempotency, artifact dependency hashes,
checkpoint types, approval gates, and snapshot persistence ordering when moving
or modifying these modules. AI decisions keep their registered prompt owner;
request validation and structured-output normalization do not replace AI intent
understanding.

A recoverable chapter issue remains local quality debt. Only an explicit global
stop/replan decision, unusable generation result, or runtime safety/data-integrity
failure may stop the book chain. Read-only projections must retain this scope
and keep failed or blocked director tasks discoverable through recovery.

Takeover restart creates its existing rewrite snapshot before preparing the
reset. Continuation retains the saved execution range and available chapter
content. A structural move must not add a database operation, weaken these
guards, or synthesize an independent workflow state.
