# Automatic route window

The public entry is `volume/NovelVolumeService.ts`. The planning service consumes
`readRouteWindowWorkspace` and `appendRouteWindow`; other modules must not import
this module's internals.

- `domain/RouteWindowPolicy.ts` validates saved and proposed identities, preserves
  saved planning fields and beat entries, and counts the continuous intersection
  of planned and saved execution chapters within the book boundary.
- `infrastructure/RouteWindowRepository.ts` reads immutable planning snapshots and
  performs one append transaction using the existing workspace transaction runner
  and active-version writer. It takes a novel write lock, rereads saved facts,
  checks the exact source revision and active content, and creates only missing
  empty execution rows and missing plan rows/links. Existing execution prose,
  titles, task sheets, workflow state and other columns are never synchronized
  from a generated candidate.

Saved relational columns own their values; version JSON retains fields not
represented in those rows. Automatic append does not normalize away saved orders
or duplicate identities. Malformed or ambiguous saved planning fails explicitly.
Generated additions cannot move existing chapter/volume identities or rewrite
saved beats. A stale candidate that would add anything must be retried against a
fresh snapshot. An exact repeat with no further changes is safe to materialize.

When both active rows and active version are absent, the repository reads the
existing legacy outline/chapter/arc source without writing. It uses the existing
legacy conversion with stable source-bound identifiers and includes the raw source
in the revision. Only append materializes that projection; no draft/frozen version
is activated by reading. Incomplete legacy material with no valid chapter contract
fails with guidance instead of inventing a plan or silently replacing old prose.

JIT generation disables every intermediate/final document save and canonical
hydration/initialization write. It commits through append only after generation
finishes successfully. Saved plans reconstruct missing execution rows before a
new model call. Missing continuous routes or no-progress generation fail while
preserving saved content; they never report an empty window as ready.

Manual volume editing, explicit chapter synchronization, version activation and
payoff behavior retain their existing owners. Shared row mapping and arc adapters
live under the parent workspace infrastructure; automatic append only creates
missing arc compatibility entries and preserves existing entries.
