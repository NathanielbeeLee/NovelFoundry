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

## Acceptance reuse

An acceptance result belongs to the exact prepared review, not just the chapter
text. Changes to the book or chapter title, target length, selected obligations
and context, prompt contract, effective model defaults, endpoint, protocol,
reasoning, or supported fallback and repair configuration invalidate reuse.
The cache key is computed from the same preparation consumed by invocation.

Pending requests share a promise that includes persistent lookup and result
storage. Completed results have a separate bounded cache; pending work cannot
be evicted by it. An unavailable assessment is still local quality guidance and
is never cached as successful AI acceptance, so later review can try again.

Persistent reuse checks the complete digest and result contract. Version 2
identities are isolated from older checkpoints without deleting chapter data.
Missing, corrupt, or unverifiable cache records cause a fresh assessment. Cache
read/write failures do not stop chapter production; audit/data failures retain
their existing recovery boundary. The owned
[acceptance module](../../../server/src/services/novel/runtime/acceptance/README.md)
defines the result-policy revision and custom-assessor contract.

Regression checks use injected AI failures and disposable SQLite schemas.
They verify retention, retry consumption, debt finalization, and interruption
boundaries without using a writer's database or a live model provider.

## Extension rule

New routes, streams, jobs, or director commands may provide a different
transport, but they must call the existing runtime facade. Do not add a second
writer, review loop, repair helper, or timeline writer in a transport module.

## Manual prose saves and review evidence

A manual content write supplies the exact saved source text, including null and
whitespace distinctions. The database conditionally updates the chapter by novel,
chapter and source content in the same short transaction as the returned row.
Only a successful write can synchronize artifacts. Missing preconditions fail
explicitly; metadata-only clients keep their existing contract. A conflict keeps
the local draft and offers comparison or reload. Continuing with the compared
remote baseline still uses another conditional save, never a force overwrite.

The editor instance belongs to the novel/chapter identity, not its query timestamp.
A save acknowledges only submitted text. Later typing stays dirty through query
refresh, failure and conflict. Switching chapters isolates late callbacks. This
contract does not persist unsaved text after leaving the page.

Explicit manual reviews use a distinct registered evidence contract. AI judges
reading impact, narrative function and counterevidence in one call; host checks
only quote positions and source identity. Unsupported, ambiguous, keep and deferred
findings remain visible advice. Only grounded confirmed findings become ordinary
audit issue rows, and repair validates the source again. Report JSON retains all
findings and source hashes; old free-text reports are never labelled verified.
Preview reviews do not replace reports for the saved manuscript. Saving reports
locks the reviewed source in the same transaction; failed AI review remains an
error rather than a synthetic clean score. Automatic chapter acceptance retains
its own contract and local-quality-debt continuation rule.
