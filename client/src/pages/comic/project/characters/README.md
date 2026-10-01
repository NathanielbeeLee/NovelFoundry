# Comic Character Workspace

`index.ts` exports `CharactersPanel`; the existing `../CharactersPanel.tsx`
entry remains its compatibility facade. The workspace lets a project select a
character, inspect its design references, maintain visual anchors and assets,
and review facts extracted from earlier episodes.

## Owners

- `domain/characterPresentation.ts` reads saved sheet/expression/anchor data,
  preserves free-form anchors from older projects, and builds the existing
  editable character-sheet suggestion. It has no React or network effects.
- `components/CharactersWorkspace.tsx` owns selection and the empty state.
  `CharacterList` and `CharacterStatusBadges` display saved reference status.
- `components/CharacterDetail.tsx` coordinates design/expression generation
  and tuning through the shared image-confirmation flow. `GenderSelector` and
  `VisualAnchorEditor` own their existing edit and adoption interactions.
- `assets/AssetSection.tsx` owns the character asset query, type grouping,
  quick creation, upload, deletion, and image generation. Its private cards and
  inputs are used only by this gallery.
- `components/FactsSection.tsx` reads and groups project facts and delegates
  explicit deletion to the comic API.

## Contracts

Components use `@/api/comic`; HTTP details and provider execution stay in their
adapters and backend owners. Keep existing query keys, invalidation scopes,
provider defaults, generation options, confirmation previews, and busy states.
Selecting a character keeps the detail keyed by character id so local tuning
and anchor drafts are recreated for that character.

An AI anchor suggestion remains a proposal until adopted and saved. Changing
gender or an anchor affects later generation; it does not redraw saved images.
The existing editable sheet suggestion is presentation support, not an AI
routing or intent policy. New product prompts belong to the server registry.
Outside consumers use the facade instead of deep-importing these internals.
