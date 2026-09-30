# Troubleshooting

Back up before any operation that could affect data.

## Classify the problem

Start by deciding whether the issue is a model connection, task state,
knowledge retrieval, persisted data, or a page and navigation problem. Then use
the matching owner instead of retrying through several entry points.

## Check task state

Open Task Center for queued, running, completed, failed, and recoverable tasks.
Record the task name, novel, latest state, error text, and available retry or
resume action. Do not start the same long-running task from multiple pages.

## Check Director Follow-ups

Director Follow-ups show whether the system is waiting for a direction, book
setup, chapter plan, chapter execution, or recovery action. A local chapter
quality issue is normally repairable quality debt and does not stop the whole
book.

## Model diagnosis

1. Run the connection test in Settings.
2. Confirm the API key, base URL, and model name.
3. Check provider quota, concurrency limits, and network access.
4. Try a more stable model for the same task.
5. Route structured review, repair, or analysis to a model that follows the
   required output format.

Do not bypass AI intent, planning, or routing with hard-coded keyword rules.

## Retrieval diagnosis

1. Confirm that the document upload succeeded.
2. Confirm that indexing finished.
3. Check Qdrant connectivity when it is configured.
4. Broaden overly strict retrieval settings.
5. Confirm that the current task actually needs the document.

## Backup minimum

Before cleaning data, migrating, resetting, or deleting files:

- copy the database to a clear backup path;
- verify that the file exists and has a plausible size;
- record the time and source location;
- preferably export the novel and keep relevant task evidence.

## Page display problems

Refresh the page, re-enter through Home or Novels, and check Task Center and
Director Follow-ups for a running or waiting task. Record the entry point,
steps, and a redacted screenshot. Different pages may project the same task in
different ways.

## Reporting a problem

Include the commit or desktop version, reproduction steps, novel state, task
status and error, provider and task type, Qdrant status, and safe logs or
screenshots. Never include API keys, private novels, or unredacted backups.
