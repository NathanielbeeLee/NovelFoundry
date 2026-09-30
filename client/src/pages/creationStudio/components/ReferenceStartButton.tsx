import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BookOpen, Loader2 } from "lucide-react";
import { BOOK_ANALYSIS_SECTIONS, type BookAnalysisSectionKey } from "@novelfoundry/shared/types/bookAnalysis";
import { getBookAnalysis, listBookAnalyses } from "@/api/bookAnalysis";
import { startReferenceCreation } from "@/api/creationStudio";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/i18n";

const recommendedSections: BookAnalysisSectionKey[] = ["plot_structure", "themes", "style_technique"];

export default function ReferenceStartButton({ analysisId, disabled }: { analysisId?: string; disabled?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(analysisId ?? "");
  const [sectionKeys, setSectionKeys] = useState<BookAnalysisSectionKey[]>([]);
  const [instruction, setInstruction] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["reference-start", "analyses"], queryFn: () => listBookAnalyses({ status: "succeeded" }),
    enabled: open && !analysisId,
  });
  const detail = useQuery({
    queryKey: ["reference-start", "analysis", selectedId], queryFn: () => getBookAnalysis(selectedId),
    enabled: open && Boolean(selectedId),
  });
  const analysis = detail.data?.data;
  useEffect(() => { if (open && analysisId) setSelectedId(analysisId); }, [open, analysisId]);
  useEffect(() => {
    if (!analysis) return;
    const available = analysis.sections.filter((section) => section.status === "succeeded").map((section) => section.sectionKey);
    const recommended = recommendedSections.filter((key) => available.includes(key));
    setSectionKeys(recommended.length ? recommended : available.slice(0, 1));
  }, [analysis]);
  const mutation = useMutation({
    mutationFn: () => startReferenceCreation({ analysisId: selectedId, sectionKeys, instruction: instruction.trim() || undefined }),
    onSuccess: (response) => {
      if (!response.data) return;
      queryClient.setQueryData(["creation-studio", response.data.taskId], response);
      setOpen(false);
      navigate(`/create?taskId=${encodeURIComponent(response.data.taskId)}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("creation.referenceStartError")),
  });
  return <>
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
      <BookOpen className="mr-1.5 h-4 w-4" />{t("creation.referenceButton")}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("creation.referenceTitle")}</DialogTitle>
          <DialogDescription>{t("creation.referenceDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!analysisId ? <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="reference-analysis">{t("creation.referenceAnalysis")}</label>
            <Select value={selectedId} onValueChange={(value) => { setSelectedId(value); setSectionKeys([]); }}>
              <SelectTrigger id="reference-analysis"><SelectValue placeholder={t("creation.referenceChoose")} /></SelectTrigger>
              <SelectContent>{list.data?.data?.map((item) => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}</SelectContent>
            </Select>
            {!list.isLoading && !list.data?.data?.length ? <p className="text-sm text-muted-foreground">{t("creation.referenceEmpty")}</p> : null}
          </div> : <p className="text-sm font-medium">{analysis?.title ?? t("creation.referenceLoading")}</p>}
          {list.isError || detail.isError ? <p className="text-sm text-destructive">{t("creation.referenceLoadError")}</p> : null}
          {analysis ? <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("creation.referenceAspects")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {BOOK_ANALYSIS_SECTIONS.map((section) => {
                const available = analysis.sections.some((item) => item.sectionKey === section.key && item.status === "succeeded");
                return <label key={section.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!available} checked={sectionKeys.includes(section.key)}
                    onChange={(event) => setSectionKeys((keys) => event.target.checked ? [...keys, section.key] : keys.filter((key) => key !== section.key))} />
                  <span className={!available ? "text-muted-foreground" : ""}>{t(`creation.section.${section.key}`)}{!available ? t("creation.referencePending") : ""}</span>
                </label>;
              })}
            </div>
          </fieldset> : null}
          <label className="block space-y-2">
            <span className="text-sm font-medium">{t("creation.referenceInstruction")}</span>
            <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={4000}
              placeholder={t("creation.referencePlaceholder")}
              className="min-h-24 w-full rounded-md border bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={!analysis || !sectionKeys.length || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("creation.referenceGenerate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
