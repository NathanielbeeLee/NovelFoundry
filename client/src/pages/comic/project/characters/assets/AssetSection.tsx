import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import {
  characterAssetImageUrl,
  createCharacterAsset,
  deleteCharacterAsset,
  generateCharacterAssetImage,
  prepareCharacterAssetImage,
  listCharacterAssets,
  uploadCharacterAssetImage,
  type CharacterAssetType,
  type AssetImageData,
  type ComicCharacterAsset,
  type ComicCharacter,
} from "@/api/comic";
import { ImageGenerationConfirmDialog } from "@/components/image/ImageGenerationConfirmDialog";
import { useImageGenerationFlow } from "@/components/image/useImageGenerationFlow";
import { toast } from "@/components/ui/toast";
import { GeneratedImageCard } from "@/components/comic/GeneratedImageCard";

// ─── Asset Section ────────────────────────────────────────────────────────────

const ASSET_TYPE_LABELS: Record<CharacterAssetType, string> = {
  costume: "服装",
  weapon: "武器",
  item: "道具",
  vehicle: "载具",
  ability: "技能",
  other: "其他",
};

const ASSET_TYPE_ORDER: CharacterAssetType[] = ["costume", "weapon", "item", "vehicle", "ability", "other"];

const ASSET_TYPE_ACCENT: Record<CharacterAssetType, { chip: string; dot: string; soft: string }> = {
  costume: { chip: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/20 dark:text-violet-300", dot: "bg-violet-500", soft: "hover:bg-violet-50 hover:border-violet-300 dark:hover:bg-violet-900/20" },
  weapon:  { chip: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/20 dark:text-rose-300", dot: "bg-rose-500", soft: "hover:bg-rose-50 hover:border-rose-300 dark:hover:bg-rose-900/20" },
  item:    { chip: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300", dot: "bg-amber-500", soft: "hover:bg-amber-50 hover:border-amber-300 dark:hover:bg-amber-900/20" },
  vehicle: { chip: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700/50 dark:bg-sky-900/20 dark:text-sky-300", dot: "bg-sky-500", soft: "hover:bg-sky-50 hover:border-sky-300 dark:hover:bg-sky-900/20" },
  ability: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-300", dot: "bg-emerald-500", soft: "hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-900/20" },
  other:   { chip: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground/60", soft: "hover:bg-muted/60" },
};

const STATUS_DOT_STYLE: Record<string, string> = {
  idle: "bg-muted-foreground/30",
  generating: "bg-sky-500 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-rose-500",
};

const STATUS_DOT_TITLE: Record<string, string> = {
  idle: "未生成",
  generating: "生成中",
  done: "已就绪",
  error: "生成失败",
};

function parseAssetImageData(raw: string | null): AssetImageData {
  if (!raw) return { status: "idle" };
  try { return JSON.parse(raw) as AssetImageData; } catch { return { status: "idle" }; }
}

function AssetCard({
  asset,
  provider,
  onDeleted,
  onUpdated,
}: {
  asset: ComicCharacterAsset;
  provider: string;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const imageData = parseAssetImageData(asset.imageData);
  const flow = useImageGenerationFlow();

  const triggerGen = () => {
    flow.start({
      prepare: () => prepareCharacterAssetImage(asset.id, provider || undefined),
      generate: (overrides) => generateCharacterAssetImage(asset.id, provider || undefined, overrides),
      onSuccess: onUpdated,
    });
  };

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadCharacterAssetImage(asset.id, file),
    onSuccess: onUpdated,
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteCharacterAsset(asset.id),
    onSuccess: onDeleted,
    onError: (e) => toast.error(String(e)),
  });

  const accent = ASSET_TYPE_ACCENT[asset.assetType as CharacterAssetType] ?? ASSET_TYPE_ACCENT.other;
  const status = (imageData.status ?? "idle") as "idle" | "generating" | "done" | "error";

  return (
    <>
      <ImageGenerationConfirmDialog {...flow.dialogProps} />
      <GeneratedImageCard
        status={status}
        imageUrl={status === "done" ? characterAssetImageUrl(asset.id) : undefined}
        errorMessage={imageData.error}
        title={asset.name}
        subtitle={asset.description ?? undefined}
        typeBadge={{ label: ASSET_TYPE_LABELS[asset.assetType as CharacterAssetType] ?? asset.assetType, className: accent.chip }}
        onGenerate={triggerGen}
        onUpload={(file) => uploadMut.mutate(file)}
        onDelete={() => deleteMut.mutate()}
        busy={uploadMut.isPending || deleteMut.isPending}
        confirmDeleteText={`删除资产「${asset.name}」？此操作不可撤销。`}
      />
    </>
  );
}

/** 类型快捷按钮 */
function AssetTypeChip({
  type,
  active,
  onClick,
}: {
  type: CharacterAssetType;
  active: boolean;
  onClick: () => void;
}) {
  const accent = ASSET_TYPE_ACCENT[type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
        active
          ? `${accent.chip} ring-2 ring-offset-1 ring-offset-background ring-current/40`
          : `border-border bg-background text-muted-foreground ${accent.soft}`,
      ].join(" ")}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
      {ASSET_TYPE_LABELS[type]}
    </button>
  );
}

/** 添加输入行：激活某类型后展示，Enter 提交，Esc 取消，连续添加 */
function AssetAddRow({
  type,
  characterId,
  projectId,
  onCreated,
  onClose,
}: {
  type: CharacterAssetType;
  characterId: string;
  projectId: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const createMut = useMutation({
    mutationFn: () =>
      createCharacterAsset({
        characterId,
        projectId,
        assetType: type,
        name: name.trim(),
        description: desc.trim() || undefined,
      }),
    onSuccess: () => {
      onCreated();
      setName("");
      setDesc("");
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    onError: (e) => toast.error(String(e)),
  });

  const accent = ASSET_TYPE_ACCENT[type];
  const placeholderName = type === "costume" ? "战斗套装" : type === "weapon" ? "月光剑" : type === "vehicle" ? "踏雪马" : type === "ability" ? "破云剑诀" : "宗门腰牌";

  return (
    <div className="mb-3 rounded-lg border-2 border-dashed border-primary/30 bg-background px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
          <p className="text-[11px] font-semibold text-foreground">
            新增{ASSET_TYPE_LABELS[type]}
          </p>
          <span className="text-[10px] text-muted-foreground">回车提交 · Esc 关闭 · 可连续添加</span>
        </div>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          完成
        </button>
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          placeholder={`${ASSET_TYPE_LABELS[type]}名称（如：${placeholderName}）`}
          value={name}
          disabled={createMut.isPending}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) createMut.mutate();
            if (e.key === "Escape") onClose();
          }}
        />
        <input
          className="flex-[1.2] rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          placeholder="外观描述（可选，注入生图提示词）"
          value={desc}
          disabled={createMut.isPending}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) createMut.mutate();
            if (e.key === "Escape") onClose();
          }}
        />
        <button
          type="button"
          disabled={!name.trim() || createMut.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          onClick={() => createMut.mutate()}
        >
          {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "添加"}
        </button>
      </div>
    </div>
  );
}

export function AssetSection({
  character,
  provider,
}: {
  character: ComicCharacter;
  provider: string;
}) {
  const queryClient = useQueryClient();
  const [activeAddType, setActiveAddType] = useState<CharacterAssetType | null>(null);

  const assetsKey = ["comic", "character-assets", character.id];

  const { data: assets = [], isLoading } = useQuery({
    queryKey: assetsKey,
    queryFn: () => listCharacterAssets(character.id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: assetsKey });

  const grouped = ASSET_TYPE_ORDER
    .map((type) => ({ type, items: assets.filter((a) => a.assetType === type) }))
    .filter((g) => g.items.length > 0);

  const isEmpty = !isLoading && assets.length === 0;

  return (
    <div className="border-t bg-muted/10 px-4 py-4">
      {/* 标题 */}
      <div className="mb-2.5 flex items-baseline gap-2">
        <p className="text-sm font-semibold">角色资产库</p>
        <span className="text-[11px] text-muted-foreground">
          {assets.length > 0
            ? `${assets.length} 个资产 · 已按类型分组`
            : "服装、武器、道具一旦录入，生格子图会自动注入到参考图，提升一致性"}
        </span>
      </div>

      {/* 类型快捷条 = 主入口 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">添加：</span>
        {ASSET_TYPE_ORDER.map((t) => (
          <AssetTypeChip
            key={t}
            type={t}
            active={activeAddType === t}
            onClick={() => setActiveAddType(activeAddType === t ? null : t)}
          />
        ))}
      </div>

      {activeAddType && (
        <AssetAddRow
          key={activeAddType}
          type={activeAddType}
          characterId={character.id}
          projectId={character.projectId}
          onCreated={refresh}
          onClose={() => setActiveAddType(null)}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          加载中...
        </div>
      )}

      {isEmpty && !activeAddType && (
        <div className="rounded-lg border border-dashed bg-background/50 px-4 py-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Plus className="h-5 w-5" />
          </div>
          <p className="text-xs font-semibold text-foreground">还没有资产</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            点击上方任意彩色标签即可快速添加。<br />
            生格子图时会自动把对应资产合成到参考图，锁定服装 / 武器 / 道具外形。
          </p>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="space-y-4">
          {grouped.map(({ type, items }) => {
            const accent = ASSET_TYPE_ACCENT[type];
            return (
              <div key={type}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                  <span className="text-[11px] font-semibold text-foreground">
                    {ASSET_TYPE_LABELS[type]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {items.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      provider={provider}
                      onDeleted={refresh}
                      onUpdated={refresh}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
