import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { novelRouteForecastSchema } from "./routeForecast.promptSchemas";

export interface NovelRouteForecastPromptInput {
  candidateCount: number;
  horizon: number;
  authorIntent: string;
  context: {
    bookContract: unknown;
    macroConstraints: unknown;
    volumeWindow: unknown;
    chapterMission: unknown;
    obligationContract: unknown;
    chapterBoundary: unknown;
    chapterStateGoal: unknown;
    participants: unknown;
    characterHardFacts: unknown;
    localStateSummary: string;
    openConflictSummaries: string[];
    payoffItems: string[];
    recentChapterSummaries: string[];
    previousChapterTail: string;
  };
}

type NovelRouteForecastPromptOutput = z.infer<typeof novelRouteForecastSchema>;

export const novelRouteForecastPrompt: PromptAsset<
  NovelRouteForecastPromptInput,
  NovelRouteForecastPromptOutput
> = {
  id: "novel.route_forecast.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  maxRenderedInputTokens: 12_000,
  maxOutputTokens: 4_000,
  repairPolicy: { maxAttempts: 1, maxSourceTokens: 4_000 },
  semanticRetryPolicy: { maxAttempts: 1 },
  management: { productPrompt: true, editModes: ["readonly"] },
  outputSchema: novelRouteForecastSchema,
  structuredOutputHint: {
    example: {
      recommendedRouteId: "route_1",
      comparisonSummary: "路线一最贴合本章任务与人物当前动机，路线二更奇险但需要额外铺垫。",
      routes: [
        {
          id: "route_1",
          title: "正面逼问",
          coreMove: "主角利用刚获得的证据当面试探对手，换取即时推进，同时保留真正底牌。",
          chapterBeats: [
            { chapterOffset: 0, objective: "完成本章调查目标", conflict: "对手拒绝承认", turningPoint: "证据暴露隐藏关系", hook: "真正知情人主动现身" },
            { chapterOffset: 1, objective: "追查新线索", conflict: "同伴出现分歧", turningPoint: "主角改变调查顺序", hook: "线索指向内部人" },
          ],
          characterChoices: [{ character: "主角", choice: "公开部分证据", consequence: "获得主动权但惊动幕后者" }],
          expectedChanges: ["主角与同伴的信任出现可见变化"],
          readerPayoff: "本章给出一个可验证答案，同时抛出更具体的新问题。",
          fitScore: 90,
          noveltyScore: 76,
          continuityScore: 94,
          fitReason: "沿用现有任务与角色动机，不需要补造关键事实。",
          risks: [{ level: "medium", summary: "揭示速度可能过快", mitigation: "只兑现表层答案，保留幕后因果" }],
        },
        {
          id: "route_2",
          title: "诱饵反查",
          coreMove: "主角故意放出错误消息，引导对手行动，再从行动结果确认真正的利益链。",
          chapterBeats: [
            { chapterOffset: 0, objective: "布置可控诱饵", conflict: "诱饵可能伤及盟友", turningPoint: "盟友主动配合", hook: "对手选择了意外目标" },
            { chapterOffset: 1, objective: "跟踪对手行动", conflict: "主角必须在救人与取证间选择", turningPoint: "主角放弃完整证据先救人", hook: "被救者掌握第二份证据" },
          ],
          characterChoices: [{ character: "主角", choice: "用假消息换行动证据", consequence: "关系压力上升但调查取得突破" }],
          expectedChanges: ["对手行动模式被确认"],
          readerPayoff: "让读者提前理解计策，并通过意外偏差获得悬念。",
          fitScore: 82,
          noveltyScore: 88,
          continuityScore: 80,
          fitReason: "有较强戏剧性，但需要确保诱饵来源符合既有事实。",
          risks: [{ level: "medium", summary: "计策可能显得凭空出现", mitigation: "用已有证据和角色能力完成布置" }],
        },
      ],
    },
    note: "routes 数量必须等于 candidateCount；每条路线的 chapterBeats 数量必须等于 horizon，chapterOffset 从 0 连续递增。",
  },
  render: (input) => [
    new SystemMessage([
      "你是长篇小说的剧情推演导演。你要基于已经存在的正史、章节任务、人物硬事实和卷级承诺，生成彼此真正不同的未来路线。",
      "推演只提供候选计划，不写正文，不宣称修改了正史，不补造上下文中不存在的关键事实。",
      "每条路线必须从当前章节开始，覆盖指定 horizon，并说明人物选择、读者收益、预期变化和风险控制。",
      "差异必须来自因果策略、人物选择、冲突入口或兑现顺序，不能只替换措辞。",
      "优先帮助缺乏写作经验的作者：路线标题要直观，风险和取舍要能看懂，推荐理由要具体。",
      "作者补充意图如果与硬事实冲突，应保留硬事实，并在风险中说明需要的铺垫，不得强行执行冲突要求。",
      "fitScore 衡量对当前任务与作者意图的适配，noveltyScore 衡量路线差异与新鲜度，continuityScore 衡量与既有正史的连续性。",
      "只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: (output, input) => {
    if (output.routes.length !== input.candidateCount) {
      throw new Error(`剧情路线必须输出 ${input.candidateCount} 条。`);
    }
    const routeIds = new Set(output.routes.map((route) => route.id));
    if (routeIds.size !== output.routes.length) {
      throw new Error("剧情路线 id 不能重复。");
    }
    if (!routeIds.has(output.recommendedRouteId)) {
      throw new Error("推荐路线必须指向本次输出中的路线。");
    }
    for (const route of output.routes) {
      if (route.chapterBeats.length !== input.horizon) {
        throw new Error(`每条剧情路线必须覆盖 ${input.horizon} 章。`);
      }
      route.chapterBeats.forEach((beat, index) => {
        if (beat.chapterOffset !== index) {
          throw new Error("剧情路线的章节偏移必须从 0 连续递增。");
        }
      });
    }
    return output;
  },
};
