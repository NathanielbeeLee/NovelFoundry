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

## Score availability and request limits

An unavailable automatic acceptance judgment has a null score and an explicit
availability/reason. It is neither a passing nor a failing literary grade.
Rule-derived estimates and zero are not substitutes for a missing AI score.
Persisted audit reports and runtime projections retain this distinction; legacy
reports marked with an unavailable acceptance gate must not regain a numeric
grade merely because an older payload contains one. Legacy scores without
availability evidence remain explicitly of unknown provenance.

A secondary prose-check failure leaves a valid narrative judgment intact and
adds a local warning. Missing acceptance judgment preserves usable prose and
finalizes quality debt. Score thresholds do not fabricate acceptance or force a
global replan when no score exists.

One chapter execution shares an eight-request allowance across automatic
acceptance, local prose repair and recheck. Actual network attempts count,
including transport retries, structured strategies, JSON repair, semantic
correction and model fallback. Initial writing, continuation, timeline
finalization and artifact synchronization remain outside this review allowance.
A cache hit consumes no requests. Exhaustion stops additional review requests
and records local debt with usable prose; it cannot turn a local issue into a
book-level stop.

This allowance is invocation-local. Explicit retry, resume or restart starts a
new allowance; existing outer retry limits own re-entry. It is not a persisted
cross-run spending cap. See the
[request-budget owner](../../../server/src/llm/requestBudget/README.md).

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

## State feedback context and output allowance

Previous-state lookup restricts snapshots to source chapters strictly before the
requested chapter before applying the recent-snapshot limit. Current or future
chapters must not crowd earlier eligible state out of the query. Candidates
retain the existing creation-time ordering and source-content hash validation;
stale snapshots do not become canonical context. The lookup inspects the latest
50 eligible candidates, so it can return no state if all 50 are stale even when
an older valid candidate exists. Revisit that bound if repeated extraction or
source edits produce that case.

Chapter artifact extraction uses the registered prompt's output policy rather
than a separate service-level token override. The current asset allows 8000
output tokens, subject to the existing provider and structured-output limits;
JSON repair keeps the prepared invocation allowance. This is the existing prompt
policy, not a guarantee that task-route limits override registered prompt limits.

Payoff evidence in artifact extraction must carry evidence text. Parsing accepts
plain strings and common alias keys for that text, and drops an evidence item
that has none rather than copying the parent payoff summary into it. One
malformed evidence item therefore leaves that payoff with less evidence instead
of failing the whole chapter's synchronization.

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

For a semantic prose change, the save transaction invalidates automatic summary,
fact, timeline and local index projections while preserving authored records.
Follow-up extraction uses the existing registered AI artifact owner and its
source-locked transaction. Index work joins that transaction as an outbox;
late embeddings must still validate their current owner before commit and read.
Newer index revisions queue a successor behind an older running revision.

The committed prose result is independent of subsequent mirror, extraction or
index scheduling failures. Existing artifact checkpoints and diagnostic warnings
record failed work; saving the same prose can retry it. Do not claim a separate
restart recovery scheduler. Empty prose invalidates automatic projections and
skips AI extraction. Prose compare-and-set and edit-preview identities are exact;
AI artifact checkpoints retain their canonical-whitespace identity. Metadata
mirror and index revisions additionally include their source revision.

The editor instance belongs to the novel/chapter identity, not its query timestamp.
A save acknowledges only submitted text. Later typing stays dirty through query
refresh, failure and conflict. Switching chapters isolates late callbacks.

### Manuscript text fidelity

The chapter editor uses LF as its editing line ending and preserves all other
manuscript whitespace, including full-width indentation, repeated spaces, single
line breaks, empty lines and trailing empty lines. One LF separates editor text
blocks; shared serialization and half-open UTF-16 ranges define selection,
paragraph context, diagnostic anchors and candidate replacement on both sides of
the API. Display formatting must not rewrite the text being saved.

The raw persisted source remains a separate compare-and-set token, including
CRLF, null and empty distinctions. Loading an old manuscript or recovery copy
never bulk-rewrites stored prose. Ordinary save is explicit; acknowledgements,
query refresh and recovery retain the existing revision ownership. A candidate's
text and the selected source keep their whitespace through validation and diff
rendering; checking that prose is nonblank must not trim the returned value.

### Local draft recovery

The editor keeps a device-local recovery copy of unfinished prose, separate from
canonical chapter saves. Copies bind the novel, chapter, editing session, exact
raw saved baseline (including null versus empty text), complete local prose and
revision identity. On return, the author chooses whether to restore or discard a
copy. Restoration does not save prose, run extraction, adopt AI suggestions or
advance production. A changed server baseline requires explicit comparison using
the existing save-conflict flow; the next save still uses compare-and-set.

Successful saves remove only the acknowledged local revision. New typing during
a pending save remains recoverable against the newly acknowledged baseline.
Other tabs keep separate copies, and an older save/discard cannot delete a newer
revision. Existing copies remain until explicitly discarded or superseded by a
confirmed transfer/save; reaching age or capacity limits cannot silently evict
unfinished prose. Storage failure leaves the in-memory text intact and explains
that device recovery is unavailable, so the author can save or copy it.

Recovery is limited to the current device/browser origin. It is neither portable
backup nor a guarantee that the last keystroke survives immediate termination.
Browser storage clearing or device loss can remove copies. Use canonical saves
and the portable backup/export workflow for durable manuscript protection.

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

## Saved-source synchronization diagnostics

The chapter information panel reads the production-owned synchronization
projection independently of AI revision analysis. It reports summary,
character/story artifacts, timeline, chapter retrieval and summary retrieval
against the saved chapter. Local unsaved text is excluded. A diagnostic request
never invokes AI, queues work, retries a checkpoint, writes canon or changes the
director's continuation decision.

A successful historical task is not sufficient evidence of current completion.
Summary and artifact checks use the artifact owner's source identity and
freshness contract; timeline checks use the timeline owner's distinct checkpoint
identity and source metadata. Stable and degraded timeline results remain
separate. Missing evidence stays unknown, and expired running artifact/timeline
checkpoints do not imply that a worker is still active. These observations do
not create a global quality gate.

Retrieval completion requires matching local chunk metadata. A completed index
job can have no chunks; its queued source revision is not proof of the source
actually indexed. The projection checks the two chapter owners only and does not
probe the external vector service or certify book-wide retrieval health. Pending
and failed jobs remain visible for their own source revision. Bounded or missing
evidence cannot produce a completion claim.

The read uses a consistent database snapshot and rechecks chapter/summary source
identity before responding. Concurrent source changes return unconfirmed results.
The client scopes the query to novel, chapter and loaded save time, hides cached
results during saves/refreshes or after failed reads, and requires a fresh match
when the loaded version changes. The displayed read time identifies a snapshot;
refresh rereads evidence without repairing it. UI acceptance remains separate
from the offline projection and rendering checks.

Implementation contracts and limits are owned by the
[synchronization diagnostics module](../../../server/src/modules/novel/production/syncDiagnostics/README.md)
and [chapter editor](../../../client/src/pages/novels/components/chapterEditor/README.md).
