import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import type { NovelExportDownloadFormat, NovelExportScope } from "@novelfoundry/shared/types/novelExport";
import { downloadNovelExport } from "@/api/novel";
import { toast } from "@/components/ui/toast";
import { isNovelWorkspaceFlowTab } from "../../novelWorkspaceNavigation";
import { createDownload } from "../infrastructure/novelEditBrowserEffects";
import type { useNovelEditWorkspaceState } from "./useNovelEditWorkspaceState";
import type { useNovelEditWorkspaceData } from "./useNovelEditWorkspaceData";

interface UseNovelEditExportInput {
  state: ReturnType<typeof useNovelEditWorkspaceState>;
  data: ReturnType<typeof useNovelEditWorkspaceData>;
}

export function useNovelEditExport({ state, data }: UseNovelEditExportInput) {
  const { id, basicForm, activeTab } = state;
  const { novelDetailQuery } = data;
  const exportNovelMutation = useMutation({
    mutationFn: async (input: {
      format: NovelExportDownloadFormat;
      scope: NovelExportScope;
      novelTitle: string;
    }) => {
      const exported = await downloadNovelExport(id, input.format, input.scope, input.novelTitle);
      return {
        ...exported,
        scope: input.scope,
        format: input.format,
      };
    },
    onSuccess: ({ blob, fileName, scope }) => {
      createDownload(blob, fileName);
      toast.success(scope === "full" ? "整本书导出已开始。" : "当前步骤导出已开始。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "导出失败。");
    },
  });
  const exportNovelTitle = useMemo(
    () => basicForm.title.trim() || novelDetailQuery.data?.data?.title?.trim() || id,
    [basicForm.title, novelDetailQuery.data?.data?.title, id],
  );
  const currentExportScope = isNovelWorkspaceFlowTab(activeTab) && activeTab !== "world" ? activeTab : null;
  const exportVariables = exportNovelMutation.variables;
  const isExportingCurrentMarkdown = exportNovelMutation.isPending
    && exportVariables?.scope === currentExportScope
    && exportVariables?.format === "markdown";
  const isExportingCurrentJson = exportNovelMutation.isPending
    && exportVariables?.scope === currentExportScope
    && exportVariables?.format === "json";
  const isExportingFullMarkdown = exportNovelMutation.isPending
    && exportVariables?.scope === "full"
    && exportVariables?.format === "markdown";
  const isExportingFullJson = exportNovelMutation.isPending
    && exportVariables?.scope === "full"
    && exportVariables?.format === "json";
  return {
    exportNovelMutation,
    exportNovelTitle,
    currentExportScope,
    isExportingCurrentMarkdown,
    isExportingCurrentJson,
    isExportingFullMarkdown,
    isExportingFullJson,
  };
}
