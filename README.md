<div align="center">

# NovelFoundry

**From idea to a finished novel.**

An open-source AI-native writing workspace for first-time novelists.

![NovelFoundry: an illuminated book forging a connected story world](images/github/novelfoundry-hero.png)

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-2563EB)](LICENSE)
[![CI](https://github.com/NathanielbeeLee/NovelFoundry/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NathanielbeeLee/NovelFoundry/actions/workflows/ci.yml)
![Web: React + Vite](https://img.shields.io/badge/Web-React%20%2B%20Vite-0891B2)
![Desktop: Windows + Electron](https://img.shields.io/badge/Desktop-Windows%20%2B%20Electron-7C3AED)

[Quick start](#quick-start) · [Features](#features) ·
[Your first novel](#your-first-novel) · [Documentation](#documentation) ·
[Contributing](CONTRIBUTING.md) · [Report an issue](https://github.com/NathanielbeeLee/NovelFoundry/issues)

</div>

Describe an idea and let AI guide you through story planning, worldbuilding,
character preparation, chapter writing, review, and repair. Saved projects and
recoverable tasks help you reach a readable first chapter and keep working
toward a complete book. Short stories have their own production workspace.

> **Active development.** The web workspace and Windows desktop packaging are
> available in this repository. Chinese/English UI coverage is partial; see
> [FAQ](#faq) for language and data-storage details.

## Quick start

You need **Node.js 22.12+ within 22.x**, **pnpm 10.6+**, and access to one text
model through a cloud provider or a local Ollama server. Node.js 20.19+ within
20.x and Node.js 24+ are also supported (`^20.19.0 || ^22.12.0 || >=24.0.0`).
The workspace pins pnpm 10.6.0.

```bash
git clone --branch main https://github.com/NathanielbeeLee/NovelFoundry.git
cd NovelFoundry
pnpm install
pnpm dev
```

Open **[http://localhost:5173](http://localhost:5173)**, or the client URL printed
by Vite if that port is occupied. Follow quick setup to select a provider and
model, then run the normal-text and structured-output checks.

The default source setup prepares a local **SQLite** database at startup. A
separate database server, Qdrant, and an image model are not required for your
first chapter. Start with one working text model and add optional services later.

For published Windows desktop builds, check the repository's
[Releases page](https://github.com/NathanielbeeLee/NovelFoundry/releases).
See [Installation and preparation](docs/public/installation.md) for more detail,
or [Troubleshooting](docs/public/troubleshooting.md) if setup needs attention.

## Features

- **Start from one idea.** AI Creation Studio proposes story directions and
  helps you choose a short story or a long novel. The AI director guides book
  preparation and production.
- **Plan and write a whole book.** Prepare the story, world, cast, volumes,
  pacing, and chapter goals. Generate, review, repair, and save chapters through
  the same production chain.
- **Keep the story connected.** Track character facts, timelines, resources,
  and foreshadowing. Review chapters and the whole book for consistency and
  prose quality.
- **Continue after interruptions.** Follow tasks and live AI execution in
  Task Center, inspect checkpoints, and use Director Follow-ups for recovery.
  Local quality issues can remain visible as repair guidance or quality debt
  while the rest of the book continues.
- **Build your writing toolkit.** Analyze books, retrieve reference knowledge,
  manage writing profiles and anti-AI rules, develop titles, and inspect prompts
  in Prompt Workbench.
- **Export and back up your work.** Export manuscripts and project data as
  TXT, Markdown, or JSON. Create portable novel backups with linked assets and
  restore an independent copy.
- **Explore comic and drama projects.** Develop comic and short-drama projects
  from novel material, original ideas, or imported text. Image generation
  requires a suitable provider.

## Your first novel

**Idea → Direction → World and cast → Chapter plan → Write, review, repair → Manuscript**

1. **Describe your idea.** Open Getting Started, AI Creation Studio, or the AI
   director. Select a long novel for the full book-production path.
2. **Choose a direction.** Compare the AI proposals and confirm the story you
   want to develop.
3. **Let AI prepare the book.** Follow the director through story, world,
   character, volume, and chapter planning.
4. **Read the first saved chapter and continue.** Follow the recommended next
   action, or open Task Center when a run needs attention.

Choose the writing mode that fits how much control you want:

| Mode | How you work |
| --- | --- |
| **Guided creation** | AI continues the book while a simple chapter shelf shows progress and stable drafts. |
| **Professional workspace** | Inspect and edit the plan, characters, and chapter manuscript. |

The first milestone is a saved, readable chapter. Writing profiles, reference
collections, image models, and per-task routing can be added later. Follow the
[first novel walkthrough](docs/public/playbook/first-novel-walkthrough.md)
for the complete sequence.

## Models and optional services

Provider presets include **OpenAI, Anthropic, DeepSeek, SiliconFlow, Grok/xAI,
Kimi, MiniMax, GLM, Qwen, Gemini, and Ollama**. Settings also supports custom
compatible endpoints and different models for planning, writing, review, or
analysis. Local Ollama does not require an API key.

Protocol, structured output, context size, and image capabilities depend on
the endpoint and model. The Gemini preset uses its OpenAI-compatible endpoint;
check your selected model during setup.

Optional services include **Qdrant and an embedding model** for vector retrieval,
**an image provider** for visual assets, and **PostgreSQL** as an alternative to
the default SQLite database. See [Model routing](docs/public/modules/model-routing.md),
[Knowledge and RAG](docs/public/flow/knowledge-and-rag.md), and
[`server/.env.example`](server/.env.example).

## Documentation

| I want to… | Read this |
| --- | --- |
| Understand the product and its tools | [Introduction](docs/public/introduction.md) and [Usage guide](docs/public/usage-guide.md) |
| Get a first chapter | [Installation](docs/public/installation.md) and [First novel walkthrough](docs/public/playbook/first-novel-walkthrough.md) |
| Follow a whole book | [End-to-end production](docs/public/flow/end-to-end-production.md) and [AI director pipeline](docs/public/flow/auto-director-pipeline.md) |
| Understand chapter writing | [Chapter execution](docs/public/flow/chapter-execution.md) |
| Recover an interrupted run | [Recovery by phase](docs/public/playbook/recovery-by-phase.md) and [Troubleshooting](docs/public/troubleshooting.md) |
| Work on the codebase | [Contributing](CONTRIBUTING.md) and [Project knowledge graph](docs/wiki/knowledge-graph/README.md) |

The [`site/`](site/) package serves the public guides with workflow diagrams
and selected screenshots. Run `pnpm dev:site` to browse them locally.

## FAQ

<details>
<summary><strong>Is the interface fully bilingual?</strong></summary>

Chinese/English support covers the application shell and selected creation
screens. Some workspaces and built-in content remain in Chinese. Switching UI
language does not translate existing fiction or set the language of AI-generated
text.

</details>

<details>
<summary><strong>Where does my data go?</strong></summary>

The default local setup stores project state in SQLite and generated assets on
disk. AI calls send prompts and selected story context to your configured model
endpoint. Development logs may contain model inputs and outputs;
`LLM_DEBUG_LOG=false` disables LLM request debug logging.

Protect databases, provider credentials, private novels, backups, generated
assets, and logs when sharing a project or reporting an issue. See the
[Security policy](SECURITY.md).

</details>

<details>
<summary><strong>Is a manuscript export also a project backup?</strong></summary>

Manuscript exports and portable novel backups serve different purposes. Use a
portable backup to restore a project and its linked assets as an independent
copy. See [Novel backup and restore](docs/wiki/workflows/novel-backup-restore.md).

</details>

<details>
<summary><strong>What happens when a writing run pauses?</strong></summary>

Read the checkpoint reason in Task Center or Director Follow-ups and use its
recovery action. Local quality issues can become repair work or visible quality
debt. A task can still pause when its plan needs revision, generation cannot
produce usable content, or safe continuation is unavailable. See
[Recovery by phase](docs/public/playbook/recovery-by-phase.md).

</details>

## Development

`main` is the development and integration branch. The API listens on port
`3000` by default, and the Vite client proxies API requests to it. `pnpm dev`
builds and watches shared contracts and starts both the API and client.

<details>
<summary><strong>Development commands and checks</strong></summary>

From the repository root, choose the development command you need:

```bash
# Start the API, web client, and Electron development shell together
pnpm dev:desktop

# Start only the public documentation site
pnpm dev:site
```

Use the narrowest check that matches your change:

```bash
pnpm check:docs-manifest
pnpm typecheck
pnpm build
```

Runtime, schema, prompt, recovery, and cross-module changes need focused
verification. UI acceptance is a human review step. Documentation-only changes
do not require a full application build.

</details>

<details>
<summary><strong>Repository layout and module boundaries</strong></summary>

| Area | Responsibility |
| --- | --- |
| `client/` | React/Vite web workspace and responsive shell |
| `server/` | Express APIs, Prisma persistence, LLM adapters, and runtime services |
| `shared/` | Shared TypeScript contracts and schemas |
| `desktop/` | Electron packaging and local runtime integration |
| `site/` | Public documentation site |
| `docs/public/` | User guides and workflow documentation |
| `docs/wiki/` | Architecture, workflow, prompt, retrieval, and product rules |

Backend responsibilities cover setup, planning, chapter production, director
orchestration, characters, story state, and export. The server contains both
module-owned entrypoints and existing service facades. Read the
[module boundary contract](docs/wiki/architecture/module-boundaries.md)
before changing a production path.

</details>

## Contributing and support

Contributions target `main` in
[NathanielbeeLee/NovelFoundry](https://github.com/NathanielbeeLee/NovelFoundry).
Read [Contributing](CONTRIBUTING.md) and the [Code of conduct](CODE_OF_CONDUCT.md),
use [issue templates](.github/ISSUE_TEMPLATE/) for reports, and consult
[Support](SUPPORT.md) for help. Report security issues through the
[Security policy](SECURITY.md).

Identify the source, license, and notice obligations for third-party code,
prompts, assets, or data included in a contribution.

The current priorities are stable recovery, chapter production, and beginner
completion of a full novel. See the [optimization plan](docs/plans/optimization-backlog.md)
for the active backlog.

## License

NovelFoundry is distributed under **[AGPL-3.0-only](LICENSE)**. You may use,
modify, and distribute it, including commercially, under those terms. If you
modify the program and make it available over a network, the AGPL requires you
to offer the corresponding source to its users. Copyright and source attribution
are retained in [NOTICE](NOTICE).

## Latest update

### 2026-10-01

- Writing profiles guide planning, drafting, review, and rewriting through
  reusable writing techniques, reducing carry-over of reference names and
  identities into a new novel.
- A timed-out or interrupted chapter repair keeps saved prose and records
  follow-up work so the book can continue. Cancelling stops review and repair.
- Director recovery shows the current step status after a successful retry
  and pauses when the chapter plan explicitly needs reconsideration.
- The workspace loads editing, graph, and Markdown tools when their pages need
  them, reducing the compressed JavaScript required at startup by about 30%.
- Prompt Workbench lists comic visual-fact extraction so you can inspect the
  instructions that help keep characters, places, props, and states consistent
  across episodes.

Full history is available in [docs/releases/release-notes.md](docs/releases/release-notes.md).
