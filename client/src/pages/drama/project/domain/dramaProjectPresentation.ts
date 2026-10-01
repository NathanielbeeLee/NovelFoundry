import type { DramaBatchCostBreakdown, DramaProjectDetail } from "@/api/drama";

export type DramaTab = "source" | "strategy" | "episodes" | "quality" | "characters" | "visual" | "export";

export const TABS: Array<{ key: DramaTab; label: string }> = [
  { key: "source", label: "来源素材" },
  { key: "strategy", label: "短剧策略" },
  { key: "episodes", label: "分集台本" },
  { key: "quality", label: "质量问题" },
  { key: "characters", label: "角色" },
  { key: "visual", label: "分镜视频" },
  { key: "export", label: "导出" },
];

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "素材准备",
    strategized: "策略已生成",
    outlined: "分集已生成",
    scripting: "台本生成中",
    completed: "已完成",
    planned: "待生成台本",
    scripted: "台本已生成",
    reviewed: "已检查",
    needs_repair: "需要修复",
    approved: "已通过",
  };
  return labels[status] ?? status;
}

export function safeJson<T>(input: string | null | undefined, fallback: T): T {
  if (!input) {
    return fallback;
  }
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

export function compactText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  if (input == null) {
    return "";
  }
  return JSON.stringify(input, null, 2);
}

export const STRATEGY_LABELS: Record<string, string> = {
  positioning: "受众定位",
  mainPleasureLine: "主爽点线",
  paywallNote: "付费卡点规划",
  paywallPlan: "付费卡点计划",
  emotionCurveNote: "情绪曲线",
  deviationDeclaration: "改编边界",
};

export const SCORE_LABELS: Record<string, string> = {
  hook: "开场钩子",
  density: "信息密度",
  paywall: "付费卡点",
  emotion: "情绪曲线",
  duration: "时长",
  consistency: "一致性",
  overall: "综合",
};

function readBatchCost(raw: string | null | undefined): DramaBatchCostBreakdown | null {
  const parsed = safeJson<{ cost?: DramaBatchCostBreakdown }>(raw, {});
  return parsed.cost ?? null;
}

export function summarizeBatchCosts(project: DramaProjectDetail): DramaBatchCostBreakdown | null {
  const costs = (project.batchJobs ?? [])
    .map((job) => readBatchCost(job.progress))
    .filter((cost): cost is DramaBatchCostBreakdown => Boolean(cost));
  if (!costs.length) {
    return null;
  }
  const currency = costs[0]?.currency ?? "CNY";
  return {
    currency,
    estimated: costs.reduce((sum, cost) => sum + (cost.estimated ?? 0), 0),
    actual: costs.reduce((sum, cost) => sum + (cost.actual ?? 0), 0),
    estimatedUnits: {},
    actualUnits: {},
    unit: {},
  };
}

export function formatBatchCost(cost: DramaBatchCostBreakdown, amount: number): string {
  return `${cost.currency} ${amount.toFixed(2)}`;
}
