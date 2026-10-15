import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { researchExtractPrompt } from "../../../../prompting/prompts/knowledge/research/prompts";
import { getLLMSelectionSettings } from "../../../settings/LLMSelectionSettingsService";
import { AppError } from "../../../../middleware/errorHandler";
import { assertResearchInput } from "../domain/researchPolicy";
import { loadExtractionSource, storeResearchFindings } from "../infrastructure/ResearchStore";

export async function extractResearch(documentId: string, expectedRevision: string) {
  const source = await loadExtractionSource(documentId, expectedRevision);
  const content = source.documentVersion.content;
  assertResearchInput(content);
  const selection = await getLLMSelectionSettings();
  if (!selection) throw new AppError("请先在顶部选择用于提取的模型。", 400);
  const result = await runStructuredPrompt({ asset: researchExtractPrompt,
    promptInput: { title: source.title, reliabilityReason: source.reliabilityReason, content },
    options: { provider: selection.provider, model: selection.model, temperature: 0.1, maxTokens: 4096 },
  });
  return storeResearchFindings(documentId, source.id, expectedRevision, content, { findings: result.output });
}
