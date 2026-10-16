# Workspace Layout Review

## Scope and evidence

Reviewed on 2026-10-16 against the current React application. The chapter-editing
and header slice is implemented; the remaining priorities below are proposals. Browser review
used fictional project data and intercepted API responses; it did not access a
writer's database, run a model, or verify task execution. The source components,
styles, navigation, and editor are the actual application implementation.

The previous direction screenshot showed an obsolete modal. The current
direction page already uses vertically stacked candidates with optional details
collapsed. Keep that improvement rather than redesigning around the old image.

## Implemented slice

Chapter editing uses the actual content width. At least 1380px is required to
keep the 300px context and 380px revision panels beside the manuscript. Narrower
workspaces use context and revision dialogs; prose lines are capped at 880px.
Title, save status, issue count, back, version history, and save remain above
the manuscript. Revision state stays in the shell, and viewport changes keep
the live text editor mounted, including across the mobile breakpoint.

The header presents the current model through one settings entry at all desktop
widths. Provider, model, and temperature remain in the dialog, with a direct
configuration link. Provider validity is synchronized even while it is closed.

With navigation expanded, final editable-element widths are 878px at 1920px,
880px at 1440px and 1280px, 694px at 1024px, and 490px at 820px. This measures
the element, including its internal padding, rather than the prose glyph area.
The original 1440px and 1280px widths were 358px and 183px respectively.

Browser checks use fictional static data. They cover panel access, keyboard
close and focus return, unsaved prose and undo across resizing, retained
revision instructions, and a simulated save conflict on a short mobile screen.
They do not validate live model output or production task execution.

The chapter execution queue, Creative Hub scrolling, candidate density, and
optional navigation below remain outside this slice.

## Priority 1: protect the manuscript area

Before this slice, the chapter editor had a 248px workspace rail plus fixed
320px context and 400px revision panels at the `xl` breakpoint. With navigation
expanded, the editable element measured 358px at a 1440px viewport and 183px at 1280px.
At 1024px it measured 679px because the three-column breakpoint was inactive.
The abrupt loss of writing space penalizes ordinary laptop windows.

Use the available content width to decide how many panels can remain open.
Keep a comfortable manuscript width before allocating side panels; expose context
and revision through dialogs on medium windows. Preserve access to save,
version history, source context, review findings, and repair comparison.

Owners: `ChapterEditorShell.tsx`, `ChapterEditorSidebar.tsx`,
`ChapterEditorDirectorPanel.tsx`, and `NovelWorkspaceRail.tsx`.

The execution page has the same class of risk: a 300px queue and 332px right
panel beside the global rail. Its smaller-screen queue precedes the manuscript
without a bounded parent height. Confirm that a long chapter list cannot push
the selected chapter out of the initial viewport before implementing that slice.

Owner: `ChapterManagementTab.tsx` and `ChapterExecutionQueueCard.tsx`.

## Priority 2: reduce header controls on medium screens

Before this slice, at an 820px viewport the header's brand container measured
24px while its controls occupied 736px. The writing service and model controls
remain full width above the mobile-shell breakpoint, leaving the product name
without useful space. This was clipping, not a demonstrated off-screen button.

Keep the brand, current model summary, and execution status visible. Provider
selection and temperature use one compact model-settings entry at desktop widths.
Preserve the project/workspace navigation switch, language
choice, keyboard access, and a clear route to unavailable-provider setup.

Owners: `Navbar.tsx`, `LLMSelector.tsx`, and the mobile shell.

## Priority 3: keep the next action and message composer in view

The Creative Hub example at 1920 x 1080 showed a large conversation area while
the composer continued below the initial viewport. The page header and next
action add height above a grid sized from a fixed viewport subtraction.
Allocate the remaining height with a flex layout and keep the composer within
the conversation pane; long messages should scroll independently.

For chapter execution, put the recommended next action near the chapter title
instead of requiring authors to discover the third right-panel tab. Keep one
primary action and put alternative tools in an explicit secondary area. Do not
hide stop, failed-save, or ownership/conflict notices while simplifying.

Owners: `CreativeHubPage.tsx`, `CreativeHubConversation.tsx`,
`ChapterManagementTab.tsx`, and `ChapterExecutionActionPanel.tsx`.

## Priority 4: make direction comparisons easier to scan

At 1024px, the first candidate's three core fields each measured about 110px.
The page combines a 220px action rail with a second three-column grid inside
the remaining content. Stack the action area and core fields until the actual
container has enough room. Keep title, premise, main conflict, and the selection
action visible; retain full settings as optional details.

When showing title scores, explain that they are AI estimates rather than
measured click-through data. Prefer a recommendation reason over an unexplained
number. This is a presentation change, not a new quality-ranking mechanism.

Owner: `NovelAutoDirectorCandidateBatches.tsx`.

## Priority 5: reduce navigation and explanatory noise

The global navigation exposes creation, resource libraries, derivative tools,
and system controls together. Keep the first-novel path prominent and group
optional libraries without removing their entry points. Use a quieter visual
hierarchy for inactive stages and show the current stage and next action clearly.

Replace implementation commentary with concrete author instructions. Preserve
the distinction between saved prose, an unaccepted suggestion, and pending
quality work; visual simplification must not imply that a failed operation
succeeded or that a preview has been saved.

## Suggested implementation sequence

1. Chapter editing and the header at 1280px and 820px (implemented).
2. Consolidate scrolling and keep primary actions and the composer visible.
3. Adjust candidate comparison density and simplify optional navigation.

Use 1920px, 1440px, 1280px, 1024px, and the existing mobile breakpoint when
reviewing the affected slice. Include long chapters, long titles, many queued
chapters, pending generation, failed saves, and review conflicts. Maintain
existing runtime contracts and leave manuscript content untouched.
