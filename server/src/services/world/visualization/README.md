# World visualization boundary

The stable service entry is `../worldVisualization.ts`.

- `domain/` owns representation contracts, label normalization, faction edges,
  and map layout. It does not select novel workflows or call AI.
- `infrastructure/legacySourceProjection.ts` reads legacy world text fields.
- `projections/structuredWorldProjection.ts` projects persisted structured facts.
- `application/generateVisualization.ts` chooses the available world source,
  invokes the registered visualization asset, and assembles the returned view.

Legacy text projection is an existing display compatibility path. Its parsing
rules must not become intent recognition or a replacement for structured AI
planning. A visualization reads the world; it never writes world facts.

Keep fallback rendering, graph normalization, and AI asset invocation separate
so a presentation change cannot alter the persisted world or production plan.
