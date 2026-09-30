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

## Extension rule

New routes, streams, jobs, or director commands may provide a different
transport, but they must call the existing runtime facade. Do not add a second
writer, review loop, repair helper, or timeline writer in a transport module.
