# Chapter editor draft ownership

The editor instance belongs to a novel and chapter identity. Query timestamps are
not instance keys: acknowledging a save must not remount the editor or erase its
undo history. A real chapter switch creates a new instance; late callbacks from
the old instance may refresh its persisted queries but cannot update the active
editor or its AI preview.

`domain/chapterDraft.ts` separates local prose, acknowledged saved prose, and
observed remote prose. Saving acknowledges the submitted text only. Text entered
while that request is pending remains dirty. A query refresh can replace a clean
draft; a dirty draft keeps its text and defers the remote value. Successful saves
clear earlier deferred values because the write acknowledgement is newer evidence.
Failure keeps the local text available for retry. Controlled echoes of local
keystrokes must retain the live text editor, including trailing spaces and empty
paragraphs, instead of rebuilding its document and undo stack.

## Manuscript text and selections

The editor uses the shared `novel/editor/text` contract: CRLF becomes LF in the
editable view; every LF separates a paragraph node, including empty and trailing
nodes. Other whitespace, full-width indentation and solitary CR characters remain
text. Enter and Shift+Enter insert one LF; multiple newlines remain multiple empty
blocks. Text and fragment insertion follow the same mapping, including inline
leaves and multiline paste. Paragraph numbers and half-open UTF-16 selections use
that exact view on both client and server. Display spacing must not add manuscript
bytes, and preview rendering must not trim them.

The exact persisted source remains separate for compare-and-save. Opening a book
does not rewrite it. Old device recovery copies are complete text, not serialized
editor nodes, and must not be migrated or collapsed. A candidate's leading/trailing
whitespace is part of its replacement and diff; HTTP validation rejects empty
semantic selections without trimming valid quoted text. Empty unsaved chapters
must not fall back to saved prose when requesting AI revision.

Formatting removed by earlier explicit saves cannot be reconstructed from this
contract. Existing snapshots or recovery copies remain the recovery source. No
bulk chapter migration is performed. Browser rendering/interaction acceptance is
user-owned; headless Plate fixtures cover insertion and text/selection contracts.

## Concurrent saves

Manual prose writes and AI candidate acceptance send `expectedContent` from the
exact persisted source, separately from normalized editor text. Null and empty
text remain distinct. A successful acknowledgement advances this baseline but
keeps input entered during the request. Save and candidate-apply requests cannot
run concurrently in the same editor.

A 409 response freezes remote draft adoption, preserves local prose, and shows
both texts. The author explicitly chooses to load saved prose or retain local
prose against the displayed baseline. Continuing does not write immediately;
the next save still compares the raw baseline and can conflict again. No automatic
merge or unconditional overwrite is offered. Unsaved editor text has an optional
recovery path described below; navigation never submits it as canonical prose.

## Device recovery copies

`recovery/` owns browser-local manuscript recovery. `domain/` validates versioned
copy identities, `infrastructure/` reads and writes localStorage, and
`application/` coordinates one editor lifetime and asynchronous save receipts.
The shell consumes the feature through its facade. The existing branded storage
helper owns preference migration and is unsuitable for versioned manuscript
removal; recovery uses its own namespaced adapter without new dependencies.

Author edits synchronously attempt a complete device copy bound to novel id,
chapter id and the exact raw saved baseline. Null, empty text, CRLF and whitespace
remain distinct. The copy contains the whole local editor text, not an AI
candidate or a canonical state delta. Startup offers explicit restore or discard;
it does not automatically replace prose. Dirty editors must save before restoring
another copy. A restored baseline different from the current persisted source
opens the existing comparison and explicit choice; the normal source CAS remains
mandatory on every save. Loading a recovery copy never invokes the server.

Each revision has an immutable storage key and each editor lifetime a separate
session id. Writes persist the complete replacement before removing its previous
revision. Restoring transfers only the selected immutable revision. Other tabs'
newer revisions cannot be removed by an older displayed copy or late save receipt.
A storage event lets an active editor re-protect its text if another tab has
transferred its displayed copy. Ordinary saves and AI candidate adoption capture
the submitted recovery identity; acknowledgements clear only that identity and
retain newer typing against the actual acknowledged baseline. Unmounted callbacks
can finish their own recovery bookkeeping but cannot clear a new editor's copy.

Writes enforce 50 stored copies and 2,000,000 serialized UTF-16 characters for
this namespace (approximately 4 MB), counting unreadable entries as occupied.
There is no eviction to make space and no manuscript truncation. Copies older
than 30 days are marked for author review and retained until explicit discard or
acknowledged save. LocalStorage has no cross-tab transaction, so concurrent new
keys can momentarily exceed the admission limit; the browser quota remains the
final bound and no other copy is sacrificed to enforce a count. Replaced revisions
may also remain if a storage operation is interrupted. Do not claim a transactional
or crash-durable archive. Revisit the storage backend if larger manuscripts or
strict multi-window quotas become an evidenced need.

Quota, denied access, malformed JSON and unknown versions preserve existing bytes
and editor text, with a visible save/copy-to-file instruction. Recovery stays on
this browser origin/device, has no cross-device promise, and can be lost through
browser-data clearing, private browsing or device failure. It does not guarantee
instant persistence through power loss. Focused lifecycle/store fixtures cover
these limits; browser and visual acceptance remains the user's responsibility.

## Manuscript-first layout

`ChapterEditorLayout` measures the available workspace rather than the viewport:
global navigation can change the space available to the manuscript. Both side
panels stay inline only from 1380px of content width, leaving at least 668px for
the manuscript surface. Smaller workspaces expose context and revision dialogs;
the manuscript keeps one position in the React tree. Prose lines are capped at
880px so a wide window remains readable.

Chapter identity, save status, issue count, save, back, and version entrypoints
stay above the manuscript. Revision instructions and candidate state belong to
the shell, so closing a panel or resizing does not discard them. A revision
started from a passage opens its panel and returns keyboard focus to a visible
entrypoint on close. The application shell also keeps the chapter outlet mounted
across the mobile breakpoint to preserve drafts and undo history.

Save conflicts close an overlapping revision dialog and expose the existing
comparison. The comparison scrolls within a bounded area on short screens so
both resolution actions remain reachable. Layout changes must preserve the
concurrent-save rules above; opening or closing a panel never applies a candidate.

Legacy clients that send prose without `expectedContent` receive 428 and must
retain their draft and refresh the app. Metadata-only updates remain compatible.
AI candidate application takes its existing pre-edit snapshot before attempting
the guarded save; a conflict can leave an extra snapshot but cannot write the
rejected candidate or its artifacts.

## Optional candidate consequences

The active candidate can request an advisory impact assessment without saving.
The `consequences/` hook and panel retain the report only for its exact local
snapshot, source baseline, candidate, selection, session and requested model.
Changing those inputs or reaching receipt expiry makes the assessment stale;
late responses from an older request cannot attach to another candidate.

An assessed candidate always uses the server's guarded adoption endpoint. A
failed, expired or stale assessment cannot silently fall back to ordinary save.
The author can re-evaluate, retain/reject the candidate, or explicitly cancel
assessment before using ordinary adoption. Unassessed editing keeps the existing
path. Findings remain advice, display supplied evidence and uncertainty, and
never create a mandatory planning wizard or director stop.

Receipts last at most 15 minutes on one server instance and can be evicted or
lost on restart/worker change. The resulting 409 preserves local content and
candidate selection, with reassessment available. UI acceptance belongs to the
user; no browser/visual check is required by this module contract.

## Saved chapter synchronization diagnostics

`syncDiagnostics/` reads a separate GET endpoint in the chapter information panel.
It does not depend on AI workspace analysis, trigger extraction, or offer repair.
The five rows describe saved summary, character/story artifacts, timeline, chapter
retrieval and summary retrieval. Status labels preserve unknown, partial, failed,
pending and outdated evidence rather than collapsing them into a success flag.

Queries bind novel, chapter and loaded `updatedAt`, use cancellable reads, and
refresh on mount. Save and candidate adoption invalidate this query alongside the
chapter. Saving, unresolved save conflicts, fetching, failed reads, source changes during
a read, and a loaded chapter version mismatch hide cached success. Unsaved edits have an explicit
exclusion notice. Refresh also reloads chapter detail through the existing draft
reconciliation rules; it never overwrites dirty editor text. Results show their
read time and remain a snapshot until refresh, not a live worker health monitor.
