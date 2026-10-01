# Novel Application Capability Composition

This module assembles the existing novel application API from focused
capabilities. Callers use `index.ts` or the compatibility entry
`../NovelApplicationServices.ts`; narrow injected contracts remain defined in
`../NovelApplicationContracts.ts`.

## Responsibilities

- `NovelApplicationContext.ts`: create the shared service instances and register
  the chapter execution, preparation, and quality-repair stage runners.
- `NovelProjectApplication.ts`: novel/chapter operations, detail enrichment,
  snapshots, and snapshot restoration.
- `NovelProductionApplication.ts`: generation streams, review/repair, and
  chapter-batch lifecycle. It uses the project snapshot capability before
  starting a batch.
- `NovelPlanningApplication.ts`: volume/storyline planning, editor previews,
  state, planning stages, audit, and payoff queries.
- `NovelWorldApplication.ts`: book-world instances, scoped world slices, manual
  world edits, and library synchronization.
- `NovelCharacterApplication.ts`: characters, timeline, preparation, visible
  profiles, dynamics, mind, influence, and dialogue.
- `projections/snapshots.ts`: the snapshot list-item view.
- `DefaultNovelApplicationServices.ts`: preserve the public class and factory
  while composing the original capability method descriptors.

## Composition contract

Only the default application instance is constructed. Its context creates each
dependency once, in the established order, and retains the existing runner
registration callbacks. Capability classes are method containers: their
prototype descriptors are installed on the default prototype, and they are
never instantiated during composition.

This preserves the method receiver, signatures, descriptor attributes, and
shared dependency identity without building an arbitrary inheritance chain
between unrelated product capabilities. Production explicitly depends on the
project capability for its snapshot method; other capabilities use the common
context. The compatibility facade can still replace its established internal
core/coordinator references for existing diagnostic fixtures.

## Maintenance rules

Keep capability methods as application wiring. Database queries, prompts,
chapter generation, quality debt, recovery, and world/character rules remain in
their established owners. A new capability must extend the typed application
contract intentionally, rather than becoming an implicit runtime route.

Preserve pre-operation snapshots, shared production-orchestrator entry points,
stage-runner registration, and chapter-runtime handoffs. Do not add a second
writer or promote chapter-local quality debt into a director-level replan here.

Read callers through the public entry points; external modules must not import
these implementation classes directly.
