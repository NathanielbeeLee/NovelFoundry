# Optional research evidence

## Boundaries

This module turns one user-supplied knowledge document into optional external research
findings. It does not browse the source URL, verify external truth, alter novel text,
write canonical facts, or bind a document to the general knowledge-retrieval system.
Existing RAG bindings retain their independent behavior. Only explicitly adopted
research findings enter the dedicated research context.

`contracts.ts` is the pure public prompt contract: schema and excerpt grounding, with
no database, HTTP or model initialization. `index.ts` exposes HTTP registration and
chapter-anchor reads. Internal policy, application orchestration and persistence are
owned by their respective folders; prompts live exclusively in the Prompt Registry.

## Source and evidence identity

Three relational models own source metadata, findings, and per-novel adoption. A source
is unique to a knowledge-document version. Its SHA-256 hash covers the exact stored
UTF-16 text encoded as UTF-8, without normalization. Findings retain that hash, source
revision, exact quote and half-open UTF-16 offsets. Invalid offsets can be relocated
only when a complete quote occurs exactly once; absent, ambiguous or split-surrogate
quotes are rejected. Matching a quote proves grounding, not a claim's truth. Every
finding carries the model's uncertainty and the user's source reliability notes.

Saving changed source metadata and successful re-extraction rotate the source revision.
Previous findings and adoption history remain recorded but cease to qualify for context.
A no-op metadata save keeps the revision. Extraction failure leaves saved findings
unchanged; the UI separates saving metadata from extraction so failed AI work cannot
silently change the source. An empty successful result means no supported findings.

The input limit is 12,000 UTF-16 code units for the entire document, never a silently
truncated sample. A request may return up to five claims, each at most 400 characters,
with a 600-character quote and 300-character uncertainty. The source URL is metadata
only; the service never fetches it.

## Adoption, invalidation, and concurrency

The user selects a novel for each adoption. At most five non-revoked selections exist
per novel, including stale selections until the user explicitly revokes them. This
prevents reactivating sources from exceeding the context bound. The UI exposes all
selections for the selected novel, including those from disabled/older document
versions, so every slot can be revoked without restoring that source.

Transactions lock document, source, then novel using parameterized no-op updates.
Revision/hash/state checks reject model results computed before source edits; the
novel lock serializes count-and-adopt across requests. Date values are not used as raw
SQL equality tokens, preserving compatibility with legacy SQLite epoch timestamps.
Revoke does not require an enabled source or active document version, and may return
null current-source metadata after successfully saving the revocation.

At each chapter-context assembly, only enabled sources whose document is enabled and
active at the same version/hash, with matching finding revision/quote and non-revoked
adoption, are included. Snapshot reads made before a later revocation are not retroactively
rewritten; the next assembly reflects it. Context is a dedicated `researchAnchors`
field, carried into writer, incremental writer, review and repair as a required block
with `allowSummary: false`. The prompt preserves citation/uncertainty and explicitly
keeps external claims separate from canonical novel facts. Existing plans are not
rewritten: relevance is judged against the current chapter mission at generation time.

## Portability and deployment

Both database providers have additive, repeat-safe migrations. Runtime SQLite migration
discovery uses the existing migration directory; no bespoke startup DDL or AppSetting
product-data storage is used. Repository tests create isolated temporary SQLite files;
implementation does not apply migrations to a real database.

Single-novel backups seed only that novel's adoption rows, then follow finding → source
→ document version dependencies. They never traverse source → unrelated findings or
other novels' adoptions. IDs are remapped, while source-revision tokens remain stable.
If a managed image URL changes during restore, research content hashes and exact quote
offsets are repaired. An excerpt intersecting only part of an altered URL keeps its old
hash and becomes stale rather than being relabeled as verified evidence. A restored
source retains its previous freshness/staleness relationship.
