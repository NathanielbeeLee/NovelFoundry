# Production Planning Boundary

This facade prepares rolling chapter routes before job admission and again when
an executor starts or resumes. Chapter route generation stays in the existing
planning services; this module chooses its book-scale completion profile.

For every pipeline mode, the persisted novel's positive estimated chapter count
is authoritative. If it is absent, use the supplied director/job planning target,
then the execution end as the legacy fallback. The planning target is at least
the approved execution end, so a smaller stale estimate cannot contract that
range. Execution still uses the job's original startOrder/endOrder. Only full-book
autopilot materializes rolling routes; other modes receive book-scale context
without extra route generation. A route beyond a batch does not authorize its prose.

The director supplies its stored full-book completion target independently of
the selected batch. Admission stores the resolved target in the job payload.
Execution re-resolves it from current book settings, replacing old payloads that
mistook a batch end for book size. Within one execution, the same profile feeds
pre-admission planning, rolling route extension, JIT prefetch and the chapter
runtime. Restart must preserve both the prose range and this separation.

This does not change compact/serial thresholds, quality gates, canonical state,
or local quality-debt continuation. It introduces no AI prompt or database
schema; it maps existing structured book settings into planning context.
