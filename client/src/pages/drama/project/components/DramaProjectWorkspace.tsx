import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import {
  assembleDramaSourceBundle,
  checkDramaProjectCompliance,
  createDramaEpisodeBatchJob,
  createDramaVideoProviderTask,
  downloadDramaEpisodeExport,
  downloadDramaExport,
  generateDramaEpisodeScript,
  generateDramaOutline,
  generateDramaStoryboard,
  generateDramaStrategy,
  generateDramaShotKeyframe,
  generateDramaVideoPrompt,
  getDramaProject,
  importDramaCharacterFromLibrary,
  listDramaCharacterLibrary,
  listDramaTTSProviders,
  listDramaVideoProviders,
  repairDramaEpisode,
  refreshDramaVideoProviderTask,
  reviewDramaEpisode,
  saveDramaCharacterToLibrary,
  type DramaEpisodeExportFormat,
  updateDramaCharacter,
  updateDramaEpisode,
} from "@/api/drama";
import { queryKeys } from "@/api/queryKeys";
import { DramaCharactersPanel } from "@/pages/drama/components/DramaCharactersPanel";
import { DramaNextStepPanel } from "@/pages/drama/components/DramaNextStepPanel";
import { DramaQualityPanel } from "@/pages/drama/components/DramaQualityPanel";
import { DramaSourcePanel } from "@/pages/drama/components/DramaSourcePanel";
import { DramaVisualPanel } from "@/pages/drama/components/DramaVisualPanel";
import { dramaTrackLabel } from "@/pages/drama/dramaDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  type DramaTab,
  summarizeBatchCosts,
  statusLabel,
  formatBatchCost,
  TABS,
} from "../domain/dramaProjectPresentation";
import { downloadBlob } from "../infrastructure/downloadDramaBlob";
import { ProjectProgress } from "./ProjectProgress";
import { StrategyPanel } from "./StrategyPanel";
import { EpisodesPanel } from "./episodes/EpisodesPanel";

export default function DramaProjectPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DramaTab>("source");
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [selectedVideoProvider, setSelectedVideoProvider] = useState("mock");

  const projectQuery = useQuery({
    queryKey: queryKeys.drama.project(id ?? "none"),
    queryFn: () => getDramaProject(id!),
    enabled: Boolean(id),
  });
  const characterLibraryQuery = useQuery({
    queryKey: queryKeys.drama.characterLibrary(id),
    queryFn: () => listDramaCharacterLibrary(id),
    enabled: Boolean(id),
  });
  const videoProvidersQuery = useQuery({
    queryKey: queryKeys.drama.videoProviders,
    queryFn: listDramaVideoProviders,
  });
  const ttsProvidersQuery = useQuery({
    queryKey: queryKeys.drama.ttsProviders,
    queryFn: listDramaTTSProviders,
  });

  const project = projectQuery.data?.data;
  const videoProviders = videoProvidersQuery.data?.data ?? [];
  const ttsProviders = ttsProvidersQuery.data?.data ?? [];
  const activeVideoProvider = videoProviders.some((provider) => provider.provider === selectedVideoProvider)
    ? selectedVideoProvider
    : videoProviders[0]?.provider ?? "mock";
  const selectedOrderValue = useMemo(() => {
    if (selectedOrder) {
      return selectedOrder;
    }
    return project?.episodes?.[0]?.order ?? null;
  }, [project?.episodes, selectedOrder]);
  const batchCostSummary = project ? summarizeBatchCosts(project) : null;

  const invalidateProject = async () => {
    if (!id) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.project(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.projects });
    await queryClient.invalidateQueries({ queryKey: queryKeys.drama.characterLibrary(id) });
  };

  const actionMutation = useMutation({
    mutationFn: async (input: { action: () => Promise<unknown>; message: string }) => {
      await input.action();
      return input.message;
    },
    onSuccess: async (message) => {
      await invalidateProject();
      toast.success(message);
    },
  });

  const runAction = (action: () => Promise<unknown>, message: string) => {
    return actionMutation.mutateAsync({ action, message });
  };

  const handleExport = async (format: "markdown" | "json") => {
    if (!project) {
      return;
    }
    const blob = await downloadDramaExport(project.id, format);
    downloadBlob(blob, `${project.title}-short-drama.${format === "json" ? "json" : "md"}`);
  };

  const handleEpisodeExport = async (order: number, format: DramaEpisodeExportFormat) => {
    if (!project) {
      return;
    }
    const blob = await downloadDramaEpisodeExport(project.id, order, format);
    const suffix = format === "timeline-json" ? "timeline.json" : "srt";
    downloadBlob(blob, `${project.title}-E${order}.${suffix}`);
  };

  const handleSaveEpisode = (order: number, input: {
    title: string;
    hookOpening: string;
    cliffhanger: string;
    content: string;
    durationSec: string;
  }) => {
    if (!project) {
      return;
    }
    const durationSec = input.durationSec.trim() ? Number(input.durationSec) : undefined;
    if (!input.title.trim()) {
      toast.error("请填写本集标题。");
      return;
    }
    runAction(
      () => updateDramaEpisode(project.id, order, {
        title: input.title.trim(),
        hookOpening: input.hookOpening.trim() || null,
        cliffhanger: input.cliffhanger.trim() || null,
        content: input.content,
        durationSec: durationSec !== undefined && Number.isFinite(durationSec) ? durationSec : null,
      }),
      `第 ${order} 集已保存。`,
    );
  };

  if (projectQuery.isLoading) {
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">正在加载短剧项目...</div>;
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/drama"><ArrowLeft className="h-4 w-4" />返回短剧工作台</Link>
        </Button>
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">没有找到这个短剧项目。</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-0">
            <Link to="/drama"><ArrowLeft className="h-4 w-4" />短剧工作台</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-normal">{project.title}</h1>
            <Badge variant="secondary">{statusLabel(project.status)}</Badge>
            <Badge variant="outline">{dramaTrackLabel(project.track)}</Badge>
            <Badge variant="outline">{project.targetEpisodes} 集</Badge>
            {batchCostSummary ? (
              <Badge variant="outline">
                生产费用：已用 {formatBatchCost(batchCostSummary, batchCostSummary.actual)} / 预计 {formatBatchCost(batchCostSummary, batchCostSummary.estimated)}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            按“素材 → 策略 → 分集 → 台本 → 质量 → 分镜视频”的顺序推进这部短剧。
          </p>
        </div>
        <Button type="button" variant="outline" disabled={projectQuery.isFetching} onClick={() => void projectQuery.refetch()}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      <ProjectProgress project={project} />

      <DramaNextStepPanel
        project={project}
        busy={actionMutation.isPending}
        onSetTab={setActiveTab}
        onSelectEpisode={setSelectedOrder}
        onAssembleSource={() => runAction(() => assembleDramaSourceBundle(project.id), "短剧素材已整理。")}
        onGenerateStrategy={() => runAction(() => generateDramaStrategy(project.id), "短剧策略已生成。")}
        onGenerateOutline={() => runAction(() => generateDramaOutline(project.id, { startOrder: 1, count: 12 }), "前 12 集分集已生成。")}
        onGenerateScript={(order) => runAction(() => generateDramaEpisodeScript(project.id, order), `第 ${order} 集台本已生成。`)}
        onReviewEpisode={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
        onRepairEpisode={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
        onGenerateStoryboard={(order) => runAction(() => generateDramaStoryboard(project.id, order), `第 ${order} 集分镜已生成。`)}
        onGenerateVideoPrompt={(shot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
        onCreateProviderTask={(prompt) => runAction(() => createDramaVideoProviderTask(prompt.id, activeVideoProvider), "视频任务已创建。")}
        onExportMarkdown={() => void handleExport("markdown")}
      />

      <div className="flex gap-2 overflow-x-auto border-b pb-2">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            size="sm"
            variant={activeTab === tab.key ? "default" : "ghost"}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "source" ? <DramaSourcePanel project={project} /> : null}
      {activeTab === "strategy" ? <StrategyPanel project={project} /> : null}
      {activeTab === "episodes" ? (
        <EpisodesPanel
          project={project}
          selectedOrder={selectedOrderValue}
          onSelectOrder={setSelectedOrder}
          ttsProviders={ttsProviders}
          onBatchJob={(order, input) => runAction(() => createDramaEpisodeBatchJob(project.id, order, input), "配音任务已创建。")}
          busy={actionMutation.isPending}
          onGenerateScript={(order) => runAction(() => generateDramaEpisodeScript(project.id, order), `第 ${order} 集台本已生成。`)}
          onReview={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
          onRepair={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
          onSave={handleSaveEpisode}
        />
      ) : null}
      {activeTab === "quality" ? (
        <DramaQualityPanel
          project={project}
          busy={actionMutation.isPending}
          onSelectEpisode={setSelectedOrder}
          onOpenEpisodes={() => setActiveTab("episodes")}
          onReview={(order) => runAction(() => reviewDramaEpisode(project.id, order), `第 ${order} 集质量检查完成。`)}
          onComplianceAll={() => runAction(() => checkDramaProjectCompliance(project.id), "合规预检完成。")}
          onRepair={(order) => runAction(() => repairDramaEpisode(project.id, order), `第 ${order} 集已按质量建议修复。`)}
        />
      ) : null}
      {activeTab === "characters" ? (
        <DramaCharactersPanel
          project={project}
          library={characterLibraryQuery.data?.data ?? []}
          busy={actionMutation.isPending}
          onSave={(character, input) => {
            if (!input.name.trim()) {
              toast.error("请填写角色名。");
              return;
            }
            runAction(
              () => updateDramaCharacter(project.id, character.id, {
                name: input.name.trim(),
                archetype: input.screenRole.trim() || undefined,
                persona: input.audienceRead.trim() || undefined,
                speechStyle: input.lineRule.trim() || undefined,
                visualAnchor: input.visualAnchor.trim() || undefined,
                voiceProfile: input.voiceAnchor.trim() || undefined,
                relations: input.relationMap.trim() || undefined,
              }),
              `${input.name || character.name} 已保存。`,
            );
          }}
          onSaveToLibrary={(character) => runAction(
            () => saveDramaCharacterToLibrary(project.id, character.id),
            `${character.name} 已保存到角色库。`,
          )}
          onImportFromLibrary={(libraryId) => runAction(
            () => importDramaCharacterFromLibrary(project.id, libraryId),
            "角色已导入当前项目。",
          )}
          onRefreshProject={() => void projectQuery.refetch()}
        />
      ) : null}
      {activeTab === "visual" ? (
        <DramaVisualPanel
          project={project}
          selectedOrder={selectedOrderValue}
          onSelectOrder={setSelectedOrder}
          busy={actionMutation.isPending}
          onStoryboard={(order) => runAction(() => generateDramaStoryboard(project.id, order), `第 ${order} 集分镜已生成。`)}
          onBatchJob={(order, input) => runAction(() => createDramaEpisodeBatchJob(project.id, order, input), "批量任务已创建。")}
          onKeyframe={(shot, provider, useCharacterRefImages, overrides) => runAction(() => generateDramaShotKeyframe(project.id, shot.id, provider, useCharacterRefImages, overrides), `镜头 ${shot.order} 的首帧图已生成。`)}
          onVideoPrompt={(shot) => runAction(() => generateDramaVideoPrompt(project.id, shot.id), `镜头 ${shot.order} 的视频提示词已生成。`)}
          videoProviders={videoProviders}
          selectedProvider={activeVideoProvider}
          onSelectProvider={setSelectedVideoProvider}
          onProviderTask={(prompt, provider) => runAction(() => createDramaVideoProviderTask(prompt.id, provider), "视频任务已创建。")}
          onRefreshProviderTask={(prompt) => runAction(() => refreshDramaVideoProviderTask(prompt.id), "视频任务状态已刷新。")}
        />
      ) : null}
      {activeTab === "export" ? (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg">导出短剧资料</CardTitle>
            <CardDescription>导出当前项目的角色、分集和已生成台本。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleExport("markdown")}>
              <Download className="h-4 w-4" />
              导出 Markdown
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleExport("json")}>
              <Download className="h-4 w-4" />
              导出 JSON
            </Button>
            {selectedOrderValue ? (
              <>
                <Button type="button" variant="outline" onClick={() => void handleEpisodeExport(selectedOrderValue, "srt")}>
                  <Download className="h-4 w-4" />
                  导出本集 SRT
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleEpisodeExport(selectedOrderValue, "timeline-json")}>
                  <Download className="h-4 w-4" />
                  导出剪辑草稿
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
