import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

const issueSchema = z.object({
  category: z.enum(["continuity", "character", "plot", "pacing", "voice", "payoff"]),
  severity: z.enum(["low", "medium", "high"]),
  title: z.string().min(1), detail: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1).max(6),
  chapterOrders: z.array(z.number().int().positive()).min(1).max(12),
  recommendation: z.string().min(1), feedback: z.string().min(1),
});
export const wholeBookReviewOutputSchema = z.object({
  summary: z.string().min(1), strengths: z.array(z.string().min(1)).max(8),
  scores: z.object({
    continuity: z.number().int().min(0).max(100), character: z.number().int().min(0).max(100),
    plot: z.number().int().min(0).max(100), pacing: z.number().int().min(0).max(100),
    voice: z.number().int().min(0).max(100), payoff: z.number().int().min(0).max(100),
    overall: z.number().int().min(0).max(100),
  }), issues: z.array(issueSchema).max(12),
});

type ReviewPromptInput = { title: string; startOrder: number; endOrder: number; evidenceJson: string };

export const wholeBookRangeReviewPrompt: PromptAsset<ReviewPromptInput, z.infer<typeof wholeBookReviewOutputSchema>> = {
  id: "novel.review.book_range", version: "v2", taskType: "chapter_review", mode: "structured", language: "zh",
  contextPolicy: { maxTokensBudget: 0 }, repairPolicy: { maxAttempts: 1 }, outputSchema: wholeBookReviewOutputSchema,
  structuredOutputHint: { example: { summary: "整书判断", strengths: [], scores: { continuity: 80, character: 80, plot: 80, pacing: 80, voice: 80, payoff: 80, overall: 80 }, issues: [] }, note: "只输出合法 JSON。" },
  render: (input) => [
    new SystemMessage([
      "你是长篇小说的分段审校编辑。请审查当前章节段的连续性、角色弧、情节因果、节奏、文风和伏笔回收。",
      "只能依据提供的章节证据；每个问题必须给出可定位的证据和章节序号，不得臆造正文事实。",
      "文风审阅还要比较各章开头、结尾与摘要：若反复出现相同的解说式开场、主题总结式收尾、整齐的情绪反应或过于轻易的冲突解决，可归入 voice、pacing 或 plot，并指出重复发生在哪些章。单个短句、比喻或惯用表达本身不构成问题。",
      "伏笔审阅要区分已兑现、计划延后与证据不足；只有证据能说明前文承诺被遗漏或写反时才报告，不能仅因本段未提及就判定伏笔丢失。",
      "feedback 必须写成可直接提供给后续章节生成模型的明确约束，但不会自动采用，需用户确认。",
      "最多列出 12 个高价值问题，优先选择跨章节问题。只返回 JSON。",
    ].join("\n")),
    new HumanMessage(`书名：${input.title}\n范围：第 ${input.startOrder}-${input.endOrder} 章\n证据包：\n${input.evidenceJson}`),
  ],
};

export const wholeBookReviewPrompt: PromptAsset<ReviewPromptInput, z.infer<typeof wholeBookReviewOutputSchema>> = {
  ...wholeBookRangeReviewPrompt,
  id: "novel.review.book_synthesis",
  render: (input) => [
    new SystemMessage([
      "你是长篇小说的全书级主编。输入包含多个分段审校结果和书级约束，请合并重复问题并判断跨段影响。",
      "只能使用分段报告里的证据；保留可定位的章节序号，不得添加不存在的正文事实。",
      "重点识别跨段重复的叙事模板和长期承诺遗漏；分段报告没有足够证据时保留不确定性，不把局部表达问题升级为全书结构故障。",
      "最多保留 12 个最影响全书质量的问题。feedback 必须是后续章节可直接读取的明确创作约束。",
      "综合评分要反映全书表现，不得只复制某一个分段。只返回 JSON。",
    ].join("\n")),
    new HumanMessage(`书名：${input.title}\n全书范围：第 ${input.startOrder}-${input.endOrder} 章\n分段审校与书级资料：\n${input.evidenceJson}`),
  ],
};
