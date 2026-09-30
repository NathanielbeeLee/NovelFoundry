# Installation and Preparation

This guide prepares NovelFoundry on Windows and confirms that model, storage,
and retrieval capabilities are available.

## Recommended installation

The source is available at
[NathanielbeeLee/NovelFoundry](https://github.com/NathanielbeeLee/NovelFoundry).
Use the source workflow below to run the current development branch. Published
desktop builds, when available, appear on the repository's
[Releases page](https://github.com/NathanielbeeLee/NovelFoundry/releases).

## Before first launch

Prepare an LLM API key, a provider base URL or compatible endpoint, a model
that can handle planning and long-form text, a stable network connection, and
enough local disk space for the database, logs, assets, and generated content.

If you are unsure which model to use, configure one general text model first.
After the main path works, route writing, review, analysis, and other tasks to
specialized models.

## Configuration order

1. Open Settings.
2. Enter the provider, API key, base URL, and default model.
3. Run the connection test.
4. Create a small test novel.
5. Enter one simple idea.
6. Follow Getting Started or the AI director to the first chapter.

Run the shortest path before configuring retrieval, the style engine, or
advanced routing. This makes failures easier to locate.

## Data and backups

The desktop build stores novels, task state, configuration, and the local
database in its application data directory. Keep regular backups of the
database, novel exports, character and world assets, knowledge and style
assets, and useful task logs or screenshots.

NovelFoundry uses its own application data directory. If a previous desktop
installation has a compatible SQLite database, the desktop maintenance panel
can suggest it as an optional import source. Close the previous app before
importing. The import backs up the current NovelFoundry database before
replacing it, and it leaves the source database untouched. The database import
does not carry external files such as generated images; use a portable novel
backup to move those assets. A portable installation can select its prior
database manually.

Never delete a database or reset data without a verified backup. See
[Troubleshooting](./troubleshooting.md) for the minimum backup check.

## Is Qdrant required?

No. Qdrant powers vector retrieval and knowledge-base recall, but it is not a
prerequisite for creating a novel or generating a first chapter.

- Skip Qdrant when you only want to try the main workflow.
- Configure it when you need searchable reference material or book analysis.
- Prioritize a stable Qdrant connection for large research collections.

If retrieval misses a document, check indexing status before changing search
settings.

## Run from source

```bash
git clone --branch main https://github.com/NathanielbeeLee/NovelFoundry.git
cd NovelFoundry
pnpm install
pnpm dev
pnpm build
```

To preview only the public site:

```bash
pnpm --filter @novelfoundry/site dev
```

Source mode is intended for development and debugging. Regular writing is
simpler with the desktop build.

## After installation

Run a model connection test, create a small test novel, and confirm that the
Task Center displays progress and results. If one step fails, read the [FAQ](./faq.md)
and [Troubleshooting](./troubleshooting.md) before starting a larger task.
