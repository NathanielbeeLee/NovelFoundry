import { FileText, ImageOff, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { panelImageUrl, type ComicPanel } from "@/api/comic";
import { Button } from "@/components/ui/button";
import { parseImageData, parseDialogues, isPanelImageStale } from "../domain/panelPresentation";

// ─── Strip view ──────────────────────────────────────────────────────────────
export function StripView({
  panels,
  busyPanelId,
  onSelect,
  onGenerate,
}: {
  panels: ComicPanel[];
  busyPanelId: string;
  onSelect: (panel: ComicPanel) => void;
  onGenerate: (panelId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0">
      {panels.map((panel, idx) => {
        const imageData = parseImageData(panel.imageData);
        const dialogues = parseDialogues(panel.dialogues);
        const imageStale = isPanelImageStale(panel, imageData);
        const busy = busyPanelId === panel.id;

        return (
          <div key={panel.id} className="group relative border-b last:border-b-0">
            <div className="relative w-full overflow-hidden bg-black">
              {imageData.status === "done" ? (
                <>
                  <img
                    src={panelImageUrl(panel.id)}
                    alt={`第 ${panel.order} 格`}
                    className="w-full object-cover"
                    loading={idx < 3 ? "eager" : "lazy"}
                  />
                  {imageStale && (
                    <span className="absolute left-2 top-2 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      待重抽
                    </span>
                  )}
                  {dialogues.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      {dialogues.map((d, i) => (
                        <div key={i} className="text-xs leading-relaxed text-white">
                          {d.speaker && <span className="mr-1 font-bold text-yellow-200">{d.speaker}：</span>}
                          「{d.text}」
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-40 items-center justify-center bg-muted">
                  {busy || imageData.status === "generating" ? (
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  ) : (
                    <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">第 {panel.order} 格</span>
              <span className="opacity-60">{panel.panelType}</span>
              {panel.focus && <span className="flex-1 truncate">{panel.focus}</span>}
              <div className="ml-auto flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                {imageData.status !== "done" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => onGenerate(panel.id)}
                  >
                    <Sparkles className="h-3 w-3" />
                    生图
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => onGenerate(panel.id)}
                  >
                    <RefreshCw className="h-3 w-3" />
                    重抽
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => onSelect(panel)}
                >
                  <FileText className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
