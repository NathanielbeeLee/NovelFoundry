import type { QueryClient } from "@tanstack/react-query";
import { getAgentRunDetail, listAgentRuns } from "@/api/agentRuns";
import { queryKeys } from "@/api/queryKeys";
import type { CreativeHubStateRefreshResult } from "../runtime";

export function createCreativeHubStateRefresh(queryClient: QueryClient, threadId: string) {
  return async (runId: string | null): Promise<CreativeHubStateRefreshResult> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads }),
      queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.state(threadId || "none") }),
      queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.history(threadId || "none") }),
      ...(runId ? [queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail("agent_run", runId) })] : []),
    ]);
    const sessionId = `creative_hub_${threadId}`;
    if (runId) {
      const response = await getAgentRunDetail(runId);
      if (!response.success || !response.data || response.data.run.id !== runId || response.data.run.sessionId !== sessionId) {
        throw new Error("无法确认本轮任务状态，请刷新后再继续。");
      }
      queryClient.setQueryData(queryKeys.agentRuns.detail(runId), response);
      const run = response.data.run;
      return { run, hasActiveRun: run.status === "running" || run.status === "queued" || run.status === "waiting_approval" };
    }
    // Filter each active status at the service, so a limit on completed history
    // cannot hide an active run when the connection closed before its id arrived.
    const responses = await Promise.all(["queued", "running", "waiting_approval"].map((status) => listAgentRuns({
      sessionId,
      status: status as "queued" | "running" | "waiting_approval",
      limit: 10,
    })));
    if (responses.some((response) => !response.success || !response.data)) {
      throw new Error("无法确认当前任务状态，请刷新后再继续。");
    }
    const runs = responses.flatMap((response) => response.data ?? []).filter((run) => run.sessionId === sessionId);
    return { run: runs.length === 1 ? runs[0] : null, hasActiveRun: runs.length > 0 };
  };
}
