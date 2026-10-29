# Saved chapter synchronization diagnostics

`ChapterSyncDiagnosticsService` is a read-only projection for the saved chapter.
The HTTP route is `GET /api/novels/:id/chapters/:chapterId/sync-diagnostics`.
The existing novel router owns transport guards; the repository additionally
checks that the chapter belongs to the requested novel.

The repository uses SELECT-only serializable transactions, supported by the
PostgreSQL and SQLite providers. A second source read detects changes to the
chapter or summary during inspection. A changed source makes every item unknown.
Responses expose source identity and observation time, never prose, raw errors,
checkpoint metadata, credentials, or model output.

Summary and artifact freshness use the artifact owner's canonical content hash.
Successful artifact checkpoints additionally require the current freshness
version and a matching summary no newer than the checkpoint. Timeline checkpoints
use their owner's trimmed-content hash and require canonical source metadata
before a success is reported. Stable and degraded finalization stay distinct.
Expired running checkpoints are observational warnings; this read path does not
reclaim them. A missing generation job is irrelevant to these checks.

RAG job revisions only identify pending or failed work. Completed jobs may have
produced zero chunks or may have been cleaned up. Local chunk source metadata is
the success evidence, including chapter update time and summary source hash.
The bounded read checks chapter and chapter-summary indexes only; it does not
probe vector services or assert whole-novel retrieval health. Truncated evidence
cannot establish current status. RAG running records have no lease proof and are
shown explicitly as records, without inventing a worker liveness timeout.

No diagnostic read starts AI, writes chapter or canonical state, queues work,
retries synchronization, or changes director status. Local synchronization
problems remain warnings and never create a global replan gate. Unsaved editor
text and safe retry commands are outside this capability.
