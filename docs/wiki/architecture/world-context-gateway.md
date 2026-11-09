# World Context Gateway

The gateway exposes the world facts that a novel task is allowed to use. External world samples, the current book world copy, and task-scoped slices are separate concepts.

World generation and synchronization go through the world application facade. Chapter and prompt code consumes a scoped context package and does not query world tables directly. Established book facts have priority over reference samples.
