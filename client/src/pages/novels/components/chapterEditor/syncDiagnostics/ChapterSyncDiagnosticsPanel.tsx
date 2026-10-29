import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getChapterSyncDiagnostics } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import ChapterSyncDiagnosticsView from "./ChapterSyncDiagnosticsView";
import { getSyncDiagnosticsViewState } from "./viewState";

export default function ChapterSyncDiagnosticsPanel(props: {
  novelId: string;
  chapterId: string;
  chapterUpdatedAt: string;
  isDirty: boolean;
  isSaving: boolean;
  hasSaveConflict: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...queryKeys.novels.chapterSyncDiagnostics(props.novelId, props.chapterId), props.chapterUpdatedAt],
    queryFn: ({ signal }) => getChapterSyncDiagnostics(props.novelId, props.chapterId, signal),
    retry: false,
    refetchOnMount: "always",
    // This panel reads only; a refresh must never queue extraction or repair.
  });
  const state = getSyncDiagnosticsViewState({ ...props, ...query });
  return <ChapterSyncDiagnosticsView
    state={state}
    data={query.data}
    isDirty={props.isDirty}
    onRefresh={() => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(props.novelId) }),
        query.refetch(),
      ]);
    }}
  />;
}
