# Testing Foundations

The main business tests live under `server/tests/` and use Node `node:test` with `node:assert/strict`. The default test command builds shared and server packages before running the fast group.

## Commands

```bash
pnpm test
pnpm --filter @novelfoundry/server test
pnpm --filter @novelfoundry/server test:integration
pnpm test:all
pnpm test:client
```

Use focused tests for runtime, prompt, schema, recovery, and cross-module changes. The repository typecheck, lint, schema parity, and docs manifest checks are complementary gates.

Tests should use deterministic fixtures and must not depend on real model calls or private novels. Destructive database checks require the same backup and restore safeguards as development operations.

## Disposable SQLite setup

Initialize a new temporary SQLite file before applying a Prisma schema. The
schema engine can fail without a useful diagnostic when the target file does
not exist. An empty SQLite file with `user_version = 0` provides a stable
fixture; apply the schema only to that test-owned path. Never replace a real
database to make a test or first-run setup pass. The development preparation
script likewise initializes only missing files and leaves existing ones alone.
