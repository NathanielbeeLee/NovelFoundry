import { CheckCircle2, LockKeyhole } from "lucide-react";
import type {
  PromptCatalogItem,
  PromptPreviewResult,
  PromptSlotReconcileItem,
  PromptSlotReconcileResult,
  PromptTestRunResult,
} from "@/api/promptWorkbench";
import { cn } from "@/lib/utils";
import type { PromptEditorSection, PromptSlotValue } from "../../promptWorkbenchTypes";
import { PromptPreviewPanel } from "../../components/PromptPreviewPanel";
import { ContextReferenceChips } from "./ContextReferenceChips";
import { PromptOfficialVersionPanel } from "./PromptOfficialVersionPanel";
import { PromptSlotSection } from "./slots/PromptSlotSection";

export function PromptBodyEditor(props: {
  prompt: PromptCatalogItem;
  immersive?: boolean;
  preview: PromptPreviewResult | null;
  testRun?: PromptTestRunResult | null;
  testRunPending?: boolean;
  testRunError?: string | null;
  sections: PromptEditorSection[];
  reconcile: PromptSlotReconcileResult | null;
  reconcileMap: Record<string, PromptSlotReconcileItem>;
  showReconcile: boolean;
  reconcileLoading?: boolean;
  reconcilePending?: boolean;
  disabled?: boolean;
  onSlotChange: (key: string, value: PromptSlotValue) => void;
  onSlotReset: (key: string) => void;
  onApplyOfficialSlots: (keys: string[]) => void;
  onKeepSlots: (keys: string[]) => void;
  onContextSelect: (blockId: string) => void;
}) {
  const {
    disabled,
    immersive,
    onApplyOfficialSlots,
    onContextSelect,
    onKeepSlots,
    onSlotChange,
    onSlotReset,
    preview,
    prompt,
    reconcile,
    reconcileLoading,
    reconcileMap,
    reconcilePending,
    sections,
    showReconcile,
    testRun,
    testRunError,
    testRunPending,
  } = props;
  const controlSections = sections.filter((section) => section.placement === "control");
  const bodySections = sections.filter((section) => section.placement === "body");
  const appendSections = sections.filter((section) => section.placement === "append");
  const hasEditableSlots = sections.length > 0;

  return (
    <div className={cn("space-y-6", immersive && "mx-auto max-w-[1320px]")}>
      <ContextReferenceChips
        prompt={prompt}
        preview={preview}
        onContextSelect={onContextSelect}
      />

      {showReconcile ? (
        <PromptOfficialVersionPanel
          reconcile={reconcile}
          isLoading={reconcileLoading}
          pending={reconcilePending}
          onApplyOfficial={onApplyOfficialSlots}
          onKeepMine={onKeepSlots}
        />
      ) : null}

      {!hasEditableSlots ? (
        <div className="rounded-md border border-dashed bg-background/80 p-5 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <LockKeyhole className="h-4 w-4 text-primary" />
            提示词只读
          </div>
          该提示词没有声明可编辑槽位。可以查看最终 messages 与上下文注入，但不能直接替换 system prompt 或修改上下文策略。
        </div>
      ) : (
        <>
          {controlSections.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">运行控制</h3>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {controlSections.map((section) => (
                  <PromptSlotSection
                    key={section.slotKey}
                    section={section}
                    immersive={immersive}
                    reconcileItem={reconcileMap[section.slotKey]}
                    disabled={disabled}
                    onChange={onSlotChange}
                    onReset={onSlotReset}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {bodySections.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Prompt 主体槽位</h3>
              <div className="space-y-3">
                {bodySections.map((section) => (
                  <PromptSlotSection
                    key={section.slotKey}
                    section={section}
                    immersive={immersive}
                    reconcileItem={reconcileMap[section.slotKey]}
                    disabled={disabled}
                    onChange={onSlotChange}
                    onReset={onSlotReset}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {appendSections.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">自定义补充规则</h3>
              <div className="space-y-3">
                {appendSections.map((section) => (
                  <PromptSlotSection
                    key={section.slotKey}
                    section={section}
                    immersive={immersive}
                    reconcileItem={reconcileMap[section.slotKey]}
                    disabled={disabled}
                    onChange={onSlotChange}
                    onReset={onSlotReset}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">最终消息预览</h3>
        <PromptPreviewPanel
          preview={preview}
          testRun={testRun}
          testRunPending={testRunPending}
          testRunError={testRunError}
        />
      </section>
    </div>
  );
}
