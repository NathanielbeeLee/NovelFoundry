import { Button } from "@/components/ui/button";
import { recoveryIsOld, type ChapterRecoveryRecord } from "./domain/chapterRecovery";

export default function ChapterRecoveryPanel(props: {
  pending: ChapterRecoveryRecord[];
  error: string | null;
  protected: boolean;
  baseline: string | null;
  disabled: boolean;
  isDirty: boolean;
  onRestore: (record: ChapterRecoveryRecord) => void;
  onDiscard: (record: ChapterRecoveryRecord) => void;
}) {
  const record = props.pending[0];
  if (!record && !props.error && !(props.protected && props.isDirty)) return null;
  return <section aria-label="设备草稿副本" className="shrink-0 rounded-xl border border-border/70 bg-background p-3 text-sm">
    <p className="text-xs text-muted-foreground">未保存文字仅在此设备保留副本；保存正文可写入小说。</p>
    {props.error ? <p role="alert" className="mt-2 text-amber-700 dark:text-amber-300">{props.error}</p>
      : props.protected ? <p role="status" className="mt-1 text-xs text-muted-foreground">未保存文字有此设备副本保护。</p> : null}
    <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">设备副本的保留范围</summary><p className="mt-1">副本保存在此浏览器中，不能跨设备恢复。清理浏览器数据、隐私模式或设备故障可能使副本丢失；离开前请保存正文。</p></details>
    {record ? <div className="mt-2">
      <p className="font-medium">找到此章的设备副本{props.pending.length > 1 ? `（共 ${props.pending.length} 份，逐份处理）` : ""}</p>
      <p className="text-xs text-muted-foreground">其他窗口的稿件分别保留；恢复只加载所选副本，不合并文字。</p>
      <p className="text-xs text-muted-foreground">{new Date(record.updatedAt).toLocaleString()} · {record.content.length} 字符{recoveryIsOld(record) ? " · 超过 30 天，请核对内容" : ""}{record.baseline !== props.baseline ? " · 已保存正文与副本的来源不同，恢复后请对照选择" : ""}</p>
      <details className="my-2"><summary className="cursor-pointer">查看副本内容</summary><textarea aria-label="设备副本内容" readOnly value={record.content} className="mt-2 h-32 w-full rounded border bg-background p-2" /></details>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={props.disabled || props.isDirty} onClick={() => props.onRestore(record)}>恢复到编辑器</Button>
        <Button size="sm" variant="ghost" disabled={props.disabled} onClick={() => props.onDiscard(record)}>丢弃这份设备副本</Button>
      </div>
      {props.isDirty ? <p className="mt-1 text-xs text-muted-foreground">请先保存编辑器中的修改，再恢复这份副本。</p> : null}
    </div> : null}
  </section>;
}
