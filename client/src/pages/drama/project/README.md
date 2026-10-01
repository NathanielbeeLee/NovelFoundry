# Drama Project Workspace

The existing `../DramaProjectPage.tsx` route re-exports `index.ts`. This module
coordinates the current source, strategy, episode, quality, character, visual,
and export workspaces without duplicating backend production logic.

## Owners

- `domain/dramaProjectPresentation.ts` owns tab/status labels, safe saved-JSON
  projection, strategy/score labels, and batch cost presentation. It has no
  React, browser, or API dependencies.
- `infrastructure/downloadDramaBlob.ts` owns the existing object-URL download
  effect; it does not select export format or workflow state.
- `components/ProjectProgress.tsx` presents saved production milestones.
- `components/StrategyPanel.tsx` displays the saved strategy.
- `components/episodes/EpisodesPanel.tsx` owns selected-episode draft
  hydration, episode cards, quality results, and the existing audio panel.
- `components/DramaProjectWorkspace.tsx` composes route state, enabled
  queries, the shared action mutation, cache invalidation, and existing stage
  panels. Network behavior remains in `@/api/drama`.

## Contracts

Keep project/character-library/provider query keys and enablement, episode
selection defaults, selected-provider fallback, action payloads, success
messages, invalidation scope, and export filenames intact. Draft hydration
uses the existing saved-field dependencies; do not silently change when a
draft resets. Costs display persisted batch estimates and usage, not a new
billing calculation.

This workspace delegates stage guidance to `DramaNextStepPanel` and backend
workflow results. It does not infer production actions from prose or create a
parallel planner. Outside consumers use the route/module facade; local
components may import their owned domain and browser adapter directly.
