import type { ChapterSaveConflict } from "@novelfoundry/shared/types/novel";
import { Button } from "@/components/ui/button";

export default function ChapterSaveConflictPanel({ localContent, conflict, onResolve }: {
  localContent: string;
  conflict: ChapterSaveConflict;
  onResolve: (keepLocal: boolean) => void;
}) {
  return <section role="alert" className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4">
    <p className="font-medium">章节有其他修改，请对照后选择</p>
    <p className="mb-3 text-sm text-muted-foreground">你的草稿保留在编辑器中。继续编辑后保存，将用你的稿件替换下方已保存正文；若正文再次变化，会再次提醒你。</p>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">你的草稿<textarea aria-label="你的草稿" readOnly value={localContent} className="mt-1 h-36 w-full rounded border bg-background p-2" /></label>
      <label className="text-sm">已保存正文<textarea aria-label="已保存正文" readOnly value={conflict.currentContent ?? ""} className="mt-1 h-36 w-full rounded border bg-background p-2" /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => onResolve(true)}>保留我的草稿，继续编辑</Button>
      <Button variant="outline" onClick={() => onResolve(false)}>放弃本地修改，加载已保存正文</Button>
    </div>
  </section>;
}
