# Style profile boundary

Callers enter through `../StyleProfileService.ts`.

- `domain/` owns extraction contracts, source policy, and deterministic field
  normalization.
- `infrastructure/extractionLog.ts` owns extraction diagnostics.
- `application/StyleProfileGenerationService.ts` invokes registered style
  assets, enriches structured extraction, and selects enabled anti-AI rules.
- `application/StyleProfileService.ts` owns profile CRUD, public generation and
  extraction commands, and profile persistence.

Generation is an internal capability of the same profile service instance.
Keep its base out of the public facade. Prompts and schemas belong to the
Prompt Registry; normalization only validates already-structured output.
Extraction task scheduling belongs to the sibling `extractionTasks/` module.
