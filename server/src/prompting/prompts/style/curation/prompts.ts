import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { z } from "zod";

import type { PromptAsset } from "../../../core/promptTypes";

import { antiAiRuleAiDraftSchema, styleProfileAntiAiSelectionSchema, styleProfileMetadataSchema, styleProfileSanitizeForGenerationSchema } from "../style.promptSchemas";

import { type StyleProfileMetadataPromptInput, type StyleProfileAntiAiSelectionPromptInput, type StyleProfileSanitizeForGenerationPromptInput, type AntiAiRuleAiDraftPromptInput } from "../contracts/inputs";

export const styleProfileMetadataPrompt: PromptAsset<
  StyleProfileMetadataPromptInput,
  z.infer<typeof styleProfileMetadataSchema>
> = {
  id: "style.profile.metadata",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: styleProfileMetadataSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说写法资产元信息整理器。",
      "你的任务是基于已经提炼好的写法核心摘要，补齐便于检索和推荐的元信息。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "输出字段必须且只能包括：",
      "category, tags, applicableGenres。",
      "",
      "全局硬规则：",
      "1. 所有字段值必须使用简体中文。",
      "2. 只能基于给定写法摘要归纳，不得发散到摘要中没有依据的标签。",
      "3. category 必须稳、短、可复用，不要写成长句。",
      "4. tags 只保留有区分度的短标签，避免空泛形容词；通常返回 3-8 个。",
      "5. applicableGenres 只保留真正适合迁移的题材；通常返回 2-6 个，不要泛滥铺满。",
      "6. 如果给了建议分类且它与摘要不冲突，优先沿用建议分类。",
      "7. 宁可少而准，也不要堆砌无意义标签。",
    ].join("\n")),
    new HumanMessage([
      `写法名称：${input.name}`,
      `来源：${input.sourceType}`,
      `建议分类：${input.preferredCategory?.trim() || "未指定"}`,
      "",
      "写法核心摘要：",
      input.styleDigest,
    ].join("\n")),
  ],
};

export const styleProfileAntiAiSelectionPrompt: PromptAsset<
  StyleProfileAntiAiSelectionPromptInput,
  z.infer<typeof styleProfileAntiAiSelectionSchema>
> = {
  id: "style.profile.select_anti_ai",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: styleProfileAntiAiSelectionSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说写法资产的反AI规则精配器。",
      "你的任务是从给定的合法规则目录中，只挑出真正适合当前写法的反AI规则 key。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "输出字段必须且只能包括：",
      "antiAiRuleKeys。",
      "",
      "全局硬规则：",
      "1. 只能从输入目录中出现过的 key 里选择，严禁自造新 key。",
      "2. 只有当某条规则真的能帮助维持当前写法、抑制对应风险时才可选择。",
      "3. 如果目录中没有真正匹配的规则，返回空数组。",
      `4. 最多返回 ${input.maxRuleCount ?? 4} 个 key。`,
      "5. 优先选择和当前写法的高风险点、常见翻车点直接对应的规则，不要为了凑数量泛选。",
      "6. 不要把“通用安全感”误当成“强相关”；弱相关规则宁可不选。",
    ].join("\n")),
    new HumanMessage([
      `写法名称：${input.name}`,
      `写法摘要：${input.summary?.trim() || "未提供"}`,
      "",
      "写法核心摘要：",
      input.styleDigest,
      "",
      "风险摘要：",
      input.riskDigest,
      "",
      "合法规则目录：",
      input.catalogText,
    ].join("\n")),
  ],
};

export const styleProfileSanitizeForGenerationPrompt: PromptAsset<
  StyleProfileSanitizeForGenerationPromptInput,
  z.infer<typeof styleProfileSanitizeForGenerationSchema>
> = {
  id: "style.profile.sanitize_for_generation",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: styleProfileSanitizeForGenerationSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说写法资产安全净化器。",
      "你的任务是把写法 profile 转换成可用于生成的抽象写法指导，并识别禁止泄露的源作品实体。",
      "只输出严格 JSON，不要 Markdown、解释或额外文本。",
      "",
      "输出字段只能包含：writingGuidance, forbiddenEntities, sourceRiskSummary。",
      "",
      "规则：",
      "1. writingGuidance 只能保留可迁移的写法维度，例如叙事节奏、信息密度、对话张力、句式组织、留白方式。",
      "2. forbiddenEntities 必须列出源作品角色名、地名、专有称谓、组织名、标志性梗和可识别组合词。",
      "3. writingGuidance 里严禁出现 forbiddenEntities 中的任何词。",
      "4. 不要复述源作品剧情、设定名词、人物关系或名场面。",
      "5. 如果无法判断某个具体名词是否可迁移，优先放入 forbiddenEntities。",
    ].join("\n")),
    new HumanMessage([
      `写法 profile：${input.profileName}`,
      "",
      "当前写法合同：",
      input.styleContractText,
      "",
      "源素材摘要：",
      input.sourceDigest,
    ].join("\n")),
  ],
};

export const antiAiRuleAiDraftPrompt: PromptAsset<
  AntiAiRuleAiDraftPromptInput,
  z.infer<typeof antiAiRuleAiDraftSchema>
> = {
  id: "style.anti_ai_rule.draft",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: antiAiRuleAiDraftSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说写作产品里的反 AI 规则编辑助手。",
      "你的任务是把用户的自然语言需求整理成一条可执行、可编辑、可检测的反 AI 规则草稿。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "输出字段必须且只能包括：draft, rationale, safetyNotes。",
      "draft 必须且只能包含：key, name, type, severity, description, detectPatterns, promptInstruction, rewriteSuggestion。",
      "",
      "规则类型含义：",
      "1. forbidden：明确禁止的 AI 味、模板痕迹或不适合正文生成的表达。",
      "2. risk：常见风险，需要提醒模型规避，但允许在特定语境下自然出现。",
      "3. encourage：鼓励采用的替代表达方式或正向写法。",
      "",
      "生成要求：",
      "1. 所有文本字段必须使用简体中文，key 必须使用英文小写、数字和下划线。",
      "2. 规则必须具体、可执行，不要写“提升真实感”“避免AI感”这类空泛要求。",
      "3. detectPatterns 只放少量高价值短语，通常 3-8 个；不要堆砌同义词。",
      "4. promptInstruction 要能直接进入正文生成约束，使用命令式表达。",
      "5. rewriteSuggestion 要给出命中后如何改，不要只重复问题名称。",
      "6. 不要生成会要求模型照搬某个具体作品、作者、角色、设定或标志性句子的规则。",
      "7. 如果用户要求过宽，要收束成一条规则，不要一次做成多条规则。",
      "",
      input.mode === "improve"
        ? [
            "当前模式：优化已有规则。",
            "你必须在当前规则基础上改得更清楚、更可执行。",
            "除非用户明确要求改规则标识，否则 key 应尽量保持原值。",
            "不要改变启用状态、全局默认状态或自动改写开关；这些开关由系统处理。",
          ].join("\n")
        : [
            "当前模式：新建规则。",
            "你要根据用户描述生成一条新的规则草稿。",
            "不要假设这条规则会进入全局默认，也不要决定自动改写开关。",
          ].join("\n"),
      "",
      "rationale 用一句话说明为什么这样组织规则。",
      "safetyNotes 用 0-3 条说明使用风险，例如适合写法绑定、不建议全局默认、容易误伤的语境。",
    ].join("\n")),
    new HumanMessage([
      `模式：${input.mode}`,
      "",
      input.currentRuleText
        ? [
            "当前规则：",
            input.currentRuleText,
            "",
          ].join("\n")
        : "",
      "用户需求：",
      input.instruction,
    ].filter(Boolean).join("\n")),
  ],
};
