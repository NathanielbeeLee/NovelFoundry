# Capability Catalog

This catalog maps a user capability to its entry point, owner, persistent
assets, and deeper guide. The catalog describes current NovelFoundry behavior;
Git history and source notices provide separate copyright evidence.

## Novel completion path

| Capability | User outcome | Entry point | Owner |
| --- | --- | --- | --- |
| AI director | Turn one idea into direction, book setup, planning, and execution | `/novels/auto-director` | `server/src/services/novel/director/` |
| Getting Started | Configure a model and reach the first chapter | Home and `/help` | onboarding and setup modules |
| Creative Hub | Discuss an idea and start a controlled task | `/creative-hub` | Creative Hub, agents, and graphs |
| Book setup | Confirm audience, promise, contract, world, and cast | `/novels/:id/edit` | setup and planning modules |
| Volume and chapter planning | Turn a book contract into chapter tasks | Novel workspace | planning and volume services |
| Chapter execution | Generate, review, repair, finalize, and feed back state | Novel workspace and Task Center | shared chapter runtime |
| Director recovery | Inspect checkpoints and continue safely | `/auto-director/follow-ups` | director commands, state, and projections |
| Task center | Observe long-running work and available actions | `/tasks` | task service and adapters |

## Continuity and quality

| Capability | Persistent facts |
| --- | --- |
| State feedback | `StoryStateSnapshot`, character state, information state |
| Payoff tracking | `PayoffLedgerItem` and payoff services |
| Timeline constraints | timeline events, chapter anchors, and constraint reports |
| Character resources | resource ledger items and pending proposals |
| Book quality loop | book quality reports, accepted decisions, quality debt, and polish revisions |
| Backup and restore | portable project package and import receipt |

See [Chapter production chain](../workflows/chapter-production-chain.md),
[Whole-book quality loop](../workflows/whole-book-quality-loop.md), and
[Novel backup and restore](../workflows/novel-backup-restore.md).

## Knowledge and writing assets

| Capability | Entry point | Owner |
| --- | --- | --- |
| Knowledge and retrieval | `/knowledge` | knowledge and RAG services |
| Book analysis | `/book-analysis` | book-analysis services |
| Style engine | `/style-engine` | style engine and writing profiles |
| Anti-AI rules | `/anti-ai-rules` | style bindings and rule assets |
| Prompt Workbench | `/prompt-workbench` | `server/src/prompting/` |
| World library and book world | `/worlds` and novel workspace | world and setup modules |
| Character library | `/base-characters` and novel workspace | character modules |
| Title Studio | `/titles` and creation flow | title services |

## Models and derivative workspaces

| Capability | Entry point | Owner |
| --- | --- | --- |
| Model routing and protocols | Settings and `/settings/model-routes` | LLM adapters and model router |
| AI live execution | Header and task views | live execution runtime |
| Comic Studio | `/comic` | comic modules |
| Drama Studio | `/drama` | drama modules |
| Desktop runtime | packaged application | `desktop/` |

## Catalog rules

A visible page does not prove that a task completed. Use task state and persisted
artifacts. A model field does not prove protocol or structured-output
compatibility. An analysis report does not become downstream context until the
user or a governed workflow adopts it. Keep a single owner and link to the
specialist contract instead of copying its implementation rules here.
