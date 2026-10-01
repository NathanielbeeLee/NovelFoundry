# Creative Hub Stream HTTP Boundary

The route mounts the HTTP transport; `index.ts` constructs its business terminal
from the graph's authoritative run status and persisted checkpoint. This module
does not run tools, update task status, or create a second recovery workflow.

Successful and approval terminals require a checkpoint from the same run.
Message completion, a turn summary, or a closed response is insufficient. The
route emits a terminal only after graph completion and always releases its
heartbeat. Client interruption recovery reads the owning run/thread APIs and
must not replay writes automatically.
