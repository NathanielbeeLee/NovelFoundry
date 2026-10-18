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
