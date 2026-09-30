# Project Handbook

This handbook is the maintainer entry point for NovelFoundry. It explains the
product contract, the production path, the state owners, and where to diagnose
failures. Current code and runtime state remain authoritative.

## Product contract

NovelFoundry helps a beginner move from an idea to a complete long-form novel.
The system combines an AI director, book contracts, world and character state,
retrieval, chapter generation, review, repair, and resumable task execution.
It does not promise that every model or provider will complete a book without
pauses; model context, quota, cost, quality, and data safety still matter.

## Main path

```text
Creative Hub
  -> direction and title candidates
  -> confirmed book framing and contract
  -> world and character preparation
  -> volume strategy and chapter tasks
  -> chapter generation, review, repair, and state feedback
```

Conversation can clarify an idea, but only confirmed project assets and task
records become durable context. A message that was never saved cannot be
assumed to reach a later chapter.

## Recommended first run

Configure one provider and model, test normal and structured output, create a
small novel, and run one to three chapters before expanding to a volume or full
book. This validates the gateway protocol, output shape, context size, and
quality at low cost.

## State ownership

- The novel and chapter records own persisted content.
- The chapter runtime owns generation, review, repair, finalization, and state
  feedback.
- The director owns stage commands, checkpoints, approvals, and recovery.
- Task Center projects long-running task state and available actions.
- Context Broker and Prompt Registry own context selection and prompt assets.
- RAG owns indexing, retrieval scope, and retrieval diagnostics.

Do not create a second writer, director state machine, prompt registry, or fact
ledger in a route, UI page, or legacy service.

## Diagnosis order

1. Check the current Task Center state and error.
2. Check Director Follow-ups for a checkpoint or approval request.
3. Check the owning novel or chapter artifact.
4. Check provider connectivity, retrieval status, or database health only when
   the task evidence points there.
5. Resume from the saved checkpoint when the issue is recoverable.

Preserve usable prose and create a verified backup before any destructive data
operation.

## Related contracts

- [Module boundaries](./architecture/module-boundaries.md)
- [Beginner-first completion](./product/beginner-first-novel-completion.md)
- [AI director runtime](./workflows/auto-director-runtime.md)
- [Chapter production chain](./workflows/chapter-production-chain.md)
- [Prompt Registry](./prompts/prompt-registry-and-structured-output.md)
- [Knowledge and context assembly](./rag/knowledge-and-context-assembly.md)
- [LLM request protocols](./architecture/llm-request-protocols.md)
