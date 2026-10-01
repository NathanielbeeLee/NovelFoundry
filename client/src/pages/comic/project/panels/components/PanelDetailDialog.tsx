import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  FileText,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { panelImageUrl, updatePanelVisualPrompt, type ComicPanel } from "@/api/comic";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  parseImageData,
  densityBadge,
  parseLayoutData,
  isPanelImageStale,
  REF_KIND_COLOR,
  REF_KIND_LABEL,
} from "../domain/panelPresentation";

export function PanelDetailDialog({
  panel,
  busy,
  onClose,
  onGenerate,
  onSaved,
}: {
  panel: ComicPanel;
  busy: boolean;
  onClose: () => void;
  onGenerate: (panelId: string) => void;
  onSaved: (panel: ComicPanel) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftVisualPrompt, setDraftVisualPrompt] = useState(panel.visualPrompt);
  const imageData = parseImageData(panel.imageData);
  const density = densityBadge(panel.densityLevel);
  const layoutData = parseLayoutData(panel.layoutData);
  const imageStale = isPanelImageStale(panel, imageData);

  useEffect(() => {
    setDraftVisualPrompt(panel.visualPrompt);
    setIsEditing(false);
  }, [panel.id, panel.visualPrompt]);

  const savePromptMut = useMutation({
    mutationFn: () => updatePanelVisualPrompt(panel.id, draftVisualPrompt.trim()),
    onSuccess: (updatedPanel) => {
      onSaved(updatedPanel);
      setIsEditing(false);
      toast.success("画面脚本已保存");
    },
    onError: (e) => toast.error(String(e)),
  });

  const saveAndGenerate = () => {
    savePromptMut.mutate(undefined, {
      onSuccess: (updatedPanel) => {
        onSaved(updatedPanel);
        onGenerate(updatedPanel.id);
        onClose();
      },
    });
  };

  const canSave = draftVisualPrompt.trim().length > 0 && draftVisualPrompt.trim().length <= 400;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AppDialogContent
        title={`第 ${panel.order} 格 · ${panel.panelType}`}
        description="检查并调整这一格的画面描述；重新生图会使用保存后的内容。"
        className="max-w-4xl"
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-0 lg:flex-row">
          <div className="border-b bg-muted/30 p-4 lg:w-56 lg:border-b-0 lg:border-r">
            {imageData.status === "done" ? (
              <div className="relative">
                <img
                  src={panelImageUrl(panel.id)}
                  alt={`第 ${panel.order} 格`}
                  className="mx-auto max-h-72 w-full rounded-md object-contain lg:max-h-none"
                />
                {imageStale && (
                  <span className="absolute left-2 top-2 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    待重抽
                  </span>
                )}
              </div>
            ) : (
              <div className="flex aspect-[2/3] w-full items-center justify-center rounded-md bg-muted">
                <ImageOff className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}
            <Button
              type="button"
              size="sm"
              className="mt-3 w-full"
              disabled={busy || savePromptMut.isPending}
              onClick={() => {
                onGenerate(panel.id);
                onClose();
              }}
            >
              {imageData.status === "done" ? (
                <>
                  <RefreshCw className="h-3 w-3" />
                  重抽
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  生图
                </>
              )}
            </Button>
            {imageStale && (
              <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-800">
                画面脚本已在上次生图后修改，重抽后图片才会使用新的脚本。
              </p>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-4 p-4">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">动作描述</span>
                <span className={`rounded border px-2 py-0.5 text-[11px] ${density.className}`}>{density.label}</span>
              </div>
              <div className="rounded bg-muted px-2 py-1.5 text-sm">{panel.action}</div>
            </div>

            {panel.focus && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">主视觉焦点</div>
                <div className="rounded bg-muted/60 px-2 py-1.5 text-sm">{panel.focus}</div>
              </div>
            )}

            {layoutData.layout && (
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">版式结构</div>
                <div className="rounded border bg-muted/40 px-2 py-2 text-xs leading-relaxed text-muted-foreground">
                  <div className="font-medium text-foreground">{layoutData.layout === "four_koma" ? "四格起承转合" : layoutData.layout}</div>
                  {layoutData.subPanels?.length ? (
                    <div className="mt-1 space-y-1">
                      {layoutData.subPanels.map((subPanel) => (
                        <div key={`${subPanel.order}-${subPanel.beat}`}>
                          {subPanel.order}. {subPanel.beat}：{subPanel.visualPrompt}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">画面脚本</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={savePromptMut.isPending}
                  onClick={() => {
                    setDraftVisualPrompt(panel.visualPrompt);
                    setIsEditing((value) => !value);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  {isEditing ? "取消编辑" : "编辑"}
                </Button>
              </div>
              <textarea
                readOnly={!isEditing}
                value={draftVisualPrompt}
                maxLength={400}
                rows={5}
                onChange={(event) => setDraftVisualPrompt(event.target.value)}
                className={[
                  "w-full resize-y rounded border px-2 py-1.5 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring",
                  isEditing ? "bg-background" : "bg-muted",
                ].join(" ")}
              />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>保存后，下一次生图会使用这段画面脚本。</span>
                <span>{draftVisualPrompt.length}/400</span>
              </div>
              {isEditing && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canSave || savePromptMut.isPending}
                    onClick={() => savePromptMut.mutate()}
                  >
                    {savePromptMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    保存
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canSave || busy || savePromptMut.isPending}
                    onClick={saveAndGenerate}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    保存并生图
                  </Button>
                </div>
              )}
            </div>

            {imageData.referenceImages && imageData.referenceImages.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <ImageIcon className="h-3 w-3" />
                  本次生图使用的参考素材
                  <span className="rounded border bg-muted px-1 py-px text-[10px] font-normal text-muted-foreground">
                    {imageData.referenceImages.length}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {imageData.referenceImages.map((ref, i) => {
                    const kindStyle = REF_KIND_COLOR[ref.kind] ?? REF_KIND_COLOR.asset;
                    const kindLabel = REF_KIND_LABEL[ref.kind] ?? ref.kind;
                    return (
                      <a
                        key={`${ref.url}-${i}`}
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        title={`${kindLabel} · ${ref.label}（点击查看大图）`}
                        className="group block overflow-hidden rounded border bg-background transition-colors hover:border-primary"
                      >
                        <div className="aspect-square bg-muted/30">
                          <img
                            src={ref.url}
                            alt={ref.label}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </div>
                        <div className="border-t px-1.5 py-1">
                          <span className={`inline-block rounded border px-1 py-px text-[9px] leading-none ${kindStyle}`}>
                            {kindLabel}
                          </span>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground">{ref.label}</p>
                        </div>
                      </a>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  这些素材会被合成为雪碧图后传给图像模型，用于锁定角色外形、服装、道具与场景。
                </p>
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <FileText className="h-3 w-3" />
                上次发送给图像模型的 Prompt
              </div>
              {imageData.prompt ? (
                <>
                  <textarea
                    readOnly
                    value={imageData.prompt}
                    rows={6}
                    className="w-full resize-y rounded border bg-muted/60 px-2 py-1.5 text-xs leading-relaxed focus:outline-none"
                  />
                  {imageData.provider && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      模型：{imageData.provider}{imageData.generatedAt ? ` · 生成于 ${new Date(imageData.generatedAt).toLocaleString("zh-CN")}` : ""}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded bg-muted/50 px-2 py-2 text-xs text-muted-foreground">
                  生图后可在这里查看模型实际收到的完整 prompt。
                </div>
              )}
            </div>
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
