# Novel Application Services

Novel application services compose setup, planning, production, director, character, state, and export capabilities. Legacy services remain compatibility facades while callers migrate.

An application service owns a use-case boundary, authorization, idempotency, and transaction coordination. It should not become a new God Object or expose persistence details to routes and UI.
