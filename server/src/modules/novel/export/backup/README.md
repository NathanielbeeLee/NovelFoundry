# Novel backup ownership

The generated catalog is a static whitelist reviewed with each schema change.
`readBookSnapshot` seeds assets owned by the selected novel, follows forward references,
and expands only the explicit `CHILD_EDGES`. Do not enumerate arbitrary reverse
relations: shared knowledge documents, libraries and sources can serve other novels.

Research adoption is owned by `novelId`. Its finding, source and document version are
selected dependencies; source-to-finding and finding-to-adoption inverse edges must
not be added. This carries adopted and revoked research history for this book without
copying another book's choices or every finding in a shared source. Generic catalog
references remap entity IDs; revision tokens remain provenance identities. The
reference-metadata adapter repairs exact research hashes and offsets when managed
image references change, while preserving stale findings as stale.

Regenerate the catalog with `node server/scripts/generate-novel-backup-catalog.cjs`
after reviewing model ownership and dependency closure, then run the focused backup
portability fixtures. Generation reads schema files only; it never queries a database.
