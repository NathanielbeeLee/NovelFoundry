import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { rewriteCharacterVisualAnchor, updateCharacterVisualAnchor, type ComicCharacter } from "@/api/comic";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { getVisualAnchorText, getFaceShapeOverride } from "../domain/characterPresentation";

// ─── Visual Anchor Editor ──────────────────────────────────────────────────────
// 一次编辑，所有生图（三视图/表情稿/资产/格子图）后续生成都会读新版

const FACE_PRESETS: Array<{ key: string; label: string; snippet: string }> = [
  { key: "round", label: "圆脸", snippet: "脸型圆润饱满，下巴线条柔和不尖锐，round soft face, gentle rounded jawline" },
  { key: "square", label: "方脸", snippet: "脸型方正，下颌角清晰，square face shape, defined jawline angle" },
  { key: "oval", label: "鹅蛋脸", snippet: "脸型为标准鹅蛋脸，oval face shape, balanced proportions" },
  { key: "long", label: "长脸", snippet: "脸型偏长，long face shape, vertically elongated" },
  { key: "young", label: "童颜", snippet: "面部线条柔和带婴儿肥，年龄感偏小，youthful baby face, soft cheeks" },
  { key: "mature", label: "成熟", snippet: "面部骨骼明显，气质成熟，mature defined bone structure, adult features" },
  { key: "sharp", label: "棱角分明", snippet: "颧骨与下颌线条分明，sharp cheekbones, well-defined jawline" },
  { key: "wide_eyes", label: "眼距偏宽", snippet: "双眼间距偏宽，wide-set eyes" },
  { key: "narrow_eyes", label: "丹凤眼", snippet: "眼型为细长丹凤眼，narrow phoenix eyes, upturned outer corners" },
];

interface RewriteSuggestion {
  appearance: string;
  faceShapeOverride?: string;
  rationale: string;
}

export function VisualAnchorEditor({ character }: { character: ComicCharacter }) {
  const queryClient = useQueryClient();
  const initial = getVisualAnchorText(character);
  const initialOverride = getFaceShapeOverride(character);
  const [text, setText] = useState(initial);
  const [override, setOverride] = useState(initialOverride);
  const [editing, setEditing] = useState(false);
  const [showAIBox, setShowAIBox] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [suggestion, setSuggestion] = useState<RewriteSuggestion | null>(null);

  // 切角色时重置（key 已用 character.id 重新挂载 CharacterDetail，但单独保险）
  // 注：CharacterDetail 用 key={character.id}，本组件会随之重建

  const saveMut = useMutation({
    mutationFn: () =>
      updateCharacterVisualAnchor(character.id, {
        appearance: text.trim(),
        faceShapeOverride: override.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project"] });
      toast.success("外貌锚点已保存，下次生图生效");
      setEditing(false);
    },
    onError: (e) => toast.error(String(e)),
  });

  const rewriteMut = useMutation({
    mutationFn: () =>
      rewriteCharacterVisualAnchor(character.id, {
        userInstruction: aiInstruction.trim() || undefined,
      }),
    onSuccess: (result) => {
      setSuggestion(result);
    },
    onError: (e) => toast.error(String(e)),
  });

  const adoptSuggestion = () => {
    if (!suggestion) return;
    setText(suggestion.appearance);
    if (suggestion.faceShapeOverride !== undefined) setOverride(suggestion.faceShapeOverride);
    setSuggestion(null);
    setShowAIBox(false);
    toast.success("已采用 AI 建议，请检查后保存");
  };

  const setPresetAsOverride = (snippet: string) => {
    setOverride(snippet);
    setEditing(true);
  };

  const appendPresetToOverride = (snippet: string) => {
    setOverride((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return snippet;
      if (trimmed.includes(snippet.split("，")[0])) return trimmed;
      return `${trimmed}；${snippet}`;
    });
    setEditing(true);
  };

  const dirty = text.trim() !== initial.trim() || override.trim() !== initialOverride.trim();

  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">外貌锚点</p>
        {!editing && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setEditing(true)}
          >
            编辑
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        所有生图的源头：三视图、表情稿、资产、格子图都读这里。改一次，后续生成全部跟上。
      </p>

      {editing ? (
        <>
          {/* AI 协助优化 */}
          <div className="mt-3 rounded-md border border-violet-300/50 bg-violet-50/40 px-2.5 py-2 dark:border-violet-700/50 dark:bg-violet-900/10">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                <Bot className="h-3 w-3" />
                AI 协助优化
              </p>
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => { setShowAIBox((v) => !v); setSuggestion(null); }}
              >
                {showAIBox ? "收起" : "展开"}
              </button>
            </div>
            {showAIBox && (
              <>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  AI 会消除主外貌里的矛盾词、按你期望微调、保留人设亮点。结果会显示在下方供你审阅，确认后才会替换当前内容。
                </p>
                <input
                  type="text"
                  className="mt-1.5 w-full rounded border bg-background px-2 py-1 text-xs"
                  placeholder="（可选）告诉 AI 怎么改，比如：脸更圆、年龄感更小、像古风少年"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  disabled={rewriteMut.isPending}
                />
                <div className="mt-1.5 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={rewriteMut.isPending || !text.trim()}
                    onClick={() => rewriteMut.mutate()}
                  >
                    {rewriteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {rewriteMut.isPending ? "生成中..." : "让 AI 优化"}
                  </Button>
                </div>
                {suggestion && (
                  <div className="mt-2 space-y-2 rounded border bg-background p-2 text-xs">
                    <p className="text-[10px] font-semibold text-muted-foreground">AI 建议（待采用）</p>
                    <div>
                      <p className="text-[10px] text-muted-foreground">修改说明</p>
                      <p className="mt-0.5 leading-relaxed">{suggestion.rationale}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">新的主外貌</p>
                      <p className="mt-0.5 whitespace-pre-wrap rounded bg-muted/50 p-1.5 leading-relaxed">{suggestion.appearance}</p>
                    </div>
                    {suggestion.faceShapeOverride && (
                      <div>
                        <p className="text-[10px] text-amber-700 dark:text-amber-300">新的脸型强覆盖</p>
                        <p className="mt-0.5 whitespace-pre-wrap rounded bg-amber-50/60 p-1.5 leading-relaxed dark:bg-amber-900/20">{suggestion.faceShapeOverride}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button type="button" size="sm" onClick={adoptSuggestion}>采用</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setSuggestion(null)}>丢弃</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="mt-3 mb-1 text-[10px] font-semibold text-muted-foreground">主外貌描述</p>
          <textarea
            className="w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs leading-relaxed"
            style={{ minHeight: 100 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="描述角色外貌：五官、肤色、发型、年龄、体格、标志特征..."
          />

          <div className="mt-3 rounded-md border border-amber-300/50 bg-amber-50/40 px-2.5 py-2 dark:border-amber-700/50 dark:bg-amber-900/10">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">脸型强覆盖（FINAL OVERRIDE）</p>
              {override && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => setOverride("")}
                >
                  清除
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
              当主外貌里有「锐利如刀刻」「三角眼」等与你期望脸型矛盾的词时，把脸型描述填到这里——生图 prompt 会以最高优先级压制冲突词，无需删原描述。
            </p>
            <textarea
              className="mt-1.5 w-full resize-y rounded border bg-background px-2 py-1 text-xs leading-relaxed"
              style={{ minHeight: 48 }}
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="留空 = 不启用。例如：脸型圆润饱满，下巴柔和不尖锐"
            />
            <div className="mt-1.5">
              <p className="mb-1 text-[10px] text-muted-foreground">骨相速记（点击设为覆盖；已有覆盖时追加）：</p>
              <div className="flex flex-wrap gap-1">
                {FACE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    title={p.snippet}
                    className="rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => (override.trim() ? appendPresetToOverride(p.snippet) : setPresetAsOverride(p.snippet))}
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!dirty || !text.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saveMut.isPending}
              onClick={() => { setText(initial); setOverride(initialOverride); setEditing(false); }}
            >
              取消
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {initial || "该角色还没有外貌锚点。"}
          </p>
          {initialOverride && (
            <div className="mt-1.5 rounded-md border border-amber-300/50 bg-amber-50/40 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/10 dark:text-amber-300">
              <span className="font-semibold">脸型强覆盖：</span>{initialOverride}
            </div>
          )}
        </>
      )}
    </div>
  );
}
