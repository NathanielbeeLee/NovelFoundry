import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NOVEL_BACKUP_MAX_BYTES, type NovelBackupPreview, type NovelBackupRestoreResult } from "@novelfoundry/shared/types/novelBackup";
import { previewNovelBackup, restoreNovelBackup } from "@/api/novel/backup";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function NovelBackupRestoreDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<NovelBackupPreview | null>(null);
  const [result, setResult] = useState<NovelBackupRestoreResult | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<"checking" | "restoring" | null>(null);
  const [error, setError] = useState("");
  const selection = useRef(0);
  const restoreRequest = useRef<{ id: string; title: string } | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const selectFile = async (next: File | undefined) => {
    const version = ++selection.current;
    restoreRequest.current = null;
    setPreview(null); setResult(null); setFile(null); setError("");
    if (!next) return;
    if (next.size === 0 || next.size > NOVEL_BACKUP_MAX_BYTES) {
      setError("请选择非空、大小不超过 128 MB 的小说备份文件。"); return;
    }
    setFile(next); setBusy("checking");
    try {
      const checked = await previewNovelBackup(next);
      if (selection.current !== version) return;
      setPreview(checked); setTitle(`${checked.title}（恢复副本）`.slice(0, 120));
    } catch (failure) {
      if (selection.current === version) setError(failure instanceof Error ? failure.message : "备份检查失败。");
    } finally { if (selection.current === version) setBusy(null); }
  };

  const restore = async () => {
    if (!file || !preview || !title.trim() || busy || result) return;
    setBusy("restoring"); setError("");
    try {
      restoreRequest.current ??= { id: crypto.randomUUID(), title: title.trim() };
      const restored = await restoreNovelBackup(file, restoreRequest.current.title, preview.digest, restoreRequest.current.id);
      setResult(restored);
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.all });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "恢复失败，请刷新书架确认结果。");
    } finally { setBusy(null); }
  };

  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />恢复备份</Button>
    <Dialog open={open} onOpenChange={(value) => { if (busy !== "restoring") setOpen(value); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>从备份恢复作品</DialogTitle><DialogDescription>检查备份中的正文和创作资料，并创建一份独立作品。原作品会保留。</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><label className="text-sm font-medium" htmlFor="novel-backup-file">小说备份文件</label><Input id="novel-backup-file" type="file" accept=".json,application/json" disabled={Boolean(busy)} onChange={(event) => void selectFile(event.target.files?.[0])} /></div>
          {busy === "checking" ? <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />检查文件和资料关联…</p> : null}
          {preview ? <>
            <div className="rounded-md border p-3 text-sm"><p className="font-medium">{preview.title}</p><p className="mt-1 text-muted-foreground">{preview.chapterCount} 章 · {preview.characterCount} 位角色 · {preview.resourceCount} 个文件资源 · {(preview.bytes / 1024 / 1024).toFixed(1)} MB</p></div>
            <div className="space-y-2"><label className="text-sm font-medium" htmlFor="restored-novel-title">新作品名称</label><Input id="restored-novel-title" value={title} maxLength={120} disabled={Boolean(busy) || Boolean(result) || Boolean(restoreRequest.current)} onChange={(event) => setTitle(event.target.value)} /></div>
            {preview.warnings.length ? <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm"><p className="font-medium">恢复说明</p><ul className="mt-2 list-disc space-y-1 pl-5">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
          </> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {result ? <div className="space-y-3"><p role="status">《{result.title}》恢复完成，可从书架继续阅读或创作。</p>{result.warnings.map((warning, index) => <p key={index} className="text-sm text-muted-foreground">{warning}</p>)}<Button onClick={() => { setOpen(false); navigate(`/novels/${result.novelId}/edit`); }}>打开恢复的作品</Button></div> :
            <Button className="w-full" disabled={!preview || !title.trim() || Boolean(busy)} onClick={() => void restore()}>{busy === "restoring" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{busy === "restoring" ? "恢复中，请稍候" : "恢复为新作品"}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
