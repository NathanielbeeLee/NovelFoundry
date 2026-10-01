# Character cast preparation boundary

The stable entry is `../CharacterPreparationService.ts`.

- `application/contracts.ts` owns generation and cast application options.
- `application/CharacterCastContextService.ts` reads book, story mode, and world
  facts and builds registered generation context.
- `application/CharacterPreparationService.ts` coordinates generation, quality
  repair, persistence, cast application, and post-application enhancements.
- `domain/memberValues.ts` normalizes optional persisted values.
- `projections/castOptions.ts` serializes stored candidates and their assessment.

The context capability uses the same WorldContextGateway as supplemental
generation. It adds no state, constructor side effect, or separate AI route.
Keep quality checks and optional/background/deferred enhancements in the
application owner so candidate display cannot change acceptance behavior.
