# Style Prompt assets

The registry imports the stable `style.prompts.ts` facade.

- `contracts/inputs.ts` defines asset input types.
- `recommendation/` selects profiles and rules.
- `writing/` shapes prose guidance.
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
