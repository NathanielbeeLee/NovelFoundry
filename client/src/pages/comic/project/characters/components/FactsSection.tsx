import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Trash2 } from "lucide-react";
import { deleteComicFact, listComicFacts, type ComicFact } from "@/api/comic";
import { toast } from "@/components/ui/toast";

const FACT_CATEGORY_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  completed: { label: "已发生", className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300" },
  revealed: { label: "首次登场", className: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-300" },
  state_changed: { label: "状态变化", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
};

export function FactsSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const { data: facts = [], isLoading } = useQuery({
    queryKey: ["comic", "facts", projectId],
    queryFn: () => listComicFacts(projectId),
  });

  const deleteMut = useMutation({
    mutationFn: (factId: string) => deleteComicFact(factId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", "facts", projectId] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const grouped = facts.reduce<Record<number, ComicFact[]>>((acc, fact) => {
    if (!acc[fact.episodeOrder]) acc[fact.episodeOrder] = [];
    acc[fact.episodeOrder].push(fact);
    return acc;
  }, {});
  const sortedOrders = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className="border-t px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <BookMarked className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">跨话事实库</p>
        <span className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{facts.length}</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        生成分格脚本后系统自动提取，用于保证跨话剧情与角色状态一致性。可手动删除不准确的条目。
      </p>

      {isLoading && <div className="text-xs text-muted-foreground">加载中...</div>}

      {!isLoading && facts.length === 0 && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          尚无事实条目。生成至少一话的分格脚本后会自动提取。
        </div>
      )}

      <div className="space-y-3">
        {sortedOrders.map((order) => (
          <div key={order}>
            <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">第 {order} 话</div>
            <div className="space-y-1">
              {grouped[order].map((fact) => {
                const badge = FACT_CATEGORY_BADGE[fact.category] ?? {
                  label: fact.category,
                  className: "border-border bg-muted text-muted-foreground",
                };
                return (
                  <div
                    key={fact.id}
                    className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"
                  >
                    <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] leading-none ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="flex-1 leading-relaxed text-muted-foreground">{fact.text}</span>
                    <button
                      type="button"
                      title="删除此条目"
                      disabled={deleteMut.isPending}
                      className="ml-1 mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteMut.mutate(fact.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
