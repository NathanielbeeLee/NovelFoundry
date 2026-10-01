import { useMemo } from "react";
import { LockKeyhole, MapPin } from "lucide-react";
import type { PromptCatalogItem, PromptPreviewResult } from "@/api/promptWorkbench";
import { cn } from "@/lib/utils";
import { CONTEXT_GROUP_LABELS, LOCKED_CONTEXT_GROUPS } from "../../promptWorkbenchLabels";

export function ContextReferenceChips(props: {
  prompt: PromptCatalogItem;
  preview: PromptPreviewResult | null;
  onContextSelect: (blockId: string) => void;
}) {
  const { onContextSelect, preview, prompt } = props;
  const firstBlockByGroup = useMemo(() => {
    const map = new Map<string, string>();
    preview?.context.blocks.forEach((block) => {
      if (!map.has(block.group)) {
        map.set(block.group, block.id);
      }
    });
    return map;
  }, [preview?.context.blocks]);

  if (prompt.contextRequirements.length === 0) {
    return null;
  }

  return (
    <section className="rounded-md border border-[#d8e2de] bg-[#f8fbfa] px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#25443f]">
        <MapPin className="h-4 w-4 text-[#0f766e]" />
        上下文引用
      </div>
      <div className="flex flex-wrap gap-1.5">
        {prompt.contextRequirements.map((requirement) => {
          const blockId = firstBlockByGroup.get(requirement.group);
          const locked = LOCKED_CONTEXT_GROUPS.has(requirement.group) || requirement.required;
          return (
            <button
              key={requirement.group}
              type="button"
              disabled={!blockId}
              onClick={() => blockId && onContextSelect(blockId)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                blockId
                  ? "border-[#cbdad6] bg-white text-[#52606d] hover:border-[#0f766e] hover:bg-[#eaf7f2] hover:text-[#0f5f59]"
                  : "cursor-not-allowed border-transparent bg-muted/30 text-muted-foreground/70",
              )}
              title={requirement.group}
            >
              {locked ? <LockKeyhole className="h-3 w-3" /> : null}
              {CONTEXT_GROUP_LABELS[requirement.group] ?? requirement.group}
            </button>
          );
        })}
      </div>
    </section>
  );
}
