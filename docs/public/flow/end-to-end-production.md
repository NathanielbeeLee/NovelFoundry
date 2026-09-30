# End-to-End Production

This page maps the path from one idea to a ready chapter batch and then to
chapter execution. Read it before the detailed director and chapter guides.

:::tip Recommended reading order
Start here, then read [AI director pipeline](./auto-director-pipeline.md),
[Chapter execution](./chapter-execution.md), and [Knowledge and retrieval](./knowledge-and-rag.md).
Use the [First novel walkthrough](../playbook/first-novel-walkthrough.md) when
you want to operate the product directly.
:::

## Three production layers

| Layer | Goal | Inputs | Main artifacts | Common entry points |
| --- | --- | --- | --- | --- |
| Idea | Turn an unclear idea into book directions | Premise, genre preference, reader promise, model | Direction candidates, title candidates, book framing | Getting Started, Creative Hub, director direction page |
| Director | Turn a confirmed direction into executable assets | Candidate, run mode, approval policy | Novel, book contract, story macro, world, cast, volume plan, beat sheet, chapter list, chapter tasks | Director Follow-ups, novel workspace, Task Center |
| Chapter execution | Generate prose and feed stable state back | Chapter task, context package, retrieved assets, style, character state | Draft, review, repair result, quality debt, fact and payoff updates | Chapter page, Task Center, Director Follow-ups |

## Layer boundaries

- Direction confirmation creates a project; a casual chat preference does not
  become a persisted novel fact until confirmed.
- The director hands work to chapter execution through a chapter batch-ready
  checkpoint. Writing should not start without a chapter task.
- Chapter execution writes stable facts, character state, and payoff status back
  to the project. Later chapters consume those records instead of asking the
  user to repeat the previous chapter.

## Production modes

- **Prepare until ready to write** is recommended for a first book. It prepares
  the project and stops before prose production.
- **Complete the book automatically** continues through writing, review, repair,
  and state feedback until the target range completes or a safe pause occurs.
- **Run a selected range** limits work to the book, a chapter range, or a volume.
- **Review and repair after writing** adds the quality loop to another mode.

If you are unsure, prepare to write first. This gives you a chance to inspect
the plan before spending a larger model budget.

## Resumability

Every long-running stage keeps task state and a checkpoint. A provider failure,
quota stop, repair failure, or explicit replan request should lead to a visible
recovery action. Local quality debt remains repairable and does not by itself
stop the global book chain.
