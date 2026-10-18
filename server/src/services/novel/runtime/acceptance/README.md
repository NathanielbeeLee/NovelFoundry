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

## Score availability and bounded review

The prompt requires a complete numeric score for successful model output. The
host result separately represents `score: null`, `scoreAvailability`, and
`scoreReason` when assessment is unavailable. Never create narrative grades from
length, prose heuristics, missing fields, or skipped review. Unavailable markers
in older numeric audit records override those numbers when reading them.
Report-only views and book quality summaries share the latest narrative-evidence
policy. A later numeric `QualityReport` alone cannot supersede an unavailable
attempt: a newer complete automatic acceptance or manual review audit must
provide the actual score. Unmarked legacy grades remain `legacy_unknown`.

An unavailable assessment retains usable prose as continuable chapter quality
debt. It does not request repair, manual approval, or replan by itself. Numeric
`QualityReport` rows are written only for completed assessments; `AuditReport`
and the chapter quality-loop record preserve unscored attempts and their reason.
Each persisted attempt replaces the complete prior automatic acceptance report
set, even when its audit categories change. Manual and other audit owners remain
intact; the runtime receives only the reports created by that attempt.
Secondary prose checking is isolated from narrative assessment: its failure is
a follow-up warning and cannot erase a valid AI score.

A pipeline chapter shares one process-local eight-request budget across
acceptance, local repair, and recheck. Only assessor and repair invocations enter
that scope; initial writing, timeline finalization, and artifact extraction do
not. Actual transport attempts, including retries and provider fallback, consume
the budget. Nested assessment scopes reuse it; an explicit new execution starts
a fresh budget. Exhaustion retains usable prose and follows the same local debt
path, and unavailable results are never reusable successful cache entries.
