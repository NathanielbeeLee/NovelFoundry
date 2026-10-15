import { SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { auditChapterPrompt, type AuditChapterPromptInput } from "../audit.prompts";
import { manualAuditOutputSchema, calibrateManualAudit } from "./schema";
import type { z } from "zod";

type ManualAuditOutput = ReturnType<typeof calibrateManualAudit>;
export const manualChapterAuditPrompt: PromptAsset<AuditChapterPromptInput, ManualAuditOutput, z.infer<typeof manualAuditOutputSchema>> = {
  taskType: "critical_review",
  mode: "structured",
  language: "zh",
  contextPolicy: auditChapterPrompt.contextPolicy,
  contextRequirements: auditChapterPrompt.contextRequirements,
  slots: auditChapterPrompt.slots,
  editableSlots: auditChapterPrompt.editableSlots,
  id: "audit.chapter.manual_evidence",
  version: "v1",
  structuredOutputHint: undefined,
  maxRenderedInputTokens: 24_000,
  maxOutputTokens: 6_000,
  outputSchema: manualAuditOutputSchema,
  semanticRetryPolicy: { maxAttempts: 0 },
  render: (input, context) => [
    ...auditChapterPrompt.render(input, context),
    new SystemMessage([
      "本次为作者手动发起的证据审稿。输出score和issues，不输出auditReports；每条issues按本次schema完整填写。",
      "除severity、category、evidence、fixSuggestion外，填写verdict、excerpt、startOffset、endOffset、readingImpact、counterEvidence。",
      "evidence是你对问题的解释；excerpt必须是本次正文中连续逐字的短引文，不转述、不拼接，不从检索材料或规则复制。",
      "无法找到对应原文时excerpt可为空，此时不得confirmed。缺少前文也不能把猜测当成正文事实。",
      "引文重复时给出JS UTF-16从0计数的[startOffset,endOffset)位置；不能准确定位时两项均null，由系统核对。",
      "readingImpact解释实际影响读者理解或故事推进的原因。counterEvidence说明支持保留的文本证据、可能的叙事意图，以及为何仍需修改；没有充分证据时明确待确认，不为了填表编造反证。",
      "verdict=confirmed表示有充分依据值得修改；hypothesis表示证据不充分；deferred表示等待更多上下文；keep表示这是有作用的写法，应保留。",
      "不要仅凭句式、词语、人称或字数判断文学质量；先判断题材、人物声音、场景功能和有意重复。",
      "只记录有用的发现，不强迫每章出现问题。允许issues=[]；评分由你按实际阅读判断，不由问题数量决定。",
    ].join("\n")),
  ],
  postValidate: (raw, input) => calibrateManualAudit(manualAuditOutputSchema.parse(raw), input.content, input.requestedTypes),
};
