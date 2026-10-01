# Prompt workbench boundary

Callers enter through `../PromptWorkbenchService.ts`.

- `application/` owns public preview/test contracts and context/execution
  orchestration.
- `catalog/` projects registered assets and filters the catalog.
- `projections/` serializes messages, diagnostics, and reference suggestions.
- `infrastructure/previewAssets.ts` resolves registered assets and saved/draft
  template adapters.
- `previewContextBuilder.ts` preserves the existing preview fact assembly.

Catalog and reference projections are read paths. Preview prepares context
without redefining the production Prompt Registry. Test-run uses the original
execution path and accounting; slot overlays and template diagnostics retain
the same precedence. Relative dynamic/type imports must be relocated with the
owning implementation file.
