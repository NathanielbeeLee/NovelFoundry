# Novel Core CRUD Boundary

Consumers use `index.ts` or the compatibility entry `../novelCoreCrudService.ts`.
The module owns novel persistence and the existing manual chapter API. Director
execution, recovery decisions, chapter generation, and quality assessment remain
with their workflow owners.

## Responsibilities

- `application/NovelCoreCrudContext.ts`: initialize the continuation, workflow,
  and volume capabilities once per service instance, in their existing order.
- `infrastructure/NovelListQueryService.ts`: read novel lists and details, enrich
  shelf rows with task summaries, token usage, and cover assets, and select the
  latest visible task within each lane.
- `application/NovelCoreCrudService.ts`: validate and persist novel mutations,
  expose chapter reads and mutations, and coordinate their existing artifact,
  volume, and retrieval-index side effects.

The public service inherits the query capability and its dependency context.
This retains the original method names, instance dependencies, and `this`
dispatch without creating another service instance or running a query during
construction. Internal classes are not additional public entrypoints.

## Persistence and projection rules

Novel shelf queries keep `auto_director` and `creation_studio` as separate lanes.
They select the latest non-archived task per novel without hiding failed or
blocked director tasks. A live step label fills an absent task label only for
the existing queued, running, and waiting-approval states. The director query's
optional healing flag defaults to `false`; if healing is explicitly enabled and
changes state, its refresh runs once with healing disabled.

Continuation selection is validated through `NovelContinuationService` before
novel creation or update. Continuation source and analysis selections retain
their existing clearing rules. Changing the selected world clears the persisted
book-specific world slice and its overrides using the current schema version.

Novel deletion retains its transaction for failed-task archive cleanup and
novel removal, followed by the existing retrieval-index cleanup requests.
Chapter creation and update retain their original artifact synchronization,
best-effort volume workspace mirror, and retrieval-index update ordering.
Chapter removal remains limited to an empty manual chapter that has not entered
planning or writing; it must not bypass the existing content and artifact guard.

These APIs do not introduce a workflow checkpoint, promote a local quality
warning into global replan, or change generation runtime ownership.

## Manual chapter save preconditions

Every content update through this API requires raw `expectedContent` (including
null versus empty string). The persistence adapter atomically updates by chapter
id, novel id and expected prose, then reads the result inside the same transaction.
A mismatch returns 409 with current prose and timestamp; a missing precondition
returns 428. Older metadata-only callers remain compatible. Internal agent writes
must forward the source they read, not fetch a new baseline to retry a rejected
write. This protects edits since that read; agent proposal-generation freshness
is a separate upstream contract.

Only a committed update proceeds to artifact synchronization, volume mirroring
and RAG scheduling. Rejected updates must not synchronize the rejected prose.
This endpoint does not add an unconditional force-save option or change the
separate generation/polish persistence paths.
