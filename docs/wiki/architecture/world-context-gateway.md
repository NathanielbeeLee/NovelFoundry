# World Context Gateway

The gateway exposes the world facts that a novel task is allowed to use. External world samples, the current book world copy, and task-scoped slices are separate concepts.

World generation and synchronization go through the world application facade. Chapter and prompt code consumes a scoped context package and does not query world tables directly. Established book facts have priority over reference samples.

The gateway forwards the caller's provider, model and temperature to both
automatic slice preparation and explicit refresh. A temperature of zero is an
explicit choice. Missing or stale slices use those choices through the existing
registered world-slice prompt. Fresh saved slices are reused without another
model request; changing model choices alone does not invalidate a saved slice.
Freshness, overrides and forced refresh remain owned by the slice service.
