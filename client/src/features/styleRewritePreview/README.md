# Style rewrite preview

The Anti-AI Rules effect-test page and Style Engine clean-prose panel consume
this capability through `index.ts`.

- `application/session.ts` owns captured request inputs, a source-bound
  detection report, mutual exclusion, abort propagation and late-result guards.
- `application/useStyleRewritePreview.ts` adapts the session to React and the
  style API. Its live input key hides stale results before effect cleanup runs.
- `domain/result.ts` validates the response and evidence against the captured
  source and candidate. Legacy or inconsistent metadata becomes unverified;
  a different original snapshot is rejected.
- `components/` displays preservation status, evidence, original/candidate
  text, and the author's next action. It never adopts or persists the candidate.

Text, selected profile, temporary rules, effective rule/profile configuration
and model selection participate in the input key. Changes invalidate both the
cached detection and the preview and abort pending calls. Requests snapshot
input before the first await; a transport that ignores abort still cannot
publish a result for an old input. Intentional Axios cancellation is silent in
the shared HTTP interceptor.

Detection scores describe the original, not the candidate. A zero-violation
report keeps the original without inventing a rewrite or a preservation pass.
Only the shared preservation result describes semantic comparison; prose
quality remains a separate judgment. Trial writing and chapter-editor flows
do not consume this module implicitly.

See the [preservation contract](../../../../docs/wiki/prompts/prompt-registry-and-structured-output.md#style-rewrite-preview-preservation).
