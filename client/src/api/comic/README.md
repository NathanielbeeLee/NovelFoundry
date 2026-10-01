# Comic Client API Boundary

The stable public entry is `@/api/comic`. `../comic.ts` re-exports this module's
`index.ts`, preserving every existing DTO and function name. UI callers must
not depend on individual contract or adapter files.

## Contracts and adapters

`contracts/` owns client-side HTTP shapes:

- `core.ts`: projects, characters, episodes, panels, facts, and setup/export
  payloads.
- `characters.ts`: design/expression data, visual anchors, and character
  asset payloads.
- `generation.ts`: preparation previews, generation overrides, and batch
  progress/cost payloads.
- `scenes.ts`: scene descriptions, images, and editing payloads.

`infrastructure/` owns one request family per adapter: projects, characters,
episodes, panels, exports, batches, facts, character assets, and scenes. Each
uses the shared `apiClient` and imports DTOs from contracts. Contracts never
import request adapters, React, or workspace state.

## Compatibility rules

Preserve HTTP methods, paths, public image URL builders, provider omission,
payload spread order, upload content type, default payload objects, response
unwrapping, and export result types. Distinguish image preparation from actual
generation; their endpoint and response contracts are separate. These adapters
do not infer intent, select workflow actions, repair JSON, or classify failures.
Structured AI decisions and image execution remain backend responsibilities.
