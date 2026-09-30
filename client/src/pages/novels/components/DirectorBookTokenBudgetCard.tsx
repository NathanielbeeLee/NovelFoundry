import type { DirectorBookTokenBudgetSummary } from "@novelfoundry/shared/types/directorRuntime";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { updateDirectorBookTokenBudget } from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface DirectorBookTokenBudgetCardProps {
  novelId: string;
  taskId?: string | null;
  summary: DirectorBookTokenBudgetSummary;
}

function formatTokens(value: number | null | undefined): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));
}

function budgetStatusText(summary: DirectorBookTokenBudgetSummary): string {
  if (summary.status === "disabled") {
    return "未设置上限";
  }
  if (summary.status === "exhausted") {
    return "预算已用尽，后续章节会在边界暂停";
  }
  if (summary.status === "warning") {
    return "用量已到提醒线";
  }
  return "用量在预算内";
}

export default function DirectorBookTokenBudgetCard({
  novelId,
  taskId,
  summary,
}: DirectorBookTokenBudgetCardProps) {
  const queryClient = useQueryClient();
  const [limitWan, setLimitWan] = useState(summary.limitTokens ? String(summary.limitTokens / 10_000) : "100");
  const [warnPercent, setWarnPercent] = useState(String(Math.round(summary.warnRatio * 100)));

  useEffect(() => {
    if (summary.limitTokens) {
      setLimitWan(String(summary.limitTokens / 10_000));
    }
    setWarnPercent(String(Math.round(summary.warnRatio * 100)));
  }, [summary.limitTokens, summary.warnRatio]);

  const mutation = useMutation({
    mutationFn: (payload: { limitTokens: number | null; warnRatio: number }) => (
      updateDirectorBookTokenBudget(novelId, payload)
    ),
    onSuccess: async () => {
      const invalidations: Array<Promise<unknown>> = [
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.directorBookAutomation(novelId) }),
      ];
      if (taskId) {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorTaskSnapshot(taskId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorRuntime(taskId) }),
        );
      }
      await Promise.allSettled(invalidations);
      toast.success("本书 Token 预算已保存。后续自动任务会按新预算判断是否继续。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Token 预算保存失败，请稍后重试。");
    },
  });

  const usagePercent = summary.limitTokens
    ? Math.max(0, Math.round((summary.usedTokens / summary.limitTokens) * 100))
    : 0;
  const saveLimit = () => {
    const parsedWan = Number(limitWan);
    if (!Number.isFinite(parsedWan) || parsedWan < 1) {
      toast.error("预算至少填写 1 万 Tokens。");
      return;
    }
    mutation.mutate({
      limitTokens: Math.min(2_000_000_000, Math.round(parsedWan * 10_000)),
      warnRatio: Number(warnPercent) / 100,
    });
  };
  const disableLimit = () => {
    mutation.mutate({
      limitTokens: null,
      warnRatio: Number(warnPercent) / 100,
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-muted/15 p-4">
      <div>
        <div className="text-sm font-medium text-foreground">本书 Token 预算</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">
          为自动导演设置整本书用量上限。达到上限时，系统会保留已完成正文，并在下一章开始前暂停。
        </div>
      </div>

      <div className={cn(
        "rounded-xl border bg-background/80 p-3",
        summary.status === "exhausted" && "border-destructive/40 bg-destructive/5",
        summary.status === "warning" && "border-amber-300/70 bg-amber-50/50 dark:border-amber-700/60 dark:bg-amber-950/15",
      )}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium text-foreground">{budgetStatusText(summary)}</span>
          <span className="text-muted-foreground">
            {formatTokens(summary.usedTokens)}{summary.limitTokens ? ` / ${formatTokens(summary.limitTokens)}` : " Tokens"}
          </span>
        </div>
        {summary.limitTokens ? (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                summary.status === "exhausted"
                  ? "bg-destructive"
                  : summary.status === "warning"
                    ? "bg-amber-500"
                    : "bg-primary",
              )}
              style={{ width: `${Math.min(100, usagePercent)}%` }}
            />
          </div>
        ) : null}
        <div className="mt-2 text-xs text-muted-foreground">
          {summary.limitTokens
            ? `已用 ${usagePercent}% · 剩余 ${formatTokens(summary.remainingTokens)} Tokens`
            : "自动导演继续记录实际用量，但不按整书额度暂停。"}
        </div>
        {summary.trackingStatus === "no_usage_yet" ? (
          <div className="mt-2 text-xs text-muted-foreground">
            模型尚未返回可统计的 usage；用量出现后会自动计入。
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <label className="space-y-1.5 text-xs text-muted-foreground">
          <span>预算上限（万 Tokens）</span>
          <Input
            type="number"
            min={1}
            max={200000}
            step={1}
            value={limitWan}
            onChange={(event) => setLimitWan(event.target.value)}
            disabled={mutation.isPending}
            aria-label="本书 Token 预算上限，单位为万 Tokens"
          />
        </label>
        <label className="space-y-1.5 text-xs text-muted-foreground">
          <span>提前提醒</span>
          <Select value={warnPercent} onValueChange={setWarnPercent} disabled={mutation.isPending}>
            <SelectTrigger aria-label="Token 预算提醒比例">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="70">达到 70%</SelectItem>
              <SelectItem value="80">达到 80%</SelectItem>
              <SelectItem value="90">达到 90%</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={saveLimit} disabled={mutation.isPending}>
          {mutation.isPending ? "保存中…" : "保存预算"}
        </Button>
        {summary.limitTokens ? (
          <Button type="button" size="sm" variant="outline" onClick={disableLimit} disabled={mutation.isPending}>
            关闭预算限制
          </Button>
        ) : null}
      </div>
    </section>
  );
}
