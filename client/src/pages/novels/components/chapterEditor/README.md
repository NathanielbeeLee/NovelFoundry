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

This scope does not persist unsaved drafts after navigating away or resolve
cross-tab / concurrent AI writes. The manual chapter API still has no expected
source precondition. Adding optimistic concurrency requires an atomic server
check and an explicit conflict/reload interaction; silently overwriting or
merging a conflicting manuscript is not an acceptable substitute.
