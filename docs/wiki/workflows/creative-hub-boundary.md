# Creative Hub Boundary

Creative Hub is the conversational front door for the novel completion path.
It helps the user express an intention, asks focused questions, and routes a
confirmed task to the owning capability.

## It can do

- clarify an idea and reader promise;
- inspect real project progress;
- suggest the next planning or production action;
- start a registered director, planning, chapter, or asset command;
- preview a proposed chapter change before explicit approval.

## It must not do

- become a second general chat product with unrelated durable state;
- treat conversation text as canon without an explicit save or confirmation;
- own chapter writing, repair, timeline finalization, or a second task state
  machine;
- route intent through fixed keyword tables when structured AI understanding is
  required.

Creative Hub should explain real artifacts and the next action first, then show
background task details. Every write action must use the owning application
service and preserve the same recovery and permission contracts.

## Stream result contract

Message completion and transport closure do not prove that a Creative Hub run
finished. The HTTP stream emits `creative_hub/run_terminal` after the graph has
returned its authoritative run status and persisted checkpoint. `completed`
and `waiting_approval` require a checkpoint belonging to that run; `failed` and
`cancelled` preserve their distinct outcomes. Heartbeats and reader resources
are released when the connection ends.

The client flushes UTF-8 and the final SSE buffer. EOF without a terminal is an
unknown outcome, even if some assistant messages completed. A known terminal
or error cannot be replaced by a later read/close failure. Received messages
remain visible while the client reads the current thread and run state.

After interruption, refresh is read-only. Match the run id and a new checkpoint
before concluding that a turn completed or is awaiting approval. An older idle
thread is not evidence of this turn's success. A successful action can precede
checkpoint persistence; keep its outcome pending until the saved result is
confirmed. Never replay tools, restart a director, or reload the old request
automatically to recover the stream.

Session and thread guards prevent a late response or refresh from replacing a
new conversation. Pending state has a visible refresh action and preserves the
approval entry point when the matching checkpoint becomes available. Client
coordination projects server state; it does not own a second task state machine.
