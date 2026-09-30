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

## Priority order

1. Novel edit composition and workflow hooks.
2. Shared director runtime contracts and comic character composition.
3. Director takeover, workspace analysis, and event projections.
4. Dense route directories and legacy novel services.
5. Cross-module deep imports and compatibility shims.

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
