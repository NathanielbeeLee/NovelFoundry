# Prompt Body Editor Boundary

`index.ts` exports `PromptBodyEditor`; the existing
`../components/PromptBodyEditor.tsx` remains its compatibility facade. This
module displays governed prompt slots and delegates changes, resets, official
version adoption, and context selection to the workbench controller.

## Owners

- `domain/plateText.ts` converts plain text and Plate values, preserves line
  boundaries, and normalizes editor event payloads. It has only type imports.
- `domain/slotPresentation.ts` reads declared length limits and formats
  reconciliation state and saved values.
- `components/PromptSlotTextEditor.tsx` owns Plate synchronization, editor
  reseeding, existing length truncation, and line/remaining-character display.
- `components/slots/` owns slot badges, choice/toggle/token controls, and a
  slot section's reset/change presentation.
- `components/PromptOfficialVersionPanel.tsx` displays server reconciliation
  results and delegates explicit restore/keep decisions.
- `components/ContextReferenceChips.tsx` maps declared context requirements to
  preview blocks and delegates navigation.
- `components/PromptBodyWorkspace.tsx` groups control/body/append slots and
  composes context, reconciliation, read-only guidance, and the existing final
  message preview.

## Governance and dependencies

Preserve declared slot kinds, placement, sources, dirty/reset state, max-length
behavior, required tokens, reconciliation callbacks, and locked-context
requirements. Plate's internal draft remains synchronized using the existing
effect dependencies and seed behavior. Components do not persist overrides,
call a model, replace system messages, or choose context policy.

Prompt Registry and workbench persistence hooks remain the owners of prompt
contracts and override validation. Official-version and context data are
already structured inputs, not text that these components may classify.
Outside callers use the facade; internal components depend on owned domain
functions and the existing workbench types/labels.
