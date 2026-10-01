# Volume change detection boundary

The stable entry is `../volumePlanChangeDetection.ts`.

- `domain/` owns comparison contracts, chapter field comparisons, and source
  signals derived from existing planning artifacts.
- `application/buildSyncPlan.ts` builds the synchronization plan from those
  comparisons.
- `projections/` presents plan differences and beat impact for consumers.

These are pure read/comparison paths. They do not persist workspaces, invoke
AI, or choose a second chapter production flow. Persisted version changes
belong to the volume workspace service. Keep synchronization counts, legacy
source signals, and stable chapter identity consistent across both projections.
