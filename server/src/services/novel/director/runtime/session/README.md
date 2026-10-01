# Director Session Contracts

This module owns the data crossing candidate selection, confirmation, and
checkpointed preparation. Consumers use `index.ts` or
`../novelDirectorHelpers.ts`; schemas retain their separate public facet at
`../novelDirectorSchemas.ts`.

## Responsibilities

- `contracts/seedPayload.ts`: candidate-stage, generation-context, and persisted
  workflow seed types.
- `contracts/schemas.ts`: the existing candidate, book-contract, and blueprint
  response schemas.
- `domain/runMode.ts`: run-mode, target chapter count, and full-book approval
  normalization over structured inputs.
- `domain/sessionState.ts`: session phase, lock scopes, and review scope.
- `domain/bookInput.ts`: candidate/book-spec mapping, refinement summaries,
  story input assembly, and book-contract normalization.
- `application/seedPayload.ts`: seed payload construction, candidate-stage
  clearing, saved director input lookup, and model-option overrides.
- `application/candidateTitles.ts`: title-service enrichment and distinct title
  selection, retaining the original service failure and title reuse behavior.

The index preserves the helper entry's public exports. Schemas are a separate
facet so moving their implementation does not expand that helper API.

## Contract rules

Seed payloads preserve their existing defaults and merge order. Once a novel is
created or preparation leaves candidate selection, candidate-stage state is
cleared rather than becoming a second continuation cursor. Full-book mode keeps
its current approval and execution-plan contract; an explicit chapter range is
preserved.

Domain code processes already structured state and inputs. It does not infer
user intent, create another workflow state machine, or invoke a model. Title
enrichment delegates to the established title service without introducing a new
product prompt or title-generation path.
