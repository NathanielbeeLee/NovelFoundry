# Style rewrite preview preservation

## Ownership

`StyleRewriteService` prepares sanitized style guidance and produces a candidate
with `style.rewrite`. It consumes this module through `index.ts` to compare the
complete original and candidate with `style.rewrite.preservation@v1`.

- `application/` invokes the registered AI comparison, propagates cancellation,
  bounds the comparison lifetime, and maps its outcome to the shared contract.
- `domain/` owns resource limits and unfinished-review guidance. It does not
  classify story meaning, style quality, or user intent.
- Prompt input, schema, semantic instructions, and evidence grounding belong to
  `server/src/prompting/prompts/style/preservation/`.
- The style HTTP route owns request cancellation. The client owns display and
  invalidation of previews when their input or selected configuration changes.

## Result boundary

`content` remains the candidate for existing API consumers. `originalContent`
retains the exact submitted text; nonblank validation must not trim it.
`preservation` describes a complete comparison, detected changes, or an
unfinished check. An HTTP success is not a preservation pass or an adoption.

A pass requires a complete AI review with no findings. Definite changes require
verbatim evidence anchored in the corresponding manuscript. Partial and
uncertain reviews, missing or invalid output, over-budget input, model failure,
timeout, and cancellation never become a pass. Missing-side excerpts are valid
for additions or omissions; altered information requires both sides.

The combined pair is limited to 24,000 JavaScript string units, and neither side
is truncated. The prompt also checks its fully rendered input budget and caps
output at 2,600 tokens. The comparison has a 60-second deadline and forwards its
abort signal to the model adapter. JSON repair and semantic retries are disabled
for this prompt. A failed comparison preserves the original and candidate for
inspection; an empty rewrite itself is a generation failure.

## Workflow scope

This check protects `POST /style-detection/rewrite`, used by the Anti-AI Rules
effect-test preview and the Style Engine clean-prose preview. It does not write
a chapter or adopt the candidate. The
original-text style report does not score the candidate; expression quality
and semantic preservation are separate judgments.

Do not activate the unused post-generation style runner, extend trial-writing
or chapter-editor contracts implicitly, or feed preview outcomes into director
replanning or chapter acceptance. Other workflows need their own explicit
integration and adoption policy.

See the [Prompt Registry contract](../../../../../docs/wiki/prompts/prompt-registry-and-structured-output.md#style-rewrite-preview-preservation).
