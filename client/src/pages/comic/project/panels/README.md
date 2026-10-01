# Comic Panel Workspace

`index.ts` exports `PanelsGridPanel`; the existing `../PanelsGridPanel.tsx`
entry remains its compatibility facade. The workspace combines episode
selection, grid/strip reading, saved visual scripts, and image generation.

## Owners

- `domain/panelPresentation.ts` parses stored image/layout/dialogue data and
  supplies density/reference labels and image-staleness presentation. It must
  remain independent of React, browser APIs, and HTTP adapters.
- `components/PanelsGridWorkspace.tsx` owns episode/panel/view selection,
  workspace queries, image-confirmation flow, and post-generation refresh.
- `components/StripView.tsx` presents the continuous reading layout and
  delegates selection and generation through callbacks.
- `components/PanelDetailDialog.tsx` owns the visual-script draft, its existing
  length constraint, save/save-and-generate actions, and reference inspection.
- `batch/BatchBar.tsx` owns batch estimates, job identity, interval polling,
  retry, and progress presentation.

## Contracts

Keep query keys, enablement, provider defaults, preparation previews, busy
panel identity, cache invalidation, and refetch behavior intact. Single-panel
generation goes through the shared confirmation flow. Batch generation keeps
its existing API contract, estimate freshness, 2.5-second polling interval,
completion callback, and unmount cleanup.

Saving a visual script does not regenerate its image. Save-and-generate uses
the updated panel id and closes the detail dialog as before. The staleness
indicator compares saved timestamps with its existing one-second tolerance;
it is a display rule, not a task scheduler. HTTP adapters and backend image
services remain the owners of requests and generation. Outside callers use
the facade instead of these internal presentation or batch modules.
