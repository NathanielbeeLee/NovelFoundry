import type { ReviewIssue } from "@novelfoundry/shared/types/novel";

export function readStoredManualFindings(reports: Array<{ legacyScoreJson?: string | null }>): ReviewIssue[] {
  for (const report of reports) {
    try {
      const value = JSON.parse(report.legacyScoreJson ?? "null");
      if (Array.isArray(value?.manualReview?.issues)) return value.manualReview.issues.filter((item: any) =>
        item && typeof item.evidence === "string" && typeof item.fixSuggestion === "string"
        && typeof item.category === "string" && item.calibration && typeof item.calibration.sourceContentHash === "string");
    } catch { /* Legacy reports keep their existing display. */ }
  }
  return [];
}

export function ReviewFindingCard({ issue }: { issue: ReviewIssue }) {
  const calibration = issue.calibration;
  const verdict = calibration ? ({ confirmed: "建议修改", hypothesis: "需要确认", deferred: "等待更多上下文", keep: "建议保留" } as const)[calibration.verdict] : "旧报告：证据未核验";
  return <div className="rounded-xl border p-3 text-xs">
    <div className="font-medium text-foreground">{verdict}</div>
    <div className="mt-1 leading-6">{issue.evidence}</div>
    {calibration?.excerpt && <blockquote className="mt-2 whitespace-pre-wrap border-l-2 pl-2">{calibration.excerpt}</blockquote>}
    {calibration && <div className="mt-1 text-muted-foreground">{calibration.reason}</div>}
    {calibration?.readingImpact && <div className="mt-1">阅读影响：{calibration.readingImpact}</div>}
    {calibration?.counterEvidence && <div className="mt-1">保留与反证：{calibration.counterEvidence}</div>}
    <div className="mt-1 leading-6">{issue.fixSuggestion}</div>
    {calibration && !calibration.repairEligible && <div className="mt-1 text-muted-foreground">此意见供参考，请确认依据后再修稿。</div>}
  </div>;
}
