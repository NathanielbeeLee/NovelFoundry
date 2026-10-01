# Director Pipeline Runtime Boundary

This module coordinates the existing preparation stages and their chapter
execution handoff. Consumers use `index.ts` or the compatibility entry
`../../novelDirectorPipelineRuntime.ts`.

## Responsibilities

- `application/contracts.ts`: the run input and unchanged injected capability
  contract.
- `domain/phaseResult.ts`: recognize an existing character-review pause result.
- `application/NovelDirectorPipelineRuntime.ts`: choose the safe starting phase,
  skip completed fact modules, enforce memory and approval gates, advance the
  stage sequence, and hand an approved chapter batch to the runtime orchestrator.
- `application/DirectorPhaseExecutionRuntime.ts`: adapt existing phase services
  and callbacks, including reuse of persisted character cast options.

The orchestration class inherits the phase capability to preserve its original
method names, injected dependency object, and `this` dispatch. The base
constructor only stores that object; construction does not start work.

## Runtime contract

The preparation order remains story macro, book contract, world, characters,
volume strategy, and structured outline. Completed module facts can skip work;
they do not synthesize an independent checkpoint state. Stage review preserves
the existing waiting checkpoint and user confirmation path.

Automatic approval retains its run-mode/config checks and its audit record.
Chapter execution starts through the shared orchestrator after the existing
`chapter_batch_ready` handoff. The phase adapters retain their registered prompt,
persistence, and callback owners; this module does not add a prompt or writer.

Local chapter quality debt is handled by the chapter and quality-loop owners.
Only their explicit global stop/replan or runtime safety result may stop that
chain; a structural extraction must not change these results or their scopes.

`server/tests/novelDirectorPipelineRuntime.test.js` checks the existing sequence,
approval, and resume behavior.
