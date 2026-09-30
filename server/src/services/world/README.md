# World Service Boundary

The world service owns reusable world samples, structured world data, legacy
field compatibility, and the projections consumed by novel setup. It is not a
general-purpose JSON utility layer.

## Responsibilities

- **Structure domain**: normalize and validate structured profiles, rules,
  factions, forces, locations, and relations.
- **Legacy compatibility**: read older text fields and write compatibility
  projections without making legacy fields the source of truth.
- **Workspace application**: coordinate generation, persistence, snapshots, and
  user-facing world workspace operations.
- **Novel context**: expose a stable gateway for a novel's selected world
  instance; novel production must not reach into world storage internals.
- **Overview projection**: `structure/presentation/overview.ts` converts normalized
  world data into the sectioned read model used by the workspace. It does not
  normalize input or persist data.

## Structured data boundary

`worldStructure.ts` is the compatibility facade for the owned
[structured world module](./structure/README.md). Its `domain/` layer owns
normalization, empty values, entities, and binding support; `application/`
assembles blueprint seeds; `infrastructure/` adapts legacy fields and JSON;
`presentation/` formats the overview. The extracted module returns values and
does not query or write the database.

Keep `WorldService` as the workspace application owner. Its persistence,
generation, snapshots, and HTTP entry points remain separate from deterministic
structure conversion. Callers consume the structure facade or `structure/index.ts`
and must not reach into its responsibility folders.
