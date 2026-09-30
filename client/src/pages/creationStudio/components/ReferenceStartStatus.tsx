import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import type { CreationStudioTaskProjection } from "@novelfoundry/shared/types/creationStudio";
import { retryReferenceCreation } from "@/api/creationStudio";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/i18n";

export default function ReferenceStartStatus({ task }: { task: CreationStudioTaskProjection }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => retryReferenceCreation(task.taskId),
    onSuccess: (response) => queryClient.setQueryData(["creation-studio", task.taskId], response),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("creation.referenceRetryError")),
  });
  const reference = task.referenceStart;
  if (!reference) return null;
  const working = (task.status === "queued" || task.status === "running") && !reference.canRetry;
  return <section className="rounded-xl border bg-muted/20 p-5" aria-live="polite">
    <div className="text-sm font-medium">{t("creation.referenceStatus").replace("{title}", reference.sourceTitle)}</div>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("creation.referenceStatusHint")}</p>
    {reference.status === "ready" ? <>
      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">{reference.mechanisms.map((item, index) => <li key={index}>· {item}</li>)}</ul>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{task.idea}</p>
      {!task.novelId && !task.productionTaskId ? <Button className="mt-3" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <RefreshCw className="mr-2 h-4 w-4" />{t("creation.referenceRetry")}
      </Button> : null}
    </> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm">
        {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {task.error || (reference.canRetry ? t("creation.referenceInterrupted") : task.currentAction || t("creation.referencePreparing"))}
      </p>
      {reference.canRetry ? <Button variant="outline" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <RefreshCw className="mr-2 h-4 w-4" />{t("creation.referenceRetry")}
      </Button> : null}
    </div>}
  </section>;
}
