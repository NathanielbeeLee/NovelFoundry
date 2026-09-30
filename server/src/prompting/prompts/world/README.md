# World Prompt Assets

This family turns world inspiration, author choices, source material, and existing
world facts into governed prompt assets. It does not execute LLM calls, persist
world data, or decide the novel workflow.

## Entry points and ownership

`world.prompts.ts` is the stable facade for the fourteen world assets. Registry
loaders and product services consume this facade. Internal files are not public
entry points.

| Owner | Responsibility |
| --- | --- |
| `inspiration/` | Reference analysis, concept cards, and concept-card localization |
| `generation/` | Property choices, layered generation, layer localization, and axioms |
| `structure/` | Visualization extraction, structure backfill, book world generation, and section completion |
| `review/` | Missing-setting questions and consistency review |
| `import/` | Source-text extraction into importable world fields |
| `domain/` | Reference-mode wording and deterministic validation of structured AI output |
| `world.promptTypes.ts` | Input contracts shared by the assets and callers |
| `world.promptSchemas.ts` | Family output schemas; world-owned schemas keep their existing owners |
| `worldDraft.prompts.ts` | The separate draft-generation entry point |

## Maintenance rules

- Add or update assets through the Prompt Registry contract. Family grouping does
  not authorize a second prompt registry or direct service-owned prompt path.
- Keep external consumers on the facade while internal responsibilities evolve.
- Output validation only checks and filters already-structured AI output. It must
  not infer author intent or select a workflow through keyword matching.
- Keep asset identifiers, versions, task types, schemas, rendered messages, and
  post-validation semantics explicit when moving an existing asset.
- A file move alone does not require a prompt version change. A behavior or
  prompt-text change follows the normal prompt versioning rules.

## Verifying a structural move

Compare each full `export const ...: PromptAsset<...>` declaration against its
pre-move source, ignoring only blank space between declarations. This comparison
covers asset metadata, prompt text, render expressions, schema references, and
post-validation calls. Compare moved domain function bodies separately, allowing
only the added `export` modifier. Then check facade export names and relative
import targets before running the server TypeScript check.
