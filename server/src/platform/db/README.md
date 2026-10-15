# Execution-scoped persistence

`db/prisma` is the application facade. Outside an execution scope it exposes the
original Prisma delegates and lazy PrismaPromises. Product owners supply an
`ExecutionWriteScope`; this module does not decide director lease policy.

Within a scope, each awaited mutation starts a short interactive transaction. Its
first operation conditionally locks the owner's durable execution identity on the
same connection. The row lock is held through mutation and commit. Callback
transactions join nested facade writes; array transactions accept only lazy
operations from the same scope. Raw SQL APIs are also fenced because reads may
contain data-changing SQL. An expired authority or a callback client used after
transaction closure rejects writes and rolls back the transaction.

Do not cache raw delegates or write methods outside a scope and then execute them
inside one. Do not instantiate a separate Prisma client in a command runtime.
Scoped client extension APIs are rejected. Reads may observe newer state; only
writes and explicit transactions acquire the execution lock. Execution ownership
is separate from chapter source freshness checks; both must hold when accepting
an AI result.

A director schedule registers background work with `scheduleExecutionWork` before
returning. Its executor drains registered work (including nested scheduling) while
renewal remains active. Detached descendants inherit the authority and lose write
permission when it is revoked. Callers outside a scope retain their existing
asynchronous scheduling behavior. Authority cancellation is merged into prompt
execution signals, but persistence fencing remains necessary when an external
provider ignores cancellation.

`afterExecutionCommit` is reserved for committed transition notifications. It runs
outside both the transaction and execution scope so delivery cannot hold a lease
row lock, and can record delivery logs after the command becomes terminal. Never
use it for chapter, task, runtime, or other canonical result writes. Rollback drops
these callbacks. Delivery failure cannot roll back already committed content.
