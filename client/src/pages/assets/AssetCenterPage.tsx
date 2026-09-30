import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpenText, Database, Globe2, Search, SquarePen, Tags, UsersRound, WandSparkles, Workflow } from "lucide-react";
import { getBaseCharacterList } from "@/api/character";
import { getGenreTree, type GenreTreeNode } from "@/api/genre";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { getStoryModeTree, type StoryModeTreeNode } from "@/api/storyMode";
import { getStyleProfiles } from "@/api/styleEngine";
import { listTitleLibrary } from "@/api/title";
import { getWorldList } from "@/api/world";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function countTree(nodes: Array<GenreTreeNode | StoryModeTreeNode> | undefined): number {
  return (nodes ?? []).reduce((total, node) => total + 1 + countTree(node.children), 0);
}

export default function AssetCenterPage() {
  const [search, setSearch] = useState("");
  const genre = useQuery({ queryKey: ["asset-center", "genres"], queryFn: getGenreTree, staleTime: 30_000 });
  const storyModes = useQuery({ queryKey: ["asset-center", "story-modes"], queryFn: getStoryModeTree, staleTime: 30_000 });
  const knowledge = useQuery({ queryKey: ["asset-center", "knowledge"], queryFn: () => listKnowledgeDocuments(), staleTime: 30_000 });
  const worlds = useQuery({ queryKey: ["asset-center", "worlds"], queryFn: getWorldList, staleTime: 30_000 });
  const styles = useQuery({ queryKey: ["asset-center", "styles"], queryFn: getStyleProfiles, staleTime: 30_000 });
  const characters = useQuery({ queryKey: ["asset-center", "characters"], queryFn: () => getBaseCharacterList(), staleTime: 30_000 });
  const titles = useQuery({ queryKey: ["asset-center", "titles"], queryFn: () => listTitleLibrary({ pageSize: 1 }), staleTime: 30_000 });

  const assets = useMemo(() => [
    { to: "/genres", title: "题材基底", description: "管理题材规则、受众和常用叙事约束。", icon: Tags, count: countTree(genre.data?.data) },
    { to: "/story-modes", title: "推进模式", description: "复用升级、悬疑、感情等故事推进方式。", icon: Workflow, count: countTree(storyModes.data?.data) },
    { to: "/knowledge", title: "知识文档", description: "集中查看可供生成和检索使用的参考资料。", icon: Database, count: knowledge.data?.data?.length ?? 0 },
    { to: "/worlds", title: "世界样本", description: "管理世界规则、地点、势力和设定边界。", icon: Globe2, count: worlds.data?.data?.length ?? 0 },
    { to: "/style-engine", title: "写法资产", description: "沉淀可复用的文风、技法与表达规则。", icon: WandSparkles, count: styles.data?.data?.length ?? 0 },
    { to: "/base-characters", title: "基础角色", description: "复用角色原型，再按每本小说继续发展。", icon: UsersRound, count: characters.data?.data?.length ?? 0 },
    { to: "/titles", title: "标题资产", description: "生成、筛选并保存适合不同题材的标题。", icon: SquarePen, count: titles.data?.data?.total ?? 0 },
    { to: "/book-analysis", title: "拆书资产", description: "从优秀文本提取结构、角色和写法参考。", icon: BookOpenText, count: null },
  ], [characters.data, genre.data, knowledge.data, storyModes.data, styles.data, titles.data, worlds.data]);
  const keyword = search.trim().toLowerCase();
  const visibleAssets = assets.filter((item) => !keyword || `${item.title}${item.description}`.toLowerCase().includes(keyword));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">统一资产中心</h1>
        <p className="mt-2 text-muted-foreground">从一个入口查找题材、世界、角色、知识和写法；具体编辑仍在各自工作台完成。</p>
      </div>
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索资产类型，例如角色、世界、写法" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleAssets.map((item) => (
          <Link key={item.to} to={item.to}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader>
                <div className="flex items-center justify-between"><item.icon className="h-6 w-6 text-primary" />{item.count === null ? null : <span className="text-2xl font-semibold">{item.count}</span>}</div>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.description}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {visibleAssets.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">没有匹配的资产类型，换一个关键词试试。</div> : null}
    </div>
  );
}
