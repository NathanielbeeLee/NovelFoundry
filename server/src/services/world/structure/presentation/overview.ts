import type { WorldBindingSupport, WorldStructuredData, WorldRule } from "@novelfoundry/shared/types/world";

function formatRuleText(rule: WorldRule): string {
  const parts = [
    rule.summary,
    rule.cost && `代价：${rule.cost}`,
    rule.boundary && `边界：${rule.boundary}`,
    rule.enforcement && `约束：${rule.enforcement}`,
  ].filter(Boolean);
  return `${rule.name}${parts.length > 0 ? `：${parts.join("；")}` : ""}`;
}

function formatFactions(structure: WorldStructuredData): string {
  const forceNameById = new Map(structure.forces.map((item) => [item.id, item.name]));
  return [
    ...structure.factions.map((item) =>
      [
        item.name,
        item.position && `立场：${item.position}`,
        item.doctrine && `主张：${item.doctrine}`,
        item.goals.length > 0 && `目标：${item.goals.join("、")}`,
        item.methods.length > 0 && `手段：${item.methods.join("、")}`,
        item.representativeForceIds.length > 0
          && `代表势力：${item.representativeForceIds.map((id) => forceNameById.get(id) ?? id).join("、")}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    ...structure.forces.map((item) =>
      [
        item.name,
        item.type && `类型：${item.type}`,
        item.summary && `概述：${item.summary}`,
        item.leader && `核心人物：${item.leader}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
  ].filter(Boolean).join("\n");
}

function formatPolitics(structure: WorldStructuredData): string {
  const forceNameById = new Map(structure.forces.map((item) => [item.id, item.name]));
  return [
    ...structure.factions.map((item) =>
      [
        item.name,
        item.position && `立场：${item.position}`,
        item.goals.length > 0 && `目标：${item.goals.join("、")}`,
        item.methods.length > 0 && `手段：${item.methods.join("、")}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    ...structure.forces.map((item) =>
      [
        item.name,
        item.currentObjective && `当前目标：${item.currentObjective}`,
        item.pressure && `施压方式：${item.pressure}`,
        item.baseOfPower && `权力基础：${item.baseOfPower}`,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
    ...structure.relations.forceRelations.map((item) =>
      [
        forceNameById.get(item.sourceForceId) ?? item.sourceForceId,
        item.relation,
        forceNameById.get(item.targetForceId) ?? item.targetForceId,
        item.detail,
      ]
        .filter(Boolean)
        .join(" | "),
    ),
  ].filter(Boolean).join("\n");
}

function formatGeography(structure: WorldStructuredData): string {
  return structure.locations
    .map((item) =>
      [
        item.name,
        item.terrain && `地形：${item.terrain}`,
        item.summary && `概述：${item.summary}`,
        item.narrativeFunction && `叙事功能：${item.narrativeFunction}`,
        item.risk && `风险：${item.risk}`,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .filter(Boolean)
    .join("\n");
}

export function buildWorldStructureOverview(
  structure: WorldStructuredData,
  bindingSupport: WorldBindingSupport,
) {
  return {
    summary:
      structure.profile.summary
      || [structure.profile.identity, structure.profile.coreConflict].filter(Boolean).join(" | ")
      || "World summary is not available yet.",
    sections: [
      {
        key: "profile",
        title: "世界概要",
        content: [
          structure.profile.identity && `世界身份：${structure.profile.identity}`,
          structure.profile.tone && `整体调性：${structure.profile.tone}`,
          structure.profile.summary && `摘要：${structure.profile.summary}`,
          structure.profile.coreConflict && `核心冲突：${structure.profile.coreConflict}`,
          structure.profile.themes.length > 0 && `主题：${structure.profile.themes.join("、")}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        key: "rules",
        title: "规则中心",
        content: [
          structure.rules.summary,
          ...structure.rules.axioms.map(formatRuleText),
          ...structure.rules.taboo.map((item) => `禁忌：${item}`),
          ...structure.rules.sharedConsequences.map((item) => `共通后果：${item}`),
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        key: "factions",
        title: "阵营与势力",
        content: [formatFactions(structure), formatPolitics(structure)]
          .filter(Boolean)
          .join("\n\n"),
      },
      { key: "locations", title: "地点与地形", content: formatGeography(structure) },
      {
        key: "relations",
        title: "关系网络",
        content: [
          ...structure.relations.forceRelations.map((item) =>
            [item.sourceForceId, item.relation, item.targetForceId, item.tension, item.detail]
              .filter(Boolean)
              .join(" | "),
          ),
          ...structure.relations.locationControls.map((item) =>
            [item.forceId, item.relation, item.locationId, item.detail].filter(Boolean).join(" | "),
          ),
          ...bindingSupport.compatibleConflicts.map((item) => `可兼容冲突：${item}`),
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ].filter((section) => section.content.trim()),
  };
}
