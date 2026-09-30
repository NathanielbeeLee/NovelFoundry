import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";
import type {
  WorldPropertyOptionsPromptInput,
  WorldLayerGenerationPromptInput,
  WorldLayerLocalizationPromptInput,
  WorldAxiomSuggestionPromptInput,
} from "../world.promptTypes";
import {
  worldPropertyOptionsPayloadSchema,
  worldLooseObjectSchema,
  worldAxiomSuggestionSchema,
} from "../world.promptSchemas";
import { buildReferenceModeLabel } from "../domain/referenceModeLabel";
import { sanitizeLooseWorldObject } from "../domain/outputValidation";

export const worldPropertyOptionsPrompt: PromptAsset<
  WorldPropertyOptionsPromptInput,
  z.infer<typeof worldPropertyOptionsPayloadSchema>
> = {
  id: "world.property_options.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldPropertyOptionsPayloadSchema,
  render: (input) => {
    const isReferenceMode = Boolean(input.referenceMode);

    return [
      new SystemMessage(
        isReferenceMode
          ? [
              "你是参考作品架空改造规划师。",
              "你的任务不是重写一套无关的新世界，而是基于参考作品的世界锚点、保留要求和改造边界，提炼出“正式生成世界前必须先决定”的关键世界决策项。",
              "",
              "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
              "输出结构必须严格为：",
              "{",
              '  "options": [',
              "    {",
              '      "id": "可选",',
              '      "name": "属性名称",',
              '      "description": "40-90字，说明这个属性决定什么，以及为什么值得在生成前就做选择",',
              '      "targetLayer": "foundation|power|society|culture|history|conflict",',
              '      "reason": "一句话说明它为什么值得优先决策",',
              '      "choices": [',
              "        {",
              '          "id": "choice-a",',
              '          "label": "方向 A",',
              '          "summary": "说明这个方向如何改造原作世界"',
              "        }",
              "      ]",
              "    }",
              "  ]",
              "}",
              "",
              "全局硬规则：",
              "1. options 数量必须与要求数量完全一致。",
              "2. 所有文本必须使用简体中文。",
              "3. targetLayer 只能是：foundation、power、society、culture、history、conflict。",
              "4. 每个 option 都必须包含 2-4 个 choices。",
              "5. choices 必须是互斥分支，而不是同义改写、强弱版本或描述角度变化。",
              "6. 不要生成角色动机、感情推进、具体桥段、单章冲突这类故事层选项。",
              "7. 只能围绕“世界层”或“世界-故事接口层”做决策设计。",
              "",
              "决策项要求：",
              "1. 每个 option 都必须是真正会改变后续世界构建方向的前置决策，而不是伪选项。",
              "2. name 必须简洁、清楚、可直接给用户点选，不要写成长句。",
              "3. description 必须说明“这个属性决定什么”以及“为什么要现在先决定”，不能空泛。",
              "4. reason 必须一句话点明它为何属于优先决策项，不能重复 description。",
              "",
              "choices 设计规则：",
              "1. 每个 choice 都必须代表一条清晰可分叉的架空改造路线。",
              "2. choices 之间要体现真正不同的世界走法，例如现实保留程度、秩序显隐方式、压迫结构来源、规则公开程度、地点系统组织方式等。",
              "3. 不要输出只是措辞不同的近义分支。",
              "4. summary 必须说明“这一分支会如何改造原作世界”，并点出边界与代价感。",
              "",
              "参考改造原则：",
              "1. 决策项必须围绕参考作品的世界基底展开，而不是借壳起一套无关新世界。",
              "2. 优先保留真正定义原作气质的底层结构，再在可改造边界内做分叉设计。",
              "3. 如果某个方向会让原作核心气质失真，应在该 choice.summary 中体现这种边界。",
              "4. 优先考虑现实基底、城市规则、社会压迫结构、地点系统、势力网络、公开与隐秘边界这类真正影响世界的核心轴。",
              "",
              "质量要求：",
              "1. options 之间尽量覆盖不同 targetLayer，不要全部挤在同一层。",
              "2. 每个 option 都应让用户一眼明白“我到底在决定哪个世界轴”。",
              "3. 输出结果应直接服务于下一步世界生成，而不是停留在概念讨论层。",
              input.retryStrict
                ? "4. 本次必须严格返回 JSON；如果不确定，也要先给出结构化 options，不得省略。"
                : "",
            ].filter(Boolean).join("\n")
          : [
              "你是小说世界生成器的前置决策规划师。",
              "你的任务是在正式生成世界之前，先提炼出一组真正值得用户先做决定的“关键世界属性选项”。",
              "这些选项不是装饰性问题，而是会直接影响后续世界构建方向的前置决策轴。",
              "",
              "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
              "输出结构必须严格为：",
              "{",
              '  "options": [',
              "    {",
              '      "id": "可选",',
              '      "name": "属性名称",',
              '      "description": "40-90字，说明这个属性决定什么，以及为什么值得在生成前就做选择",',
              '      "targetLayer": "foundation|power|society|culture|history|conflict",',
              '      "reason": "一句话说明它为什么值得优先决策"',
              "    }",
              "  ]",
              "}",
              "",
              "全局硬规则：",
              "1. options 数量必须与要求数量完全一致。",
              "2. 所有文本必须使用简体中文。",
              "3. targetLayer 只能是：foundation、power、society、culture、history、conflict。",
              "4. 不要生成“世界名称”“世界简介”“整体风格”这类过于宽泛或无实际选择价值的伪选项。",
              "",
              "属性设计要求：",
              "1. 每个 option 都必须是具体、可选择、会影响后续世界搭建方向的关键属性。",
              "2. name 必须简洁明确，让用户一眼知道自己在决定什么。",
              "3. description 必须说明：这个属性具体控制世界的哪一部分，以及为什么值得在生成前优先确定。",
              "4. reason 必须一句话点明它为何属于优先决策项，不能和 description 同义重复。",
              "",
              "生成原则：",
              "1. 这些选项应延续“先选属性、再补细节”的思路，优先抓真正影响世界成型方向的分歧点。",
              "2. 属性之间尽量独立，但组合后应能自然拼成一套连贯世界。",
              "3. 优先考虑基础层、力量层、社会层、文化层、历史层、冲突层，不要全部堆在一个层面。",
              "4. 可以参考经典网文世界搭建逻辑，但不要落入陈词滥调，要保留辨识度。",
              "5. 必须结合世界类型、模板说明、概念摘要、核心意象、关键词、基调和用户原始灵感综合判断。",
              "",
              "质量要求：",
              "1. 每个属性都应让用户看完后能自然做选择，而不是还要再解释一遍。",
              "2. 不要输出空泛大词，例如“世界复杂度”“设定深度”“故事张力”。",
              "3. 输出结果应直接服务下一步世界生成，而不是停留在灵感讨论层。",
              input.retryStrict
                ? "4. 本次必须严格返回 JSON；如果不确定，也要先给出结构化 options，不得省略。"
                : "",
            ].filter(Boolean).join("\n")
      ),
      new HumanMessage(
        isReferenceMode
          ? [
              `参考方式：${buildReferenceModeLabel(input.referenceMode)}`,
              input.referenceAnchors && input.referenceAnchors.length > 0
                ? `原作世界锚点：\n${input.referenceAnchors.map((item) => `- ${item.label}：${item.content}`).join("\n")}`
                : "",
              input.preserveElements && input.preserveElements.length > 0
                ? `必须保留：${input.preserveElements.join("、")}`
                : "",
              input.allowedChanges && input.allowedChanges.length > 0
                ? `允许改造：${input.allowedChanges.join("、")}`
                : "",
              input.forbiddenElements && input.forbiddenElements.length > 0
                ? `禁止偏离：${input.forbiddenElements.join("、")}`
                : "",
              `请生成 ${input.optionsCount} 个“架空改造前必须先决定”的关键世界决策项。`,
              "补充要求：",
              "1. 每个决策项都必须是世界层或世界-故事接口层的改造轴。",
              "2. 每个决策项都必须给出 2-4 个互斥分支 choices，让用户能真正做路线选择。",
              "3. choices 之间必须体现不同架空方向，而不是描述角度变化。",
              "4. 不要偏离原作世界基底去重新发明无关新世界。",
            ].filter(Boolean).join("\n")
          : [
              `世界类型：${input.worldType}`,
              `模板：${input.templateName}`,
              `模板说明：${input.templateDescription}`,
              input.classicElements.length > 0 ? `可参考的经典元素：${input.classicElements.join("、")}` : "",
              input.pitfalls.length > 0 ? `需要避开的常见坑点：${input.pitfalls.join("、")}` : "",
              `世界概念摘要：${input.conceptSummary}`,
              input.coreImagery.length > 0 ? `核心意象：${input.coreImagery.join("、")}` : "",
              input.keywords.length > 0 ? `关键词：${input.keywords.join("、")}` : "",
              input.tone.trim() ? `整体基调：${input.tone.trim()}` : "",
              input.sourcePrompt.trim() ? `用户原始灵感：${input.sourcePrompt.trim()}` : "",
              input.ragContext?.trim() ? `可参考素材：${input.ragContext.trim()}` : "",
              `请生成 ${input.optionsCount} 个“适合在正式生成世界前先做决定”的关键世界属性选项。`,
              "补充要求：",
              "1. 优先覆盖真正重要的世界分歧点，而不是宽泛项。",
              "2. 属性之间尽量分布到不同层级，组合后能形成完整世界。",
              "3. 每个属性都要让用户一眼明白自己在决定什么。",
            ].filter(Boolean).join("\n")
      ),
    ];
  },
};

export const worldLayerGenerationPrompt: PromptAsset<
  WorldLayerGenerationPromptInput,
  z.infer<typeof worldLooseObjectSchema>
> = {
  id: "world.layer.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldLooseObjectSchema,
  render: (input) => [
    new SystemMessage(
      [
        `你是世界观分层构建器，当前只负责生成 layer=${input.layerKey} 对应字段。`,
        "你的任务不是重写整套世界观，而是在既有世界基础上，为当前层补出可直接用于小说创作的结构化设定。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        `输出字段只能来自：${input.targetFields.join(", ")}。`,
        "不得新增字段，不得输出目标字段之外的任何键。",
        "每个字段的值必须是可直接展示给作者阅读的简体中文文本字符串。",
        "禁止把字段值写成 JSON 对象、数组、嵌套结构、键值表或代码式结构。",
        "如果某层天然包含多个条目，请在同一个字符串内用自然语言分段或换行表达，不要输出嵌套对象。",
        "",
        "全局硬规则：",
        "1. 必须严格遵守：世界公理、模板约束、用户前置蓝图选择、既有已生成内容。",
        "2. 只能在现有基础上做补全与细化，不得推翻前面层已成立的设定。",
        "3. 若输入信息不足，必须做保守补全，优先给出低风险、可成立的设定，不要胡乱发散。",
        "4. 所有字段值必须使用简体中文。",
        "5. 输出必须是可直接落入世界设定库的结果，而不是分析说明或摘要。",
        "",
        "生成原则：",
        "1. 当前层必须与前面层形成因果关系、结构关联或运行关联，不能写成孤立描述。",
        "2. 每个字段都应回答“这个世界具体是怎么运作的”，而不是只写概念标签。",
        "3. 优先生成对后续剧情、人物、冲突、资源流动、秩序运转真正有作用的设定。",
        "4. 不要写空泛表达，如“社会复杂”“文化多元”“势力纷争”。必须具体说明复杂在哪里、多元在哪里、如何纷争。",
        "",
        "一致性要求：",
        "1. 不得与 existing 中已有内容冲突。",
        "2. 若某项设定必须承接 blueprint 或 summary 中的方向，必须明确体现承接关系。",
        "3. 若 classicElements 可参考，应吸收其有效结构，但不能机械复读模板说明。",
        "4. 若 pitfalls 已指出常见坑点，必须主动避开这些问题，不要把风险直接写进设定。",
        "",
        "质量要求：",
        "1. 每个字段都要具体、清楚、可用于写作，不要停留在百科式空描述。",
        "2. 设定应体现世界的运行逻辑、约束边界和叙事价值。",
        "3. 如果当前层天然依赖上层设定，必须显式体现这种依赖，而不是另起炉灶。",
        "",
        "边界规则：",
        "1. 不要输出总结段、前言、后记或解释说明。",
        "2. 不要补写 targetFields 之外的附加设定。",
        "3. 不要因为信息不足而留空字段；应尽量给出稳妥可用的内容。",
      ].join("\n")
    ),
    new HumanMessage(
      [
        `name=${input.worldName}`,
        `worldType=${input.worldType}`,
        `template=${input.templateName}`,
        `templateDescription=${input.templateDescription}`,
        `classicElements=${input.classicElements.join(" | ") || "none"}`,
        `pitfalls=${input.pitfalls.join(" | ") || "none"}`,
        `axioms=${input.axioms || "none"}`,
        `summary=${input.summary || "none"}`,
        "blueprint=",
        input.blueprintPromptBlock,
        `existing=${input.existingJson}`,
        `ragContext=${input.ragContext || "none"}`,
        "",
        `请只生成当前 layer=${input.layerKey} 所需字段，并确保字段仅来自：${input.targetFields.join(", ")}。`,
      ].join("\n")
    ),
  ],
  postValidate: (output, input) =>
    sanitizeLooseWorldObject(
      output,
      input.targetFields,
      `world.layer.generate(${input.layerKey})`,
    ),
};

export const worldLayerLocalizationPrompt: PromptAsset<
  WorldLayerLocalizationPromptInput,
  z.infer<typeof worldLooseObjectSchema>
> = {
  id: "world.layer.localize",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldLooseObjectSchema,
  render: (input) => [
    new SystemMessage(
      [
        "你是世界观设定文本本地化助手。",
        "你的任务是将输入 JSON 对象中所有“展示给用户看的字段值”改写为自然、准确、可直接使用的简体中文。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        "结构硬规则：",
        "1. 必须保持字段名完全不变。",
        "2. 不得新增字段、删除字段或调整层级结构。",
        `3. 输出字段只能来自当前层允许字段：${input.layerFields.join(", ")}。`,
        "",
        "内容规则：",
        "1. 必须保留原设定语义，不得改变世界规则、结构关系、因果逻辑或设定边界。",
        "2. 必须保留专有名词含义；若原专有名词已有合理中文形式，应优先使用自然中文表达。",
        "3. 不得补写新设定，不得删减已有有效信息。",
        "4. 不得把模糊表述擅自具体化为新的世界事实。",
        "",
        "本地化要求：",
        "1. 所有字段值都必须改写为简体中文。",
        "2. 不是机械翻译，而是要转写成符合中文小说世界设定语境的自然表达。",
        "3. 若原文存在英文思维、生硬直译、重复或不通顺表达，应在不改变原意前提下优化。",
        "4. 数组中的每一项也必须本地化，但要保持原有数量与对应关系不变。",
        "",
        "质量要求：",
        "1. 输出结果必须像可直接进入世界设定库的中文成稿，而不是翻译稿。",
        "2. 各字段值之间必须保持一致，不得出现术语前后不统一。",
        "3. 不要输出空泛润色，优先保证准确、稳定、可复用。",
        "",
        "边界规则：",
        "1. 如果输入中某些值本来已经是自然中文，可保留或仅做轻微润色，不要为了改而改。",
        "2. 如果某些 ID、代码式字段值属于结构标识而非展示文本，不要误翻。",
      ].join("\n")
    ),
    new HumanMessage(
      [
        `layer=${input.layerKey}`,
        `fields=${input.layerFields.join(",")}`,
        `input=${input.sourcePayloadJson}`,
      ].join("\n")
    ),
  ],
  postValidate: (output, input) =>
    sanitizeLooseWorldObject(
      output,
      input.layerFields,
      `world.layer.localize(${input.layerKey})`,
    ),
};

export const worldAxiomSuggestionPrompt: PromptAsset<
  WorldAxiomSuggestionPromptInput,
  z.infer<typeof worldAxiomSuggestionSchema>
> = {
  id: "world.axioms.suggest",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldAxiomSuggestionSchema,
  render: (input) => [
    new SystemMessage([
      "你是世界公理设计器。",
      "你的任务是为当前世界生成 5 条“核心公理”，作为后续世界构建、设定补全和剧情展开的最高约束层。",
      "",
      "只输出一个合法 JSON 数组，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "数组元素必须全部是字符串，且全部使用简体中文。",
      "必须精确输出 5 条，不能多也不能少。",
      "",
      "全局硬规则：",
      "1. 每条公理都必须是“能约束后续生成”的硬规则，而不是口号、主题句或世界简介。",
      "2. 公理必须能直接影响后续世界搭建，例如限制代价、规定秩序、定义冲突来源、划定边界条件、明确默认后果。",
      "3. 只能基于输入中的世界类型、模板说明、世界摘要和蓝图约束来生成，不得脱离这些信息另起一套世界。",
      "4. 如果信息不足，优先生成低风险、通用但有约束力的公理，不要空泛发散。",
      "",
      "公理设计要求：",
      "1. 至少应覆盖以下关键约束中的大部分：代价、秩序、冲突来源、边界条件、默认后果、资源约束、权力限制、公开与隐秘规则。",
      "2. 每条公理都应回答“这个世界默认怎么运作，违反后会怎样，哪些事不能无代价发生”。",
      "3. 公理必须具体，例如可以约束力量使用、身份流动、资源获取、组织秩序、信息传播、社会压迫、越界代价等。",
      "4. 不要写成‘世界很残酷’‘人心复杂’‘强者为尊’这类空泛判断，除非它被具体化为可执行约束。",
      "5. 5 条公理之间尽量分工明确，不要换说法重复同一个意思。",
      "",
      "表达要求：",
      "1. 每条公理尽量写成一句完整、清楚、可直接引用的约束句。",
      "2. 不要写得太长，但必须足够具体，能拿去约束后续世界生成。",
      "3. 语言要像世界设定中的底层规则，而不是宣传文案或文学抒情。",
      "",
      "质量要求：",
      "1. 看完这 5 条，应该能大致理解这个世界的运行底线。",
      "2. 这些公理要能帮助后续自动生成避免跑偏、避免设定失真、避免无代价乱开。",
      "3. 不要生成互相冲突的公理。",
    ].join("\n")),
    new HumanMessage([
      `世界名=${input.worldName}`,
      `世界类型=${input.worldType}`,
      `模板=${input.templateName}`,
      `模板说明=${input.templateDescription}`,
      `世界摘要=${input.description}`,
      "蓝图约束：",
      input.blueprintPromptBlock,
    ].join("\n")),
  ],
};
