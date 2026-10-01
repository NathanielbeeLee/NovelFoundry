# Style extraction task boundary

The stable entry is `../StyleExtractionTaskService.ts`.

- `domain/` owns task input and status/queue projection policy.
- `infrastructure/taskLog.ts` owns task diagnostics.
- Infrastructure also reads heartbeat configuration and recognizes Prisma
  persistence errors; domain policy remains independent of environment and DB.
- `application/StyleExtractionTaskService.ts` owns scheduling, heartbeats,
  cancellation, retry, persistence, and the existing singleton.

Keep the queue, controllers, and task lifecycle together: splitting these
into independent instances would lose cancellation and restart semantics.
Profile extraction is delegated to StyleProfileService; the scheduler does
not own a second extraction implementation or new Prompt assets.
