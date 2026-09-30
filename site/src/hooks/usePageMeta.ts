import { useEffect } from "react";

const DEFAULT_TITLE = "NovelFoundry · AI-native long-form fiction production";
const DEFAULT_DESCRIPTION =
  "NovelFoundry is an open-source AI-native production workspace that guides writers from an idea to a readable chapter and a recoverable long-form workflow.";

function canonicalBase(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  return new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString();
}

function ensureMeta(selector: string, attribute: "name" | "property", key: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  return element;
}

function setMetaContent(attribute: "name" | "property", key: string, value: string) {
  const selector = `meta[${attribute}="${key}"]`;
  const element = ensureMeta(selector, attribute, key);
  element.setAttribute("content", value);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

export type PageMeta = {
  title?: string;
  description?: string;
  canonicalPath?: string;
};

export type ResolvedPageMeta = {
  title: string;
  description: string;
  canonical: string;
};

export function resolvePageMeta(meta: PageMeta | null | undefined): ResolvedPageMeta {
  const title = meta?.title ? `${meta.title} · NovelFoundry` : DEFAULT_TITLE;
  const description = meta?.description ?? DEFAULT_DESCRIPTION;
  const base = canonicalBase();
  const canonical = meta?.canonicalPath
    ? `${base}${meta.canonicalPath.replace(/^\//, "")}`
    : base;

  return { title, description, canonical };
}

export function usePageMeta(meta: PageMeta | null | undefined) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const { title, description, canonical } = resolvePageMeta(meta);

    const previousTitle = document.title;
    document.title = title;
    setMetaContent("name", "description", description);
    setMetaContent("property", "og:title", title);
    setMetaContent("property", "og:description", description);
    setMetaContent("property", "og:url", canonical);
    setMetaContent("name", "twitter:title", title);
    setMetaContent("name", "twitter:description", description);
    setCanonical(canonical);

    return () => {
      document.title = previousTitle;
    };
  }, [meta?.title, meta?.description, meta?.canonicalPath]);
}
