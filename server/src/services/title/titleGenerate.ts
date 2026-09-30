import type { TitleFactorySuggestion } from "@novelfoundry/shared/types/title";
import type { GenerateTitleIdeasInput } from "./TitleGenerationService";
import { titleGenerationService } from "./TitleGenerationService";

export type { GenerateTitleIdeasInput } from "./TitleGenerationService";
export { titleGenerationService } from "./TitleGenerationService";

export async function generateTitleIdeas(input: GenerateTitleIdeasInput): Promise<{ titles: TitleFactorySuggestion[] }> {
  return titleGenerationService.generateTitleIdeas(input);
}
