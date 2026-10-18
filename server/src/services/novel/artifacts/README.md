# Chapter artifact persistence

`index.ts` owns structured AI artifact extraction and the stable service facade.
`persistence.ts` exposes the source-locked transaction client. `manualSave.ts`
owns post-save scheduling; `manualPersistence.ts` is the pure CAS invalidation
facade and must not initialize a database or model on import.

## Manual save boundary

The manual chapter API first commits raw prose with its existing exact
`expectedContent` compare-and-swap. On a semantic body change, the same transaction
invalidates the summary's source hash and removes only automatic
`chapter_auto_extract` consistency rows, `chapter_extract` character timeline
rows, and their local index metadata. Manual rows and governed historical
proposals remain intact. Existing summary/snapshot/milestone readers validate
their source hashes, so prior projections cannot masquerade as current while AI
sync is pending. Staged vector points require current local metadata and owner
revisions before retrieval.

Empty or whitespace-only prose uses this same invalidation boundary. It is a
valid saved draft and does not start AI extraction. No synthetic summary, fact,
relationship or timeline is invented for missing prose.

Follow-up scheduling uses the committed row, never rejected or requested input.
The compatibility `novelChapterArtifacts.ts` entry delegates to the existing
background sync service and registered structured artifact prompt. The manual
path no longer performs lexical fact or character-name event extraction.
Summary event/state fields and character timeline entries come from structured
AI output; factual milestones keep their existing NovelFactService owner.

Volume mirroring holds the source row lock and checks the committed timestamp;
its existing persistence adapter joins the source transaction. A delayed save
cannot mirror stale metadata over a newer revision. Mirror or scheduling errors
do not change the successful prose-save result.

Removing an empty manual chapter also locks and reads the current row inside
one transaction. A concurrent save or planning change is checked after that
lock, rather than against an external precheck. The two index-delete outbox jobs
are written only after successful removal and in that same transaction; outbox
failure rolls removal back.

## Identity and transactions

Raw prose CAS distinguishes null, empty text and whitespace exactly. Artifact
checkpoints retain the existing canonical whitespace content hash: formatting
alone does not require a fresh AI interpretation. This is a different contract
from editor candidate adoption, which keeps exact source text and dependency
preconditions. Its optional server-only `beforeChapterUpdate` callback runs in
the same Serializable save transaction and is stripped from Prisma data.

`runWithChapterSource` locks the current chapter and sorted dependency rows,
then validates decoded content identity and optional metadata revision.
Timestamp representations must not be compared in SQL: old SQLite integer dates
and current Prisma dates can represent the same instant. Locks must not rewrite
those dates. AI/network work finishes before this database-only scope.
Prepared AI extraction also binds the chapter metadata timestamp, so a newer
title, goal or task-sheet edit rejects the older result even if prose is equal.
The existing checkpoint records this as superseded/failed, and a later current
save can retry; it is not a succeeded artifact sync.

`quality/sourceRowLock.ts` exposes only fixed model/id/novel no-op locks. The
polish journal registers guarded transactions internally and rechecks the same
active open novel scope for those locks. It never exposes the underlying client
or relaxes the journal's general raw-SQL rejection.

Artifact writes and RAG outbox jobs commit together under that source scope.
The outbox revision includes body identity, current chapter timestamp and actual
summary identity. A newer revision queues a successor if an older job is already
running; it must not disappear through same-owner deduplication. Delayed fact and
timeline embeddings must lock and recheck their actual source rows before index
metadata commits. Chapter metadata stamps and summary identity are also checked
before publishing/retrieving a prepared index.

## Failure and retry

The existing background service records running/succeeded/failed artifact
checkpoints and logs follow-up errors. When a pipeline job is active it also
projects the activity into that job's existing payload. A standalone manual save
does not create a second task runtime. An operator can inspect the chapter's
checkpoint status and warning logs; saving the unchanged current body invokes
the same owner again and retries a failed/incomplete sync. There is no promise
of automatic retry after a process restart or a new mandatory author step.

Index scheduling failure is warned and does not prevent AI sync from being
scheduled; final artifact/index outbox failure rolls back their shared derived
transaction. The already-committed prose and atomic stale-projection invalidation
remain safe. No local quality issue becomes a global director failure/replan.
