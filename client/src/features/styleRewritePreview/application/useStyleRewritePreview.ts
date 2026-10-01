import { useEffect, useRef, useState } from "react";
import { detectStyleIssues, rewriteStyleIssues } from "@/api/styleEngine";
import { toast } from "@/components/ui/toast";
import {
  emptyStyleRewritePreviewState,
  StyleRewritePreviewSession,
  styleRewritePreviewInputKey,
  type StyleRewritePreviewInput,
} from "./session.ts";

export function useStyleRewritePreview(input: StyleRewritePreviewInput, options?: { requireStyleProfile?: boolean }) {
  const key = styleRewritePreviewInputKey(input);
  const latestKey = useRef(key);
  latestKey.current = key;
  const [state, setState] = useState(() => emptyStyleRewritePreviewState(key));
  const [session] = useState(() => new StyleRewritePreviewSession({
    async detect(payload, signal) {
      const response = await detectStyleIssues(payload, { signal });
      if (!response.data) throw new Error("AI 没有返回可用的原文检测结果，请重试。");
      return response.data;
    },
    async rewrite(payload, signal) {
      const response = await rewriteStyleIssues(payload, { signal });
      return response.data;
    },
    isInputCurrent: (requestKey) => requestKey === latestKey.current,
  }, setState));

  useEffect(() => {
    session.setInput(input);
    return () => session.cancel();
  }, [key, session]);

  // Hide invalidated results immediately, before the effect aborts their request.
  const current = state.key === key ? state : emptyStyleRewritePreviewState(key);
  useEffect(() => {
    if (current.error) toast.error(current.error);
    if (current.notice) toast.success(current.notice);
  }, [current.error, current.notice]);

  const run = (operation: "detect" | "rewrite") => {
    if (options?.requireStyleProfile && !input.styleProfileId) {
      toast.error("请先选择写法资产。");
      return;
    }
    void session[operation](input);
  };

  return {
    report: current.report,
    preview: current.preview,
    detectionPending: current.operation === "detect",
    rewritePending: current.operation === "rewrite",
    detect: () => run("detect"),
    rewrite: () => run("rewrite"),
  };
}
