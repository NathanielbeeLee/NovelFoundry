# World workspace boundary

Callers enter through `../WorldService.ts`.

- `domain/generatedLayers.ts` computes layer readiness from world fields.
- `infrastructure/WorldPersistenceService.ts` owns database CRUD, knowledge
  bindings, snapshot adapter calls, and queued retrieval indexing.
- `application/WorldService.ts` coordinates generation, layer editing,
  structure, library application, and import/export through existing services.

The application class inherits persistence capabilities on the same instance.
This preserves snapshot and indexing calls without creating another world
service or state source. Base capabilities remain internal to this module.
Snapshot restoration and indexing still use their original dedicated owners.

AI generation uses registered Prompt assets. Layer readiness is deterministic
post-processing of existing world fields, not a new planning or routing path.
