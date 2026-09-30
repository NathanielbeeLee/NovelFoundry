import { renderToString } from "react-dom/server";
import App from "./App";
import { flattenedDocs } from "./docsManifest";
import { resolvePageMeta } from "./hooks/usePageMeta";
import type { PageMeta, ResolvedPageMeta } from "./hooks/usePageMeta";
import { parseRoute } from "./routing";

const docsIndexMeta: PageMeta = {
  title: "Documentation",
  description: "NovelFoundry documentation for installation, first-run usage, the AI director, chapter execution, recovery, and module workflows.",
  canonicalPath: "/docs",
};

export type PrerenderResult = {
  html: string;
  head: ResolvedPageMeta;
};

export function getPrerenderRoutes(): string[] {
  return ["/", "/docs", ...flattenedDocs.map((doc) => `/docs/${doc.id}`)];
}

function getRouteMeta(pathname: string): PageMeta | null {
  const route = parseRoute(pathname);
  if (route.page === "home") {
    return null;
  }
  if (!route.docId) {
    return docsIndexMeta;
  }
  const activeDoc = flattenedDocs.find((doc) => doc.id === route.docId);
  if (!activeDoc) {
    return docsIndexMeta;
  }
  return {
    title: `${activeDoc.title} · ${activeDoc.categoryTitle}`,
    description: activeDoc.description,
    canonicalPath: `/docs/${activeDoc.id}`,
  };
}

export function renderRoute(pathname: string): PrerenderResult {
  return {
    html: renderToString(<App initialPath={pathname} />),
    head: resolvePageMeta(getRouteMeta(pathname)),
  };
}
