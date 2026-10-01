import { NovelCoreService } from "../../NovelCoreService";
import { CharacterPreparationService } from "../../characterPrep/CharacterPreparationService";
import { CharacterDynamicsService } from "../../dynamics/CharacterDynamicsService";
import { CharacterVisibleProfileService } from "../../characterProfile/CharacterVisibleProfileService";
import { CharacterMindService } from "../../characterMind/CharacterMindService";
import { CharacterInfluenceService } from "../../characterInfluence/CharacterInfluenceService";
import { CharacterDialogueService } from "../../characterDialogue/CharacterDialogueService";
import { NovelApplicationContext } from "./NovelApplicationContext";

export class NovelCharacterApplication extends NovelApplicationContext {
  listCharacters(...args: Parameters<NovelCoreService["listCharacters"]>) {
    return this.core.listCharacters(...args);
  }

  async createCharacter(...args: Parameters<NovelCoreService["createCharacter"]>) {
    const [novelId] = args;
    const created = await this.core.createCharacter(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
    return created;
  }

  async updateCharacter(...args: Parameters<NovelCoreService["updateCharacter"]>) {
    const [novelId] = args;
    const updated = await this.core.updateCharacter(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
    return updated;
  }

  async deleteCharacter(...args: Parameters<NovelCoreService["deleteCharacter"]>) {
    const [novelId] = args;
    await this.core.deleteCharacter(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
  }

  listCharacterTimeline(...args: Parameters<NovelCoreService["listCharacterTimeline"]>) {
    return this.core.listCharacterTimeline(...args);
  }

  syncCharacterTimeline(...args: Parameters<NovelCoreService["syncCharacterTimeline"]>) {
    return this.core.syncCharacterTimeline(...args);
  }

  syncAllCharacterTimeline(...args: Parameters<NovelCoreService["syncAllCharacterTimeline"]>) {
    return this.core.syncAllCharacterTimeline(...args);
  }

  evolveCharacter(...args: Parameters<NovelCoreService["evolveCharacter"]>) {
    return this.core.evolveCharacter(...args);
  }

  checkCharacterAgainstWorld(...args: Parameters<NovelCoreService["checkCharacterAgainstWorld"]>) {
    return this.core.checkCharacterAgainstWorld(...args);
  }

  listCharacterRelations(...args: Parameters<CharacterPreparationService["listCharacterRelations"]>) {
    return this.characterPreparationService.listCharacterRelations(...args);
  }

  listCharacterCastOptions(...args: Parameters<CharacterPreparationService["listCharacterCastOptions"]>) {
    return this.characterPreparationService.listCharacterCastOptions(...args);
  }

  generateCharacterCastOptions(...args: Parameters<CharacterPreparationService["generateCharacterCastOptions"]>) {
    return this.characterPreparationService.generateCharacterCastOptions(...args);
  }

  applyCharacterCastOption(...args: Parameters<CharacterPreparationService["applyCharacterCastOption"]>) {
    return this.characterPreparationService.applyCharacterCastOption(...args);
  }

  runDeferredCharacterEnhancements(...args: Parameters<CharacterPreparationService["runDeferredEnhancements"]>) {
    return this.characterPreparationService.runDeferredEnhancements(...args);
  }

  generateSupplementalCharacters(...args: Parameters<CharacterPreparationService["generateSupplementalCharacters"]>) {
    return this.characterPreparationService.generateSupplementalCharacters(...args);
  }

  applySupplementalCharacter(...args: Parameters<CharacterPreparationService["applySupplementalCharacter"]>) {
    return this.characterPreparationService.applySupplementalCharacter(...args);
  }

  deleteCharacterCastOption(...args: Parameters<CharacterPreparationService["deleteCharacterCastOption"]>) {
    return this.characterPreparationService.deleteCharacterCastOption(...args);
  }

  clearCharacterCastOptions(...args: Parameters<CharacterPreparationService["clearCharacterCastOptions"]>) {
    return this.characterPreparationService.clearCharacterCastOptions(...args);
  }

  generateCharacterVisibleProfile(...args: Parameters<CharacterVisibleProfileService["generateCharacterVisibleProfile"]>) {
    return this.characterVisibleProfileService.generateCharacterVisibleProfile(...args);
  }

  generateBatchCharacterVisibleProfiles(...args: Parameters<CharacterVisibleProfileService["generateBatchVisibleProfiles"]>) {
    return this.characterVisibleProfileService.generateBatchVisibleProfiles(...args);
  }

  async applyCharacterVisibleProfile(...args: Parameters<CharacterVisibleProfileService["applyCharacterVisibleProfile"]>) {
    const [novelId] = args;
    const result = await this.characterVisibleProfileService.applyCharacterVisibleProfile(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
    return result;
  }

  async applyBatchCharacterVisibleProfiles(...args: Parameters<CharacterVisibleProfileService["applyBatchVisibleProfiles"]>) {
    const [novelId] = args;
    const result = await this.characterVisibleProfileService.applyBatchVisibleProfiles(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
    return result;
  }

  getCharacterDynamicsOverview(...args: Parameters<CharacterDynamicsService["getOverview"]>) {
    return this.characterDynamicsService.getOverview(...args);
  }

  listCharacterCandidates(...args: Parameters<CharacterDynamicsService["listCandidates"]>) {
    return this.characterDynamicsService.listCandidates(...args);
  }

  confirmCharacterCandidate(...args: Parameters<CharacterDynamicsService["confirmCandidate"]>) {
    return this.characterDynamicsService.confirmCandidate(...args);
  }

  mergeCharacterCandidate(...args: Parameters<CharacterDynamicsService["mergeCandidate"]>) {
    return this.characterDynamicsService.mergeCandidate(...args);
  }

  updateCharacterDynamicState(...args: Parameters<CharacterDynamicsService["updateCharacterDynamicState"]>) {
    return this.characterDynamicsService.updateCharacterDynamicState(...args);
  }

  updateCharacterRelationStage(...args: Parameters<CharacterDynamicsService["updateRelationStage"]>) {
    return this.characterDynamicsService.updateRelationStage(...args);
  }

  rebuildCharacterDynamics(...args: Parameters<CharacterDynamicsService["rebuildDynamics"]>) {
    return this.characterDynamicsService.rebuildDynamics(...args);
  }

  getCharacterMindState(...args: Parameters<CharacterMindService["getCurrentMindState"]>) {
    return this.characterMindService.getCurrentMindState(...args);
  }

  refreshCharacterMindState(...args: Parameters<CharacterMindService["refreshMindState"]>) {
    return this.characterMindService.refreshMindState(...args);
  }

  listCharacterInfluenceProposals(...args: Parameters<CharacterInfluenceService["listInfluenceProposals"]>) {
    return this.characterInfluenceService.listInfluenceProposals(...args);
  }

  generateCharacterInfluenceProposals(...args: Parameters<CharacterInfluenceService["generateInfluenceProposals"]>) {
    return this.characterInfluenceService.generateInfluenceProposals(...args);
  }

  acceptCharacterInfluenceProposal(...args: Parameters<CharacterInfluenceService["acceptInfluenceProposal"]>) {
    return this.characterInfluenceService.acceptInfluenceProposal(...args);
  }

  dismissCharacterInfluenceProposal(...args: Parameters<CharacterInfluenceService["dismissInfluenceProposal"]>) {
    return this.characterInfluenceService.dismissInfluenceProposal(...args);
  }

  getActiveCharacterDialogueSession(...args: Parameters<CharacterDialogueService["getActiveSession"]>) {
    return this.characterDialogueService.getActiveSession(...args);
  }

  startCharacterDialogueSession(...args: Parameters<CharacterDialogueService["startSession"]>) {
    return this.characterDialogueService.startSession(...args);
  }

  sendCharacterDialogueTurn(...args: Parameters<CharacterDialogueService["sendTurn"]>) {
    return this.characterDialogueService.sendTurn(...args);
  }

  activateCharacterDialogueInfluence(...args: Parameters<CharacterDialogueService["activateLatestDraftInfluence"]>) {
    return this.characterDialogueService.activateLatestDraftInfluence(...args);
  }

  dismissCharacterDialogueInfluence(...args: Parameters<CharacterDialogueService["dismissLatestDraftInfluence"]>) {
    return this.characterDialogueService.dismissLatestDraftInfluence(...args);
  }
}
