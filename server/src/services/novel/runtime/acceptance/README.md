# Chapter Acceptance Identity

The public chapter runtime and `ChapterAcceptanceAssessmentService` retain
orchestration and audit persistence. This module owns acceptance prompt
preparation and persisted-result validation. Callers consume its `index.ts`.

## Reuse contract

The quality gate prepares the real review context and registered prompt before
looking up a result. The same prepared prompt and model plan are passed to the
assessor on a miss. Identity includes the final messages, selected context,
chapter and book inputs, prompt version, schema, context policy, effective model
configuration, all supported structured attempts, repair, fallback, and an
explicit acceptance result-policy revision.

`ACCEPTANCE_RESULT_POLICY_VERSION` must change when schema preprocessing,
shared parser normalization, assessment normalization, prose findings, or audit
mapping changes semantically without a new prompt version. JSON Schema cannot
describe those functions. Never substitute a content-only or raw-request key
when preparation cannot produce a verifiable identity.

`ChapterQualityGateService` keeps pending work in a separate unbounded in-flight
map until it settles. The bounded completed cache cannot evict a pending call.
The pending promise covers persistent lookup, invocation, and cache write.
Unavailable assessments and rejected calls leave no reusable success entry.

## Persistence and failure boundaries

Version 2 uses a `prepared_v2_` sync mode and checks the full identity and result
contract. Older checkpoints remain intact but are cache misses. A malformed
result is a miss, and cache storage failures remain fail-open.

The optional `prepare` port supports custom assessors. Without a prepared
identity, an assessor remains callable but receives no cache reuse. Recoverable
AI failures can still produce local warnings; cancellation, unknown runtime
failures, and audit persistence failures keep their normal recovery semantics.
