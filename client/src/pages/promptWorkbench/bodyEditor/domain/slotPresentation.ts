import type { PromptSlotReconcileItem } from "@/api/promptWorkbench";
import type { PromptEditorSection } from "../../promptWorkbenchTypes";

export function getMaxLength(section: PromptEditorSection): number | undefined {
  if ("maxLength" in section.slot) {
    return section.slot.maxLength;
  }
  return undefined;
}

export function reconcileStateLabel(item: PromptSlotReconcileItem): string {
  if (item.state === "drifted") return "官方文案已更新";
  if (item.state === "new") return "官方新增槽位";
  return "槽位已移除";
}

export function displaySlotValue(value: string | boolean | undefined): string {
  if (value === undefined) return "无";
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  const trimmed = value.trim();
  if (!trimmed) return "空";
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed;
}
