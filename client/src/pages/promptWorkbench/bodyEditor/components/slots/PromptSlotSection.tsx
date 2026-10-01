import { RotateCcw } from "lucide-react";
import type { PromptSlotReconcileItem } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PromptEditorSection, PromptSlotValue } from "../../../promptWorkbenchTypes";
import { getMaxLength } from "../../domain/slotPresentation";
import { SlotBadges, ReconcileMiniBadge } from "./SlotBadges";
import { ChoiceSlotControl, ToggleSlotControl, TokenSlotControl } from "./SlotControls";
import { PromptSlotTextEditor } from "../PromptSlotTextEditor";

export function PromptSlotSection(props: {
  section: PromptEditorSection;
  reconcileItem?: PromptSlotReconcileItem;
  immersive?: boolean;
  disabled?: boolean;
  onChange: (key: string, value: PromptSlotValue) => void;
  onReset: (key: string) => void;
}) {
  const { disabled, immersive, onChange, onReset, reconcileItem, section } = props;
  const canReset = section.isDirty || section.isSavedOverride;
  const maxLength = getMaxLength(section);

  return (
    <section className={cn(
      "overflow-hidden rounded-md border border-[#d8e2de] bg-white shadow-[0_8px_24px_rgba(20,54,48,0.06)]",
      immersive && "border-[#b8d9d0] shadow-[0_14px_36px_rgba(15,55,48,0.10)]",
      reconcileItem?.state === "drifted" && "border-amber-300 bg-amber-50/[0.25]",
      reconcileItem?.state === "orphaned" && "border-red-200 bg-red-50/30 opacity-80",
    )}>
      <div className="flex flex-col gap-3 border-b border-[#dce8e4] bg-[#fbfdfb] px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{section.label}</h4>
            <SlotBadges section={section} />
            <ReconcileMiniBadge item={reconcileItem} />
          </div>
          {section.description ? (
            <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
          ) : null}
          {"anchor" in section.slot && section.slot.anchor ? (
            <p className="mt-1 text-xs text-muted-foreground">
              锚点：<code className="rounded bg-muted px-1">{section.slot.anchor}</code>
            </p>
          ) : null}
        </div>
        {canReset ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onReset(section.slotKey)}
            disabled={disabled}
            title={section.isOfficialDefaultOverride ? "清除本书官方默认标记，重新继承全局覆盖" : "清除当前层覆盖"}
            className="h-8 w-8 shrink-0 p-0"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="p-4">
        {section.kind === "choice" ? (
          <ChoiceSlotControl
            section={section}
            disabled={disabled}
            onChange={(value) => onChange(section.slotKey, value)}
          />
        ) : section.kind === "toggle" ? (
          <ToggleSlotControl
            section={section}
            disabled={disabled}
            onChange={(value) => onChange(section.slotKey, value)}
          />
        ) : section.kind === "token" ? (
          <TokenSlotControl
            section={section}
            disabled={disabled}
            onChange={(value) => onChange(section.slotKey, value)}
          />
        ) : (
          <PromptSlotTextEditor
            value={String(section.value)}
            maxLength={maxLength}
            immersive={immersive}
            disabled={disabled}
            placeholder={section.kind === "append" && "placeholderHint" in section.slot
              ? section.slot.placeholderHint
              : undefined}
            minHeightClassName={immersive
              ? section.kind === "append" ? "min-h-[340px]" : "min-h-[280px]"
              : section.kind === "append" ? "min-h-[180px]" : "min-h-[138px]"}
            onChange={(value) => onChange(section.slotKey, value)}
          />
        )}

        {"requiredTokens" in section.slot && section.slot.requiredTokens?.length ? (
          <div className="mt-2 text-xs text-muted-foreground">
            需保留：{section.slot.requiredTokens.join("、")}
          </div>
        ) : null}
      </div>
    </section>
  );
}
