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
