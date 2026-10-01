import { createHash } from "node:crypto";
import { prepareStructuredPromptExecution, type PreparedStructuredPromptExecution } from "../../../../../prompting/core/promptRunner";
import { resolvePromptContextBlocksForAsset } from "../../../../../prompting/context/promptContextResolution";
import { buildChapterReviewContextBlocks } from "../../../../../prompting/prompts/novel/chapterLayeredContext";
import { chapterAcceptanceAssessmentPrompt, type ChapterAcceptanceAssessmentOutput, type ChapterAcceptancePromptInput } from "../../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import type { ChapterAcceptanceAssessmentInput } from "../../ChapterAcceptanceAssessmentService";

// Bump for schema preprocess/parser normalization, prose findings, assessment
// normalization, or audit mapping changes that JSON Schema cannot describe.
const ACCEPTANCE_RESULT_POLICY_VERSION = "v1";

export interface PreparedChapterAcceptance {
  prompt: PreparedStructuredPromptExecution<ChapterAcceptancePromptInput, ChapterAcceptanceAssessmentOutput>;
  identityDigest: string | null;
}

export async function buildAcceptancePromptRequest(input: ChapterAcceptanceAssessmentInput) {
  const fallbackBlocks = input.contextPackage.chapterReviewContext
    ? buildChapterReviewContextBlocks(input.contextPackage.chapterReviewContext) : [];
  const resolvedContext = await resolvePromptContextBlocksForAsset({
    asset: chapterAcceptanceAssessmentPrompt,
    executionContext: {
      entrypoint: "chapter_pipeline", novelId: input.novelId, chapterId: input.chapterId,
      metadata: { chapterReviewContext: input.contextPackage.chapterReviewContext },
    },
    fallbackBlocks,
  });
  return {
    asset: chapterAcceptanceAssessmentPrompt,
    promptInput: {
      novelTitle: input.novelTitle, chapterOrder: input.chapterOrder, chapterTitle: input.chapterTitle,
      targetWordCount: input.targetWordCount ?? null, content: input.content,
    },
    contextBlocks: resolvedContext.blocks,
    options: {
      provider: input.provider, model: input.model, temperature: Math.min(input.temperature ?? 0.2, 0.35),
      maxTokens: 1600, novelId: input.novelId, chapterId: input.chapterId,
      stage: "chapter_acceptance", triggerReason: "chapter_acceptance_assessment",
    },
  };
}

export async function prepareChapterAcceptance(input: ChapterAcceptanceAssessmentInput): Promise<PreparedChapterAcceptance> {
  const prompt = await prepareStructuredPromptExecution<ChapterAcceptancePromptInput, ChapterAcceptanceAssessmentOutput>(
    await buildAcceptancePromptRequest(input),
  );
  return {
    prompt,
    identityDigest: prompt.identityDigest ? createHash("sha256").update(JSON.stringify({
      preparedPrompt: prompt.identityDigest, resultPolicy: ACCEPTANCE_RESULT_POLICY_VERSION,
      novelId: input.novelId, chapterId: input.chapterId,
    })).digest("hex") : null,
  };
}
