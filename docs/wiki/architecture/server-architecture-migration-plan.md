# Server Architecture Migration Plan

This is a boundary plan for gradually reducing service coupling while keeping
the current server runnable.

## Target ownership

- `app/`: startup and route mounting.
- `platform/`: database, LLM, events, runtime configuration, and shared
  adapters.
- `modules/`: product capabilities such as setup, planning, production,
  director, characters, state, and export.
- `services/novel/application/`: capability composition and stable application
  facades.
- `services/novel/runtime/`: chapter generation, review, repair, finalization,
  and pipeline adapters.
- `services/novel/director/`: commands, runtime, state, projections, recovery,
  automation, and phases.

## Migration rules

1. Move one coherent subsystem at a time.
2. Preserve a compatibility facade while callers migrate.
3. Keep HTTP mapping in module-owned `http/` folders.
4. Keep database writes and prompt assembly behind the owning application or
   platform boundary.
5. Verify dependency direction and run a focused type or service check after
   each phase.
6. Delete a shim only when all callers use the stable facade.

## Established capability ownership

Novel editing and comic panels compose owned hooks, domain rules, and view
components. Shared contracts live in capability folders behind existing public
package paths. Director runtime implementation folders separate execution,
state, artifacts, projections, commands, recovery, automation, and sessions.

Novel application capabilities share one dependency context. Core CRUD, volume
workspace persistence, cast preparation, character dynamics, style profiles,
and extraction tasks have explicit owners behind the existing service entries.
Comic and drama HTTP mapping uses ordered capability registrars on one router.
These boundaries preserve one production chain and one persisted state source.

## Remaining migration direction

As a capability needs substantial implementation work, move its platform calls
and HTTP mapping toward the target owners above. Keep existing thin facades
until consumers can migrate together. Do not move functioning subsystems solely
to make every path match the future top-level spelling; ownership and dependency
direction are the acceptance criteria.

## Established world boundaries

World structure uses an owned `services/world/structure/` module. Pure domain
normalization, application seed assembly, JSON adapters, and read-only overview
projection are separate responsibilities. `worldStructure.ts` keeps the stable
export surface; this module does not own persistence or HTTP mapping.

World prompt assets use inspiration, generation, structure, review, and import
folders under `prompting/prompts/world/`. The existing facade remains the
registry entry, and domain validation runs only on structured AI output.

Keep the five workspace roots (`client`, `server`, `shared`, `desktop`, `site`)
stable while these internal boundaries converge. They already separate product
roles and are referenced by build, Docker, and desktop staging contracts.

This plan does not authorize a rewrite or a new parallel runtime. Existing
routes must keep working while ownership moves underneath them.
