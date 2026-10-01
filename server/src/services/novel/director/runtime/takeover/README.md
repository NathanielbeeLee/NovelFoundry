# Director Takeover Boundary

This module derives an entry plan and readiness preview from persisted project
assets and an explicit takeover strategy, then coordinates its established
execution handoff. Planning consumers use `index.ts` or the compatibility entry
`../novelDirectorTakeover.ts`. Execution, continuation, reset, node adapter, and
state-loading consumers retain their individual `../novelDirectorTakeover*.ts`
public entries.

## Responsibilities

- `domain/contracts.ts`: the existing source snapshot and resolved-plan types.
- `domain/assetReadiness.ts`: prerequisite checks over already structured asset,
  checkpoint, and executable-range facts.
- `domain/stageMapping.ts`: compatibility mappings between entry steps, legacy
  phases, and workflow stages.
- `domain/executionPlan.ts`: continue/restart plan construction and the earliest
  missing prerequisite or resumable batch decision.
- `application/inputAssembly.ts`: build the existing confirmation input and
  book specification from saved project information.
- `projections/readiness.ts`: entry labels, prerequisite explanations, and
  previews for the supported strategies.
- `domain/nodeAdapters.ts`: takeover step and workflow node contracts.
- `infrastructure/stateReader.ts`: load persisted project facts, active jobs,
  checkpoints, and executable ranges without adding a continuation state.
- `application/execution.ts`: preserve the requested range, create the rewrite
  snapshot before restart preparation, and hand off to the phase/batch owner.
- `application/continuation.ts`: derive downstream reset guidance and cancel
  replaced runs within the established overlap rules.
- `application/reset.ts`: apply the requested current-step or downstream reset
  through the existing scoped persistence and workflow adapters.

## Preservation rules

Planning and readiness functions do not mutate a project, delete content,
execute a stage, or invoke a model. The application adapters apply the requested
operation through its existing owners. Preserve checkpoint IDs, skip-step
ordering, active batch reuse, prerequisite checks, reset scope, and snapshot
ordering when changing this module.

Missing chapter execution contracts must lead continuation back to structured
planning before writing. An existing usable draft remains protected. Local
quality debt and an explicit replan checkpoint remain distinct facts; do not
create a new replan decision while projecting readiness.

Domain code depends on shared contracts and the domain files. Input assembly
uses the established chapter-count normalizer. Readiness consumes the domain
plan without introducing another director state machine or AI intent router.

Related existing checks are `novelDirectorTakeover.test.js`, takeover execution,
takeover continuation, and takeover reset under `server/tests/`.
