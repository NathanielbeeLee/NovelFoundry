export {
  WORLD_STRUCTURE_SCHEMA_VERSION,
  createEmptyWorldProfile,
  createEmptyWorldRules,
  createEmptyWorldRelations,
  createEmptyWorldStructure,
  createEmptyWorldBindingSupport,
} from "./domain/emptyStructure";
export { buildStructuredRulesFromAxiomTexts } from "./domain/entities";
export { normalizeWorldStructuredData } from "./domain/normalizeStructure";
export { normalizeWorldBindingSupport, buildWorldBindingSupport } from "./domain/bindingSupport";
export { buildWorldStructureFromLegacySource } from "./infrastructure/legacySourceAdapter";
export type { WorldStructureSource } from "./infrastructure/legacySourceAdapter";
export { parseWorldStructurePayload } from "./infrastructure/payloadCodec";
export { applyStructuredWorldToLegacyFields } from "./infrastructure/legacyFieldProjection";
export { buildWorldStructureSeedFromSource } from "./application/seedWorldStructure";
export { buildWorldStructureOverview } from "./presentation/overview";
