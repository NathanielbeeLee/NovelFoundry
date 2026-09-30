# Event Side-Effect Boundaries

Domain events carry lightweight notifications. Heavy work such as indexing, character synchronization, snapshot rebuilding, and state recalculation belongs to a durable queue or a dedicated application service.

Event handlers must be idempotent, observable, and safe to retry. Read projections must not write events. Keep transport events separate from durable workflow commands.
