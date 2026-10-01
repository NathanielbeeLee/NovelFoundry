export type AuditType = "continuity" | "character" | "plot" | "mode_fit";

export type AuditIssueStatus = "open" | "resolved" | "ignored";

export interface QualityScore {
  coherence: number;
  repetition: number;
  pacing: number;
  voice: number;
  engagement: number;
  overall: number;
}

export interface ReviewIssue {
  severity: "low" | "medium" | "high" | "critical";
  category: "coherence" | "repetition" | "pacing" | "voice" | "engagement" | "logic";
  evidence: string;
  fixSuggestion: string;
}

export interface ReplanRecommendation {
  recommended: boolean;
  scope?: "local_window" | "global_book";
  action?: "continue_with_warning" | "local_patch_plan" | "stop_for_replan";
  reason: string;
  blockingIssueIds: string[];
  blockingLedgerKeys?: string[];
  affectedChapterOrders?: number[];
  anchorChapterOrder?: number | null;
  triggerReason?: string;
  windowReason?: string;
  whyTheseChapters?: string;
}

export interface AuditIssue {
  id: string;
  reportId: string;
  auditType: AuditType;
  severity: "low" | "medium" | "high" | "critical";
  code: string;
  description: string;
  evidence: string;
  fixSuggestion: string;
  status: AuditIssueStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuditReport {
  id: string;
  novelId: string;
  chapterId: string;
  auditType: AuditType;
  overallScore?: number | null;
  summary?: string | null;
  legacyScoreJson?: string | null;
  issues: AuditIssue[];
  createdAt: string;
  updatedAt: string;
}
