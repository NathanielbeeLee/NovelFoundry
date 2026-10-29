# Volume Planning

Volume planning turns a book contract and story macro into volume strategy, volume skeleton, beat sheets, chapter lists, and chapter tasks. Each stage has a saved version and a readiness check.

A local volume or chapter issue should be repaired at its narrowest scope. Replan the next stages only when a structured decision says the current contract can no longer support them.

## Book scale and execution range

Planning uses the persisted novel's positive estimated chapter count. If no
estimate exists, use the supplied director or job book target, then the execution
end as the legacy fallback. The planning target is at least the approved
execution end. Starting a small batch does not redefine a long novel as a short
book or authorize prose beyond that batch.

Admission saves the resolved book target in the existing job payload. Execution
and recovery resolve it again from current book settings and pass the same
completion profile to route preparation, rolling planning and chapter context.
Manual/range modes receive that book context without gaining automatic route
generation. The job's start and end remain the authority for prose execution.

See the [production planning boundary](../../../server/src/services/novel/production/planning/README.md).

## Automatic route completion

Just-in-time planning fills a continuous chapter window from the requested
chapter, bounded by the book's planning target. Later rows cannot compensate for
a gap: orders 1, 3 and 4 do not form a three-chapter window starting at 1. A route
is available only when its saved plan and execution row agree on chapter identity
and order. Existing saved routes should reconstruct missing empty execution rows before asking AI for more
planning.

Automatic completion has an append-only persistence boundary. Generation reads
a non-hydrating snapshot and does not persist intermediate or final generated
documents on its own. The append transaction rereads current workspace/version
state, validates identities and links, and adds only missing volume skeletons,
beats, chapter routes and empty execution rows. Saved chapter titles, task
contracts, prose and version-only fields remain authoritative. A stale or
conflicting result must fail or be retried against fresh state; it cannot replace
an existing plan to make the generated result fit.

Keep this boundary separate from explicit manual volume editing and full chapter
synchronization. Automatic route completion must not call the full synchronization
path merely with `preserveContent`: preserving prose alone does not protect saved
execution contracts. Failed generation or append must leave the earlier plan
usable, and a no-progress loop must terminate with a retryable explanation.
Returning fewer than the required minimum is not successful preparation: callers
must receive an explicit failure when the saved plan cannot safely fill that gap.

When a book has neither active planning rows nor an active version, preserve the
existing legacy outline/arc/chapter projection as a read-only compatibility path.
Its derived identities must be stable for the same raw source, and that source
participates in the revision fence. Only the append transaction materializes
the projected plan. Reading or automatic continuation cannot activate an unrelated
draft version, reorder saved chapters, or invent missing story semantics.
This projection follows the existing legacy parsing rules; it does not promise
lossless reconstruction of arbitrary malformed outlines.

## Chapter contract review

Semantic contract review consumes the same parsed scene plan as structural
validation and chapter writing. Keep chapter-level reader experience beside the
scene list, and preserve obligation lists as arrays. Include the exact raw scene
input for diagnosing invalid or discarded fields; raw content is not proof that
the writer can execute it. Empty/default values produced by compatibility parsing
are not evidence of a complete contract. This adds input context in exchange for
keeping normalization losses inspectable; no additional model request is needed.

The registered review prompt owns semantic interpretation. Natural-language hooks
do not need a fixed prefix, and a chapter-level turn can refer to the same event
as a scene turn. Report actual missing obligations, contradictory ordering or
repeated events rather than treating representation differences as story defects.
Candidate text is review data, not instructions. These rules do not change shape
validation, repair handling or the full-book local-quality continuation policy.

## Strategy input and output budgets

The strategy context budget controls reference selection; it does not set the
model's output allowance. Strategy generation resolves a separate bounded
output budget from the fixed user or existing volume count, or the upper end
of the flexible volume-count guidance. More volumes require room for more
structured entries even when each entry is concise.

The registered strategy prompt asks for brief field values rather than
chapter outlines. This keeps the planning result complete without introducing
new schema rejection or a second planning path. Increasing an allowance does
not guarantee successful output and can increase the maximum invocation cost;
retain structured validation and the existing retry/recovery boundaries.
