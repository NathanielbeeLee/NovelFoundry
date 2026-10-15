# Prompt Registry and Structured Output

The Prompt Registry is the only product-level entry point for new prompts. A
registered `PromptAsset` declares an id, version, task type, mode, context
policy, slots, and output schema when structured output is required.

## Rules

- Add prompts under `server/src/prompting/prompts/` and register them in the
  registry.
- Keep prompt rendering separate from database access. Context Broker and
  resolvers assemble context blocks.
- Use structured schemas and post-validation for planning, routing, quality,
  and state decisions. Do not hide an AI capability miss behind keyword or
  regex fallback.
- JSON repair is a bounded adapter, not a second business prompt path.
- Prompt Workbench edits registered slots and controlled templates. It cannot
  override task type, schema, context policy, approval boundaries, or required
  context.
- Required context must be resolvable by the default broker or explicitly
  supplied by the real runtime. Preview-only example blocks cannot replace
  runtime context.
- Official prompt versions are code-owned. Database overrides are scoped,
  versioned, and reversible; restoring official defaults is an explicit action.

## Chapter artifact representation boundaries

`novel.chapter.artifact_delta.extract@v3` accepts JSON numeric strings for
character-mind confidence only when the existing required 0..1 number schema
accepts the decoded value. Missing confidence, percentages, labels, booleans,
non-finite values and out-of-range values remain validation failures. Do not
invent a default confidence or silently discard the affected extraction.

Foreshadowing state accepts explicit `foreshadowTitle`, `name` or `label` when
`title` is absent or blank. A valid canonical title takes precedence; a
malformed explicitly typed title remains an error. Keep the full supplied clue
identity: do not truncate it, synthesize a placeholder, or treat a summary as a
title. This is bounded representation normalization of structured AI output,
not a semantic inference or a second decision path. Existing source freshness,
canonical transactions and chapter quality-debt rules still own persistence.

## Verification

A structured prompt check should confirm schema validity, post-validation,
repair count, missing required groups, and diagnostics. A text prompt check
returns generated text but must not write a novel, advance a director, or
replace the formal chapter runtime.

## Natural prose in chapter production

Naturalness belongs to the existing writer, style detection, and style rewrite
prompts. The writer should avoid empty setup, repeated sentence shapes, and
generic conclusions while following the chapter mission and selected style
contract. Detection is an AI judgment over the whole passage and its context;
rule wording guides the review, while literal pattern matches cannot decide
that a passage is clean or defective on their own.

Review a candidate issue against the genre, character voice, scene purpose,
and repetition in the passage. A three-item list, idiom, short sentence, or
punctuation mark is not evidence of poor prose by itself. These signals do not
identify whether a human or model wrote the text. A clean passage can remain
unchanged.

When rewriting, retain the event sequence, character relationships, point of
view, uncertainty, and established world facts. Fix the affected span with the
smallest useful edit. Do not invent details to make prose seem concrete or
flatten an intentional literary voice into generic conversational language.

`style.detection@v4` requires every finding's excerpt to occur verbatim in the
submitted manuscript. A missing or paraphrased quote fails post-validation;
never remove that finding and return a clean assessment. The check only grounds
the AI's evidence: prose quality, narrative function and rewrite suitability
remain structured AI decisions. Detection failures remain explicit errors and
can be retried by the user rather than becoming a zero-risk result.

Style findings remain local chapter guidance; they do not trigger a book-level
replan unless the structured workflow decision explicitly requires one.

Whole-book review can identify repeated narrative shapes across chapter
openings, endings, and summaries. It must cite the affected chapters and keep
its conclusion within the evidence supplied to the range and synthesis prompts.
An absent mention of a foreshadowing thread in one range is insufficient to
declare it lost. Reviews may propose future guidance, but do not silently
rewrite chapters or turn a local style issue into a global stop.

## Style rewrite preview preservation

The Anti-AI Rules effect-test preview and Style Engine clean-prose preview
compare the full original and rewrite candidate through
`style.rewrite.preservation@v1`. This is an independent AI
judgment of established facts, relationships, event and reveal order,
foreshadowing, uncertainty and character knowledge, and narrative intent. It
does not grade naturalness or claim to prove absolute semantic equivalence.
Literal quotation checks only ground the AI's evidence in the supplied text;
they are not keyword-based semantic decisions.

The shared preview contract retains `content` as the candidate, adds the exact
`originalContent`, and returns one preservation status:

| Status | Meaning and handling |
| --- | --- |
| `preserved` | Complete AI comparison with no semantic-change findings; still a preview for the author to inspect. |
| `changed` | Definite changes with grounded evidence and guidance; retain the original as the trusted text. |
| `unverified` | Partial or uncertain review, unavailable or invalid output, input limit, timeout, or cancellation; never display this as a pass. |

Limit the complete pair to 24,000 JavaScript string units. Never slice either
manuscript to fit and then return a full-coverage result. The asset additionally
guards its rendered input at 12,000 estimated tokens and caps output at 2,600
tokens. The comparison has a 60-second deadline, no JSON repair or semantic
retry, and propagates the shared abort signal to the adapter. A comparison
failure preserves the candidate and original for review; generation with no
usable candidate fails instead.

HTTP success means the preview is available, not that preservation passed. The
client binds reports and previews to captured source text, rules, profile and
model selection, aborts invalidated requests, and rejects late responses. A
content-only legacy response is unverified. The original-text detection score
must never be presented as the candidate's quality score. No detected issues
means keep the original, not fabricate a successful rewrite assessment.

This contract applies only to `POST /style-detection/rewrite`. It writes no
canonical content, does not change trial writing or chapter-editor rewriting,
and does not activate an old production style runner. Preview findings never
enter global director replanning, chapter acceptance, or a second production
loop. See the [owned module boundary](../../../server/src/services/styleEngine/rewrite/README.md).

## Source-independent writing guidance

Style profiles may contain reference titles, names, and examples. Keep those
original assets and compiled contracts for inspection and attribution, but use
`sanitizedGenerationProfile.writingGuidance` for planning, chapter writing,
review, repair, style previews, and rewriting. Feeding the original rules into
any later model call can reintroduce reference identities through its advice.

`resolveStyleGenerationProfile` preserves an existing AI-produced profile. Its
deterministic safety guard redacts known references and a bounded set of title
and designation patterns; it is not complete semantic entity recognition. New
semantic extraction belongs in the registered style sanitation prompt, not in
additional name-matching heuristics.

`ChapterWriteContext.styleGenerationGuidance` carries the generation-only text
without replacing the inspectable contract. An explicit empty result must not
fall back to original rules. Older payloads without the field sanitize their
available contract before rendering; they have no additional source evidence
beyond that contract. Style detection uses unique safe catalog aliases while
mapping results back to stable rule IDs and their original severity and rewrite
permissions. Rewriting redacts known source references in review guidance and
keeps the actual manuscript as the text to edit.

## Cancellation and repair budgets

Structured invocation errors retain their causes. Explicit cancellation stops
strategy retries, JSON repair, and fallback-model invocation; review and repair
must not convert cancellation into a successful fallback assessment.

The structured-output `usage_budget_exceeded` category describes the bounded
JSON repair allowance of one call. It does not mean that the book's token
budget is exhausted. The director's token-budget service enforces the latter
at chapter boundaries. Keep these decisions separate from quality debt and
explicit replanning.

## Prepared identities

Use `prepareStructuredPromptExecution` and `runPreparedStructuredPrompt` when
cache reuse must bind the actual call. Preparation finishes context selection,
slot overlays, rendering, output hints, and supported advanced templates, then
resolves a model plan. Execution consumes the same messages, schema, inputs,
context, and model snapshots. Semantic retries and JSON repair keep that model
plan; they do not load changed provider or prompt settings mid-call.

The identity covers the prompt version, schema shape, context policy, effective
messages and model behavior, including optional fallback and repair paths.
Function semantics such as schema preprocessing and result normalization need
an explicit version owned by the result consumer. An unrepresentable schema or
unresolved optional model path disables reuse while preserving execution.
Preparing an invalid optional fallback must not block a healthy primary.

Only opaque identity digests may be persisted with a result. Prepared plans
contain credentials in memory and must never enter checkpoint metadata or logs.
Preparation is a configuration/read step; live-call telemetry and success
records belong to actual execution. Supported template scope remains controlled
by Prompt Workbench; a shared preparation API does not enable templates for
every prompt family.

## Manual review and adopted research

`audit.chapter.manual_evidence@v1` is used by explicit manual review endpoints.
It requires complete AI scores and separate explanations, verbatim quotes,
reading impact, counterevidence and confirmed/hypothesis/deferred/keep decisions.
The host grounds each quote in the exact input snapshot; it does not decide
literary quality. Missing or ambiguous evidence stays advisory, and cannot enter
repair as a confirmed finding. HTTP contracts preserve this metadata; repair
checks source hash and positions again, including saved audit issue selections.
Manual report failure never falls through to rule-generated scores. Automatic
acceptance and whole-book synthesis keep their own contracts.

`knowledge.research.extract@v1` reads one complete bounded document. It produces
up to five supported findings with exact quotes and uncertainty. Source metadata
and manuscript text are untrusted material, not model instructions. Prompt
contracts load through a pure public entrypoint without database initialization
or route registration. Only explicit author adoptions from fresh sources enter
the protected `research_anchors` context block; they remain external research
references rather than canonical story facts. See the
[research adoption workflow](../workflows/knowledge-research-adoption.md).
