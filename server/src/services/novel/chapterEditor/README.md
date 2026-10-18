# Chapter editor ownership

`ChapterEditorWorkspaceService` reads the chapter workspace and produces an AI
diagnosis. `NovelChapterEditorService` produces unsaved rewrite candidates.
`consequences/` owns optional assessment of one active candidate; it does not
own prose generation, canonical state, director execution or artifact repair.

## Candidate consequence assessment

- `domain/` validates exact selection bytes, hashes and evidence references.
- `infrastructure/` reads the current chapter, at most two planned successor
  chapters and physically linked resource/payoff/state evidence. It also owns
  the bounded advisory receipt store and dependency revision guards.
- `application/` prepares and executes the registered structured assessment,
  checks freshness, and adopts through the existing chapter update facade.
- HTTP/schema/API/UI mappings remain in their existing owners. Other modules
  consume the application service through the `consequences/index.ts` facade.

Assessment never persists prose, state hypotheses, canonical facts or director
decisions. Conflict labels are AI semantic judgments with verified quotations;
possible effects remain uncertain. No local finding blocks whole-book execution.
Only supplied references are eligible evidence. The reference horizon is bounded
and missing participants/future prose remain evidence limits, not proof of safety.

Identity uses exact UTF-8 SHA-256 over the full saved source (including null),
local snapshot, candidate, session/candidate identity, exact range and selected
bytes, dependency revisions and prepared prompt/model execution identity. Do not
use the normalized artifact-content hash for this contract. A preparation without
a reusable identity cannot issue a receipt. Adoption re-prepares without invoking
a model, compares identity, then saves only the bound replacement.

There is no general installation signing secret owner. Advisory receipts are
opaque server-owned UUIDs, bounded to 40 per service instance for 15 minutes.
They contain no credentials. Restart, eviction or a request reaching another
worker returns an explicit 409 requiring reassessment. This is deliberately not
a restart-durable preview. The candidate remains in the editor; an author may
explicitly cancel assessment and use ordinary candidate acceptance.

Adoption first creates the existing pre-edit snapshot, then supplies an internal
dependency callback to the existing source-CAS save facade. Within its
serializable persistence transaction, captured rows are locked in stable order
with parameterized fixed-table `id=id` writes and decoded `updatedAt` comparison,
preserving legacy SQLite epoch timestamp representation. The bounded inventory is reloaded and fingerprinted,
and prose still compares the exact saved `expectedContent`. Serialization
conflicts return 409 without automatic retries. Predicate reads cover successor
membership in databases that implement serializable isolation; SQLite serializes
writes. A conflict may leave an extra snapshot, but cannot authorize stale prose
or client-supplied state deltas. Canonical derivatives follow the ordinary manual
save synchronization owner after prose commits.

Prompt/model configuration is checked immediately before adoption but is not
part of the database row-lock transaction. The receipt binds the prepared
configuration actually used; later configuration changes require reassessment
when observed during the adoption preparation. No model call happens inside the
transaction, and no configuration lock is claimed across the save.

Focused offline fixtures: `server/tests/chapterEditorConsequences.test.js`.
They validate schemas, evidence, exact byte/range freshness, receipt lifetime,
advisory no-write behavior and adoption transaction preconditions. Literary
accuracy and PostgreSQL serializable runtime behavior need separate acceptance
evidence; fixtures do not claim either.

State snapshots must match the current source chapter's existing artifact hash;
an earlier snapshot source chapter also enters the exact dependency guards.
Unversioned/stale snapshots are omitted with an evidence limitation. Resource
and payoff ledger entries without per-item current-source hashes are labeled
unverified historical clues and may support uncertain effects, never a supported
conflict finding. Every evidence quote must contain non-whitespace characters;
validation preserves its exact bytes rather than trimming the quotation.
