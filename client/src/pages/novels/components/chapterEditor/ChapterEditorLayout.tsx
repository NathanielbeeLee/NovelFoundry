import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, History, PanelLeft, PanelRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

export type ChapterEditorPanel = "context" | "revision" | null;

interface ChapterEditorLayoutProps {
  chapterOrder: number;
  chapterTitle: string;
  wordCount: number;
  openIssueCount: number | null;
  saveStatusLabel: string;
  isDirty: boolean;
  isSaving: boolean;
  saveBlocked: boolean;
  revisionStatus: "idle" | "loading" | "ready" | "error";
  activePanel: ChapterEditorPanel;
  onActivePanelChange: (panel: ChapterEditorPanel) => void;
  onBack?: () => void;
  onOpenVersionHistory?: () => void;
  onSave: () => void;
  context: ReactNode;
  revision: ReactNode;
  children: ReactNode;
}

// Reserve at least 668px for the manuscript before showing both side panels.
// Measure the workspace, since collapsing global navigation changes its width.
const INLINE_PANELS_MIN_WIDTH = 1380;

export default function ChapterEditorLayout(props: ChapterEditorLayoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contextTriggerRef = useRef<HTMLButtonElement | null>(null);
  const revisionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const manuscriptRef = useRef<HTMLDivElement | null>(null);
  const lastPanelRef = useRef<ChapterEditorPanel>(null);
  const [inlinePanels, setInlinePanels] = useState(false);

  useLayoutEffect(() => {
    if (props.activePanel) lastPanelRef.current = props.activePanel;
  }, [props.activePanel]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setInlinePanels(container.clientWidth >= INLINE_PANELS_MIN_WIDTH);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const revisionLabel = props.revisionStatus === "loading"
    ? "AI 修正中"
    : props.revisionStatus === "ready"
      ? "查看待确认改写"
      : props.revisionStatus === "error"
        ? "查看修正失败原因"
        : "AI 修正";

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
        {props.onBack ? (
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={props.onBack} aria-label="返回章节执行页" title="返回章节执行页">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="truncate text-base font-semibold" title={props.chapterTitle}>
            第 {props.chapterOrder} 章 · {props.chapterTitle}
          </h1>
          <div className="mt-1 text-xs text-muted-foreground" role="status" aria-live="polite">
            {props.wordCount} 字 · {props.saveStatusLabel}
            {props.openIssueCount !== null ? ` · 待处理 ${props.openIssueCount} 项` : ""}
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {props.onOpenVersionHistory ? (
            <Button size="sm" variant="ghost" className="w-9 px-0" onClick={props.onOpenVersionHistory} aria-label="版本入口" title="版本入口">
              <History className="h-4 w-4" />
            </Button>
          ) : null}
          {!inlinePanels ? (
            <>
              <Button ref={contextTriggerRef} size="sm" variant="outline" aria-haspopup="dialog" onClick={() => props.onActivePanelChange("context")}>
                <PanelLeft className="h-4 w-4" />章节信息
              </Button>
              <Button ref={revisionTriggerRef} size="sm" variant={props.revisionStatus === "idle" ? "outline" : "secondary"} aria-haspopup="dialog" onClick={() => props.onActivePanelChange("revision")}>
                <PanelRight className="h-4 w-4" />
                <span aria-live="polite">{revisionLabel}</span>
              </Button>
            </>
          ) : null}
          <Button size="sm" onClick={props.onSave} disabled={!props.isDirty || props.isSaving || props.saveBlocked}>
            <Save className="h-4 w-4" />
            {props.saveBlocked ? "请先处理正文冲突" : props.isSaving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      <div className={`grid min-h-0 min-w-0 flex-1 gap-4 overflow-hidden ${inlinePanels ? "grid-cols-[300px_minmax(0,1fr)_380px]" : "grid-cols-[minmax(0,1fr)]"}`}>
        {/* Keep this child in the same position so resizing never remounts the editor. */}
        <div ref={manuscriptRef} tabIndex={-1} aria-label="章节正文" className={`relative min-h-0 min-w-0 overflow-hidden outline-none ${inlinePanels ? "col-start-2 row-start-1" : "col-start-1 row-start-1"}`}>
          {props.children}
        </div>
        {inlinePanels ? (
          <>
            <aside className="col-start-1 row-start-1 min-h-0 min-w-0 overflow-hidden" aria-label="章节信息与问题卡">
              {props.context}
            </aside>
            <aside className="col-start-3 row-start-1 min-h-0 min-w-0 overflow-hidden" aria-label="AI 修正">
              {props.revision}
            </aside>
          </>
        ) : null}
      </div>

      <Dialog open={!inlinePanels && props.activePanel !== null} onOpenChange={(open) => {
        if (!open) props.onActivePanelChange(null);
      }}>
        <AppDialogContent
          title={props.activePanel === "context" ? "章节信息与问题卡" : "AI 修正"}
          aria-describedby={undefined}
          className="h-[calc(100dvh-2rem)] max-w-xl"
          bodyClassName="flex min-h-0 flex-col p-3"
          onCloseAutoFocus={(event) => {
            const trigger = lastPanelRef.current === "context" ? contextTriggerRef.current : revisionTriggerRef.current;
            const target = trigger?.isConnected && trigger.getClientRects().length
              ? trigger
              : manuscriptRef.current;
            if (target) {
              event.preventDefault();
              target.focus({ preventScroll: true });
            }
          }}
        >
          {props.activePanel === "context" ? props.context : props.revision}
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
