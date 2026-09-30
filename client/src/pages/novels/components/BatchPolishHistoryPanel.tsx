import { useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { PolishRevisionDetail, PolishUndoEligibility } from "@novelfoundry/shared/types/polishHistory";
import { listPolishRevisions, getPolishRevision, undoPolishRevision } from "@/api/novel/polishHistory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";

const reasonText = (reason: PolishUndoEligibility["reason"]) => ({
  review_required: "查看差异后可检查是否能够撤销。",
  content_changed: "正文有后续修改，可查看并复制润色前文字。",
  derived_state_changed: "相关章节或人物记录有后续修改，可查看差异。",
  active_task: "等待本书的生成和同步任务结束后再撤销。",
  incomplete_revision: "此记录仅供比较，无法安全自动还原。",
  already_undone: "本次润色已撤销。",
  backup_unverified: "撤销前需完成备份核验。",
}[reason ?? "incomplete_revision"]);

export default function BatchPolishHistoryPanel({ novelId, running }: { novelId: string; running: boolean }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PolishRevisionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setSelected(null); setConfirming(false); }, [novelId]);
  const history = useInfiniteQuery({ queryKey: ["novels", "polish-history", novelId], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listPolishRevisions(novelId, pageParam), getNextPageParam: (page) => page.nextCursor ?? undefined, refetchInterval: running ? 5000 : 15000 });
  const revisions = history.data?.pages.flatMap((page) => page.items) ?? [];
  const show = async (revisionId: string) => {
    try { const detail = await getPolishRevision(novelId, revisionId); if (detail) { setSelected(detail); setConfirming(false); } }
    catch (error) { toast.error(error instanceof Error ? error.message : "读取润色记录失败。"); }
  };
  const undo = async () => {
    if (!selected?.afterRawHash) return;
    setBusy(true);
    try {
      await undoPolishRevision(novelId, selected.id, selected.afterRawHash);
      toast.success("本章润色已撤销，相关检索内容将重新整理。");
      await queryClient.invalidateQueries({ queryKey: ["novels"] });
      await show(selected.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "未能安全撤销，请查看差异。");
      await history.refetch();
      await show(selected.id);
    } finally { setBusy(false); setConfirming(false); }
  };
  return <Card>
    <CardHeader><CardTitle>润色记录</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">比较每章润色前后的正文；没有后续修改时，可单独撤销本章润色。</p>
      {history.isError ? <p className="text-sm text-destructive">读取记录失败。<Button variant="ghost" onClick={() => void history.refetch()}>重试</Button></p> : null}
      {!history.isLoading && !revisions.length ? <p className="text-sm text-muted-foreground">完成一次批量润色后，可在此查看记录。</p> : null}
      {revisions.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
        <span className="font-medium">第 {row.chapterOrder} 章</span>
        <time className="text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</time>
        <Badge variant="secondary">{row.status === "undone" ? "已撤销" : row.status === "recording" ? "处理中" : row.status === "imported_readonly" ? "备份历史" : row.changed ? "正文有调整" : "正文未变"}</Badge>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => void show(row.id)}>查看变化</Button>
      </div>)}
      {history.hasNextPage ? <Button variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? "读取中…" : "查看更早的记录"}</Button> : null}
    </CardContent>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !busy) { setSelected(null); setConfirming(false); } }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>第 {selected?.chapterOrder} 章 · 润色前后</DialogTitle><DialogDescription>撤销仅恢复这次润色及其相关记录；存在后续修改时保留当前内容。</DialogDescription></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <section><h3 className="mb-2 font-medium">润色前</h3><pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm">{selected?.beforeContent}</pre></section>
          <section><h3 className="mb-2 font-medium">润色后</h3><pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm">{selected?.afterContent ?? "处理中"}</pre></section>
        </div>
        {!selected?.undoEligibility.allowed ? <p className="text-sm text-muted-foreground">{reasonText(selected?.undoEligibility.reason)}</p> : null}
        {confirming ? <div className="space-y-3 rounded-lg border p-3 text-sm"><p>将先保存完整单书备份，再恢复本章润色前正文和本次影响的记录。若有后续修改，操作会停止。</p><div className="flex gap-2"><Button disabled={busy} onClick={() => void undo()}>{busy ? "备份并撤销中…" : "确认撤销本章润色"}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>保留润色结果</Button></div></div>
          : <div className="flex gap-2"><Button disabled={!selected?.undoEligibility.allowed || running || busy} onClick={() => setConfirming(true)}>撤销本章润色</Button><Button variant="outline" onClick={() => { if (selected) void navigator.clipboard.writeText(selected.beforeContent).then(() => toast.success("润色前正文已复制。")).catch(() => toast.error("复制失败，请选择正文后手动复制。")); }}>复制润色前正文</Button></div>}
      </DialogContent>
    </Dialog>
  </Card>;
}
