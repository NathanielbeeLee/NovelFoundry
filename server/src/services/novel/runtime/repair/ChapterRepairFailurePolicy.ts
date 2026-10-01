import { isLlmInvocationCancelled, StreamOutcomeError } from "../../../../llm/streamOutcome";
import { StructuredOutputError } from "../../../../llm/structuredOutput";

export function isChapterOperationCancelled(error: unknown): boolean {
  if (isLlmInvocationCancelled(error)) {
    return true;
  }
  const seen = new Set<Error>();
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error);
    if (error.message === "PIPELINE_CANCELLED") {
      return true;
    }
    error = error.cause;
  }
  return false;
}

// This policy applies only to AI review/repair calls with usable prose. Storage,
// context assembly and other runtime failures must keep their normal recovery path.
export function isRecoverableChapterAiFailure(error: unknown): error is Error {
  return !isChapterOperationCancelled(error) && (
    error instanceof StructuredOutputError
    || error instanceof StreamOutcomeError
    || (error instanceof Error && error.name === "TimeoutError")
  );
}

export class ChapterRepairInvocationFailedError extends Error {
  constructor(error: Error) {
    super(`章节修复暂未完成，正文已保留：${error.message}`, { cause: error });
    this.name = "ChapterRepairInvocationFailedError";
  }
}
