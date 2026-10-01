export const WHOLE_BOOK_REVIEW_RUN_KIND = "whole_book_review_run_v1" as const;

export interface WholeBookReviewIssue {
  id: string;
  category: "continuity" | "character" | "plot" | "pacing" | "voice" | "payoff";
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  evidence: string[];
  chapterOrders: number[];
  recommendation: string;
  feedback: string;
  applied?: boolean;
}

export interface WholeBookReviewReport {
  id: string;
  novelId: string;
  startOrder: number;
  endOrder: number;
  summary: string;
  strengths: string[];
  scores: { continuity: number; character: number; plot: number; pacing: number; voice: number; payoff: number; overall: number };
  issues: WholeBookReviewIssue[];
  sourceRevision?: string;
  createdAt: string;
}

export interface WholeBookReviewRunState {
  id: string;
  novelId: string;
  status: "running";
  startOrder: number;
  endOrder: number;
  startedAt: string;
  updatedAt: string;
}

export interface WholeBookReviewBlockingPipelineJob {
  id: string;
  status: "queued" | "running";
  startOrder: number;
  endOrder: number;
  completedCount: number;
  totalCount: number;
  currentItemLabel?: string | null;
}

export interface WholeBookReviewStatus {
  activeRun: WholeBookReviewRunState | null;
  blockingPipelineJob: WholeBookReviewBlockingPipelineJob | null;
  latestReport: WholeBookReviewReport | null;
  contentChangedSinceLatest: boolean | null;
}
