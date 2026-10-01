import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCharacterGender, type ComicCharacterGender, type ComicCharacter } from "@/api/comic";
import { toast } from "@/components/ui/toast";
import SelectControl from "@/components/common/SelectControl";

// ─── Gender Selector ──────────────────────────────────────────────────────────
// 角色性别是所有生图链路（三视图/表情稿/资产/格子图）的 GENDER LOCK 来源。
// 古风/韩漫语境里"鹅蛋脸/桃花眼"等描述男女通用，必须显式声明性别，否则模型偏向韩漫美男。

const GENDER_LABELS: Record<ComicCharacterGender, string> = {
  unknown: "未指定",
  male: "男",
  female: "女",
  other: "中性",
};

const GENDER_BADGE_STYLE: Record<ComicCharacterGender, string> = {
  unknown: "border-border bg-muted text-muted-foreground",
  male: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300",
  female: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-700 dark:bg-pink-900/20 dark:text-pink-300",
  other: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300",
};

export function GenderSelector({ character }: { character: ComicCharacter }) {
  const queryClient = useQueryClient();
  const current = (character.gender ?? "unknown") as ComicCharacterGender;

  const mut = useMutation({
    mutationFn: (g: ComicCharacterGender) => updateCharacterGender(character.id, g),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "project"] });
      toast.success("性别已更新，下次生图生效");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="flex items-center gap-1">
      <SelectControl
        className={`rounded border px-1.5 py-0.5 text-[11px] leading-tight ${GENDER_BADGE_STYLE[current]} disabled:opacity-50`}
        value={current}
        disabled={mut.isPending}
        title="角色性别（GENDER LOCK）：避免生图把女画成男或反之"
        onChange={(e) => mut.mutate(e.target.value as ComicCharacterGender)}
      >
        {(Object.keys(GENDER_LABELS) as ComicCharacterGender[]).map((g) => (
          <option key={g} value={g}>{GENDER_LABELS[g]}</option>
        ))}
      </SelectControl>
    </div>
  );
}
