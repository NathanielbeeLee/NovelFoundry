import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChapterDraft } from "../../domain/chapterDraft";
import { ChapterRecoverySession } from "./ChapterRecoverySession.ts";
import type { ChapterRecoveryRecord } from "../domain/chapterRecovery.ts";

export function useChapterRecovery(novelId: string, chapterId: string | undefined, draft: ChapterDraft) {
  const [session] = useState(() => new ChapterRecoverySession({ novelId, chapterId: chapterId ?? "" }));
  const [snapshot, setSnapshot] = useState(() => session.snapshot());
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const refresh = useCallback(() => setSnapshot(session.snapshot()), [session]);
  const capture = useCallback((next: ChapterDraft) => {
    if (!chapterId) return;
    session.capture(next);
    refresh();
  }, [chapterId, refresh, session]);

  useLayoutEffect(() => { capture(draft); }, [capture, draft.content, draft.savedContent, draft.sourceContent]);
  useEffect(() => {
    const onStorage = () => capture(draftRef.current);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [capture]);

  return {
    ...snapshot, capture,
    beginSave: () => { const token = session.beginSave(draft); refresh(); return token; },
    acknowledge: (token: ChapterRecoveryRecord | null, submitted: string, baseline: string | null) => {
      session.acknowledge(token, submitted, baseline); refresh();
    },
    restore: (record: ChapterRecoveryRecord) => { session.restore(record); refresh(); },
    discard: (record: ChapterRecoveryRecord) => { session.discard(record); refresh(); },
    discardCurrent: () => { session.discardCurrent(); refresh(); },
  };
}
