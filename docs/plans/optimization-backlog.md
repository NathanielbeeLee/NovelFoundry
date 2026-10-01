# NovelFoundry Optimization Backlog

Updated: 2026-10-01

This page records follow-up work after the current foundation pass. Items are
not known blocking failures and are not claims that the work is already
implemented.

## Completed foundation

- Unified book-level director progress, health, and task projections.
- Routed cockpit actions to the relevant confirmation, chapter, repair, or task
  entry point.
- Added schema parity checks to the typecheck workflow.
- Added explicit domain and infrastructure boundaries for novel-edit selectors
  and browser effects.
- Added a persistent application-shell locale switch and the first onboarding
  route migration.
- Established owned world structure and world prompt modules with stable
  facades, separating deterministic domain rules from AI assets and adapters.
- Kept local data, tooling, and recovery archives outside the published source
  and Docker build context.
- Split the remaining oversized production sources into owned workflow,
  contract, projection, persistence, and presentation modules while retaining
  public entry points.
- Organized shared contracts by product capability and director runtime
  implementations by execution, state, recovery, projection, and session owner.
- Removed unused direct dependencies and an unconnected placeholder page and
  API. Reproducible manifests and the lockfile remain the dependency contract.

## Follow-up priorities

### P1: Replayable whole-book recovery

Build deterministic fixtures for service restart, LLM timeout, malformed JSON,
repair failure with usable text, repeated state synchronization, duplicate
continue commands, expired command leases, and resume into the next chapter.
Cover the smallest SQLite and PostgreSQL startup and recovery smoke paths.

### P2: Cost and quality budget estimates

Show beginners an estimate before batch generation, review, or repair. Keep
input, successful usage, and retry usage separate. A budget stop must remain
resumable and must not create a second production branch.

### P2: Book health local-repair entry points

Let a health warning open the relevant chapter range, repair action, or
synchronization task. Local quality debt remains visible and non-blocking;
only an explicit replan, unusable output, or runtime/data safety failure pauses
the global chain.

### P2: Runtime metrics

Derive completion rate, checkpoint recovery success, duplicate-command blocks,
quality-debt lifecycle, and estimated-versus-actual usage from existing task,
runtime, artifact, and quality projections. Do not introduce a second state
source.

## Working rules

- Continue directly on `main`; do not create temporary feature branches
  for ordinary work.
- Implement one coherent phase at a time and verify its actual scope.
- Do not remove a product entry without updating the capability catalog and
  related Wiki pages.
- Runtime, prompt, recovery, schema, and database changes require focused
  verification.
- Pure internal changes do not need release-note entries; user-visible changes
  do.
