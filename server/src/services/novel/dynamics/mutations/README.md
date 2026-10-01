# Character dynamics mutation boundary

Callers enter through `../CharacterDynamicsMutationService.ts`.

- `infrastructure/ports.ts` describes existing context and volume factories.
- `application/CharacterDynamicsStateService.ts` rebuilds persisted dynamics
  and synchronizes chapter evidence using the injected services.
- `application/CharacterDynamicsMutationService.ts` applies public dynamics
  commands and records their downstream effects.

The mutation service inherits the state capability and its original injected
dependencies. Methods continue to execute on one instance, preserving `this`,
factory defaults, and chapter/volume side effects. The state base is internal;
outside modules should consume the mutation facade.
