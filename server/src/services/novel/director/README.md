# Director Service Boundary

The director service owns checkpointed book preparation and continuation. It
coordinates commands, runtime stages, state, projections, recovery, and
automation; it does not own a second chapter writer or fact ledger.

## Ownership

- `commands/`: explicit continue, retry, approval, takeover, cancel, and replan
  commands;
- `runtime/`: stage execution and continuation orchestration;
- `state/`: durable task and checkpoint state;
- `projections/`: dashboard, progress, and task read models;
- `recovery/`: stale lease and resume decisions;
- `phases/`: stage-specific contracts and policies.

Routes and Creative Hub start commands through the facade. Read projections are
side-effect free. Chapter generation and repair delegate to the shared chapter
runtime and timeline finalization boundary.
