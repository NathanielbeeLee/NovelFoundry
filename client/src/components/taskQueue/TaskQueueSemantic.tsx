import type { ReactNode } from "react";
import { WorkspaceStateNotice } from "@/components/workspace";
import { TaskQueueMetricGrid, TaskQueueStatusBadge, type TaskQueueMetricItem } from "./TaskQueuePrimitives";
import { useI18n } from "@/i18n";

export type TaskQueueSeverity = "blocking" | "quality" | "normal";

const severityTone = {
  blocking: "danger",
  quality: "warning",
  normal: "neutral",
} as const;

export function TaskQueueSeverityBadge(props: { severity: TaskQueueSeverity; label?: string }) {
  const { t } = useI18n();
  const labels = { blocking: t("task.blocking"), quality: t("task.quality"), normal: t("task.normal") };
  return <TaskQueueStatusBadge label={props.label ?? labels[props.severity]} tone={severityTone[props.severity]} />;
}

export function TaskQueueImpactNotice(props: {
  severity: TaskQueueSeverity;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <WorkspaceStateNotice
      tone={severityTone[props.severity]}
      title={props.title}
      description={props.description}
      action={props.action}
      compact={props.compact}
    />
  );
}

export function TaskQueueEmptyState(props: { title: string; description: string; action?: ReactNode }) {
  return <WorkspaceStateNotice title={props.title} description={props.description} action={props.action} />;
}

export function TaskQueueSummaryGrid(props: { items: TaskQueueMetricItem[]; className?: string }) {
  return <TaskQueueMetricGrid items={props.items} className={props.className} />;
}
