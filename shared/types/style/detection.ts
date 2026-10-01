import type { AntiAiRuleType, AntiAiSeverity } from "./antiAiRules.js";
import type { StyleContractViolationSource, StyleContractIssueCategory } from "./rules.js";

export type StyleDetectionRuleType = "style" | "character" | AntiAiRuleType;

export interface StyleDetectionViolation {
  ruleId: string;
  ruleName: string;
  ruleType: StyleDetectionRuleType;
  severity: AntiAiSeverity;
  source: StyleContractViolationSource;
  issueCategory: StyleContractIssueCategory;
  excerpt: string;
  reason: string;
  suggestion: string;
  canAutoRewrite: boolean;
}

export interface StyleDetectionReport {
  riskScore: number;
  summary: string;
  violations: StyleDetectionViolation[];
  canAutoRewrite: boolean;
  appliedRuleIds: string[];
}
