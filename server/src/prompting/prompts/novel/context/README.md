# Chapter context selection

The structured chapter plan owns required cast selection. `plannedCast.ts` uses
the shared exact-identity resolver: an explicit roster ID wins, otherwise only a
unique exact name binds. Unknown or duplicate names remain unresolved references;
they cannot acquire another character's facts through background-guide fallback.
Resource/dialogue context assembly uses the same resolver. This is validation of
AI-selected identities, not a second character-selection decision engine.

All resolved planned characters enter the writer context. Optional background
participants can fill the existing six-character allowance; they cannot displace
required cast. Dynamic guides preserve required cast while keeping optional guides
bounded. `plannedCast.omittedBackgroundIds` records identities outside the selected
participant set, and unresolved references remain visible in the prompt.

Participant hard facts are retained without a second character-count truncation
in selection, rendering or repair fallback. Additional background hard facts use
only remaining slots in the existing allowance. Do not fall back to arbitrary
facts when no participating identity can be resolved.

The optional `plannedCast` snapshot stores resolved ID/name pairs, unresolved
references and scoped per-character mind evidence. Current knowledge queries
exclude the current/future source chapter. Source-bearing legacy mind records
without a known source order are not injected into required cast knowledge; null
source remains the existing author/baseline state convention. Missing knowledge
is not omniscience, and a character's belief/private intent is not another
character's knowledge or an objective fact.

Render required cast evidence inside the existing `participant_subset` block,
which is required and non-summarizable. This preserves Broker, Prompt Workbench
and saved advanced-template compatibility without adding a mandatory template
variable. Old write snapshots without `plannedCast` still render their saved
participants. Writer, review, repair and incremental modes share this block.

The existing context budget is a soft selection budget: mandatory identity,
knowledge and hard constraints may exceed it; optional blocks are summarized or
dropped through the normal trace. This is not an unlimited model context window
or a guarantee that arbitrarily large casts fit a provider. Do not introduce a
new full-book quality stop or silently truncate required constraints to satisfy
that soft budget. Revisit request sizing if an actual provider-window failure is
observed. Retrieval likewise retains all resolved plan names and spends its
remaining soft query allowance on optional mission prose; no-plan retrieval keeps
the existing bounded background cast.
