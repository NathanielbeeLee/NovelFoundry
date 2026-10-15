import type { ReviewIssue } from "@novelfoundry/shared/types/novel";
import { reviewContentHash } from "../../../prompting/prompts/audit/manual/schema";

export function eligibleReviewIssues(issues: ReviewIssue[], content: string): ReviewIssue[] {
  const hash = reviewContentHash(content);
  return issues.filter((issue) => !issue.calibration || (
    issue.calibration.repairEligible && issue.calibration.verdict === "confirmed"
    && issue.calibration.grounding === "verified" && issue.calibration.sourceContentHash === hash
    && issue.calibration.startOffset !== null && issue.calibration.endOffset !== null
    && issue.calibration.startOffset >= 0 && issue.calibration.endOffset > issue.calibration.startOffset
    && issue.calibration.endOffset <= content.length
    && content.slice(issue.calibration.startOffset ?? -1, issue.calibration.endOffset ?? -1) === issue.calibration.excerpt
    && !!issue.calibration.excerpt.trim() && !!issue.calibration.readingImpact.trim() && !!issue.calibration.counterEvidence.trim()
  ));
}
