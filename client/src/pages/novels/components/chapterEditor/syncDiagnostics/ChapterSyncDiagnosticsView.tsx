import type { ChapterSyncDiagnosticKey, ChapterSyncDiagnosticStatus, ChapterSyncDiagnosticsResponse } from "@novelfoundry/shared/types/novel";
import { Button } from "@/components/ui/button";
import type { SyncDiagnosticsViewState } from "./viewState";

const ITEM_LABELS: Record<ChapterSyncDiagnosticKey, string> = {
  summary: "章节摘要",
  artifacts: "角色与故事状态",
  timeline: "时间线",
  ragChapter: "正文检索",
  ragSummary: "摘要检索",
};
const STATUS_LABELS: Record<ChapterSyncDiagnosticStatus, string> = {
  current: "对应已保存正文", running: "处理中", queued: "等待处理", failed: "处理失败",
  stale: "待更新", degraded: "部分完成", unknown: "待确认", not_applicable: "无需处理",
};
const MESSAGES: Record<Exclude<SyncDiagnosticsViewState, "ready">, string> = {
  saving: "正在保存正文，保存结束后读取同步情况。",
  loading: "正在读取已保存正文的同步情况。",
  error: "同步情况暂时无法读取，请稍后刷新。",
  changed: "章节保存版本有变化，请刷新后查看对应结果。",
  conflict: "保存版本存在冲突，请先核对正文后查看同步情况。",
};

export default function ChapterSyncDiagnosticsView(props: {
  state: SyncDiagnosticsViewState;
  data?: ChapterSyncDiagnosticsResponse;
  isDirty: boolean;
  onRefresh: () => void;
}) {
  const busy = props.state === "loading" || props.state === "saving";
  return (
    <section className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm" aria-label="章节同步情况" aria-busy={busy}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">章节同步情况</h3>
        <Button variant="ghost" size="sm" disabled={busy} onClick={props.onRefresh} aria-label="刷新章节同步情况">刷新</Button>
      </div>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        查看已保存正文的记忆与检索准备情况。刷新仅查看状态。
      </p>
      {props.isDirty && <p className="mb-3 text-xs leading-5 text-amber-700 dark:text-amber-300">未保存的修改不包含在此结果中。</p>}
      {props.state !== "ready" ? (
        <p role="status" className="text-sm leading-6 text-muted-foreground">{MESSAGES[props.state]}</p>
      ) : props.data ? (
        <>
          <ul className="space-y-3">
            {props.data.items.map((item) => (
              <li key={item.key}>
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="font-medium text-foreground">{ITEM_LABELS[item.key]}</span>
                  <span className={item.status === "current"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : ["failed", "stale", "degraded"].includes(item.status)
                      ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            查看时间：<time dateTime={props.data.checkedAt}>{new Date(props.data.checkedAt).toLocaleString("zh-CN")}</time>
          </p>
        </>
      ) : null}
    </section>
  );
}
