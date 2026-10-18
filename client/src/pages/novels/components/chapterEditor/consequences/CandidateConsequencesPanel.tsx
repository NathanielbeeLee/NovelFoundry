import type { ChapterEditorConsequenceReport } from "@novelfoundry/shared/types/novel";
import { Button } from "@/components/ui/button";
import type { ConsequencePreviewStatus } from "./useCandidateConsequences";

export interface CandidateConsequencesPanelProps {
  status: ConsequencePreviewStatus;
  report: ChapterEditorConsequenceReport | null;
  error?: string;
  disabled?: boolean;
  onAssess: () => void;
  onCancel: () => void;
}

export function CandidateConsequencesPanel(props: CandidateConsequencesPanelProps) {
  const { status, report } = props;
  return <section className="space-y-3 rounded-2xl border border-border/70 p-4" aria-label="候选后续影响">
    <div className="text-sm font-medium">这版会影响后文吗？</div>
    <p className="text-xs leading-5 text-muted-foreground">按需核对本章、最多两章后续计划及关联资料，帮助判断要补充哪些衔接。</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={props.onAssess} disabled={props.disabled || status === "loading"}>
        {status === "loading" ? "评估中..." : status === "idle" ? "评估这版的后续影响" : "重新评估"}
      </Button>
      {status !== "idle" && <Button size="sm" variant="ghost" onClick={props.onCancel} disabled={props.disabled}>取消影响评估</Button>}
    </div>
    {status === "stale" && <p role="status" className="text-sm text-amber-800">正文、选区、候选或评估依据可能变化，请重新评估后采纳。</p>}
    {status === "error" && <p role="alert" className="text-sm text-rose-800">{props.error}</p>}
    {report && <div className="space-y-3 text-sm leading-6">
      <p>{report.summary}</p>
      <p className="font-medium">{report.recommendation === "keep_candidate" ? "建议：可保留这版，留意下列范围限制。" : report.recommendation === "review_local_followup" ? "建议：先核对局部衔接，再决定采纳。" : "建议：补充依据后再判断。"}</p>
      {report.findings.map((finding, index) => <div key={index} className="space-y-2 rounded-xl bg-muted/30 p-3">
        <div className="font-medium">{finding.kind === "conflict" ? "有引文依据的冲突判断" : "可能的后续影响（尚不确定）"}：{finding.summary}</div>
        <p>{finding.reason}</p>
        <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">原文：{finding.currentQuote}<br />候选：{finding.candidateQuote}</blockquote>
        {finding.dependencies.map((evidence, i) => <p key={i} className="text-xs text-muted-foreground">{report.sources.find((source) => source.refId === evidence.refId)?.label ?? evidence.refId}：{evidence.quote}</p>)}
        <p>下一步：{finding.suggestedAction}</p>
      </div>)}
      <p className="text-xs text-muted-foreground">评估范围：{report.sources.filter((source) => source.chapterOrder !== undefined && source.refId.startsWith("chapter:")).map((source) => source.label).join("、") || "本章"}。未提供的后文、缺失资料与未来变化仍需另行核对。</p>
      {report.uncertainties.length > 0 && <ul className="list-disc pl-4 text-xs text-muted-foreground">{report.uncertainties.map((text, i) => <li key={i}>{text}</li>)}</ul>}
    </div>}
  </section>;
}
