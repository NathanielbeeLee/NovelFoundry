# Director Workspace Analysis Boundary

Workspace analysis collects existing book and artifact facts, interprets them
through the registered prompts when requested, and records the resulting
analysis through the runtime store. Consumers use `index.ts` or the preserved
`../DirectorWorkspaceAnalyzer.ts` entry.

## Responsibilities

- `domain/manualEditInventory.ts`: compare draft hashes, identify changed
  chapters and dependencies, and preserve the existing non-AI inventory result.
- `domain/manualEditRecommendation.ts`: project an already evaluated edit impact
  into its next action.
- `domain/workspaceInterpretation.ts`: deterministic interpretation of recorded
  facts for the existing non-AI display path.
- `infrastructure/DirectorWorkspaceInventoryRepository.ts`: read Prisma records
  and normalize persisted artifact references with the original query scopes,
  limits, ordering, and quality-risk classification.
- `application/DirectorWorkspaceAnalyzer.ts`: coordinate collection, registered
  workspace/manual-edit prompts, context resolution, and runtime-store writes.

## Dependency and behavior rules

The application extends the stateless inventory adapter to preserve the
existing protected collection methods and `this` call sites. It retains its
runtime-store constructor argument. Collection methods remain replaceable by
existing diagnostic fixtures; there is no second inventory cache or task store.

Domain files do not query Prisma, invoke a model, or record events. The adapter
reads inventory only. The application retains the original prompt options,
context metadata, conditions for AI interpretation, and task-recording rules.
Do not extend deterministic display interpretation into a product intent
recognizer or use it to replace a required AI decision.

Continuable local chapter quality risk must remain excluded from the count of
blocking repairs. Missing artifacts, protected user edits, and explicit replan
decisions retain their existing scopes and evidence references.

Existing checks include `directorManualEditImpact.test.js` and workspace
artifact inventory checks under `server/tests/`.
