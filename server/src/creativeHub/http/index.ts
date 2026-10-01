import type { CreativeHubStreamFrame } from "@novelfoundry/shared/types/api";
import type { CreativeHubStreamGraphResult } from "../langgraphState";

export function createCreativeHubTerminalFrame(
  threadId: string,
  result: Pick<CreativeHubStreamGraphResult, "runId" | "runStatus" | "checkpoint" | "latestError">,
): Extract<CreativeHubStreamFrame, { event: "creative_hub/run_terminal" }> {
  const checkpointId = result.checkpoint?.checkpointId ?? null;
  switch (result.runStatus) {
    case "succeeded":
    case "waiting_approval": {
      if (!result.runId || !checkpointId || result.checkpoint?.runId !== result.runId) {
        throw new Error("本轮任务的保存结果尚未确认，请刷新任务状态。");
      }
      return {
        event: "creative_hub/run_terminal",
        data: {
          threadId,
          runId: result.runId,
          checkpointId,
          status: result.runStatus === "succeeded" ? "completed" : "waiting_approval",
        },
      };
    }
    case "failed":
    case "cancelled":
      return {
        event: "creative_hub/run_terminal",
        data: {
          threadId,
          runId: result.runId,
          checkpointId,
          status: result.runStatus,
          ...(result.latestError ? { message: result.latestError } : {}),
        },
      };
    default:
      throw new Error("本轮任务仍未返回确定结果，请刷新任务状态。");
  }
}
