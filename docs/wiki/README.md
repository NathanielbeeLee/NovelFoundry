# Development Wiki

The Wiki records durable project knowledge. It helps maintainers and AI agents
understand ownership, runtime contracts, workflow boundaries, and the reasons
behind product decisions.

## Start here

- [Knowledge graph](./knowledge-graph/README.md): route a question to the
  narrowest evidence source.
- [Capability catalog](./knowledge-graph/capability-catalog.md): map product
  capabilities to UI entry points and backend owners.
- [Project handbook](./project-handbook.md): understand the complete novel
  production path.
- [Module boundaries](./architecture/module-boundaries.md): check ownership and
  dependency direction before editing code.
- [Source and license notes](./knowledge-graph/provenance.md): check copyright
  and attribution obligations before redistribution.

## Topics

### Architecture

- [Module boundaries](./architecture/module-boundaries.md)
- [Configuration conventions](./architecture/configuration-conventions.md)
- [Repository hygiene](./architecture/repository-hygiene.md)
- [LLM request protocols](./architecture/llm-request-protocols.md)
- [Model selection](./architecture/model-selection.md)
- [Chapter runtime boundaries](./architecture/chapter-runtime-boundaries.md)
- [World context gateway](./architecture/world-context-gateway.md)
- [Testing foundations](./architecture/testing.md)

### Workflows

- [Auto-director runtime](./workflows/auto-director-runtime.md)
- [Chapter production chain](./workflows/chapter-production-chain.md)
- [Whole-book quality loop](./workflows/whole-book-quality-loop.md)
- [Creative Hub boundary](./workflows/creative-hub-boundary.md)
- [Volume planning](./workflows/volume-planning.md)
- [Novel backup and restore](./workflows/novel-backup-restore.md)

### AI governance and retrieval

- [Prompt Registry and structured output](./prompts/prompt-registry-and-structured-output.md)
- [Knowledge and context assembly](./rag/knowledge-and-context-assembly.md)

### Product and debugging

- [Beginner-first novel completion](./product/beginner-first-novel-completion.md)
- [Beginner onboarding flow](./product/onboarding-flow.md)
- [Task center role](./product/task-center-role.md)
- [Public site design](./product/public-site-design.md)

## Wiki rules

- Write in English. Keep user-authored story content and model-generated
  content in its original language.
- Record stable rules and reasons, not a change log.
- Prefer a single owner and a single canonical contract for each capability.
- Link to plans, checkpoints, and release notes instead of copying them.
- When implementation and documentation disagree, verify current code and
  runtime state first, then update the Wiki if the rule is durable.
