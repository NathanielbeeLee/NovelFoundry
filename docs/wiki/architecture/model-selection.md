# Model Selection

Model selection is a task policy, not a keyword switch. The route considers task type, provider capability, protocol, structured-output support, context size, and configured overrides.

Start with one verified default model. Add task-specific routes only after normal and structured tests pass. An explicit protocol choice must not silently fall through to another protocol after a formal request fails.

## Endpoint labels and model parameters

A compatible relay can expose a model under a different provider label.
Request-parameter guards must honor known model requirements across those
labels: recognized Kimi K2/K3 models use their required fixed temperature even
through a custom endpoint. Ordinary models retain their configured temperature.

This guard validates request parameters after model selection. It does not
classify user intent, choose another model, or authorize switching protocols.
Keep it in the shared capability policy consumed by the LLM factory rather
than duplicating it in chapter and planning services.
