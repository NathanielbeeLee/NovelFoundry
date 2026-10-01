export type StyleRewritePreservationCategory =
  | "fact"
  | "relationship"
  | "event_order"
  | "foreshadowing"
  | "certainty"
  | "narrative_intent";

export interface StyleRewritePreservationFinding {
  category: StyleRewritePreservationCategory;
  change: "added" | "removed" | "altered";
  /** Verbatim evidence; empty only when the corresponding fact is absent. */
  originalExcerpt: string;
  rewrittenExcerpt: string;
  explanation: string;
  suggestedAction: string;
}

export type StyleRewriteUnverifiedReason =
  | "model_uncertain"
  | "incomplete_review"
  | "input_limit"
  | "unavailable"
  | "invalid_result"
  | "cancelled"
  | "timeout";

export interface StyleRewritePreservationResult {
  status: "preserved" | "changed" | "unverified";
  summary: string;
  findings: StyleRewritePreservationFinding[];
  reason?: StyleRewriteUnverifiedReason;
}

/** A read-only preview; content is the candidate, never an adoption decision. */
export interface StyleRewriteResult {
  content: string;
  originalContent: string;
  preservation: StyleRewritePreservationResult;
}
