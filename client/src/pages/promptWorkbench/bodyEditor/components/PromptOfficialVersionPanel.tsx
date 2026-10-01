import { ShieldCheck } from "lucide-react";
import type { PromptSlotReconcileResult } from "@/api/promptWorkbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reconcileStateLabel, displaySlotValue } from "../domain/slotPresentation";

export function PromptOfficialVersionPanel(props: {
  reconcile: PromptSlotReconcileResult | null;
  isLoading?: boolean;
  pending?: boolean;
  onApplyOfficial: (slotKeys: string[]) => void;
  onKeepMine: (slotKeys: string[]) => void;
}) {
  const { isLoading, onApplyOfficial, onKeepMine, pending, reconcile } = props;
  const actionableItems = (reconcile?.items ?? []).filter((item) => item.state !== "unchanged");
  const restoreKeys = actionableItems.map((item) => item.key);
  const keepKeys = actionableItems
    .filter((item) => item.state === "drifted" || item.state === "orphaned")
    .map((item) => item.key);

  return (
    <section className="rounded-md border border-[#b8d9d0] bg-[#f7fbf9] px-4 py-4 shadow-[0_8px_24px_rgba(20,54,48,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#25443f]">
            <ShieldCheck className="h-4 w-4 text-[#0f766e]" />
            官方版本对齐
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#52606d]">
            对照当前官方槽位，恢复可靠默认值，或保留你的设置并消除版本提醒。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || restoreKeys.length === 0}
            onClick={() => onApplyOfficial(restoreKeys)}
            className="border-[#b8d9d0] bg-white text-[#0f5f59] hover:bg-[#eaf7f2]"
          >
            恢复官方当前版
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || keepKeys.length === 0}
            onClick={() => onKeepMine(keepKeys)}
            className="text-[#52606d] hover:bg-white"
          >
            保留我的设置
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-md border border-dashed border-[#cbdad6] bg-white px-3 py-3 text-sm text-muted-foreground">
          正在读取官方版本...
        </div>
      ) : actionableItems.length === 0 ? (
        <div className="mt-4 rounded-md border border-[#d8e2de] bg-white px-3 py-3 text-sm text-[#315f58]">
          当前槽位与官方当前版一致。
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {actionableItems.map((item) => (
            <div key={item.key} className="rounded-md border border-[#d8e2de] bg-white px-3 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                    <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-800">
                      {reconcileStateLabel(item)}
                    </Badge>
                    {item.overrideMode === "official_default" ? (
                      <Badge variant="outline" className="border-[#a7d7ca] bg-[#eaf7f2] text-[#0f766e]">
                        本书使用官方默认
                      </Badge>
                    ) : null}
                  </div>
                  {item.changelog ? (
                    <p className="text-xs text-muted-foreground">{item.changelog}</p>
                  ) : null}
                  <div className="grid gap-2 text-xs text-[#52606d] md:grid-cols-2">
                    <div className="rounded-md bg-[#f7fbf9] px-2 py-2">
                      <div className="mb-1 font-medium text-[#25443f]">官方当前版</div>
                      <div className="whitespace-pre-wrap break-words">{displaySlotValue(item.defaultCurrent)}</div>
                    </div>
                    <div className="rounded-md bg-[#fffaf0] px-2 py-2">
                      <div className="mb-1 font-medium text-[#7a5620]">我的设置</div>
                      <div className="whitespace-pre-wrap break-words">{displaySlotValue(item.overrideValue)}</div>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onApplyOfficial([item.key])}
                    className="border-[#b8d9d0] bg-white text-[#0f5f59] hover:bg-[#eaf7f2]"
                  >
                    恢复官方当前版
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending || item.state === "new"}
                    onClick={() => onKeepMine([item.key])}
                    className="text-[#52606d] hover:bg-[#f4faf7]"
                  >
                    保留我的设置
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
