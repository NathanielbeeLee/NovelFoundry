import type {
  DirectorAutoApprovalGroup,
  DirectorAutoApprovalPoint,
} from "@novelfoundry/shared/types/autoDirectorApproval";
import AutoDirectorApprovalPointMultiSelect, {
  summarizeDirectorAutoApprovalPoints,
} from "./AutoDirectorApprovalPointMultiSelect";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import { useI18n } from "@/i18n";

interface AutoDirectorApprovalStrategyPanelProps {
  enabled: boolean;
  approvalPointCodes: string[];
  groups?: DirectorAutoApprovalGroup[];
  approvalPoints?: DirectorAutoApprovalPoint[];
  onEnabledChange: (enabled: boolean) => void;
  onApprovalPointCodesChange: (next: string[]) => void;
}

export default function AutoDirectorApprovalStrategyPanel({
  enabled,
  approvalPointCodes,
  groups,
  approvalPoints,
  onEnabledChange,
  onApprovalPointCodesChange,
}: AutoDirectorApprovalStrategyPanelProps) {
  const { t } = useI18n();
  return (
    <div className="mt-3 min-w-0 rounded-md border border-primary/15 bg-primary/5 p-3">
      <div className="text-xs font-medium text-foreground">{t("director.strategy.title")}</div>
      <div className={AUTO_DIRECTOR_MOBILE_CLASSES.approvalStrategyGrid}>
        <button
          type="button"
          className={`rounded-xl border px-3 py-3 text-left transition ${
            enabled ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
          }`}
          onClick={() => onEnabledChange(true)}
        >
          <div className="text-sm font-medium text-foreground">{t("director.strategy.auto")}</div>
          <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {t("director.strategy.autoDescription")}
          </div>
        </button>
        <button
          type="button"
          className={`rounded-xl border px-3 py-3 text-left transition ${
            !enabled ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
          }`}
          onClick={() => onEnabledChange(false)}
        >
          <div className="text-sm font-medium text-foreground">{t("director.strategy.copilot")}</div>
          <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {t("director.strategy.copilotDescription")}
          </div>
        </button>
      </div>

      <div className={`mt-3 rounded-md border bg-background/80 p-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        {enabled
          ? t("director.strategy.autoSummary")
          : t("director.strategy.copilotSummary").replace("{summary}", summarizeDirectorAutoApprovalPoints(approvalPointCodes))}
      </div>

      {!enabled ? (
        <details className="mt-3 rounded-md border bg-background">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
            {t("director.strategy.advanced")}
          </summary>
          <div className="border-t p-3">
            <AutoDirectorApprovalPointMultiSelect
              value={approvalPointCodes}
              onChange={onApprovalPointCodesChange}
              groups={groups}
              approvalPoints={approvalPoints}
              compact
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
