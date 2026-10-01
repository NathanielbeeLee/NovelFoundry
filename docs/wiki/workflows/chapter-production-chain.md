# Chapter Production Chain

The chapter production chain is the single implementation for manual chapter
runs, batch generation, director continuation, review, repair, and state
feedback.

## Stages

1. Assemble scoped context from the book contract, task, world, characters,
   retrieval, style, timeline, and local state.
2. Generate a draft through the registered writer prompt.
3. Review the draft against the task and continuity contract.
4. Apply safe repair or record quality debt when the text remains usable.
5. Finalize the chapter timeline from the final text.
6. Synchronize facts, character resources, payoffs, and retrieval assets from a
   stable snapshot.
7. Expose the next chapter or recovery action.

## Invariants

- All text-changing paths converge on `ChapterRuntimeCoordinator`.
- Timeline finalization follows final prose and precedes continuation.
- Pending character or asset proposals are not treated as established facts.
- A repair failure does not discard usable prose.
- A read path does not write runtime events.
- The chain may pause for explicit replan, unusable output, or data/runtime
  safety failure. Local quality debt does not automatically stop the book.

## Repair failure boundary

Once usable prose is saved, a review or repair invocation may fail to produce
an accepted result. Structured-output failures, repair-call timeouts, and
non-cancelled stream interruptions remain local repair work. Both patch repair
and whole-chapter repair preserve the original draft, consume the local repair
attempt, and finalize visible quality debt rather than treating that chapter as
accepted or demanding a global replan. Unconfirmed partial rewrites do not
replace the saved draft.

`ChapterRepairFailurePolicy` classifies only known AI invocation failures.
Cancellation, unknown exceptions, context-assembly failures, and persistence
or integrity failures propagate through the normal runtime recovery path.
Keep the recoverable catch around the model invocation; do not extend it over
database writes or final artifact synchronization. An unavailable acceptance
assessment is a warning, while a cancelled assessment writes no fallback report.

Regression checks use injected AI failures and disposable SQLite schemas.
They verify retention, retry consumption, debt finalization, and interruption
boundaries without using a writer's database or a live model provider.

## Extension rule

New routes, streams, jobs, or director commands may provide a different
transport, but they must call the existing runtime facade. Do not add a second
writer, review loop, repair helper, or timeline writer in a transport module.
