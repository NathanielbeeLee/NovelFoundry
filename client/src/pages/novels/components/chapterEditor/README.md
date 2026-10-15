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
merge or unconditional overwrite is offered. Navigating away still does not
persist unsaved local drafts.

Legacy clients that send prose without `expectedContent` receive 428 and must
retain their draft and refresh the app. Metadata-only updates remain compatible.
AI candidate application takes its existing pre-edit snapshot before attempting
the guarded save; a conflict can leave an extra snapshot but cannot write the
rejected candidate or its artifacts.
