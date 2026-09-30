import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PipelineJob } from "@novelfoundry/shared/types/novel";
import type { WholeBookReviewReport } from "@novelfoundry/shared/types/wholeBookReview";
import {
  applyWholeBookReviewFeedback,
  getWholeBookReviewStatus,
  listWholeBookReviews,
  runWholeBookReview,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface WholeBookReviewPanelProps {
  novelId: string;
  maxOrder: number;
  pipelineJob?: PipelineJob;
}

function isActivePipelineJob(job: PipelineJob | undefined): boolean {
  return job?.status === "queued" || job?.status === "running";
}

export default function WholeBookReviewPanel({ novelId, maxOrder, pipelineJob }: WholeBookReviewPanelProps) {
  const [range, setRange] = useState({ startOrder: 1, endOrder: Math.max(1, maxOrder) });
  const [reports, setReports] = useState<WholeBookReviewReport[]>([]);
  const [starting, setStarting] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    void listWholeBookReviews(novelId)
      .then((result) => setReports(result.data ?? []))
      .catch(() => undefined);
  }, [novelId]);

  useEffect(() => {
    setRange((current) => {
      const startOrder = Math.min(Math.max(1, current.startOrder), Math.max(1, maxOrder));
      return {
        startOrder,
        endOrder: Math.min(Math.max(startOrder, current.endOrder), Math.max(1, maxOrder)),
      };
    });
  }, [maxOrder]);

  const statusQuery = useQuery({
    queryKey: queryKeys.novels.wholeBookReviewStatus(novelId, range.startOrder, range.endOrder),
    queryFn: () => getWholeBookReviewStatus(novelId, range),
    enabled: Boolean(novelId && maxOrder > 0),
    refetchInterval: (query) => {
      const status = query.state.data?.data;
      return status?.activeRun || status?.blockingPipelineJob ? 1500 : 4000;
    },
  });

  useEffect(() => {
    const latestReport = statusQuery.data?.data?.latestReport;
    if (!latestReport) {
      return;
    }
    setReports((items) => items[0]?.id === latestReport.id
      ? [latestReport, ...items.slice(1)]
      : [latestReport, ...items.filter((item) => item.id !== latestReport.id)]);
  }, [statusQuery.data?.data?.latestReport]);

  const status = statusQuery.data?.data;
  const report = reports[0];
  const suppliedPipelineIsActive = isActivePipelineJob(pipelineJob);
  const blockingPipelineJob = status?.blockingPipelineJob
    ?? (suppliedPipelineIsActive && pipelineJob
      ? {
          id: pipelineJob.id,
          status: pipelineJob.status as "queued" | "running",
          startOrder: pipelineJob.startOrder,
          endOrder: pipelineJob.endOrder,
          completedCount: pipelineJob.completedCount,
          totalCount: pipelineJob.totalCount,
          currentItemLabel: pipelineJob.currentItemLabel,
        }
      : null);
  const reviewIsRunning = starting || Boolean(status?.activeRun);
  const reportMatchesRange = report?.startOrder === range.startOrder && report?.endOrder === range.endOrder;
  const currentVersionReviewed = Boolean(
    reportMatchesRange
    && report?.sourceRevision
    && status?.contentChangedSinceLatest === false,
  );
  const allSuggestionsApplied = Boolean(report?.issues.length && report.issues.every((issue) => issue.applied));
  const reviewDisabled = maxOrder < 1 || reviewIsRunning || Boolean(blockingPipelineJob) || currentVersionReviewed;

  async function run() {
    setStarting(true);
    try {
      const result = await runWholeBookReview(novelId, range);
      if (result.data) {
        setReports((items) => [result.data!, ...items.filter((item) => item.id !== result.data!.id)]);
      }
      toast.success("全书审校完成，可以查看并采用建议。");
      await statusQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "全书审校失败，请检查模型配置后重试。");
    } finally {
      setStarting(false);
    }
  }

  async function apply(issueIds?: string[]) {
    if (!report) return;
    setApplying(true);
    try {
      const result = await applyWholeBookReviewFeedback(novelId, report.id, issueIds);
      toast.success(`已采用 ${result.data?.applied ?? 0} 条建议，后续章节会自动读取。`);
      setReports((items) => items.map((item, index) => index
        ? item
        : {
            ...item,
            issues: item.issues.map((issue) => !issueIds?.length || issueIds.includes(issue.id)
              ? { ...issue, applied: true }
              : issue),
          }));
      await statusQuery.refetch();
    } finally {
      setApplying(false);
    }
  }

  let actionLabel = report ? "重新全书审校" : "开始全书审校";
  if (reviewIsRunning) actionLabel = "全书审校中…";
  else if (blockingPipelineJob) actionLabel = "等待批量任务完成";
  else if (currentVersionReviewed) actionLabel = "当前版本已审校";

  return (
    <Card>
      <CardHeader><CardTitle>全书级审校与跨章节回灌</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">AI 会跨章节查找人设漂移、因果断裂、节奏和伏笔问题。建议只有在你确认后才会进入后续章节生成。</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            起始章
            <Input
              type="number"
              min={1}
              max={maxOrder}
              value={range.startOrder}
              disabled={reviewIsRunning}
              onChange={(event) => {
                const startOrder = Number(event.target.value);
                setRange({ startOrder, endOrder: Math.max(startOrder, range.endOrder) });
              }}
            />
          </label>
          <label className="text-xs">
            结束章
            <Input
              type="number"
              min={1}
              max={maxOrder}
              value={range.endOrder}
              disabled={reviewIsRunning}
              onChange={(event) => setRange({ ...range, endOrder: Math.max(range.startOrder, Number(event.target.value)) })}
            />
          </label>
          <Button disabled={reviewDisabled} onClick={() => void run()}>{actionLabel}</Button>
        </div>

        {blockingPipelineJob ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            批量任务正在修改第 {Math.max(1, blockingPipelineJob.startOrder)}—{Math.min(maxOrder, blockingPipelineJob.endOrder)} 章
            {blockingPipelineJob.currentItemLabel ? `，当前处理：${blockingPipelineJob.currentItemLabel}` : ""}。完成后再进行全书审校，报告会基于最终正文生成。
          </div>
        ) : status?.activeRun ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            第 {status.activeRun.startOrder}—{status.activeRun.endOrder} 章正在审校。页面刷新后会继续显示运行状态，无需重复启动。
          </div>
        ) : currentVersionReviewed ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            当前章节范围与上次审校版本一致。正文或规划更新后可以重新审校。
          </div>
        ) : reportMatchesRange && status?.contentChangedSinceLatest ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            当前章节范围有新内容，可以重新审校确认修复效果。
          </div>
        ) : null}

        {report ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge>综合 {report.scores.overall}</Badge>
              <Badge variant="outline">连续性 {report.scores.continuity}</Badge>
              <Badge variant="outline">角色 {report.scores.character}</Badge>
              <Badge variant="outline">情节 {report.scores.plot}</Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={applying || allSuggestionsApplied}
                onClick={() => void apply()}
              >
                {allSuggestionsApplied ? "全部建议已采用" : "采用全部建议"}
              </Button>
            </div>
            <p className="text-sm">{report.summary}</p>
            {report.issues.map((issue) => (
              <div key={issue.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <strong>{issue.title}</strong>
                  <Badge variant={issue.severity === "high" ? "destructive" : "outline"}>{issue.severity}</Badge>
                  {issue.applied ? <Badge>后续写作约束</Badge> : null}
                </div>
                <p className="mt-1 text-muted-foreground">{issue.detail}</p>
                <p className="mt-2">建议：{issue.recommendation}</p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="secondary"
                  disabled={applying || issue.applied}
                  onClick={() => void apply([issue.id])}
                >
                  {issue.applied ? "采用完成" : "采用并用于后续写作"}
                </Button>
              </div>
            ))}
            {allSuggestionsApplied ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                下一步：完成章节补写或批量润色；正文更新后，再运行全书审校确认修复效果。
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">还没有全书审校报告。</p>
        )}
      </CardContent>
    </Card>
  );
}
