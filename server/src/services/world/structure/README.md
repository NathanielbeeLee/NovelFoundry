# Structured World Boundary

This module owns the deterministic representation of reusable world samples.
It normalizes structured data, adapts historical fields, assembles selected
blueprint seeds, and projects read models. Keeping these responsibilities
separate prevents legacy text conversion from becoming the owner of generation,
persistence, or novel-specific world context.

## Entry points

Consumers use `index.ts` or the compatibility facade `../worldStructure.ts`.
Both expose the same public functions, source type, and schema version. The
historical `../worldStructure/overview.ts` path delegates to the module facade.
New consumers must not import a responsibility folder directly.

## Responsibility map

| Owner | Files | Contract |
| --- | --- | --- |
| Domain | `fieldNormalization.ts`, `emptyStructure.ts`, `entities.ts` | Coerce fields, create empty values, normalize entities, and assign deterministic IDs |
| Domain | `normalizeStructure.ts` | Normalize the complete structure and remove references to absent forces or locations |
| Domain | `bindingSupport.ts` | Normalize or derive bounded binding-support projections from structured world data |
| Application | `seedWorldStructure.ts` | Combine a legacy seed with explicitly selected blueprint and reference assets |
| Infrastructure | `legacySourceAdapter.ts` | Interpret historical Prisma world fields as structured seed data |
| Infrastructure | `payloadCodec.ts` | Decode persisted JSON and preserve the existing malformed/empty-payload behavior |
| Infrastructure | `legacyFieldProjection.ts` | Map structured data back to compatibility fields and JSON payloads |
| Presentation | `overview.ts` | Format the sectioned workspace overview without normalizing or writing data |

The file names in the domain rows are relative to `domain/`; the remaining rows
use their named responsibility folder.

## Dependency direction

Domain code depends only on shared world contracts and other domain files.
Infrastructure adapts external record shapes and serialization to the domain.
Application code coordinates domain rules with the legacy source adapter.
Presentation consumes shared structured-world contracts. None of these layers
calls `WorldService`, Prisma clients, HTTP handlers, LLMs, or prompts.

## Preservation rules

- Structured data owns world facts; legacy fields are compatibility views.
- Keep field aliases, fallback values, collection ordering, deduplication,
  limits, metadata, and legacy text formatting stable during extraction.
- Blueprint assembly uses the selected seed IDs and sanitizes links after
  merging. It does not infer a new user intent or run a second planner.
- Historical text parsing is a format adapter. New product intent recognition
  and generation belong to registered AI prompts and application workflows.
- These functions return values only. Persistence, snapshot coordination,
  generation, and HTTP mapping stay in their existing world owners.

The focused structure checks live in `server/tests/worldStructure.test.js`.
Related callers include novel world copies, world slices, setup status,
visualization, draft generation, and the world workspace.
