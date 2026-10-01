import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Loader2, Play, RotateCcw } from "lucide-react";
import {
  estimateBatchCost,
  getBatchJob,
  retryBatchJob,
  startEpisodeBatch,
  type BatchProgress,
  type ComicBatchJob,
} from "@/api/comic";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function BatchBar({
  episodeId,
  provider,
  onComplete,
}: {
  episodeId: string;
  provider: string;
  onComplete: () => void;
}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ComicBatchJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: estimate } = useQuery({
    queryKey: ["comic", "batch-estimate", episodeId, provider],
    queryFn: () => estimateBatchCost(episodeId, provider || undefined),
    enabled: Boolean(episodeId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const updated = await getBatchJob(jobId);
        setJob(updated);
        if (updated.status !== "running") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          onComplete();
        }
      } catch {
        // Polling failures are transient and should not interrupt the workspace.
      }
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, onComplete]);

  const startMut = useMutation({
    mutationFn: () =>
      startEpisodeBatch(episodeId, { provider: provider || undefined, concurrency: 3, skipDone: true }),
    onSuccess: ({ jobId: id }) => {
      setJobId(id);
      setJob(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  const retryMut = useMutation({
    mutationFn: () => retryBatchJob(jobId!, provider || undefined),
    onSuccess: ({ jobId: id }) => {
      setJobId(id);
      setJob(null);
    },
    onError: (e) => toast.error(String(e)),
  });

  const progress = job ? (JSON.parse(job.progress) as BatchProgress) : null;
  const isRunning = job?.status === "running" || startMut.isPending;
  const hasFailures = (progress?.failedPanelIds?.length ?? 0) > 0 && job?.status !== "running";
  const pendingCount = estimate?.pendingPanels ?? 0;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isRunning || pendingCount === 0}
          onClick={() => startMut.mutate()}
        >
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {isRunning ? "批量生成中..." : `批量生成 ${pendingCount > 0 ? `(${pendingCount}格)` : ""}`}
        </Button>

        {hasFailures && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={retryMut.isPending}
            onClick={() => retryMut.mutate()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重试 {progress!.failedPanelIds.length} 格
          </Button>
        )}

        {estimate && pendingCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CircleDollarSign className="h-3.5 w-3.5" />
            约 {estimate.estimatedCentsCost} ¢
          </span>
        )}

        {job?.status === "completed" && (
          <span className="text-xs font-medium text-green-600 dark:text-green-400">全部完成</span>
        )}
        {job?.status === "partial" && !hasFailures && (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">部分完成</span>
        )}
      </div>

      {progress && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                job?.status === "partial"
                  ? "bg-amber-500"
                  : job?.status === "completed"
                  ? "bg-green-500"
                  : "bg-primary"
              }`}
              style={{
                width: `${progress.total > 0 ? Math.round(((progress.done + progress.failed) / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>
              {progress.done} / {progress.total} 完成
              {progress.failed > 0 && (
                <span className="ml-1.5 text-destructive">{progress.failed} 失败</span>
              )}
            </span>
            <span>
              {progress.total > 0
                ? `${Math.round(((progress.done + progress.failed) / progress.total) * 100)}%`
                : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
