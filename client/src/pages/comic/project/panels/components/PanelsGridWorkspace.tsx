import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, ImageOff, LayoutGrid, Loader2, RefreshCw, Sparkles, Rows3 } from "lucide-react";
import {
  generatePanelImage,
  listComicEpisodes,
  listComicPanels,
  panelImageUrl,
  preparePanelImage,
  type ComicPanel,
} from "@/api/comic";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
import { Button } from "@/components/ui/button";
import { BatchBar } from "../batch/BatchBar";
import { PanelDetailDialog } from "./PanelDetailDialog";
import { StripView } from "./StripView";
import { parseImageData, densityBadge, isPanelImageStale } from "../domain/panelPresentation";

export function PanelsGridPanel({ projectId, provider }: { projectId: string; provider: string }) {
  const queryClient = useQueryClient();
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [busyPanelId, setBusyPanelId] = useState("");
  const [selectedPanel, setSelectedPanel] = useState<ComicPanel | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "strip">("grid");
  const imageFlow = useImageGenerationFlow();

  const { data: episodes = [] } = useQuery({
    queryKey: ["comic", "episodes", projectId],
    queryFn: () => listComicEpisodes(projectId),
  });

  const activeEpisode = selectedEpisodeId
    ? episodes.find((episode) => episode.id === selectedEpisodeId)
    : episodes[0];

  const { data: panels = [], isLoading: panelsLoading, refetch: refetchPanels } = useQuery({
    queryKey: ["comic", "panels", activeEpisode?.id],
    queryFn: () => (activeEpisode ? listComicPanels(activeEpisode.id) : Promise.resolve([])),
    enabled: Boolean(activeEpisode),
  });

  const startPanelGeneration = (panelId: string) => {
    imageFlow.start({
      prepare: () => preparePanelImage(panelId, provider || undefined),
      generate: async (overrides) => {
        setBusyPanelId(panelId);
        try {
          return await generatePanelImage(panelId, provider || undefined, overrides);
        } finally {
          setBusyPanelId("");
        }
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
      },
      onError: () => {
        queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
      },
    });
  };

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, panel: ComicPanel) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedPanel(panel);
  };

  return (
    <div className="space-y-4">
      <ImageGenerationConfirmDialog {...imageFlow.dialogProps} />
      {episodes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-1 flex-wrap gap-1.5">
            {episodes.map((episode) => (
              <button
                key={episode.id}
                type="button"
                onClick={() => setSelectedEpisodeId(episode.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${(activeEpisode?.id === episode.id) ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}
              >
                第 {episode.order} 话
              </button>
            ))}
          </div>
          <div className="ml-auto flex rounded-md border bg-background p-0.5">
            <button
              type="button"
              title="格子视图"
              className={`rounded p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="条带视图（阅读流）"
              className={`rounded p-1.5 transition-colors ${viewMode === "strip" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setViewMode("strip")}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {activeEpisode && (
        <BatchBar
          episodeId={activeEpisode.id}
          provider={provider}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode.id] });
            void refetchPanels();
          }}
        />
      )}

      {panelsLoading && <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>}
      {!panelsLoading && panels.length === 0 && activeEpisode && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          该话尚无格子脚本，请先在「分话大纲」中生成分格脚本。
        </div>
      )}

      {selectedPanel && (
        <PanelDetailDialog
          panel={selectedPanel}
          busy={busyPanelId === selectedPanel.id}
          onClose={() => setSelectedPanel(null)}
          onGenerate={startPanelGeneration}
          onSaved={(panel) => {
            setSelectedPanel(panel);
            queryClient.invalidateQueries({ queryKey: ["comic", "panels", activeEpisode?.id] });
          }}
        />
      )}

      {viewMode === "strip" ? (
        <div className="overflow-hidden rounded-lg border">
          <StripView
            panels={panels}
            busyPanelId={busyPanelId}
            onSelect={setSelectedPanel}
            onGenerate={startPanelGeneration}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {panels.map((panel) => {
            const imageData = parseImageData(panel.imageData);
            const density = densityBadge(panel.densityLevel);
            const imageStale = isPanelImageStale(panel, imageData);
            const busy = busyPanelId === panel.id;
            return (
              <div
                key={panel.id}
                role="button"
                tabIndex={0}
                className="group relative overflow-hidden rounded-lg border bg-muted outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelectedPanel(panel)}
                onKeyDown={(event) => handlePanelKeyDown(event, panel)}
              >
                {imageData.status === "done" ? (
                  <div className="relative">
                    <img
                      src={panelImageUrl(panel.id)}
                      alt={`第 ${panel.order} 格`}
                      className="aspect-[2/3] w-full object-cover"
                      loading="lazy"
                    />
                    {imageStale && (
                      <span className="absolute left-2 top-2 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        待重抽
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center bg-muted">
                    {busy || imageData.status === "generating" ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>
                )}
                <div className="p-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium">第 {panel.order} 格</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${density.className}`}>{density.label}</span>
                  </div>
                  <div className="mt-1 truncate">
                    <span className="opacity-60">{panel.panelType}</span>
                    {panel.focus ? <span className="ml-1">{panel.focus}</span> : null}
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-8 flex justify-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  {imageData.status !== "done" && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        startPanelGeneration(panel.id);
                      }}
                    >
                      <Sparkles className="h-3 w-3" />
                      生图
                    </Button>
                  )}
                  {imageData.status === "done" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        startPanelGeneration(panel.id);
                      }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      重抽
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedPanel(panel);
                    }}
                  >
                    <FileText className="h-3 w-3" />
                    提示词
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
