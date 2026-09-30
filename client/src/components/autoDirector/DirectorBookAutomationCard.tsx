import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationProjection,
} from "@novelfoundry/shared/types/directorRuntime";
import { LayoutDashboard } from "lucide-react";
import AICockpit from "./AICockpit";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

interface DirectorBookAutomationCardProps {
  projection: DirectorBookAutomationProjection | null | undefined;
  fallbackSummary?: string | null;
  fallbackStatusLabel?: string | null;
  compact?: boolean;
  onOpenProgress?: () => void;
  onOpenTaskCenter: () => void;
  onProjectionAction?: (projection: DirectorBookAutomationProjection, action: DirectorBookAutomationAction) => void;
  onSwitchToProjectNav?: () => void;
}

export default function DirectorBookAutomationCard({
  projection,
  fallbackSummary,
  fallbackStatusLabel,
  compact = false,
  onOpenProgress,
  onOpenTaskCenter,
  onProjectionAction,
  onSwitchToProjectNav,
}: DirectorBookAutomationCardProps) {
  const { t } = useI18n();
  const effectiveProjection = projection?.status === "cancelled" ? null : projection;
  const handleAction = (projection: DirectorBookAutomationProjection, action: DirectorBookAutomationAction) => {
    if (onProjectionAction) {
      onProjectionAction(projection, action);
      return;
    }
    if (action.type === "open_details") {
      onOpenTaskCenter();
      return;
    }
    onOpenProgress?.();
  };

  return (
    <div className="space-y-2">
      <AICockpit
        projection={effectiveProjection}
        mode={compact ? "compact" : "focusedNovel"}
        fallbackSummary={fallbackSummary}
        fallbackStatusLabel={fallbackStatusLabel}
        onAction={handleAction}
        onOpenDetails={effectiveProjection?.latestTask ? () => onOpenTaskCenter() : undefined}
        onOpenNovel={() => onOpenProgress?.()}
        onOpenFallbackDetails={onOpenProgress ?? onOpenTaskCenter}
      />
      {onSwitchToProjectNav ? (
        <Button type="button" size="sm" variant="ghost" className="w-full" onClick={onSwitchToProjectNav}>
          <LayoutDashboard className="h-4 w-4" />
          {t("director.projectNavigation")}
        </Button>
      ) : null}
    </div>
  );
}
