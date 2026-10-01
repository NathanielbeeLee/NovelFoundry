import type { PromptSlotReconcileItem } from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SLOT_KIND_LABELS } from "../../../promptWorkbenchLabels";
import type { PromptEditorSection } from "../../../promptWorkbenchTypes";

export function SlotBadges({ section }: { section: PromptEditorSection }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className="border-[#cbdad6] bg-[#f7fbf9] text-[#315f58]">
        {SLOT_KIND_LABELS[section.kind] ?? section.kind}
      </Badge>
      <Badge
        variant={section.source === "official" ? "outline" : "secondary"}
        className={cn(
          section.source === "novel_official_default" && "border-[#a7d7ca] bg-[#eaf7f2] text-[#0f766e]",
          section.source === "global" && "border-[#c9d7ff] bg-[#eef3ff] text-[#344d7a]",
          section.source === "novel" && "border-[#e7c78f] bg-[#fff7e8] text-[#7a5620]",
        )}
      >
        {section.sourceLabel}
      </Badge>
      {section.isDirty ? (
        <Badge variant="secondary" className="border-[#b8d9d0] bg-[#eaf7f2] text-[#0f766e]">未保存</Badge>
      ) : null}
    </div>
  );
}

export function ReconcileMiniBadge({ item }: { item?: PromptSlotReconcileItem }) {
  if (!item || item.state === "unchanged") {
    return null;
  }
  const label = item.state === "drifted"
    ? "官方已更新"
    : item.state === "new"
      ? "新增槽位"
      : "槽位已移除";
  return (
    <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-800">
      {label}
    </Badge>
  );
}
