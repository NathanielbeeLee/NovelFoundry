# Module Boundaries and Documentation Governance

## Why this exists

NovelFoundry is a monorepo containing a web client, Express and Prisma
services, a desktop host, shared contracts, prompt assets, retrieval, task
execution, and long-running novel production. The main maintenance risk is
ambiguous ownership: one feature can otherwise acquire a second state source,
writer implementation, or recovery path.

This page is the durable boundary contract. Plans and checkpoints may describe
migration history, but a new change should follow the rules here.

## Product ownership model

The product follows the novel completion workflow:

```text
setup -> planning -> production -> director -> characters -> state -> export
```

Platform capabilities such as prompting, LLM access, retrieval, persistence,
events, and runtime configuration are infrastructure. They should be consumed
through explicit facades or module entry points.

| Responsibility | Preferred owner |
| --- | --- |
| Startup and route mounting | `server/src/app/` |
| Database, LLM, events, runtime configuration | `server/src/platform/` and existing platform services |
| Book setup and framing | `server/src/modules/setup/` |
| Volume, beat, chapter, and story planning | `server/src/modules/planning/` and novel planning services |
| Chapter generation, review, repair, and finalization | `server/src/services/novel/runtime/` |
| Director commands, state, projections, recovery, and phases | `server/src/services/novel/director/{commands,state,projections,recovery,phases,runtime}/` |
| Characters and world context | owned character and world modules with stable facades |
| Export and backup | `server/src/modules/export/` |
| UI route composition | `client/src/pages/` |
| UI domain rules | feature `domain/` folders |
| Browser effects and persistence adapters | feature `infrastructure/` folders |

## Boundary rules

- Keep route handlers thin. HTTP mapping belongs in module-owned `http/`
  folders as the migration proceeds.
- Keep `NovelService` and similar legacy services as compatibility facades;
  new code should use the capability layer rather than a God Object.
- The chapter writer, repair path, batch pipeline, and director execution must
  converge on one chapter runtime. A new entry point may have a different route
  or stream transport, but it must not own a second writer or repair pipeline.
- Every path that changes chapter text must finish through
  `ChapterTimelineFinalizationService`. This includes normal generation,
  repair, and degraded continuation. A replan or safety failure may stop before
  finalization.
- Timeline events, hooks, anchors, and constraints belong to the timeline
  module. Writers, routes, and UI projections consume its facade and do not
  write timeline records directly.
- Task snapshots, facts, and recovery suggestions are read paths. They must not
  append runtime events or mutate state while projecting a view.
- Heavy side effects such as character synchronization, snapshot rebuilding,
  indexing, and state recalculation belong to durable queues or dedicated
  services, not lightweight domain-event handlers.
- Add new business prompts as registered `PromptAsset` files under
  `server/src/prompting/prompts/` and register them in the Prompt Registry.
- New code should enter another module through its facade or `index.ts`, not by
  deep-importing internal implementation files.

## Client route boundary

`client/src/pages/novels/NovelEdit.tsx` remains a route-level integration
surface. It coordinates queries, mutations, director projections, chapter
execution, navigation, and the presentation shell. It must gradually become a
composition layer rather than the owner of pure rules or browser effects.

Its feature boundary is:

- `novelEdit/domain/`: pure selectors and projection rules;
- `novelEdit/infrastructure/`: downloads, storage, and other browser effects;
- `novelEdit/hooks/`: one workflow area's orchestration;
- `novelEdit/components/`: presentation and interaction;
- `NovelEdit.tsx`: cross-area composition and compatibility wiring.

When extracting code, preserve query keys, task identifiers, checkpoint
semantics, and navigation contracts first. Do not replace a large file with
unowned `utils` or `helpers` files.

## Refactoring sequence

The current high-risk files are tracked as one coherent migration sequence:

1. Extract novel-edit data selection and director projection into owned domain
   modules, then move workflow mutations into focused hooks.
2. Keep world structure behind `server/src/services/world/structure/index.ts`:
   pure normalization in `domain/`, seed composition in `application/`, JSON
   decoding in `infrastructure/`, and read-only views in `presentation/`.
   The existing `worldStructure.ts` path is a compatibility facade. World
   prompt assets live in stage-owned folders behind `world.prompts.ts`.
3. Split director takeover and workspace analysis by responsibility: analysis,
   plan construction, execution continuation, and projection.
4. Reduce high-density director directories by moving commands, state,
   recovery, and projections into their responsibility folders.
5. Delete compatibility shims only after all callers use stable facades and the
   targeted typecheck or service check passes.

Each phase should move one subsystem, preserve behavior, document a durable
boundary when needed, and make a focused verification pass. Do not combine a
large refactor with a behavior change unless the contract is explicitly being
migrated.

## Documentation layers

- `docs/public/`: current user-facing guides.
- `docs/wiki/`: durable architecture, workflow, prompt, retrieval, and product
  decisions.
- `docs/plans/`: only plans with an active implementation purpose.
- `docs/releases/`: user-visible release history.

Retired designs, checkpoints, and pre-publication history with recovery value
belong in local maintainer archives. They are not current runtime contracts.
See [repository hygiene](./repository-hygiene.md) for the publication boundary.

Use English for repository documentation and logs. Keep the maintainer-only
root task file in Chinese and local-only. Keep user-authored fiction,
reference material, and generated story text in its original language.

## Failure patterns to investigate first

- The same state is inferred independently by a task, runtime, seed payload,
  and UI cache.
- A route or director path writes chapter text without finalizing its timeline.
- A read-only projection records a resume or recovery event.
- A new prompt is inlined inside a service instead of entering the registry.
- A page or service crosses another module's internals through a deep import.
- A historical plan is treated as proof of current behavior or code provenance.

Start debugging at the fact source and module facade before adding another
conditional branch.

## Related documents

- [Chapter runtime boundaries](./chapter-runtime-boundaries.md)
- [Server architecture migration plan](./server-architecture-migration-plan.md)
- [Event side-effect boundaries](./event-side-effect-boundaries.md)
- [Provenance](../knowledge-graph/provenance.md)
- [Novel edit boundary](../../../client/src/pages/novels/novelEdit/README.md)
