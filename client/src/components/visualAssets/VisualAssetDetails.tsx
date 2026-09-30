import type { VisualAssetSelection } from "@novelfoundry/shared/types/visualAsset";
import { ExternalLink, LoaderCircle, X } from "lucide-react";
import { resolveImageAssetUrl } from "@/api/images";
import { Button } from "@/components/ui/button";
import {
  formatVisualAssetDate,
  getVisualAssetKindLabel,
  getVisualAssetOriginLabel,
  getVisualAssetScopeLabel,
  getVisualAssetSourceLabel,
} from "./visualAssetLibrary.labels";
import { useI18n } from "@/i18n";

interface VisualAssetDetailsProps {
  asset: VisualAssetSelection | null;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
  onRetry: () => void;
}

export function VisualAssetDetails({ asset, isLoading, isError, onClose, onRetry }: VisualAssetDetailsProps) {
  const { locale, t } = useI18n();
  return (
    <aside className="flex min-h-0 w-full flex-col border-t bg-muted/[0.16] lg:w-80 lg:border-l lg:border-t-0" aria-label={t("visual.details")}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-sm font-medium">{t("visual.details")}</div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t("visual.closeDetails")}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {isLoading && !asset ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            {t("visual.loadingDetails")}
          </div>
        ) : null}
        {isError && !asset ? (
          <div className="space-y-3 py-8 text-center text-sm text-muted-foreground">
            <p>{t("visual.readError")}</p>
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t("visual.retry")}</Button>
          </div>
        ) : null}
        {asset ? (
          <>
            <a href={resolveImageAssetUrl(asset.url)} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-md border bg-background">
              <img src={resolveImageAssetUrl(asset.url)} alt={asset.source.label || getVisualAssetKindLabel(asset.kind)} className="aspect-[4/3] w-full object-cover" />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-background/85 px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                {t("visual.openOriginal")}
              </span>
            </a>
            <div className="space-y-3 text-sm">
              <DetailRow label={t("visual.type")} value={getVisualAssetKindLabel(asset.kind)} />
              <DetailRow label={t("visual.source")} value={asset.source.label || getVisualAssetSourceLabel(asset.source.domain)} />
              <DetailRow label={t("visual.origin")} value={getVisualAssetOriginLabel(asset.origin)} />
              <DetailRow label={t("visual.scope")} value={asset.scope.label || getVisualAssetScopeLabel(asset.scope.kind)} />
              <DetailRow label={t("visual.createdAt")} value={formatVisualAssetDate(asset.createdAt, locale)} />
              {asset.width && asset.height ? <DetailRow label={t("visual.dimensions")} value={`${asset.width} × ${asset.height}`} /> : null}
              {asset.provider || asset.model ? <DetailRow label={t("visual.generator")} value={[asset.provider, asset.model].filter(Boolean).join(" · ")} /> : null}
            </div>
            {asset.prompt ? (
              <div className="border-t pt-4">
                <div className="text-xs font-medium text-muted-foreground">{t("visual.prompt")}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{asset.prompt}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-foreground">{value}</div>
    </div>
  );
}
