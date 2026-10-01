import type { StyleRewritePreservationFinding, StyleRewriteResult } from "@novelfoundry/shared/types/styleEngine";
import { Badge } from "@/components/ui/badge";

const categoryLabels: Record<StyleRewritePreservationFinding["category"], string> = {
  fact: "剧情事实",
  relationship: "人物关系",
  event_order: "事件顺序",
  foreshadowing: "伏笔线索",
  certainty: "确定与猜测",
  narrative_intent: "叙事意图",
};
const changeLabels: Record<StyleRewritePreservationFinding["change"], string> = {
  added: "新增信息", removed: "遗漏信息", altered: "信息变化",
};
const statusLabels: Record<StyleRewriteResult["preservation"]["status"], string> = {
  preserved: "未发现剧情变化", changed: "发现剧情变化", unverified: "暂无法确认剧情保真",
};
const nextSteps: Record<StyleRewriteResult["preservation"]["status"], string> = {
  preserved: "对照原文确认措辞符合预期后，再手动使用修订稿。",
  changed: "先保留原文，查看下方变化提示，再点击“生成修订稿并检查”重试。",
  unverified: "继续保留原文，点击“生成修订稿并检查”重试；确认剧情信息完整前，请勿使用候选修订稿。",
};

export default function StyleRewritePreview({ result }: { result: StyleRewriteResult }) {
  const review = result.preservation;
  return (
    <section className="space-y-3" aria-label="修订稿与剧情保真检查">
      <div className="space-y-2 rounded-md border bg-muted/20 p-4" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium text-foreground">AI 剧情保真检查</div>
          <Badge variant={review.status === "changed" ? "destructive" : "outline"}>{statusLabels[review.status]}</Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{review.summary}</p>
        <p className="text-sm leading-6 text-foreground">下一步：{nextSteps[review.status]}</p>
        <p className="text-xs leading-5 text-muted-foreground">此检查比较剧情信息是否变化，不评价修订稿的文风质量。预览不会自动替换或保存正文。</p>
      </div>

      {review.findings.map((finding, index) => (
        <div key={`${finding.category}-${index}`} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{categoryLabels[finding.category]}</Badge>
            <Badge variant="outline">{changeLabels[finding.change]}</Badge>
          </div>
          <p className="text-sm leading-6 text-foreground">{finding.explanation}</p>
          <div className="text-xs text-muted-foreground">原文依据</div>
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-2 text-xs leading-6">{finding.originalExcerpt || "原文未包含对应信息。"}</pre>
          <div className="text-xs text-muted-foreground">修订稿依据</div>
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-2 text-xs leading-6">{finding.rewrittenExcerpt || "修订稿未保留对应信息。"}</pre>
          <p className="text-sm leading-6 text-muted-foreground">核对提示：{finding.suggestedAction}</p>
        </div>
      ))}

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">查看本次原文</summary>
        <pre className="mt-2 max-h-[360px] overflow-auto whitespace-pre-wrap break-words text-sm leading-7">{result.originalContent}</pre>
      </details>
      <div className="space-y-2">
        <div className="text-sm font-medium text-foreground">候选修订稿</div>
        <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/20 p-4 text-sm leading-7">{result.content}</pre>
      </div>
    </section>
  );
}
