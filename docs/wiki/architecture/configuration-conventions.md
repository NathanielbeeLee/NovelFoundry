# Configuration Conventions

Configuration has three scopes: safe repository defaults, local environment or desktop settings, and persisted user or project settings. Secrets stay in the secret store or local environment and never enter logs or client responses.

Provider, database, retrieval, and desktop settings must have an explicit owner, validation path, and safe fallback. Changes that affect runtime contracts need schema parity and focused verification.

## Public repository controls

The public site builds from `main`. Site deployment and desktop release
jobs require the repository variable `NOVELFOUNDRY_PUBLICATION_ENABLED=true`,
which stays unset until the independent repository is ready. The desktop
release job also requires a tag exactly matching `v` plus the stable version in
`desktop/package.json` and a repository named `NovelFoundry`. The desktop
client receives its public repository URL at build time; a missing URL hides
the GitHub link.

The desktop app ID and product name identify NovelFoundry separately from the
earlier installation. Its data directory is separate too. A prior database is
only suggested as an optional import source, so changing product identity must
never silently move, overwrite, or delete existing user data.

## Naming and stored-data compatibility

Workspace packages use `@novelfoundry/*` and public environment options use
`NOVELFOUNDRY_*`. Owned adapters accept earlier environment names when a new
value is absent. An explicitly supplied new value, including an empty string,
takes precedence. New launch arguments and browser preferences use the current
namespace.

Browser preferences migrate on read without deleting the original value. A
migration marker prevents an intentionally cleared current preference from
being imported again. Desktop preload exposes the current bridge and retains
aliases for older renderers; its sandboxed environment reader is self-contained.

Existing backup formats, drama export identifiers, retrieval collection and
database defaults, and prior desktop-data discovery remain compatibility
contracts. Renaming them requires a separate validated data migration, not a
text replacement. See [repository hygiene](./repository-hygiene.md).
