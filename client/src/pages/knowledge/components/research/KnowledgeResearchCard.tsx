import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KnowledgeDocumentDetail } from "@novelfoundry/shared/types/knowledge";
import { RESEARCH_INPUT_CHAR_LIMIT } from "@novelfoundry/shared/types/knowledgeResearch";
import { getNovelList } from "@/api/novel";
import { extractResearch, getResearchAdoptions, getResearchSource, saveResearchSource, setResearchAdoption } from "@/api/knowledge/research";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function KnowledgeResearchCard({ document }: { document: KnowledgeDocumentDetail }) {
  const [expanded, setExpanded] = useState(false);
  const [novelId, setNovelId] = useState("");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState(document.title);
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [accessedAt, setAccessedAt] = useState("");
  const [reliability, setReliability] = useState("来源可靠性尚未核实");
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const queryKey = ["knowledge-research", document.id, document.activeVersionId];
  const sourceQuery = useQuery({ queryKey, queryFn: () => getResearchSource(document.id), enabled: expanded && Boolean(document.activeVersionId) });
  const source = sourceQuery.data?.data;
  const novels = useQuery({ queryKey: ["research-novels", search], queryFn: () => getNovelList({ limit: 100, search }), enabled: expanded });
  const adoptions = useQuery({ queryKey: ["research-adoptions", novelId], queryFn: () => getResearchAdoptions(novelId), enabled: expanded && Boolean(novelId) });
  useEffect(() => {
    setTitle(source?.title ?? document.title); setUrl(source?.url ?? ""); setAuthor(source?.author ?? "");
    setAccessedAt(source?.accessedAt?.slice(0, 10) ?? ""); setReliability(source?.reliabilityReason ?? "来源可靠性尚未核实");
    setEnabled(source?.enabled ?? true);
  }, [source?.revision, document.id, document.activeVersionId, document.title]);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["knowledge-research"] });
    await queryClient.invalidateQueries({ queryKey: ["research-adoptions"] });
  };
  const mutation = useMutation({
    mutationFn: async (action: "save" | "extract") => {
      if (action === "extract") {
        if (!source) throw new Error("请先保存来源说明。");
        await extractResearch(document.id, source.revision);
        return action;
      }
      await saveResearchSource(document.id, {
        documentVersionId: document.activeVersionId!, expectedRevision: source?.revision ?? null,
        title: title.trim() || document.title, url: url.trim() || null, author: author.trim() || null,
        accessedAt: accessedAt ? new Date(`${accessedAt}T00:00:00Z`).toISOString() : null,
        reliabilityReason: reliability.trim() || "来源可靠性尚未核实", enabled,
      });
      return action;
    },
    onSuccess: async action => { setMessage(action === "extract" ? "提取完成。请核对原文和局限，再选择需要采用的结论。" : "来源说明已保存；更改前的结论须重新提取后采用。"); await refresh(); },
    onError: async error => { setMessage(error instanceof Error ? error.message : "操作失败，请重试。"); await refresh(); },
  });
  const adoptionMutation = useMutation({
    mutationFn: (input: { documentId: string; findingId: string; adopt: boolean }) => setResearchAdoption(input.documentId, input.findingId, novelId, input.adopt),
    onSuccess: async () => { setMessage("采用记录已保存，下次生成章节时生效。"); await refresh(); },
    onError: error => setMessage(error instanceof Error ? error.message : "保存采用记录失败。"),
  });
  const contentLength = document.versions.find(version => version.id === document.activeVersionId)?.content.length ?? 0;
  const busy = mutation.isPending || adoptionMutation.isPending;
  const canEdit = document.status === "enabled" && Boolean(document.activeVersionId) && !sourceQuery.isLoading && !sourceQuery.isError;
  const findings = source?.findings.filter(finding => finding.fresh) ?? [];
  const sourceDirty = !source || title.trim() !== source.title || (url.trim() || null) !== source.url
    || (author.trim() || null) !== source.author || accessedAt !== (source.accessedAt?.slice(0, 10) ?? "")
    || reliability.trim() !== source.reliabilityReason || enabled !== source.enabled;
  return <Card>
    <CardHeader><CardTitle><Button variant="ghost" onClick={() => setExpanded(value => !value)}>资料研究（可选）{expanded ? " · 收起" : " · 展开"}</Button></CardTitle></CardHeader>
    {expanded ? <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">从当前资料提取有原文依据的结论。核对后可供某部小说参考；每部最多采用 5 条，不会直接改写正文或故事设定。</p>
      <p className="text-xs text-muted-foreground">仅分析当前激活版本的全文，最多 {RESEARCH_INPUT_CHAR_LIMIT.toLocaleString()} 字符；来源链接用于记录，不会自动访问。</p>
      {sourceQuery.isError ? <p role="alert" className="text-sm text-destructive">{sourceQuery.error.message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">来源标题<Input disabled={busy} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></label>
        <label className="space-y-1 text-sm">来源链接（可选）<Input disabled={busy} value={url} maxLength={2000} onChange={event => setUrl(event.target.value)} placeholder="https://…" /></label>
        <label className="space-y-1 text-sm">作者或机构（可选）<Input disabled={busy} value={author} maxLength={200} onChange={event => setAuthor(event.target.value)} /></label>
        <label className="space-y-1 text-sm">查阅日期（可选）<Input disabled={busy} type="date" value={accessedAt} onChange={event => setAccessedAt(event.target.value)} /></label>
      </div>
      <label className="block space-y-1 text-sm">可信理由与已知局限<Input disabled={busy} value={reliability} maxLength={500} onChange={event => setReliability(event.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input disabled={busy} type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />允许采用这份来源的研究结论</label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !canEdit} onClick={() => mutation.mutate("save")}>保存来源说明</Button>
        <Button disabled={busy || !canEdit || !enabled || sourceDirty || contentLength > RESEARCH_INPUT_CHAR_LIMIT} onClick={() => mutation.mutate("extract")}>{mutation.isPending ? "处理中…" : "用 AI 提取结论"}</Button>
      </div>
      {sourceDirty ? <p className="text-xs text-muted-foreground">请先保存来源说明，再提取结论。更改来源说明会使旧结论暂停参与章节生成，需重新提取后采用。</p> : null}
      {contentLength > RESEARCH_INPUT_CHAR_LIMIT ? <p className="text-sm text-muted-foreground">当前资料超出单次处理范围，请上传较短的独立资料。全文不会被截断。</p> : null}
      {document.status !== "enabled" ? <p className="text-sm text-muted-foreground">资料停用或归档期间，已采用结论不参与章节生成。</p> : null}
      {message ? <p role="status" className="text-sm">{message}</p> : null}
      <div className="space-y-2 rounded-md border p-3">
        <label className="block space-y-1 text-sm">选择采用结论的小说<Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索小说标题" /></label>
        <select disabled={adoptionMutation.isPending} aria-label="采用结论的小说" className="w-full rounded-md border bg-background p-2 text-sm" value={novelId} onChange={event => setNovelId(event.target.value)}>
          <option value="">请选择小说</option>
          {(novels.data?.data?.items ?? []).map(novel => <option key={novel.id} value={novel.id}>{novel.title}</option>)}
        </select>
        {(adoptions.data?.data ?? []).map(item => <div key={item.findingId} className="space-y-1 border-t pt-2 text-sm">
          <p>{item.claim}</p><p className="text-xs text-muted-foreground">{item.sourceTitle} · {item.fresh ? "参与下次章节生成" : "来源或版本已改变，暂不参与生成"}</p>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => adoptionMutation.mutate({ documentId: item.documentId, findingId: item.findingId, adopt: false })}>撤销采用</Button>
        </div>)}
      </div>
      {findings.map(finding => {
        const adopted = finding.adoptions.some(item => item.novelId === novelId && !item.revokedAt);
        return <div key={finding.findingId} className="space-y-2 rounded-md border p-3 text-sm">
          <p className="font-medium">{finding.claim}</p>
          <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3">{finding.quote}</blockquote>
          <p className="text-xs text-muted-foreground">来源：{finding.sourceTitle} · 原文位置 {finding.startOffset + 1}–{finding.endOffset}</p>
          <p>适用局限：{finding.uncertainty}</p>
          <Button size="sm" variant={adopted ? "outline" : "default"} disabled={busy || !novelId} onClick={() => adoptionMutation.mutate({ documentId: document.id, findingId: finding.findingId, adopt: !adopted })}>{adopted ? "撤销采用" : "采用到所选小说"}</Button>
        </div>;
      })}
      {source && !findings.length ? <p className="text-sm text-muted-foreground">暂无当前版本可采用的结论。保存来源说明后可用 AI 提取；没有充分依据时也可能不产生结论。</p> : null}
    </CardContent> : null}
  </Card>;
}
