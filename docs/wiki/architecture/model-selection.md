# Model Selection

Model selection is a task policy, not a keyword switch. The route considers task type, provider capability, protocol, structured-output support, context size, and configured overrides.

Start with one verified default model. Add task-specific routes only after normal and structured tests pass. An explicit protocol choice must not silently fall through to another protocol after a formal request fails.
