import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BookOpenText,
  Braces,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  Globe2,
  House,
  Images,
  LayoutDashboard,
  ListTodo,
  MonitorPlay,
  Route,
  SquareStack,
  ScanSearch,
  Settings2,
  ShieldCheck,
  SquarePen,
  Tags,
  UsersRound,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";
import { getAutoDirectorFollowUpOverview } from "@/api/autoDirectorFollowUps";
import { getTaskOverview } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VisualAssetLibraryDialog } from "@/components/visualAssets";
import { cn } from "@/lib/utils";
import { useI18n, type MessageKey } from "@/i18n";

interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  action?: "visual_asset_library";
  disabled?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: Array<NavGroup & { titleKey: "nav.group.creation" | "nav.group.assets" | "nav.group.system" }> = [
  {
    titleKey: "nav.group.creation",
    title: "创作",
    items: [
      { to: "/", label: "nav.home", icon: House },
      { to: "/help", label: "nav.help", icon: CircleHelp },
      { to: "/novels", label: "nav.novels", icon: BookOpenText },
      { to: "/drama", label: "nav.drama", icon: MonitorPlay, disabled: true },
      { to: "/comic", label: "nav.comic", icon: SquareStack },
      { to: "/creative-hub", label: "nav.creativeHub", icon: LayoutDashboard },
      { to: "/book-analysis", label: "nav.bookAnalysis", icon: ScanSearch },
      { to: "/tasks", label: "nav.tasks", icon: ListTodo },
      { to: "/auto-director/follow-ups", label: "nav.followUps", icon: Workflow },
    ],
  },
  {
    titleKey: "nav.group.assets",
    title: "资产",
    items: [
      { to: "/assets", label: "nav.assets", icon: SquareStack },
      { to: "/genres", label: "nav.genres", icon: Tags },
      { to: "/story-modes", label: "nav.storyModes", icon: Workflow },
      { to: "/titles", label: "nav.titles", icon: SquarePen },
      { to: "/knowledge", label: "nav.knowledge", icon: Database },
      { to: "/worlds", label: "nav.worlds", icon: Globe2 },
      { to: "/style-engine", label: "nav.styleEngine", icon: WandSparkles },
      { to: "/anti-ai-rules", label: "nav.antiAiRules", icon: ShieldCheck },
      { to: "/base-characters", label: "nav.characters", icon: UsersRound },
      { to: "#visual-assets", label: "nav.visualAssets", icon: Images, action: "visual_asset_library" },
    ],
  },
  {
    titleKey: "nav.group.system",
    title: "系统",
    items: [
      { to: "/prompt-workbench", label: "nav.promptWorkbench", icon: Braces },
      { to: "/settings/model-routes", label: "nav.modelRoutes", icon: Route },
      { to: "/settings", label: "nav.settings", icon: Settings2 },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useI18n();
  const [badgeQueriesEnabled, setBadgeQueriesEnabled] = useState(false);
  const [visualAssetLibraryOpen, setVisualAssetLibraryOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setBadgeQueriesEnabled(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.overview,
    queryFn: getTaskOverview,
    enabled: badgeQueriesEnabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const overview = query.state.data?.data;
      return (overview?.queuedCount ?? 0) > 0 || (overview?.runningCount ?? 0) > 0 ? 4000 : false;
    },
  });

  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledge.documents("sidebar"),
    queryFn: () => listKnowledgeDocuments(),
    enabled: badgeQueriesEnabled,
    staleTime: 30_000,
  });

  const autoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.overview,
    queryFn: getAutoDirectorFollowUpOverview,
    enabled: badgeQueriesEnabled,
    refetchInterval: (query) => {
      const totalCount = query.state.data?.data?.totalCount ?? 0;
      return totalCount > 0 ? 4000 : false;
    },
  });

  const failedTaskCount = taskQuery.data?.data?.failedCount ?? 0;
  const autoDirectorFollowUpCount = autoDirectorFollowUpQuery.data?.data?.totalCount ?? 0;
  const knowledgeDocuments = knowledgeQuery.data?.data ?? [];
  const failedIndexCount = knowledgeDocuments.filter((item) => item.latestIndexStatus === "failed").length;

  const renderBadge = (to: string) => {
    if (to === "/comic") {
      if (collapsed) {
        return null;
      }
      return (
        <Badge
          variant="outline"
          className="ml-auto h-5 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700"
          title={`${t("nav.comic")} ${t("nav.beta")}`}
        >
          {t("nav.beta")}
        </Badge>
      );
    }

    if (to === "/tasks") {
      if (failedTaskCount <= 0) {
        return null;
      }
      return (
        <div className={cn("flex items-center gap-1", collapsed ? "absolute right-1 top-1" : "ml-auto")}>
          <Badge
            variant="destructive"
            className={cn("h-5 px-1.5 text-[10px]", collapsed && "h-4 min-w-4 px-1 text-[9px]")}
          >
            {collapsed ? failedTaskCount : `F${failedTaskCount}`}
          </Badge>
        </div>
      );
    }

    if (to === "/auto-director/follow-ups" && autoDirectorFollowUpCount > 0) {
      return (
        <Badge
          variant="destructive"
          className={cn(
            "h-5 px-1.5 text-[10px]",
            collapsed ? "absolute right-1 top-1 h-4 min-w-4 px-1 text-[9px]" : "ml-auto",
          )}
        >
          {autoDirectorFollowUpCount}
        </Badge>
      );
    }

    if (to === "/knowledge" && failedIndexCount > 0) {
      return (
        <Badge
          variant="destructive"
          className={cn(
            "h-5 px-1.5 text-[10px]",
            collapsed ? "absolute right-1 top-1 h-4 min-w-4 px-1 text-[9px]" : "ml-auto",
          )}
        >
          {collapsed ? failedIndexCount : `F${failedIndexCount}`}
        </Badge>
      );
    }

    return null;
  };

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col border-r bg-muted/20 p-3 transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("mb-4 flex items-center", collapsed ? "justify-center" : "justify-end")}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={onToggle}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
        {navGroups.map((group) => (
          <div key={group.titleKey} className="space-y-1">
            {!collapsed ? (
              <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                {t(group.titleKey, group.title)}
              </div>
            ) : (
              <div className="mx-auto h-px w-8 bg-border/70" />
            )}

            {group.items.map((item) => {
              const Icon = item.icon;
              const isNovelEntry = item.to === "/novels";

              if (item.action === "visual_asset_library") {
                return (
                  <button
                    key={item.to}
                    type="button"
                    title={collapsed ? t(item.label) : undefined}
                    className={cn(
                      "relative flex w-full items-center rounded-md text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                      collapsed ? "justify-center px-2 py-2.5" : "py-2 pl-4 pr-2",
                    )}
                    onClick={() => setVisualAssetLibraryOpen(true)}
                  >
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", collapsed ? "mx-auto" : "mr-3")} />
                    {!collapsed ? <span className="truncate">{t(item.label)}</span> : null}
                  </button>
                );
              }

              if (item.disabled) {
                return (
                  <div
                    key={item.to}
                    title={collapsed ? t(item.label) : t("nav.comingSoon")}
                    className={cn(
                      "relative flex cursor-not-allowed items-center rounded-md text-sm opacity-40",
                      collapsed ? "justify-center px-2 py-2.5" : "py-2 pl-4 pr-2",
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", collapsed ? "mx-auto" : "mr-3")} />
                    {!collapsed ? (
                      <span className="truncate">{t(item.label)}</span>
                    ) : null}
                    {!collapsed ? (
                      <span className="ml-auto text-[10px] text-muted-foreground/60">{t("nav.comingSoon")}</span>
                    ) : null}
                  </div>
                );
              }

              return (
                <NavLink key={item.to} to={item.to} title={collapsed ? t(item.label) : undefined}>
                  {({ isActive }) => (
                    <div
                      className={cn(
                        "relative flex items-center rounded-md text-sm transition-colors",
                        collapsed ? "justify-center px-2 py-2.5" : "py-2 pl-4 pr-2",
                        isActive
                          ? "bg-accent/90 font-semibold text-accent-foreground"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground",
                        isNovelEntry && !collapsed && (isActive ? "ring-1 ring-primary/20" : "bg-primary/5 hover:bg-primary/10"),
                      )}
                    >
                      <span
                        className={cn(
                          "absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-transparent",
                          isActive && "bg-primary",
                          collapsed && "left-0.5 h-6",
                        )}
                      />

                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0",
                          collapsed ? "mx-auto" : "mr-3",
                          isNovelEntry && "text-primary",
                        )}
                      />

                      {!collapsed ? (
                        <span className={cn("truncate", isNovelEntry && "font-semibold")}>
                          {t(item.label)}
                        </span>
                      ) : null}

                      {renderBadge(item.to)}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <VisualAssetLibraryDialog open={visualAssetLibraryOpen} onOpenChange={setVisualAssetLibraryOpen} />
    </aside>
  );
}
