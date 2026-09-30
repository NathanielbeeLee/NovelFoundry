import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NovelRouteForecast,
  NovelRouteForecastCandidate,
} from "@novelfoundry/shared/types/novelRouteForecast";
import type { Chapter } from "@novelfoundry/shared/types/novel";
import {
  createCreativeDecision,
  generateNovelRouteForecast,
  listCreativeDecisions,
  updateCreativeDecision,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { useLLMStore } from "@/store/llmStore";

interface ChapterRouteForecastDialogProps {
  novelId: string;
  chapter?: Chapter;
  disabled?: boolean;
}

function buildDecisionContent(
  forecast: NovelRouteForecast,
  route: NovelRouteForecastCandidate,
): string {
  const beats = route.chapterBeats.map((beat) => (
    `- 第${forecast.chapterOrder + beat.chapterOffset}章：${beat.objective}；冲突：${beat.conflict}；转折：${beat.turningPoint}；钩子：${beat.hook}`
  ));
  const choices = route.characterChoices.map((item) => (
    `- ${item.character}：${item.choice}；后果：${item.consequence}`
  ));
  const risks = route.risks.map((item) => (
    `- ${item.summary}；控制方式：${item.mitigation}`
  ));
  return [
    `采用剧情路线「${route.title}」`,
    `核心推进：${route.coreMove}`,
    "章节节拍：",
    ...beats,
    "人物选择：",
    ...choices,
    `读者回报：${route.readerPayoff}`,
    `预期变化：${route.expectedChanges.join("；")}`,
    "风险控制：",
    ...risks,
  ].join("\n");
}

function scoreTone(score: number): "default" | "secondary" | "outline" {
  if (score >= 88) return "default";
  if (score >= 75) return "secondary";
  return "outline";
}

export default function ChapterRouteForecastDialog(props: ChapterRouteForecastDialogProps) {
  const { novelId, chapter, disabled = false } = props;
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [authorIntent, setAuthorIntent] = useState("");
  const [candidateCount, setCandidateCount] = useState(3);
  const [horizon, setHorizon] = useState(3);
  const [forecast, setForecast] = useState<NovelRouteForecast | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedDecisionId, setSelectedDecisionId] = useState("");
  const [message, setMessage] = useState("");

  const decisionsQuery = useQuery({
    queryKey: queryKeys.novels.creativeDecisions(novelId),
    queryFn: () => listCreativeDecisions(novelId),
    enabled: Boolean(novelId && chapter),
  });

  useEffect(() => {
    setForecast(null);
    setSelectedRouteId("");
    setSelectedDecisionId("");
    setMessage("");
  }, [chapter?.id]);

  useEffect(() => {
    const existing = decisionsQuery.data?.data?.find((item) => (
      item.chapterId === chapter?.id && item.sourceType === "route_forecast"
    ));
    setSelectedDecisionId(existing?.id ?? "");
  }, [chapter?.id, decisionsQuery.data?.data]);

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!chapter) throw new Error("请先选择要推演的章节。");
      return generateNovelRouteForecast(novelId, chapter.id, {
        candidateCount,
        horizon,
        authorIntent: authorIntent.trim() || undefined,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.55,
      });
    },
    onSuccess: (response) => {
      setForecast(response.data ?? null);
      setSelectedRouteId("");
      setMessage("");
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "剧情路线推演失败，请稍后再试。");
    },
  });

  const selectMutation = useMutation({
    mutationFn: (route: NovelRouteForecastCandidate) => {
      if (!chapter || !forecast) throw new Error("请先生成剧情路线。");
      const payload = {
        chapterId: chapter.id,
        category: "后续剧情路线",
        content: buildDecisionContent(forecast, route),
        importance: "high",
        expiresAt: forecast.chapterOrder + forecast.horizon - 1,
        sourceType: "route_forecast",
        sourceRefId: `${chapter.id}:${forecast.sourceFingerprint}:${route.id}`,
      };
      return selectedDecisionId
        ? updateCreativeDecision(novelId, selectedDecisionId, payload)
        : createCreativeDecision(novelId, payload);
    },
    onSuccess: async (response, route) => {
      setSelectedRouteId(route.id);
      setSelectedDecisionId(response.data?.id ?? selectedDecisionId);
      setMessage(`路线「${route.title}」会作为第 ${forecast?.chapterOrder}-${(forecast?.chapterOrder ?? 0) + (forecast?.horizon ?? 1) - 1} 章的写作方向。`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.creativeDecisions(novelId) });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "保存剧情路线失败，请稍后再试。");
    },
  });

  return (
    <>
      <AiButton
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled || !chapter}
      >
        推演后续剧情路线
      </AiButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <AppDialogContent
          className="max-w-6xl"
          title={chapter ? `推演第${chapter.order}章起的剧情路线` : "推演剧情路线"}
          description="AI 会给出多条互相独立的推进方案。生成候选不会修改正文或正史，只有你选择的路线会进入后续写作上下文。"
        >
          <div className="space-y-5">
            <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/15 p-4 lg:grid-cols-[1fr_150px_150px_auto] lg:items-end">
              <label className="space-y-1 text-sm">
                <span className="font-medium">你更想看到什么（可选）</span>
                <textarea
                  className="min-h-20 w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={authorIntent}
                  onChange={(event) => setAuthorIntent(event.target.value)}
                  maxLength={1_000}
                  placeholder="例如：希望主角主动设局，但不要在本章揭开最终幕后人。"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">候选数量</span>
                <select
                  className="h-10 w-full rounded-xl border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={candidateCount}
                  onChange={(event) => setCandidateCount(Number(event.target.value))}
                >
                  {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 条</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">推演范围</span>
                <select
                  className="h-10 w-full rounded-xl border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={horizon}
                  onChange={(event) => setHorizon(Number(event.target.value))}
                >
                  {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 章</option>)}
                </select>
              </label>
              <AiButton
                onClick={() => generateMutation.mutate()}
                disabled={!chapter || generateMutation.isPending}
              >
                {generateMutation.isPending ? "正在推演..." : forecast ? "重新推演" : "生成路线"}
              </AiButton>
            </div>

            {message ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6">
                {message}
              </div>
            ) : null}

            {forecast ? (
              <>
                <div className="rounded-2xl border border-border/70 p-4 text-sm leading-6">
                  <div className="font-semibold">路线对比</div>
                  <div className="mt-1 text-muted-foreground">{forecast.comparisonSummary}</div>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {forecast.routes.map((route) => {
                    const recommended = route.id === forecast.recommendedRouteId;
                    const selected = route.id === selectedRouteId;
                    return (
                      <div key={route.id} className="flex flex-col rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold">{route.title}</div>
                              {recommended ? <Badge>AI 推荐</Badge> : null}
                              {selected ? <Badge variant="secondary">已选用</Badge> : null}
                            </div>
                            <div className="mt-2 text-sm leading-6 text-muted-foreground">{route.coreMove}</div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            <Badge variant={scoreTone(route.fitScore)}>适配 {route.fitScore}</Badge>
                            <Badge variant={scoreTone(route.noveltyScore)}>新鲜 {route.noveltyScore}</Badge>
                            <Badge variant={scoreTone(route.continuityScore)}>连贯 {route.continuityScore}</Badge>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {route.chapterBeats.map((beat) => (
                            <div key={beat.chapterOffset} className="rounded-xl border bg-muted/10 p-3 text-sm leading-6">
                              <div className="font-medium">第{forecast.chapterOrder + beat.chapterOffset}章</div>
                              <div className="text-muted-foreground">目标：{beat.objective}</div>
                              <div className="text-muted-foreground">冲突：{beat.conflict}</div>
                              <div className="text-muted-foreground">转折：{beat.turningPoint}</div>
                              <div className="text-muted-foreground">章末牵引：{beat.hook}</div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 space-y-2 text-sm leading-6">
                          <div><span className="font-medium">读者回报：</span>{route.readerPayoff}</div>
                          <div><span className="font-medium">适配理由：</span>{route.fitReason}</div>
                          <div>
                            <span className="font-medium">主要风险：</span>
                            {route.risks.map((risk) => `${risk.summary}（${risk.mitigation}）`).join("；")}
                          </div>
                        </div>

                        <div className="mt-auto pt-4">
                          <Button
                            className="w-full"
                            variant={selected ? "secondary" : recommended ? "default" : "outline"}
                            onClick={() => selectMutation.mutate(route)}
                            disabled={selectMutation.isPending || selected}
                          >
                            {selected ? "这条路线会进入后续写作" : "选用这条路线"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed p-8 text-center text-sm leading-6 text-muted-foreground">
                生成后可以横向比较人物选择、章节节拍、读者回报和连续性风险，再决定后续方向。
              </div>
            )}
          </div>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
