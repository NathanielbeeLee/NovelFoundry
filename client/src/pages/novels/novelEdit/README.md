# Novel Edit Workspace Boundary

`NovelEdit.tsx` composes the professional novel workspace through `index.ts`.
The route imports `./novelEdit/index` explicitly to avoid the route filename
shadowing the folder on case-insensitive filesystems.
The route creates one workspace controller and passes its typed slices to the
view. The module integrates existing planning, chapter, character, and director
capabilities; it does not implement a second writing or recovery engine.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `hooks/useNovelEditWorkspace.ts` | Unconditional composition in dependency order; no product decisions |
| `hooks/useNovelEditWorkspaceState.ts` | Route parameters, model selection, local forms, draft state, and selections |
| `hooks/useNovelEditWorkspaceData.ts` | Workspace and reference queries, enablement, pipeline polling, world/story integration, and saved-asset views |
| `hooks/useNovelEditVolumeWorkspace.ts` | Existing volume-planning integration, draft document, readiness, and sync previews |
| `hooks/useNovelEditVolumeVersions.ts` | Existing version-control integration and draft/version operations |
| `hooks/director/useNovelEditDirectorProjection.ts` | Requested, active, and book-projected director identity; snapshots, follow-ups, checkpoints, and refresh signatures |
| `hooks/director/useNovelEditDirectorCommands.ts` | Director commands, cache invalidation, continuation feedback, and navigation |
| `hooks/director/useNovelEditDirectorPresentationEffects.ts` | Drawer opening, retry defaults, and session-scoped dismissal preferences |
| `hooks/director/useNovelEditDirectorTakeover.ts` | Takeover and drawer action presentation using structured task/projection state |
| `hooks/useNovelEditWorkspaceSynchronization.ts` | Initialization, volume hydration, structured selection, manual stage updates, and director-driven cache refresh |
| `hooks/production/useNovelEditProductionRuntime.ts` | Existing chapter/character hooks, resource decisions, streaming lifecycles, and persisted-asset invalidation |
| `hooks/useNovelEditExport.ts` | Export mutation and scope/pending projections through the download adapter |
| `components/planning/` | Pure assembly of setup, world, volume, and structured-outline props |
| `components/production/` | Pure assembly of chapter, pipeline, and character props; callbacks delegate to existing commands |
| `components/NovelEditWorkspaceView.tsx` | Workspace shell, takeover entry, task drawer, export controls, and production-experience handoff |
| `domain/` | Pure director/continuity selectors; no React, browser, or cache access |
| `infrastructure/` | Browser download adapter; no workflow decisions |

## Dependency direction

The controller creates state, loads data, prepares volumes, projects director
state, builds commands, synchronizes persisted state, and integrates production
and export. Hooks pass values through typed input objects; they do not call
each other conditionally. The view consumes these results and assembles props
for the existing workspace components. Prop builders create callbacks but do
not perform network or browser effects during render.

Only the controller and view are exported by the facade. Callers outside this
module use `index.ts`; internal imports stay within their owned workflow area.
Existing APIs, shared selectors, and sibling workflow hooks retain their own
contracts and remain the owners of planning and chapter execution.

## Runtime invariants

- Preserve query keys, enablement conditions, polling intervals, mutation
  inputs, cache invalidation scope, and streaming completion/abort behavior.
- A manual `workspaceTaskId` remains separate from a `directorTaskId`. Book
  automation may supply a visible recovery task even without an explicit
  director id in the route. Do not substitute a manual workspace task id.
- Keep requested-task retention, canonical task synchronization, checkpoint
  actions, refresh refs, route/search parameters, and selected chapter/volume
  state consistent with the existing workflow hooks.
- A `production_experience_required` checkpoint opens the existing experience
  handoff after all workspace hooks have run. Never conditionally skip hooks.
- Local quality debt remains distinct from a global replan or runtime failure.
  UI action selection must consume the structured projection and current task.
- Session dismissal, confirmation prompts, and external follow-up navigation
  retain their existing browser behavior. New reusable browser effects belong
  in `infrastructure/`; their adapters must not classify workflow state.

## Maintenance rule

Add pure projection rules to `domain/`, reusable browser adapters to
`infrastructure/`, workflow orchestration to its focused hook, and presentation
to its owned component area. Extend shared AI/runtime contracts at their owner
before using a new decision here. Keep the route and composition hook small;
do not move unrelated decisions into a broad workspace hook or generic helper.
