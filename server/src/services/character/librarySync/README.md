# Character library synchronization boundary

The stable entry is `../CharacterLibrarySyncService.ts`.

- `domain/records.ts` defines library and novel-character projection records.
- `domain/syncProjection.ts` owns normalization, copied fields, and conflict
  comparisons without database access.
- `application/CharacterLibrarySyncService.ts` owns directional synchronization,
  link/version checks, persistence, and the existing singleton.

The library and novel character remain distinct records linked by the original
sync contract. A display comparison must not update either record or silently
resolve a conflict. Preserve version checks and the caller's sync direction.
