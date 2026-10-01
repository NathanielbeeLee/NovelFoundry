# Volume workspace boundary

Callers enter through `../NovelVolumeService.ts`.

- `domain/updateInput.ts` defines the workspace update input.
- `infrastructure/VolumeWorkspacePersistenceService.ts` owns document/version
  persistence, canonical chapter hydration, mirroring, and existing payoff
  synchronization adapters.
- `application/NovelVolumeService.ts` owns public generation, version,
  synchronization, compatibility, and workspace commands.

Persistence capabilities execute on the application service instance. They
retain the same active version, event emission, chapter matching, and payoff
ledger rules; they do not create an independent workspace or transaction path.
Keep this base internal and use the stable service entry across modules.
