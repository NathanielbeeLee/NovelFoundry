# NovelFoundry Introduction

NovelFoundry is an AI-assisted workspace for taking a story idea through the
planning, production, review, and recovery steps needed to complete a long-form
novel. It is built for people who may not know how to design a full outline,
track character continuity, or decide what to do after a generation failure.

## What problem does it solve?

Single-turn writing tools can produce a paragraph quickly, but a long novel
also needs durable decisions, context, chapter goals, quality checks, and a way
to continue after an interruption. NovelFoundry connects those pieces into one
observable workflow.

The AI director turns an idea into directions, book framing, world rules, core
characters, volume plans, pacing beats, and chapter missions. The chapter
pipeline generates text, reviews it, repairs local issues, and writes stable
facts back to the project for later chapters.

## Recommended first run

1. Configure one provider and a text model.
2. Enter one story idea in the creation flow.
3. Choose a direction with a clear reader promise and conflict.
4. Let the director prepare the book framing, world, core cast, and first
   chapter plan.
5. Generate the first chapter.
6. Review or repair it, then continue to the next chapter.

You do not need to understand prompts, databases, recovery terminology, or
advanced model routing before the first chapter.

## Product layers

1. **Novel completion path**: onboarding, novels, Creative Hub, director
   follow-ups, and task center.
2. **Knowledge and writing assets**: knowledge base, book analysis, style
   engine, and anti-AI rules.
3. **Setting assets**: genre library, story modes, characters, worlds, and title
   studio.
4. **Derivative workspaces**: comic and short-drama tools that consume novel
   assets after the main production path is usable.
5. **System configuration**: settings, model routes, and the prompt workbench.

## AI director and Creative Hub

Use the AI director when you are unsure what to do next. It checks the current
book state and proposes the next missing preparation or production step. The
Creative Hub is the conversational entry point for describing an intention,
asking for a focused decision, and starting an appropriate task.

Long-running operations keep checkpoints, task status, and recovery actions.
Local chapter quality issues remain visible as repair work or quality debt; a
whole-book run pauses only for an explicit replan request, unusable generation,
or a runtime or data-safety failure.

## Knowledge, retrieval, and writing profiles

A long novel needs more than a temporary prompt. The project can keep world
rules, reference analysis, character history, writing preferences, and later
constraints as reusable assets. Retrieval brings the relevant subset into each
planning or chapter task, while the writing profile and anti-AI rules help keep
the prose consistent.

## License

NovelFoundry is available under AGPL-3.0-only. See the repository's `LICENSE`
and `NOTICE` for the license text and copyright notices.

## Next reading

- [Installation and preparation](./installation.md)
- [First novel walkthrough](./playbook/first-novel-walkthrough.md)
- [End-to-end production flow](./flow/end-to-end-production.md)
- [Recovery by phase](./playbook/recovery-by-phase.md)
