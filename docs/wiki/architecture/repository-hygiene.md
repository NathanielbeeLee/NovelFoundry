# Repository Hygiene and Publication Boundary

## Background

NovelFoundry publishes source, reproducible configuration, and maintained
documentation. Local databases, private fiction, recovery archives, generated
assets, and developer-tool state are separate from that publication surface.
File visibility does not determine whether a file belongs in source control;
its ownership and reproducibility do.

## Current rule

- Track workspace manifests, lockfiles, build scripts, source, schemas and
  migrations, tests, credential-free environment examples, and maintained docs.
- Keep `.github/` CI, site deployment, release workflows, and useful issue/PR
  templates. Keep `.npmrc`, `.nvmrc`, and ignore rules because they define a
  reproducible setup.
- Ignore local agent/editor folders, private environment files, logs, caches,
  generated build output, database files, and backup directories.
- Exclude the same private data and tooling from Docker build contexts.
- Keep the `server/src/prisma/migrations.sqlite/` directory included. Its
  suffix identifies the database provider; it contains source migrations and
  must not be hidden by a wildcard intended for SQLite database files.
- Remove assets only after checking their consumers. Preserve referenced
  guides, diagrams, application icons, and the README artwork.
- Untrack existing application data without deleting it. Destructive data
  work requires an approved, verified backup and a separate recovery plan.

## Documentation ownership

`docs/public/` describes the product for users. `docs/wiki/` owns durable design
and runtime rules. `docs/plans/` contains active follow-up work.
`docs/releases/` owns user-facing update history. Update the relevant index when
a page moves and link to a canonical page instead of duplicating it.

Temporary audits, source comparisons, handoffs, superseded plans, and recovery
evidence belong in ignored local records. Public Git history starts from the
reviewed publication snapshot. Earlier history and removed materials are kept
in verified local maintainer archives; public docs must not send readers to
unavailable pre-publication commits.

## Compatibility and attribution

The current product namespace is NovelFoundry. Earlier names are allowed only
in owned read adapters, persisted-format contracts, existing data defaults,
data-discovery paths, compatibility fixtures, and required legal attribution.
New writes and public labels use the current name.

Do not rewrite backup formats, database or retrieval names, browser state, or
old desktop paths merely to remove a string. Preserve readable user data and
verify precedence and migration behavior. Keep `LICENSE`, `NOTICE`, and
file-level copyright statements; rebuilding history does not remove them.

## Related documents

- [Configuration conventions](./configuration-conventions.md)
- [Module boundaries](./module-boundaries.md)
- [Source and license notes](../knowledge-graph/provenance.md)
- [Documentation guide](../../README.md)
