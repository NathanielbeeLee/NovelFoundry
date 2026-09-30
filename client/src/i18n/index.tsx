import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { messages, type MessageKey } from "./catalog";

export type { MessageKey } from "./catalog";

export type Locale = "en-US" | "zh-CN";

const LOCALE_STORAGE_KEY = "novelfoundry.locale";


type Translator = (key: MessageKey, fallback?: string) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: Translator;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en-US" || stored === "zh-CN") {
      return stored;
    }
    return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
  }
  return "en-US";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    }
  };

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    toggleLocale: () => setLocale(locale === "en-US" ? "zh-CN" : "en-US"),
    t: (key, fallback) => messages[locale][key] ?? fallback ?? messages["en-US"][key] ?? key,
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside LocaleProvider");
  }
  return context;
}

const navigationLabelKeys: Partial<Record<string, MessageKey>> = {
  首页: "nav.home",
  小说: "nav.novels",
  创作: "nav.creativeHub",
  任务: "nav.tasks",
  更多: "mobile.more",
  "创作向导": "nav.help",
  短剧: "nav.drama",
  短剧工作台: "nav.drama",
  拆书: "nav.bookAnalysis",
  导演跟进: "nav.followUps",
  旧版聊天: "nav.creativeHub",
  统一资产中心: "nav.assets",
  知识库: "nav.knowledge",
  题材基底: "nav.genres",
  题材基底库: "nav.genres",
  推进模式: "nav.storyModes",
  推进模式库: "nav.storyModes",
  标题工坊: "nav.titles",
  写法引擎: "nav.styleEngine",
  "反 AI 规则": "nav.antiAiRules",
  基础角色: "nav.characters",
  基础角色库: "nav.characters",
  世界样本库: "nav.worlds",
  创建世界样本: "nav.worlds",
  提示词管理: "nav.promptWorkbench",
  模型路由: "nav.modelRoutes",
  系统设置: "nav.settings",
  世界手册: "nav.worlds",
  小说预览: "nav.novels",
  小说工作区: "nav.novels",
  章节正文: "nav.novels",
};

export function translateNavigationLabel(label: string, t: Translator): string {
  const key = navigationLabelKeys[label];
  return key ? t(key, label) : label;
}
