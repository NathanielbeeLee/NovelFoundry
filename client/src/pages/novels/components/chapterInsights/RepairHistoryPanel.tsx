import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  parseChapterRepairHistory,
  REPAIR_HISTORY_ACTION_LABELS,
  REPAIR_HISTORY_ARTIFACT_LABELS,
  type ParsedChapterRepairHistoryEntry,
} from "./chapterRepairHistory";

interface RepairHistoryPanelProps {
  value?: string | null;
}

const RESULT_PRESENTATION = {
  passed: {
    label: "检查通过",
    description: "修复后的正文已通过复查，可以继续后续流程。",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  deferred: {
    label: "保留质量提醒",
    description: "正文仍可继续使用，未完全解决的问题已保留，方便后续再次处理。",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
  },
  needs_action: {
    label: "需要继续处理",
    description: "检查发现仍有问题，可根据建议继续修复或调整章节规划。",
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-800",
  },
} as const;

const ISSUE_CATEGORY_LABELS: Record<string, string> = {
  coherence: "连贯性",
  repetition: "重复内容",
  pacing: "节奏",
  voice: "文风",
  engagement: "吸引力",
  logic: "逻辑",
};

function formatDate(value?: string): string {
  if (!value) {
    return "时间未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function getRecordTitle(entry: ParsedChapterRepairHistoryEntry): string {
  if (entry.kind === "rewrite") {
    return "正文重写";
  }
  if (entry.kind === "raw") {
    return "较早的处理记录";
  }
  return entry.operation === "repair" ? "修复后复查" : "章节质量检查";
}

function getResultPresentation(entry: ParsedChapterRepairHistoryEntry) {
  if (entry.kind === "rewrite") {
    return {
      label: "已重写",
      description: "本章正文完成了一次重写。",
      badgeClassName: "border-blue-200 bg-blue-50 text-blue-800",
    };
  }
  if (entry.kind === "raw") {
    return {
      label: "记录已保留",
      description: "这条较早记录缺少完整结果，可在技术详情中核对原始信息。",
      badgeClassName: "border-border bg-muted text-muted-foreground",
    };
  }
  return RESULT_PRESENTATION[entry.result ?? "needs_action"];
}

function ScoreChange({ entry }: { entry: ParsedChapterRepairHistoryEntry }) {
  const before = entry.scoreBefore?.overall;
  const after = entry.scoreAfter?.overall;
  if (before == null && after == null) {
    return null;
  }
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-xs text-muted-foreground">总体评分</div>
      <div className="mt-1 text-sm font-medium text-foreground">
        {before == null ? "未记录" : before}
        <span className="mx-2 text-muted-foreground">→</span>
        {after == null ? "未记录" : after}
      </div>
    </div>
  );
}

function HistoryCard({ entry }: { entry: ParsedChapterRepairHistoryEntry }) {
  const result = getResultPresentation(entry);
  const riskLabels = Array.from(new Set(entry.riskSignals.map((signal) => (
    REPAIR_HISTORY_ARTIFACT_LABELS[signal.artifactType] ?? signal.artifactType
  ))));
  const issueLabels = Array.from(new Set(entry.issueCategories.map((category) => (
    ISSUE_CATEGORY_LABELS[category] ?? category
  ))));
  const actionLabel = entry.recommendedAction
    ? REPAIR_HISTORY_ACTION_LABELS[entry.recommendedAction] ?? entry.recommendedAction
    : null;

  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm leading-6">{getRecordTitle(entry)}</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">{formatDate(entry.evaluatedAt)}</div>
          </div>
          <Badge variant="outline" className={result.badgeClassName}>{result.label}</Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{result.description}</p>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4">
        {(actionLabel || entry.attempt != null) ? (
          <div className="flex flex-wrap gap-2">
            {actionLabel ? <Badge variant="secondary">建议：{actionLabel}</Badge> : null}
            {entry.issueCount != null && entry.issueCount > 0 ? (
              <Badge variant="outline">发现 {entry.issueCount} 项问题</Badge>
            ) : null}
            {entry.attempt != null ? (
              <Badge variant="outline">
                自动处理第 {entry.attempt}{entry.maxAttempts ? `/${entry.maxAttempts}` : ""} 次
              </Badge>
            ) : null}
          </div>
        ) : null}

        {(riskLabels.length > 0 || issueLabels.length > 0) ? (
          <div>
            <div className="text-xs text-muted-foreground">本次发现</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...riskLabels, ...issueLabels].map((label) => (
                <Badge key={label} variant="outline">{label}</Badge>
              ))}
            </div>
          </div>
        ) : entry.kind === "quality_assessment" && entry.result === "passed" ? (
          <div className="text-xs leading-6 text-muted-foreground">复查未发现需要继续处理的问题。</div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <ScoreChange entry={entry} />
          {entry.contentLength != null ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">正文长度</div>
              <div className="mt-1 text-sm font-medium text-foreground">{entry.contentLength.toLocaleString("zh-CN")} 字</div>
            </div>
          ) : null}
        </div>

        {entry.contentVersion ? (
          <div className="text-xs leading-5 text-muted-foreground">
            对应正文版本：{formatDate(entry.contentVersion)}
          </div>
        ) : null}

        {entry.legacy ? (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
            这条较早记录未保存评分和正文版本，现有信息已完整保留。
          </div>
        ) : null}

        <details className="rounded-lg border bg-background px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            查看技术详情
          </summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 leading-5 text-muted-foreground">
            {entry.technicalDetails}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}

export function RepairHistoryPanel({ value }: RepairHistoryPanelProps) {
  const entries = parseChapterRepairHistory(value).reverse();

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="text-sm font-semibold text-foreground">修复记录</div>
        <div className="mt-2 text-xs leading-6 text-muted-foreground">
          暂无记录。完成质量检查或修复后，系统会在这里保存每次处理结果。
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border bg-muted/20 p-4" aria-labelledby="chapter-repair-history-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="chapter-repair-history-title" className="text-sm font-semibold text-foreground">修复记录</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">按时间保存每次检查与修复结果，最新记录排在最前。</p>
        </div>
        <Badge variant="secondary">共 {entries.length} 条</Badge>
      </div>
      <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
        {entries.map((entry, index) => (
          <HistoryCard key={`${entry.evaluatedAt ?? "record"}-${index}`} entry={entry} />
        ))}
      </div>
    </section>
  );
}
