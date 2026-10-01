import type { CharacterCastOption, CharacterCastQualityAssessment, CharacterCastRole } from "@novelfoundry/shared/types/novel";

import { parseCharacterProhibitionsJson } from "../../../characters/characterHardFacts";

import { assessCharacterCastBatch } from "../../characterCastQuality";

export function serializeCharacterCastOption(row: {
  id: string;
  novelId: string;
  title: string;
  summary: string;
  whyItWorks: string | null;
  recommendedReason: string | null;
  status: string;
  sourceStoryInput: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    id: string;
    optionId: string;
    sortOrder: number;
    name: string;
    role: string;
    gender: string;
    castRole: string;
    importanceTier: string;
    relationToProtagonist: string | null;
    storyFunction: string;
    shortDescription: string | null;
    personality: string | null;
    background: string | null;
    development: string | null;
    identityLabel: string | null;
    factionLabel: string | null;
    stanceLabel: string | null;
    powerLevel: string | null;
    realm: string | null;
    currentLocation: string | null;
    availability: string | null;
    prohibitionsJson: string;
    outerGoal: string | null;
    innerNeed: string | null;
    fear: string | null;
    wound: string | null;
    misbelief: string | null;
    secret: string | null;
    moralLine: string | null;
    firstImpression: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  relations: Array<{
    id: string;
    optionId: string;
    sortOrder: number;
    sourceName: string;
    targetName: string;
    surfaceRelation: string;
    hiddenTension: string | null;
    conflictSource: string | null;
    secretAsymmetry: string | null;
    dynamicLabel: string | null;
    nextTurnPoint: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): CharacterCastOption {
  return {
    id: row.id,
    novelId: row.novelId,
    title: row.title,
    summary: row.summary,
    whyItWorks: row.whyItWorks,
    recommendedReason: row.recommendedReason,
    status: row.status,
    sourceStoryInput: row.sourceStoryInput,
    members: row.members.map((member) => ({
      id: member.id,
      optionId: member.optionId,
      sortOrder: member.sortOrder,
      name: member.name,
      role: member.role,
      gender: member.gender as CharacterCastOption["members"][number]["gender"],
      castRole: member.castRole as CharacterCastRole,
      importanceTier: member.importanceTier as CharacterCastOption["members"][number]["importanceTier"],
      relationToProtagonist: member.relationToProtagonist,
      storyFunction: member.storyFunction,
      shortDescription: member.shortDescription,
      personality: member.personality,
      background: member.background,
      development: member.development,
      identityLabel: member.identityLabel,
      factionLabel: member.factionLabel,
      stanceLabel: member.stanceLabel,
      powerLevel: member.powerLevel,
      realm: member.realm,
      currentLocation: member.currentLocation,
      availability: member.availability,
      prohibitions: parseCharacterProhibitionsJson(member.prohibitionsJson),
      prohibitionsJson: member.prohibitionsJson,
      outerGoal: member.outerGoal,
      innerNeed: member.innerNeed,
      fear: member.fear,
      wound: member.wound,
      misbelief: member.misbelief,
      secret: member.secret,
      moralLine: member.moralLine,
      firstImpression: member.firstImpression,
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
    })),
    relations: row.relations.map((relation) => ({
      id: relation.id,
      optionId: relation.optionId,
      sortOrder: relation.sortOrder,
      sourceName: relation.sourceName,
      targetName: relation.targetName,
      surfaceRelation: relation.surfaceRelation,
      hiddenTension: relation.hiddenTension,
      conflictSource: relation.conflictSource,
      secretAsymmetry: relation.secretAsymmetry,
      dynamicLabel: relation.dynamicLabel,
      nextTurnPoint: relation.nextTurnPoint,
      createdAt: relation.createdAt.toISOString(),
      updatedAt: relation.updatedAt.toISOString(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildCastOptionQualityAssessment(option: CharacterCastOption): CharacterCastQualityAssessment {
  const assessment = assessCharacterCastBatch([option], option.sourceStoryInput ?? "");
  const optionAssessment = assessment.options[0];
  return {
    autoApplicable: optionAssessment?.autoApplicable ?? true,
    blockingReasons: assessment.blockingReasons,
    issues: optionAssessment?.issues ?? [],
  };
}

export function serializeCharacterCastOptionWithQuality(
  row: Parameters<typeof serializeCharacterCastOption>[0],
): CharacterCastOption {
  const option = serializeCharacterCastOption(row);
  return {
    ...option,
    qualityAssessment: buildCastOptionQualityAssessment(option),
  };
}
