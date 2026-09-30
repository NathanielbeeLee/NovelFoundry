# Novel Edit Boundary

The novel edit route is the integration surface for the project workspace. It
coordinates queries, mutations, director projections, chapter production, and
the presentation shell. It must not become the owner of domain rules that can
run without React.

## Current ownership

- `domain/`: pure selectors and projection rules. These functions must not
  access browser APIs, query clients, or React state.
- `infrastructure/`: browser-only effects such as downloads and storage
  adapters. These functions must not decide workflow state.
- `hooks/`: feature orchestration for one workflow area, such as planning,
  chapter execution, world context, or character mutations.
- `components/`: presentation and interaction for one workspace area.
- `NovelEdit.tsx`: route-level composition and cross-area coordination.

## Refactoring rule

New behavior should enter through the narrowest existing owner. Add a pure
projection to `domain/`, a browser adapter to `infrastructure/`, a workflow
operation to a focused hook, or a visual interaction to a component. Do not
add another large conditional block to `NovelEdit.tsx`.

The route-level coordinator remains a migration target. Future extraction must
preserve query keys, task identifiers, checkpoint semantics, and navigation
contracts before reducing file size.
