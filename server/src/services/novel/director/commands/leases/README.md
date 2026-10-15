# Command execution authority

A claim is `(commandId, leaseOwner, attempt)`. `attempt` is the monotonically
incremented generation; a reused worker slot is not proof of ownership. Claiming
returns the successful compare-and-set receipt rather than rereading a potentially
reclaimed row. Start, renew, terminal transitions and scoped writes require this
identity, an active status, and an unexpired durable lease.

The worker renews while waiting for resource capacity and throughout registered
background pipeline work. Renewal rejection revokes authority immediately;
transport errors retain only the last confirmed deadline. Late renewal success
cannot revive an expired attempt. Loss aborts resource waiting and prompt signals,
releases the worker slot even if a provider ignores cancellation, and prevents the
old attempt from recording failure against its successor.

`runWithCommandAuthority` connects identity checks to the shared persistence facade.
A conditional no-op command update locks the generation in the same transaction as
chapter, runtime, checkpoint, result and task writes. Queue terminal operations
wrap the entire command/task transition in this scope. No AI call belongs in that
transaction. Cancellation alone cannot provide this persistence guarantee.

Stale recovery also uses generation compare-and-set plus a short transaction: a
superseded scan does not update the task or its running steps. Manual recovery
locks remain authoritative. Existing saved prose is retained; authority loss is a
runtime safety handoff, not a chapter-quality verdict. Local quality debt and
explicit global replan decisions keep their existing separate policies.
