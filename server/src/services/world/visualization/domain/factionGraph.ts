import { type FactionNodeType } from "./contracts";

import { normalizeAliasKey, normalizeNodeLabel, makeId } from "./textNormalization";

export const MAX_FACTION_NODES = 12;

export const MAX_FACTION_EDGES = 18;

export const FACTION_TYPE_ALIASES: Record<string, FactionNodeType> = {
  state: "state",
  country: "state",
  kingdom: "state",
  empire: "state",
  republic: "state",
  federation: "state",
  government: "state",
  "国家": "state",
  "政权": "state",
  "政府": "state",
  faction: "faction",
  force: "faction",
  camp: "faction",
  "势力": "faction",
  "阵营": "faction",
  race: "race",
  tribe: "race",
  species: "race",
  "种族": "race",
  "族群": "race",
  "民族": "race",
  organization: "organization",
  org: "organization",
  army: "organization",
  party: "organization",
  group: "organization",
  guild: "organization",
  "组织": "organization",
  "公司": "organization",
  "企业": "organization",
  "部门": "organization",
  "机构": "organization",
  "社群": "organization",
  "圈层": "organization",
  "家庭共同体": "organization",
  "社区组织": "organization",
  "中介机构": "organization",
  "机关": "organization",
  "军队": "organization",
  "部队": "organization",
  "军团": "organization",
  "地下组织": "organization",
  other: "other",
  "其他": "other",
};

export const EDGE_RELATION_LABELS = [
  "同盟",
  "合作",
  "支援",
  "对抗",
  "敌对",
  "统属",
  "压制",
  "贸易",
  "竞争",
  "中立",
  "关联",
] as const;

export function inferFactionNodeType(label: string): FactionNodeType {
  const normalized = normalizeAliasKey(label);
  const alias = FACTION_TYPE_ALIASES[normalized];
  if (alias) {
    return alias;
  }
  if (/(国家|政府|政权|王朝|王国|帝国|联邦|共和国|朝廷|官府|军阀)/.test(label)) {
    return "state";
  }
  if (/(公司|集团|企业|部门|机构|中介|物业|学校|医院|机关|家庭联盟|共同体|社群|圈|圈层|军|军队|部队|军团|旅|团|司令部|地下党|组织|协会|会|盟|帮|派|社|教团)/.test(label)) {
    return "organization";
  }
  if (/(族|族群|民族|裔)/.test(label)) {
    return "race";
  }
  if (/(势力|阵营|集团|同盟|联盟)/.test(label)) {
    return "faction";
  }
  if (/(state|kingdom|empire|republic|federation|government)/i.test(label)) {
    return "state";
  }
  if (/(army|organization|guild|party|group)/i.test(label)) {
    return "organization";
  }
  if (/(race|tribe|clan)/i.test(label)) {
    return "race";
  }
  return "faction";
}

export function normalizeNodeType(raw: unknown, label: string): FactionNodeType {
  if (typeof raw === "string") {
    const alias = FACTION_TYPE_ALIASES[normalizeAliasKey(raw)];
    if (alias) {
      return alias;
    }
    if (/(公司|企业|部门|机构|社群|圈层|家庭共同体|社区组织|中介机构|机关|生活社群|兴趣联盟|地缘势力)/.test(raw)) {
      return "organization";
    }
    if (/(临时联盟|人物|角色|情感|关系线)/.test(raw)) {
      return "other";
    }
  }
  return inferFactionNodeType(label);
}

export function normalizeEdgeRelation(raw: unknown, sentence?: string): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value) {
    if (EDGE_RELATION_LABELS.includes(value as (typeof EDGE_RELATION_LABELS)[number])) {
      return value;
    }
    const normalized = normalizeAliasKey(value);
    if (/(alliance|ally|同盟|联合|联手)/.test(normalized)) {
      return "同盟";
    }
    if (/(cooperate|合作|协作|配合)/.test(normalized)) {
      return "合作";
    }
    if (/(support|援助|支援)/.test(normalized)) {
      return "支援";
    }
    if (/(conflict|对抗|敌对|交战|围剿|镇压)/.test(normalized)) {
      return "对抗";
    }
    if (/(trade|交易|贸易)/.test(normalized)) {
      return "贸易";
    }
    if (/(subordinate|统属|隶属|管辖|控制)/.test(normalized)) {
      return "统属";
    }
    if (/(rival|竞争|争夺)/.test(normalized)) {
      return "竞争";
    }
  }
  if (!sentence) {
    return "关联";
  }
  if (/同盟|联合|联手|结盟/.test(sentence)) {
    return "同盟";
  }
  if (/合作|协作|配合|联合抗敌|共同/.test(sentence)) {
    return "合作";
  }
  if (/支援|援助|接应|策应/.test(sentence)) {
    return "支援";
  }
  if (/敌对|对抗|冲突|围剿|镇压|交战|打击|进攻|压迫/.test(sentence)) {
    return "对抗";
  }
  if (/隶属|统辖|控制|管辖|附属/.test(sentence)) {
    return "统属";
  }
  if (/贸易|交易|输送|通商/.test(sentence)) {
    return "贸易";
  }
  if (/竞争|争夺|角力/.test(sentence)) {
    return "竞争";
  }
  return "关联";
}

export function normalizeGraphNodes(
  nodes: Array<{ id?: string; label?: string; type?: string }>,
  prefix: string,
): Array<{ id: string; label: string; type: string }> {
  const seenLabels = new Set<string>();
  const result: Array<{ id: string; label: string; type: string }> = [];
  for (const node of nodes) {
    const label = normalizeNodeLabel(node.label);
    if (!label || seenLabels.has(label)) {
      continue;
    }
    seenLabels.add(label);
    result.push({
      id: node.id?.trim() || makeId(prefix, result.length),
      label,
      type: normalizeNodeType(node.type, label),
    });
  }
  return result;
}

export function normalizeGraphEdges(
  edges: Array<{ source?: string; target?: string; relation?: string }>,
  nodes: Array<{ id: string; label: string }>,
  fallbackEdges: Array<{ source: string; target: string; relation: string }>,
): Array<{ source: string; target: string; relation: string }> {
  const idMap = new Map(nodes.map((node) => [node.id, node.id]));
  const labelMap = new Map(nodes.map((node) => [node.label, node.id]));
  const seen = new Set<string>();
  const result: Array<{ source: string; target: string; relation: string }> = [];

  for (const edge of edges) {
    const sourceKey = typeof edge.source === "string" ? edge.source.trim() : "";
    const targetKey = typeof edge.target === "string" ? edge.target.trim() : "";
    const source = idMap.get(sourceKey) ?? labelMap.get(sourceKey);
    const target = idMap.get(targetKey) ?? labelMap.get(targetKey);
    if (!source || !target || source === target) {
      continue;
    }
    const pairKey = [source, target].sort().join("|");
    if (seen.has(pairKey)) {
      continue;
    }
    seen.add(pairKey);
    result.push({
      source,
      target,
      relation: normalizeEdgeRelation(edge.relation),
    });
  }

  if (result.length > 0) {
    return result.slice(0, MAX_FACTION_EDGES);
  }
  return fallbackEdges.slice(0, MAX_FACTION_EDGES);
}
