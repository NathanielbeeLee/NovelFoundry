# Client localization boundary

The application locale is owned by `LocaleProvider` and persisted under the
`novelfoundry.locale` storage key. `catalog.ts` contains product copy that can
be translated safely without touching user-authored fiction.

## Rules

- Add UI copy as a stable, namespaced key such as `novel.setup.title`.
- Keep English as the fallback locale so an incomplete migration remains
  usable.
- Migrate one route or feature folder at a time; do not replace Chinese
  literals mechanically because many are story content, model output, prompt
  examples, or database values.
- Translate buttons, labels, helper text, validation errors, toasts, empty
  states, dialogs, mobile navigation, and accessibility labels together.
- Keep user novels, reference documents, prompt bodies, generated text, and
  stored metadata in their original language.
- Do not use locale selection to change model prompts or the language of a
  user's novel unless that is an explicit product setting.

## Migration order

1. Application shell and shared feedback components.
2. First-run setup, home, help, and novel creation.
3. Novel workspace, task center, director follow-ups, and recovery dialogs.
4. World, character, knowledge, style, and prompt workbenches.
5. Comic, drama, book analysis, and secondary administration routes.

A route is complete when its visible copy, async feedback, keyboard labels, and
empty/error states all use the catalog. Keep route-specific keys near the
feature until the feature contract is stable, then move shared wording into a
common namespace.
