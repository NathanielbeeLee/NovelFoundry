# Beginner Onboarding Flow

This document defines the product flow that should help a first-time author
reach a readable first chapter with the fewest decisions possible. It is a
product contract, not a list of UI implementation tasks.

## Desired outcome

The user should understand what to do next without knowing story structure,
prompt design, model routing, database state, or recovery terminology. The
first successful milestone is a saved, readable first chapter with its review
and continuity state attached.

## Flow

```text
Environment ready
  -> One idea
  -> Direction choice
  -> Book framing
  -> World and core cast
  -> Volume and chapter plan
  -> First chapter
  -> Review and repair
  -> Continue or switch to assisted editing
```

## Stage contracts

### Environment ready

The system checks whether a provider, model, base URL, and structured output
path are usable. If not, it offers one guided setup action. It should not send a
new user into advanced routing configuration before a first successful test.

The shared header shows the current text model and opens provider, model, and
temperature choices in one settings dialog, with a direct provider-configuration
entrypoint. Global provider validity is maintained independently of whether this
dialog is open: after configuration changes, an unavailable selection moves to
an available provider while retaining response settings. Failed configuration
reads or an empty provider list must not silently erase the current selection.

### One idea

The user can describe an idea in natural language. The system extracts the
minimum information needed to offer directions and asks focused follow-up
questions only when a missing choice would change the result.

### Direction choice

The system presents a small set of clearly different directions with a title,
reader promise, central conflict, and reason to choose. Confirming a direction
creates the novel project and a resumable director task.

### Book framing

The system records the intended audience, emotional promise, early chapter
commitments, boundaries, and writing profile. These become durable context for
later planning and production.

### World and core cast

The system prepares only the world rules and characters needed to begin. The
user can inspect or correct them, but is not required to author a complete
encyclopedia before the first chapter.

### Volume and chapter plan

The director converts the book framing into a volume strategy, pacing beats,
chapter list, and chapter mission. The first chapter must have a clear purpose,
participants, continuity context, and reader-facing movement.

### First chapter

The system generates, reviews, repairs, saves, and indexes the chapter through
one production chain. Partial output is preserved when a provider stops or a
task needs recovery.

### Review and repair

Local quality debt remains visible and repairable without blocking the whole
book. Only a clear replan request, unusable generation, or data and runtime
safety failure should stop the global chain.

## Product guardrails

- Keep advanced controls available without making them prerequisites.
- Explain the next action from the user's perspective.
- Show the current result and the reason for a pause in plain language.
- Preserve user content before repair, retry, export, or migration.
- Keep fictional content, reference material, and project facts in separate
  context scopes.
- Treat every stage as resumable and observable.
- Give manuscript reading and editing priority over auxiliary panels. Keep save
  status and conflict recovery reachable in compact windows, and preserve the
  editor instance when panel layout or viewport size changes. See the
  [chapter editor ownership rules](../../../client/src/pages/novels/components/chapterEditor/README.md).
