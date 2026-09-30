# Task Center Role

Task Center is the operational inbox for long-running work. It projects queued, running, completed, failed, waiting, and recoverable states and exposes only actions allowed by the task contract.

Task Center does not own director or chapter business rules. It delegates commands to the owning runtime and keeps recovery visible after refresh or a missing URL task id.
