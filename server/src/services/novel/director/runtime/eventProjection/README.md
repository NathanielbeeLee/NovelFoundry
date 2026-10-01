# Director Event Projection Boundary

This module converts a supplied director snapshot and optional fact summaries
into a read model. Consumers use `index.ts` or the compatibility entry
`../DirectorEventProjectionService.ts`.

## Responsibilities

- `projections/eventStatus.ts`: select the latest event/step and derive status
  and blocking reason.
- `projections/labels.ts`: format the existing action, headline, scope, and
  progress labels.
- `projections/progress.ts`: combine planning, chapter, and quality percentages
  with the established fact precedence and weights.
- `projections/quality.ts`: decode quality-budget evidence, summarize deferred
  debt, and expose the latest quality-loop assessment.
- `projections/recovery.ts`: derive the existing recovery decision and bounded
  visible risk badges without applying a recovery command.
- `projections/DirectorEventProjectionService.ts`: assemble the public snapshot
  projection with its original method signature.

## Read-only contract

Projection does not query a database, append events, launch tasks, or change
checkpoint state. Facts supplied by the caller retain precedence over inferred
step progress. Preserve event ordering and the original eight-event and
six-badge limits.

Local quality debt produces its existing warning/deferred summary. Explicit
blocking quality assessments and replan events remain separate evidence; a
projection must not turn residual local debt into a global replan or failed
workflow. Quality-budget fallback uses the established ledger policy function.

`server/tests/directorEventProjection.test.js` covers this read-model contract.
