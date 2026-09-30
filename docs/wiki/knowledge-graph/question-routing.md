# Question Routing

This table helps maintainers and AI agents find evidence. It is not product
intent routing and it does not participate in user decisions.

## First route by question

| Question | First source | Then inspect |
| --- | --- | --- |
| How do I use it? | Matching `docs/public/` page | Current route and UI |
| Is it supported? | Capability catalog | Code, schema, and route |
| Why is it paused or failing? | Task Center and Director Follow-ups | Workflow and debugging Wiki |
| Why is it designed this way? | Relevant durable Wiki page | Design records and project rules |
| Where is data stored? | Prisma schema and write path | Runtime/state contract |
| Which file should change? | Capability owner | Facade, HTTP entry, and callers |
| What copyright notices apply? | Source and license notes | Git history, LICENSE, NOTICE |

## High-signal diagnosis

- A page that looks stale does not prove that the worker stopped. Check task
  state, runtime snapshot, and the director task id.
- A waiting state may be an approval checkpoint rather than a failure.
- A restarted service may leave a stale lease; use recovery instead of rerunning
  a full book.
- A usable chapter with a failed side effect should preserve prose and retry the
  synchronization job.
- A local audit issue should become quality debt, not an automatic global
  replan.

## Context and prompt questions

| Symptom | Inspect |
| --- | --- |
| Model list fails | Base URL, `/models`, `/v1/models`, permissions, and manual model fallback |
| Normal output works but structured output fails | Probe result, schema, model capability, repair telemetry |
| Responses route calls Chat Completions | Explicit task protocol, provider default, and LLM factory |
| Prompt misses fields | Prompt id/version, schema, required context, repair and semantic retry |
| A new prompt is inline in a service | Prompt Registry and approved exception list |
| Retrieval returns nothing | Active version, indexing, bindings, scope, vector store, and trace |
| A chapter sounds formulaic | Effective style profile, writer prompt version, style detection evidence, rewrite scope, then whole-book voice patterns |
| An old foreshadowing thread disappears | Payoff ledger status and source chapter, chapter directives, retrieval query and trace, context budget, then later chapter text |

## Evidence order

1. Current source, schema, route, and runtime state.
2. The relevant durable Wiki contract.
3. Current public documentation.
4. Design records and active plans.
5. Release notes and Git history for provenance only.
6. Archived plans as historical background only.

## Answer format

A useful project answer includes the conclusion, evidence, boundary or
uncertainty, and the next action. If the question depends on a live database,
log, or task, inspect that environment before answering; the graph only tells
you where to look.
