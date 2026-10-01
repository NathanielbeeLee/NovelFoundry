# Shared Contracts

This workspace contains the contracts consumed by the web client, server,
desktop host, and documentation site. It owns serializable types, structured
output schemas, immutable catalogs, and deterministic operations on those
contracts. It does not own application orchestration, database access, LLM calls,
browser effects, or workflow execution.

## Stable entry points

- `index.ts` preserves the package-level exports.
- `types/*.ts` preserves established capability import paths. A compatibility
  file may be a one-line facade; business declarations belong under an owned
  capability directory.
- `imagePrompt.ts` and `utils/bookAnalysisTimeline.ts` retain their existing
  public paths.

The package export map remains the public contract. Moving an implementation
does not require clients to change import paths or authorize a new public API.

## Capability ownership

| Directory | Responsibility |
| --- | --- |
| `types/platform/` | API envelopes, model selection, live LLM execution, and pagination |
| `types/agents/` and `types/tasks/` | Agent contracts, task observation, and task recovery references |
| `types/creation/` | Creation studio, Creative Hub, onboarding, project framing, and writing-platform preferences |
| `types/novel/` | Project, chapter, editor, shelf, planning, production, version, review, and model-route contracts |
| `types/director/` | Director sessions, runtime facts, projections, commands, approval, and recovery |
| `types/planning/` | Story macro plans, route forecasts, volume planning, beat slots, and replan decisions |
| `types/production/` | Chapter obligations, length plans, patch repair, quality loops, task sheets, and polish history |
| `types/chapterRuntime/` | Runtime source snapshots, context policies, writing/review/repair contexts, acceptance, and package schemas |
| `types/characters/` | Cast, profiles, dynamics, conversation, dialogue, mind, resource, and synchronization contracts |
| `types/state/` | Canonical state, timeline, payoff ledger, and proposal resolution |
| `types/world/` | World library, book world, generation wizard, and chapter world slices |
| `types/style/` | Style rules, extraction, profiles, bindings, reviews, intent summaries, and deterministic rule policies |
| `types/library/` | Book analysis, knowledge documents, story modes, writing formulas, and titles |
| `types/export/` and `types/media/` | Novel backups, export requests, images, and visual assets |

The flat `types/` directory is a compatibility surface, not an implementation
directory. Its existing filenames remain to preserve the package's wildcard
export map. New declarations extend the narrowest capability module and an
existing facade rather than adding another business implementation at the root.

## Director ownership

| Directory | Responsibility |
| --- | --- |
| `types/director/session/` | Candidate creation, execution plans, quality budgets, takeover, session locks, and task seed contracts |
| `types/director/runtime/` | Artifact identity, step facts, events, policy, usage, commands, workspace analysis, and canonical runtime snapshots |
| `types/director/runtime/projections/` | Runtime, book automation, display, dashboard, and task read models |
| `types/director/workflow/` | Workflow stages, checkpoints, milestones, and resume targets |
| `types/director/workflow/catalog/` | Step identities, ordered catalog data, checkpoint data, and catalog queries |
| `types/director/approval/` | Approval settings and deterministic approval-boundary checks |
| `types/director/recovery/` | Follow-up and recovery validation contracts |

## Dependency rules

- A capability's implementation imports its owned declarations directly. It
  must not import its own public facade or the package-wide index.
- Other capabilities consume the existing stable capability paths. Do not
  introduce cross-capability deep imports to shorten an import.
- Use type-only imports when a dependency is needed only for a declaration.
  Runtime schemas and catalogs must not acquire circular initialization paths.
- Keep schema defaults, catalog order, enum values, and deterministic behavior
  unchanged during a structural move. A semantic change requires its own
  focused review and verification.
- When private schema primitives must be shared between owned files, export
  them internally and keep them out of the public facade. Moving a schema must
  preserve both its initialization dependencies and the public export set.
- Runtime state and read projections have different owners. A projection
  describes existing facts and does not create a second workflow state source.
- AI intent remains an application concern. Shared guards validate inputs or
  already-structured output and do not add keyword-based product routing.

## Verification

Run the shared TypeScript check after each coherent capability move. Compare the
complete moved declarations, exported names, runtime function bodies, schemas,
and catalogs with the source snapshot. Check both facade targets and runtime
dependency direction before relying on a client or server build.
