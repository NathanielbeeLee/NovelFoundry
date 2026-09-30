# Contributing to NovelFoundry

Thanks for helping improve NovelFoundry. The default development branch is
`main` in [NathanielbeeLee/NovelFoundry](https://github.com/NathanielbeeLee/NovelFoundry).
Target pull requests at `main`. Desktop releases follow the version and tag
checks documented in the repository.

## Before you change code

1. Read the relevant guide in `docs/public/` and the boundary contract in
   `docs/wiki/architecture/module-boundaries.md`.
2. Check the current module owner before adding a route, prompt, state field, or
   second workflow implementation.
3. Keep API keys, private novels, backups, generated private assets, and local
   `.env` files out of commits, logs, screenshots, and issue reports.
4. For external code, prompts, assets, or data, record the source, exact
   revision, license, and notice requirements before submitting a patch.

## Development workflow

```bash
pnpm install
pnpm typecheck
pnpm check:docs-manifest
```

Use the narrowest verification that matches the change. Runtime, schema,
prompt, recovery, and cross-module changes need focused verification before
submission. UI acceptance remains a human review step.

## Pull requests

Explain the user outcome, affected modules, verification performed, and any
known limitation. Keep one coherent change per pull request when practical.
Do not include generated fiction or provider credentials in fixtures.

## Contribution terms

By intentionally submitting code, prompts, tests, documentation, assets, or
other material for inclusion, you agree to license your contribution under
AGPL-3.0-only. Submit only material that you have the right to license on those
terms, and identify any third-party material and its required notices.
