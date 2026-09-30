import type { WorldStructuredData } from "@novelfoundry/shared/types/world";
import { parseWorldGenerationBlueprint } from "@novelfoundry/shared/types/worldWizard";
import {
  buildStructuredRulesFromAxiomTexts,
  seedFaction,
  seedForce,
  seedLocation,
  formatRuleText,
} from "../domain/entities";
import { dedupeByName } from "../domain/fieldNormalization";
import { normalizeWorldStructuredData } from "../domain/normalizeStructure";
import type { WorldStructureSource } from "../infrastructure/legacySourceAdapter";
import { buildWorldStructureFromLegacySource } from "../infrastructure/legacySourceAdapter";

export function buildWorldStructureSeedFromSource(source: WorldStructureSource): WorldStructuredData {
  const seeded = buildWorldStructureFromLegacySource(source);
  const blueprint = parseWorldGenerationBlueprint(source.selectedElements);
  const themes = new Set(seeded.profile.themes);
  const factions = [...seeded.factions];
  const forces = [...seeded.forces];
  const locations = [...seeded.locations];
  const rules = [...seeded.rules.axioms];

  for (const element of blueprint.classicElements) {
    if (element.trim()) {
      themes.add(element.trim());
    }
  }

  for (const selection of blueprint.propertySelections) {
    const detail = selection.detail?.trim() || selection.description.trim();
    const category = (selection.sourceCategory ?? "").trim().toLowerCase();
    if (category === "terrain" || selection.targetLayer === "foundation") {
      locations.push(seedLocation(selection.name, detail, category === "terrain" ? "terrain" : ""));
      continue;
    }
    if (category === "organization") {
      factions.push(seedFaction(selection.name, detail));
      forces.push(seedForce(selection.name, detail, "organization"));
      continue;
    }
    if (selection.targetLayer === "society") {
      factions.push(seedFaction(selection.name, detail));
      forces.push(seedForce(selection.name, detail));
      continue;
    }
    themes.add(selection.name);
  }

  const selectedRuleIds = new Set(blueprint.referenceContext?.selectedSeedIds?.ruleIds ?? []);
  const selectedFactionIds = new Set(blueprint.referenceContext?.selectedSeedIds?.factionIds ?? []);
  const selectedForceIds = new Set(blueprint.referenceContext?.selectedSeedIds?.forceIds ?? []);
  const selectedLocationIds = new Set(blueprint.referenceContext?.selectedSeedIds?.locationIds ?? []);
  const referenceSeeds = blueprint.referenceContext?.referenceSeeds;

  if (referenceSeeds) {
    for (const rule of referenceSeeds.rules) {
      if (selectedRuleIds.has(rule.id)) {
        rules.push(rule);
      }
    }

    for (const faction of referenceSeeds.factions) {
      if (selectedFactionIds.has(faction.id)) {
        factions.push({
          ...faction,
          representativeForceIds: faction.representativeForceIds.filter((id) => selectedForceIds.has(id)),
        });
      }
    }

    for (const force of referenceSeeds.forces) {
      if (selectedForceIds.has(force.id)) {
        forces.push({
          ...force,
          factionId: force.factionId && selectedFactionIds.has(force.factionId) ? force.factionId : null,
        });
      }
    }

    for (const location of referenceSeeds.locations) {
      if (selectedLocationIds.has(location.id)) {
        locations.push({
          ...location,
          controllingForceIds: location.controllingForceIds.filter((id) => selectedForceIds.has(id)),
        });
      }
    }
  }

  return normalizeWorldStructuredData(
    {
      ...seeded,
      profile: {
        ...seeded.profile,
        themes: Array.from(themes).slice(0, 8),
      },
      rules: {
        ...seeded.rules,
        axioms: buildStructuredRulesFromAxiomTexts(rules.map(formatRuleText)),
      },
      factions: dedupeByName(factions),
      forces: dedupeByName(forces),
      locations: dedupeByName(locations),
      metadata: {
        ...seeded.metadata,
        seededFrom:
          blueprint.propertySelections.length > 0
          || blueprint.classicElements.length > 0
          || selectedRuleIds.size > 0
          || selectedFactionIds.size > 0
          || selectedForceIds.size > 0
          || selectedLocationIds.size > 0
          ? "wizard-blueprint"
          : seeded.metadata.seededFrom,
      },
    },
    seeded,
  );
}
