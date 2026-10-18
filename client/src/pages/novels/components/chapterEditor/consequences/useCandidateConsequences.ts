import { useEffect, useRef, useState } from "react";
import type { ChapterEditorConsequenceAdoptRequest, ChapterEditorConsequenceReport, ChapterEditorConsequenceRequest } from "@novelfoundry/shared/types/novel";
import { previewChapterConsequences } from "@/api/novel";

export type ConsequencePreviewStatus = "idle" | "loading" | "ready" | "stale" | "error";
interface State { key: string; status: ConsequencePreviewStatus; report?: ChapterEditorConsequenceReport; error?: string; }

export function useCandidateConsequences(novelId: string, chapterId: string | undefined, request: ChapterEditorConsequenceRequest | null) {
  const key = JSON.stringify([novelId, chapterId, request]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const generation = useRef(0);
  const mounted = useRef(true);
  const [state, setState] = useState<State>({ key, status: "idle" });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    generation.current++;
    setState((previous) => previous.key === key ? previous : { key, status: !request || previous.status === "idle" ? "idle" : "stale" });
  }, [key]);
  useEffect(() => {
    if (!state.report || state.status !== "ready") return;
    const timer = setTimeout(() => setState((previous) => previous === state ? { key, status: "stale" } : previous), Math.max(0, Date.parse(state.report.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [state, key]);

  const status: ConsequencePreviewStatus = state.key !== key && state.status !== "idle" ? "stale" : state.status;
  const assess = async () => {
    if (!chapterId || !request) return;
    const attempt = ++generation.current;
    setState({ key, status: "loading" });
    try {
      const response = await previewChapterConsequences(novelId, chapterId, request);
      if (!mounted.current || attempt !== generation.current || currentKey.current !== key) return;
      if (!response.data) throw new Error("影响评估未返回结果，请重试。");
      setState({ key, status: "ready", report: response.data });
    } catch (error) {
      if (mounted.current && attempt === generation.current && currentKey.current === key) {
        setState({ key, status: "error", error: error instanceof Error ? error.message : "影响评估失败，请重试。" });
      }
    }
  };
  const cancel = () => { generation.current++; setState({ key, status: "idle" }); };
  const markStale = () => { generation.current++; setState({ key, status: "stale" }); };
  const adoptionRequest = (): ChapterEditorConsequenceAdoptRequest | null => {
    if (status === "idle") return null;
    if (status !== "ready" || !request || !state.report || Date.parse(state.report.expiresAt) <= Date.now()) {
      throw new Error("请重新评估后采纳，或取消影响评估后使用普通采纳。");
    }
    return { ...request, receipt: state.report.receipt };
  };
  return { status, report: status === "ready" ? state.report ?? null : null, error: state.error,
    assess, cancel, markStale, adoptionRequest, applyBlocked: status !== "idle" && status !== "ready" };
}
