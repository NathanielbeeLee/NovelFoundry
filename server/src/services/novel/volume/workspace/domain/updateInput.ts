export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractVolumeWorkspaceUpdateInput(input: unknown): {
  workspaceInput: unknown;
  syncToChapterExecution: boolean;
} {
  if (!isRecord(input)) {
    return {
      workspaceInput: input,
      syncToChapterExecution: false,
    };
  }
  const { syncToChapterExecution, ...workspaceInput } = input;
  return {
    workspaceInput,
    syncToChapterExecution: syncToChapterExecution === true,
  };
}
