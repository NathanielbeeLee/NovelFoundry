import type { ReactNode } from "react";
import { ArrowRight, BookOpenText, Loader2, PlusCircle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkflowBadge } from "@/lib/novelWorkflowTaskUi";
import {
  DIRECTOR_CREATE_LINK,
  formatHomeDate,
  type HomeNextAction,
  MANUAL_CREATE_LINK,
  SHORT_STORY_CREATE_LINK,
  getHomeNovelTask,
  type HomeNovelItem,
} from "../homeViewModel";
import { useI18n } from "@/i18n";

export type RenderNovelPrimaryAction = (
  novel: HomeNovelItem,
  options?: {
    size?: "default" | "sm" | "lg";
    stopPropagation?: boolean;
  },
) => ReactNode;

export function HomeNextActionPanel(props: {
  action: HomeNextAction;
  primaryNovel: HomeNovelItem | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  renderNovelPrimaryAction: RenderNovelPrimaryAction;
}) {
  const { t } = useI18n();
  if (props.loading) {
    return (
      <Card className="home-next-action-panel overflow-hidden border-0 bg-[#122033] text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
        <CardContent className="p-7">
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("home.loading")}
          </div>
          <div className="mt-7 space-y-3">
            <div className="h-8 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-5 w-full animate-pulse rounded bg-white/10" />
            <div className="h-5 w-3/4 animate-pulse rounded bg-white/10" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (props.error) {
    return (
      <Card className="home-next-action-panel border-destructive/35 shadow-sm">
        <CardContent className="space-y-4 p-6">
          <Badge variant="destructive">{t("home.loadError")}</Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">{t("home.nextStepUnavailable")}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("home.loadErrorDescription")}</p>
          </div>
          <Button onClick={props.onRetry}>{t("home.reloadProject")}</Button>
        </CardContent>
      </Card>
    );
  }

  if (props.action.kind === "starter" || !props.primaryNovel) {
    return <StarterPanel action={props.action} />;
  }

  const novel = props.primaryNovel;
  const task = getHomeNovelTask(novel);
  const workflowBadge = getWorkflowBadge(task);

  return (
    <Card className="home-next-action-panel overflow-hidden border-0 bg-[#122033] text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
      <CardContent className="grid gap-8 p-7 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-sky-200">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {props.action.eyebrow}
            </span>
            {workflowBadge ? <Badge className="border-white/15 bg-white/10 text-slate-100 hover:bg-white/10">{workflowBadge.label}</Badge> : null}
            <Badge className="border-white/15 bg-white/10 text-slate-200 hover:bg-white/10">
              {novel.status === "published" ? t("home.published") : t("home.draft")}
            </Badge>
          </div>

          <div>
            <h1 className="break-words text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">{props.action.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{props.action.description}</p>
          </div>

          <div className="grid gap-5 border-t border-white/10 pt-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)]">
            <div className="border-l border-sky-300/70 pl-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-sky-100">
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                {t("home.whyNow")}
              </div>
              <p className="text-sm leading-6 text-slate-300">{props.action.reason}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-l border-white/10 pl-5 text-xs text-slate-400 sm:grid-cols-4 lg:grid-cols-2">
              <HeroFact label={t("home.chapters")} value={String(novel._count.chapters)} />
              <HeroFact label={t("home.characters")} value={String(novel._count.characters)} />
              <HeroFact label={t("home.world")} value={novel.world?.name ?? t("home.unbound")} />
              <HeroFact label={t("home.updated")} value={formatHomeDate(novel.updatedAt)} />
            </div>
          </div>
        </div>

        <aside className="flex flex-col justify-between gap-7 border-l border-white/10 pl-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <BookOpenText className="h-4 w-4 text-sky-200" aria-hidden="true" />
              {t("home.currentlyWriting")}
            </div>
            <div className="line-clamp-2 text-xl font-semibold leading-snug">{novel.title}</div>
            {task?.currentStage ? <p className="text-sm leading-6 text-slate-300">{task.currentStage}</p> : null}
          </div>
          <div className="grid gap-2">
            <div className="[&>button]:w-full [&>button]:bg-white [&>button]:text-slate-950 [&>button:hover]:bg-slate-100">
              {props.renderNovelPrimaryAction(novel, { size: "lg" })}
            </div>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link to={novel.narrativeForm === "short_story"
                ? `/novels/${novel.id}/story`
                : task ? `/novels/${novel.id}/edit?directorTaskId=${task.id}&taskPanel=1` : `/novels/${novel.id}/edit`}>
                {novel.narrativeForm === "short_story" ? t("home.openWork") : task ? t("home.viewExecution") : t("home.openProject")}
              </Link>
            </Button>
          </div>
        </aside>
      </CardContent>
    </Card>
  );
}

function StarterPanel(props: { action: HomeNextAction }) {
  const { t } = useI18n();
  return (
    <Card className="home-next-action-panel overflow-hidden border-0 bg-[#122033] text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
      <CardContent className="grid gap-7 p-7 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-end">
        <div className="min-w-0 space-y-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-sky-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {props.action.eyebrow}
          </div>
          <div>
            <h1 className="text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">{props.action.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">{props.action.description}</p>
          </div>
          <div className="border-l border-sky-300/70 pl-4 text-sm leading-6 text-slate-300">{props.action.reason}</div>
        </div>
        <div className="grid gap-2">
          <Button asChild size="lg" className="bg-white text-slate-950 hover:bg-slate-100">
            <Link to={DIRECTOR_CREATE_LINK}><PlusCircle className="mr-2 h-4 w-4" aria-hidden="true" />{t("home.startLongNovel")}</Link>
          </Button>
          {SHORT_STORY_CREATE_LINK ? (
            <Button asChild size="lg" variant="secondary" className="bg-sky-100 text-slate-950 hover:bg-sky-200">
              <Link to={SHORT_STORY_CREATE_LINK}>
                <BookOpenText className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("home.startShortStory")}
              </Link>
            </Button>
          ) : null}
          <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
            <Link to={MANUAL_CREATE_LINK}>{t("home.manualCreate")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HeroFact(props: { label: string; value: string }) {
  return <div><div>{props.label}</div><div className="mt-1 truncate text-base font-semibold text-white">{props.value}</div></div>;
}
