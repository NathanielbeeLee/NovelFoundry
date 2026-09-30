import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type {
  CreationDirection,
  NarrativeForm,
} from "@novelfoundry/shared/types/creationStudio";
import type { WritingPlatform, WritingPlatformPreference } from "@novelfoundry/shared/types/writingPlatform";
import {
  confirmCreationDirection,
  getCreationStudioTask,
  interpretCreationIdea,
  regenerateCreationDirections,
} from "@/api/creationStudio";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import ReferenceStartButton from "./components/ReferenceStartButton";
import ReferenceStartStatus from "./components/ReferenceStartStatus";

function normalizeTarget(form: NarrativeForm, value: number): number {
  if (form === "short_story") return Math.max(3000, Math.min(30000, Math.round(value)));
  return Math.max(50000, Math.min(3_000_000, Math.round(value)));
}

export default function CreationStudioPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const taskId = searchParams.get("taskId")?.trim() ?? "";
  const shortStoryEntry = searchParams.get("form") === "short_story";
  const [idea, setIdea] = useState("");
  const [selectedDirectionId, setSelectedDirectionId] = useState("");
  const [narrativeForm, setNarrativeForm] = useState<NarrativeForm>("short_story");
  const [targetWordCount, setTargetWordCount] = useState(8000);
  const [confirmedBaseline, setConfirmedBaseline] = useState("");
  const [initialPlatformPreference, setInitialPlatformPreference] = useState<WritingPlatformPreference>("ai_recommend");
  const [writingPlatform, setWritingPlatform] = useState<WritingPlatform>("fanqie_free");

  const taskQuery = useQuery({
    queryKey: ["creation-studio", taskId],
    queryFn: () => getCreationStudioTask(taskId),
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
    retry: false,
  });
  const task = taskQuery.data?.data ?? null;
  const interpretation = task?.interpretation ?? null;

  useEffect(() => {
    if (!task) return;
    setIdea((current) => task.referenceStart ? task.idea : current || task.idea);
    if (!interpretation) return;
    setNarrativeForm(interpretation.recommendedNarrativeForm);
    setTargetWordCount(interpretation.recommendedTargetWordCount);
    setSelectedDirectionId((current) => task.selectedDirectionId
      ?? (interpretation.directions.some((direction) => direction.id === current) ? current : interpretation.directions[0].id));
    setWritingPlatform(interpretation.recommendedWritingPlatform);
    setConfirmedBaseline(`${interpretation.recommendedNarrativeForm}:${interpretation.recommendedTargetWordCount}:${interpretation.recommendedWritingPlatform}`);
  }, [task?.taskId, task?.selectedDirectionId, interpretation]);

  const currentScaleKey = `${narrativeForm}:${targetWordCount}:${writingPlatform}`;
  const scaleNeedsRefresh = Boolean(interpretation && confirmedBaseline && currentScaleKey !== confirmedBaseline);
  const selectedDirection = useMemo(
    () => interpretation?.directions.find((direction) => direction.id === selectedDirectionId) ?? null,
    [interpretation, selectedDirectionId],
  );

  const interpretMutation = useMutation({
    mutationFn: () => interpretCreationIdea({
      idea: idea.trim(),
      preferredNarrativeForm: shortStoryEntry ? "short_story" : undefined,
      writingPlatformPreference: initialPlatformPreference,
    }),
    onSuccess: (response) => {
      const created = response.data;
      if (!created) return;
      setSearchParams({ taskId: created.taskId }, { replace: true });
      toast.success(t("creation.interpretSuccess"));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("creation.interpretError")),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateCreationDirections(taskId, {
      narrativeForm,
      targetWordCount: normalizeTarget(narrativeForm, targetWordCount),
      writingPlatformPreference: writingPlatform,
      feedback: "请按我调整后的作品规模与目标平台重新适配两个方向。",
    }),
    onSuccess: async (response) => {
      setConfirmedBaseline(`${narrativeForm}:${normalizeTarget(narrativeForm, targetWordCount)}:${writingPlatform}`);
      setSelectedDirectionId(response.data?.interpretation?.directions[0].id ?? "");
      await queryClient.invalidateQueries({ queryKey: ["creation-studio", taskId] });
      toast.success(t("creation.regenerateSuccess"));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("creation.regenerateError")),
  });

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!selectedDirection) throw new Error(t("creation.chooseDirection"));
      return confirmCreationDirection(taskId, {
        directionId: selectedDirection.id,
        narrativeForm,
        targetWordCount: normalizeTarget(narrativeForm, targetWordCount),
        idempotencyKey: `creation:${taskId}:${selectedDirection.id}`,
        writingPlatform,
        expectedIntentVersionId: task?.referenceStart?.intentVersionId ?? undefined,
        expectedBriefHash: task?.referenceStart?.briefHash ?? undefined,
      });
    },
    onSuccess: (response) => {
      if (response.data?.resumeRoute) navigate(response.data.resumeRoute);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("creation.confirmError")),
  });

  if (taskId && taskQuery.isLoading) {
    return <CenteredStatus label={t("creation.restoring")} />;
  }

  return (
    <div className="w-full space-y-10 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground hover:text-foreground">
          <Link to="/novels"><ArrowLeft className="mr-2 h-4 w-4" />{t("creation.returnToNovels")}</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Link to="/novels/create">
            {t("creation.fullSetup")}
            <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <section className="w-full pt-3 sm:pt-8">
        <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {shortStoryEntry ? t("creation.shortEyebrow") : t("creation.studioEyebrow")}
        </div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-foreground sm:text-5xl lg:text-[3.5rem]">
          {shortStoryEntry ? t("creation.shortTitle") : t("creation.longTitle")}
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
          {shortStoryEntry
            ? t("creation.shortIntro")
            : t("creation.longIntro")}
        </p>
      </section>

      {!taskId && !shortStoryEntry ? <ReferenceStartButton /> : null}
      {task?.referenceStart ? <ReferenceStartStatus task={task} /> : null}
      {task?.referenceStart && !interpretation ? null : !interpretation ? (
        <section
          aria-labelledby="creation-idea-heading"
          className="mx-auto w-full max-w-4xl rounded-2xl bg-muted/20 p-3 shadow-[0_14px_44px_rgba(15,23,42,0.06)] transition focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30 sm:p-4"
        >
          <div className="flex items-start justify-between gap-4 px-1 pt-1">
            <div>
              <div className="text-xs font-medium text-muted-foreground">{t("creation.ideaStep")}</div>
              <h2 id="creation-idea-heading" className="mt-2 text-xl font-semibold tracking-[-0.02em]">
                {t("creation.ideaHeading")}
              </h2>
            </div>
            {idea ? (
              <span className="pt-1 text-xs tabular-nums text-muted-foreground">
                {idea.length.toLocaleString()} / 12,000
              </span>
            ) : null}
          </div>
          <textarea
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder={t("creation.ideaPlaceholder")}
            aria-label={shortStoryEntry ? t("creation.shortIdeaLabel") : t("creation.ideaLabel")}
            className="mt-5 min-h-[180px] w-full resize-none bg-transparent px-1 py-1 text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-lg sm:leading-8"
            maxLength={12000}
            autoFocus
          />
          <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="shrink-0">{t("creation.targetPlatform")}</span>
              <Select
                value={initialPlatformPreference}
                onValueChange={(value) => setInitialPlatformPreference(value as WritingPlatformPreference)}
              >
                <SelectTrigger aria-label={t("creation.choosePlatform")} className="h-9 min-w-[11rem] rounded-md px-2.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai_recommend">{t("creation.aiRecommend")}</SelectItem>
                  <SelectItem value="fanqie_free">{t("creation.platformFanqie")}</SelectItem>
                  {!shortStoryEntry ? <SelectItem value="qidian_male">{t("creation.platformQidian")}</SelectItem> : null}
                  {!shortStoryEntry ? <SelectItem value="jinjiang_female">{t("creation.platformJinjiang")}</SelectItem> : null}
                  <SelectItem value="zhihu_story">{t("creation.platformZhihu")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs leading-5 text-muted-foreground">{t("creation.ideaHint")}</span>
              <Button
                size="lg"
                className="h-11 rounded-full px-6 shadow-none"
                onClick={() => interpretMutation.mutate()}
                disabled={!idea.trim() || interpretMutation.isPending}
              >
                {interpretMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {t("creation.generateDirections")}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-6">
          <Card className="border-border/70 bg-muted/20">
            <CardContent className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-primary">{t("creation.understanding")}</div>
                <p className="mt-2 text-sm leading-7 text-foreground">{interpretation.understanding}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{interpretation.recommendationReason}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("creation.platformAdvice")}{interpretation.writingPlatformReason}</p>
                {interpretation.productionFoundation ? (
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="text-xs text-muted-foreground">{t("creation.foundation")}</div>
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {interpretation.productionFoundation.genre.path}
                      <span className="mx-2 text-muted-foreground">×</span>
                      {interpretation.productionFoundation.primaryStoryMode.path}
                      {interpretation.productionFoundation.secondaryStoryMode
                        ? ` + ${interpretation.productionFoundation.secondaryStoryMode.path}`
                        : ""}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {interpretation.productionFoundation.summary}
                    </p>
                  </div>
                ) : null}
              </div>
              <ScaleControls
                longFormOnly={Boolean(task?.referenceStart)}
                narrativeForm={narrativeForm}
                targetWordCount={targetWordCount}
                onFormChange={(form) => {
                  setNarrativeForm(form);
                  setTargetWordCount(form === "short_story" ? 8000 : 200000);
                  setWritingPlatform("fanqie_free");
                }}
                onTargetChange={setTargetWordCount}
                writingPlatform={writingPlatform}
                onPlatformChange={setWritingPlatform}
              />
            </CardContent>
          </Card>

          {scaleNeedsRefresh ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50/50 px-4 py-3 dark:bg-amber-950/10">
              <p className="text-sm text-muted-foreground">{t("creation.scaleChanged")}</p>
              <Button
                variant="outline"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", regenerateMutation.isPending && "animate-spin")} />
                {t("creation.refreshDirections")}
              </Button>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {interpretation.directions.map((direction) => (
              <DirectionCard
                key={direction.id}
                direction={direction}
                selected={direction.id === selectedDirectionId}
                onSelect={() => setSelectedDirectionId(direction.id)}
              />
            ))}
          </div>

          <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">{selectedDirection ? t("creation.selectedTitle").replace("{title}", selectedDirection.title) : t("creation.chooseDirection")}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {narrativeForm === "short_story" ? t("creation.shortNext") : t("creation.longNext")}
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => confirmMutation.mutate()}
              disabled={!selectedDirection || scaleNeedsRefresh || confirmMutation.isPending}
            >
              {confirmMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {t("creation.confirm")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectionCard(props: {
  direction: CreationDirection;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const direction = props.direction;
  return (
    <button type="button" className="h-full text-left" onClick={props.onSelect} aria-pressed={props.selected}>
      <Card className={cn(
        "h-full transition hover:border-primary/50 hover:shadow-sm",
        props.selected && "border-primary ring-2 ring-primary/15",
      )}>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-semibold">{direction.title}</h2>
            <span className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
              props.selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}>
              {props.selected ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          </div>
          <p className="text-sm leading-7 text-foreground">{direction.premise}</p>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <DirectionFact label={t("creation.coreExperience")} value={direction.coreExperience} />
            <DirectionFact label={t("creation.protagonist")} value={direction.protagonist} />
            <DirectionFact label={t("creation.mainConflict")} value={direction.centralConflict} />
            <DirectionFact label={t("creation.endingPayoff")} value={direction.endingPromise} />
            {direction.referenceDesign ? <>
              <DirectionFact label={t("creation.originalWorld")} value={direction.referenceDesign.worldPremise} />
              <DirectionFact label={t("creation.openingHook")} value={direction.referenceDesign.openingHook} />
              <DirectionFact label={t("creation.progression")} value={direction.referenceDesign.progressionLoop} />
              <DirectionFact label={t("creation.firstPayoff")} value={direction.referenceDesign.firstStagePromise} />
            </> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {direction.styleKeywords.map((keyword) => (
              <span key={keyword} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{keyword}</span>
            ))}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function DirectionFact(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 leading-6">{props.value}</div>
    </div>
  );
}

function ScaleControls(props: {
  longFormOnly?: boolean;
  narrativeForm: NarrativeForm;
  targetWordCount: number;
  onFormChange: (value: NarrativeForm) => void;
  onTargetChange: (value: number) => void;
  writingPlatform: WritingPlatform;
  onPlatformChange: (value: WritingPlatform) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 rounded-xl border bg-background p-4">
      <div className="text-xs font-medium text-muted-foreground">{t("creation.workScale")}</div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={props.narrativeForm === "short_story" ? "default" : "outline"}
          onClick={() => props.onFormChange("short_story")}
          disabled={props.longFormOnly}
        >
          {t("creation.shortForm")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={props.narrativeForm === "long_novel" ? "default" : "outline"}
          onClick={() => props.onFormChange("long_novel")}
        >
          {t("creation.longForm")}
        </Button>
      </div>
      <label className="block">
        <span className="text-xs text-muted-foreground">{t("creation.targetWords")}</span>
        <Input
          className="mt-1"
          type="number"
          min={props.narrativeForm === "short_story" ? 3000 : 50000}
          max={props.narrativeForm === "short_story" ? 30000 : 3000000}
          step={1000}
          value={props.targetWordCount}
          onChange={(event) => props.onTargetChange(Number(event.target.value))}
        />
      </label>
      <div className="block">
        <span className="text-xs text-muted-foreground">{t("creation.targetPlatform")}</span>
        <Select
          value={props.writingPlatform}
          onValueChange={(value) => props.onPlatformChange(value as WritingPlatform)}
        >
          <SelectTrigger className="mt-1 h-10 rounded-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fanqie_free">{t("creation.platformFanqie")}</SelectItem>
            {props.narrativeForm === "long_novel" ? <SelectItem value="qidian_male">{t("creation.platformQidian")}</SelectItem> : null}
            {props.narrativeForm === "long_novel" ? <SelectItem value="jinjiang_female">{t("creation.platformJinjiang")}</SelectItem> : null}
            {props.narrativeForm === "short_story" ? <SelectItem value="zhihu_story">{t("creation.platformZhihu")}</SelectItem> : null}
          </SelectContent>
        </Select>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{t("creation.platformHint")}</p>
      </div>
    </div>
  );
}

function CenteredStatus({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
