import { useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { downloadNovelBackup } from "@/api/novel/backup";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function NovelBackupButton({ novelId, title }: { novelId: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const blob = await downloadNovelBackup(novelId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80) || "小说"}.novel-backup.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("备份文件可从书架的“恢复备份”导入为新作品。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "备份失败，请稍后重试。");
    } finally { setBusy(false); }
  };
  return <Button type="button" size="sm" variant="outline" disabled={busy} onClick={(event) => { event.stopPropagation(); void download(); }} title="备份本书及关联创作资料">
    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Archive className="mr-1.5 h-4 w-4" aria-hidden="true" />}
    {busy ? "准备备份" : "备份"}
  </Button>;
}
