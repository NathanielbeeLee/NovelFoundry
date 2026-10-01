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
Style findings remain local chapter guidance; they do not trigger a book-level
replan unless the structured workflow decision explicitly requires one.

Whole-book review can identify repeated narrative shapes across chapter
openings, endings, and summaries. It must cite the affected chapters and keep
its conclusion within the evidence supplied to the range and synthesis prompts.
An absent mention of a foreshadowing thread in one range is insufficient to
declare it lost. Reviews may propose future guidance, but do not silently
rewrite chapters or turn a local style issue into a global stop.

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
