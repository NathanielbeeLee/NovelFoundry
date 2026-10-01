export type PolishRevisionStatus = "recording" | "applied" | "no_change" | "failed" | "undone" | "imported_readonly";

export interface PolishUndoEligibility {
  allowed: boolean;
  reason?: "content_changed" | "derived_state_changed" | "active_task" | "incomplete_revision" | "already_undone" | "backup_unverified" | "review_required";
}

export interface PolishRevisionSummary {
  id: string;
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  generationJobId?: string | null;
  status: PolishRevisionStatus;
  changed: boolean;
  createdAt: string;
  undoneAt?: string | null;
  undoEligibility: PolishUndoEligibility;
}

export interface PolishRevisionDetail extends PolishRevisionSummary {
  beforeContent: string;
  afterContent?: string | null;
  beforeRawHash: string;
  afterRawHash?: string | null;
  mutationCount: number;
  currentMatchesAfter: boolean;
}

export interface PolishRevisionPage {
  items: PolishRevisionSummary[];
  nextCursor: string | null;
}
