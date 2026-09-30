# Knowledge and Retrieval

The knowledge base, book analysis, style engine, world samples, and character
assets are durable inputs to planning and chapter execution. They are not one
undifferentiated context pool.

## Asset roles

| Asset | Purpose | Typical stages |
| --- | --- | --- |
| Knowledge documents | Research, settings, references, uploaded material | Planning, analysis, Creative Hub, chapter execution |
| Book analysis | Structure, character, hooks, pacing, and writing observations | Direction, style reference, chapter context |
| Style profiles | Narrative style, language rules, anti-template guidance | Writing, review, repair |
| World samples | Rules, factions, locations, and boundaries | World setup, chapter context |
| Character library | Base identity, visuals, and relationships | Cast preparation, writing, comic workspace |
| Facts and payoff ledgers | Established events, promises, and unresolved payoffs | Writing, review, state feedback |

## Trust order

1. Book facts already written and finalized.
2. Book planning contracts and chapter tasks.
3. User-provided references and setting material.
4. Analysis of reference works.
5. Style rules and samples.
6. Temporary conversation input.

A reference document can supplement the book, but it must not overwrite an
established book fact. Temporary conversation input affects the current task
until it is explicitly saved as a project asset.

## Where retrieval is used

- Direction may use analysis or reference summaries to understand genre and
  reader expectations.
- Book framing and volume planning primarily follow the confirmed direction and
  book contract.
- World and character setup may retrieve samples and existing assets.
- Chapter execution uses task-driven retrieval. The context assembler creates
  queries from the chapter goal and selects the relevant fragments.
- Review and repair consume the chapter runtime package, review issues, and the
  same scoped context.

## When recall fails

Check that the document was indexed, the vector store is reachable when
configured, the document is eligible for recall, and the search scope is not
too narrow. Uploading a file alone does not make it available to generation.
