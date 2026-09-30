# Documentation Guide

The `docs/` tree is the maintained documentation surface for NovelFoundry. It
is organized by reader intent so contributors can find the current contract
without reading historical planning material first.

## Documentation layers

### Public documentation: `docs/public/`

User-facing installation, product, workflow, troubleshooting, and module
guides. These pages should describe the current product in clear English and
should not expose internal implementation names unless they help a user take
the next action.

### Architecture and product knowledge: `docs/wiki/`

Durable rules for module ownership, workflow boundaries, prompt governance,
state contracts, RAG context assembly, debugging, and beginner-first product
decisions. A Wiki page should explain why a rule exists and how to maintain it.

### Active plans: `docs/plans/`

Only plans that still have an active implementation purpose belong here. A
completed plan should become a concise decision record; superseded plans are
removed from the maintained tree and retained in local maintainer archives
when they have recovery or provenance value.

### Local historical evidence

Pre-publication history and retired documents are held in local maintainer
archives, outside the published tree. Public Git history starts at the reviewed
publication snapshot. Current source, Wiki contracts, and attribution notices
are the maintained evidence; an archive is not a current implementation guide.

### Release history: `docs/releases/`

The complete user-facing release history. The root README only shows the
latest update block.

## Maintainer entry points

- [Public introduction](./public/introduction.md)
- [Installation](./public/installation.md)
- [End-to-end production flow](./public/flow/end-to-end-production.md)
- [Knowledge graph](./wiki/knowledge-graph/README.md)
- [Module boundaries](./wiki/architecture/module-boundaries.md)
- [Repository hygiene](./wiki/architecture/repository-hygiene.md)
- [Project handbook](./wiki/project-handbook.md)
- [Beginner onboarding flow](./wiki/product/onboarding-flow.md)
- [Public site design](./wiki/product/public-site-design.md)
- [Testing foundations](./wiki/architecture/testing.md)
- [Release notes](./releases/release-notes.md)

## Writing rules

- Use English for repository documentation, logs, plans, and public product
  copy. User-authored novel content and model output keep their original
  language.
- Use lowercase English filenames with hyphens.
- Prefer one canonical page per durable rule. Link to it instead of copying a
  second plan or checklist.
- Do not add per-commit file lists, temporary TODOs, or implementation
  narration to the Wiki.
- Update the relevant index when a document moves or is consolidated.
- Keep source and license provenance explicit when a third-party mechanism,
  code, prompt, or asset is used.
