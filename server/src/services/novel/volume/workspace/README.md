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

## Final document ordering

The shared active-workspace persistence boundary validates volume positions
within the novel and chapter positions within each volume before reading,
parking, or writing active rows. Draft normalization already assigns unique
positions, but later canonical chapter hydration and mirroring can change those
positions again. Reject conflicting final positions with an actionable client
error; do not silently move chapter links or overwrite one plan with another.

This validation follows the database uniqueness scopes. It does not introduce
a cross-volume chapter constraint or change draft normalization. The existing
workspace transaction remains responsible for rolling back version and active
row writes together; preflight validation is not a substitute for transactions.
