# Style Prompt assets

The registry imports the stable `style.prompts.ts` facade.

- `contracts/inputs.ts` defines asset input types.
- `recommendation/` selects profiles and rules.
- `writing/` shapes prose guidance.
- `preservation/` compares the complete original and rewrite candidate without
  judging remaining prose quality.
- `extraction/` extracts structured style features.
- `curation/` enriches, names, and classifies profiles.

Keep asset IDs, versions, task types, context policies, schemas, and prompt
templates with their stage owner. Moving an asset between files does not
authorize changing its text or metadata. New product prompts still require
explicit registration in `server/src/prompting/registry.ts`.

Generation, detection, and rewrite inputs use sanitized writing guidance; the
original profile and compiled blocks remain available for inspection. The
`style.generate@v2` contract takes priority over legacy rule blocks, including
an explicitly empty result. Keep source names out of executable guidance and
preserve stable rule IDs when displaying safe catalog aliases. See the
[generation boundary](../../../../../docs/wiki/prompts/prompt-registry-and-structured-output.md#source-independent-writing-guidance).

`style.rewrite.preservation@v1` is a structured review with verbatim evidence.
It receives only the two complete manuscripts, uses no context shortening, and
rejects a pass with partial coverage or findings. Missing or ungrounded output
is unfinished, not successful. JSON repair and semantic retries are disabled;
the rewrite application owns the complete-pair size guard and deadline. It does
not rewrite prose, adopt candidates, or decide global director status. See the
[preview boundary](../../../services/styleEngine/rewrite/README.md).

`style.detection@v4` validates each finding's excerpt against the submitted
manuscript after the AI judges its prose. The quote must be a nonempty,
contiguous literal substring, including its internal punctuation and line
breaks; repeated occurrences are allowed because the contract has no position
field. Ungrounded findings fail the existing prompt execution instead of being
filtered into a misleading clean report. No extra semantic retry is added.
This validates evidence integrity, not literary quality, and does not create
a global director gate.
