# Frequently Asked Questions

## Which AI director mode should I choose?

- **Prepare until ready to write** is recommended for a first novel. It
  prepares planning, characters, volume strategy, and chapter tasks, then
  pauses at a readable handoff.
- **Complete the book automatically** keeps producing chapters after the
  direction is confirmed. It needs a stable provider and sufficient quota.
- **Run a selected range** limits work to the book, a chapter count, or a
  volume while you validate the workflow.
- **Review and repair after writing** adds the review and repair loop to the
  other modes.

See the [AI director pipeline](#/docs/auto-director-pipeline) for details.

## What if automatic production pauses?

A pause is deliberate when the provider is unavailable, quota is exhausted,
repairs repeatedly fail, a replan is required, or a structural safety issue is
detected. Open Director Follow-ups, read the reason, resolve the external
problem, and continue from the saved checkpoint. Do not delete the project or
start over.

## Do the site and client ports conflict?

No. The client uses port 3000 and the public site uses port 4173 by default.
They can run together.

## Where is desktop data stored?

The desktop build stores its database, task state, configuration, and generated
assets in the application data directory, usually under `%APPDATA%` on Windows.
Back up before troubleshooting or removing files.

## What should I check when a model connection fails?

Check the API key, base URL, model name, provider quota, network, and whether
the model supports the selected task and structured output mode. Run the
connection test before creating another long-running task.

## I created a novel but do not know what to do next

Open Getting Started or Creative Hub, enter one idea, choose a direction, let
the director prepare the book, and run the first chapter. Do not fill every
advanced setting before the main path works.

## What if chapter generation fails?

Read the Task Center error first. Retry a temporary provider failure, use a
more stable model for malformed structured output, add missing book
information, or open Director Follow-ups when a replan is requested. If usable
text exists, local quality debt can usually be repaired without stopping the
whole book.

## Why does retrieval return nothing?

Check that indexing finished, Qdrant is reachable when configured, the document
is eligible for recall, and the search scope is not too strict. A document that
was uploaded but not indexed cannot be recalled.

## Is a director pause the same as a failure?

No. It may mean that the system is waiting for a direction, candidate, missing
setting, or recovery action. Treat it as a failure only when the task reports
an unrecoverable error, data-integrity issue, or explicit replan requirement.

## Can the system write a complete book with one click?

The product supports automatic continuation, but key direction, character, and
chapter decisions still benefit from confirmation. The system provides guided
defaults and resumable execution rather than promising identical results for
every model or provider.

## How do I protect my data?

Export or back up important novels regularly. Never reset or delete a database
without a verified backup, and redact keys and private fiction from logs,
screenshots, and issue reports.
