# Chapter Runtime Boundaries

`ChapterRuntimeCoordinator` is the stable facade for chapter generation, review, repair, finalization, and post-processing. Batch jobs, director commands, manual actions, and stream bridges may use different transports but must converge on this runtime.

The final text is timeline-finalized before state feedback and continuation. Side effects consume a stable snapshot. External callers must not deep-import runtime internals or write chapter state directly.
