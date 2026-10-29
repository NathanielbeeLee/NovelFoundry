const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePlanParticipants, generationContextPackageSchema, chapterWriteContextSchema } = require('../../../shared/dist/types/chapterRuntime.js');
const { buildParticipants, buildDynamicCharacterGuidance } = require('../../dist/prompting/prompts/novel/chapterLayeredContextCharacters.js');
const { buildBookContractContext, buildChapterWriteContext, buildChapterWriterContextBlocks, buildChapterRepairContextBlocks } = require('../../dist/prompting/prompts/novel/chapterLayeredContext.js');
const { selectContextBlocks } = require('../../dist/prompting/core/contextSelection.js');
const { buildChapterRagQuery } = require('../../dist/services/novel/NovelReferenceService.js');
const { prepareChapterRepairExecution } = require('../../dist/services/novel/runtime/repair/chapterRepairRuntime.js');
const { resolveChapterResourceCharacterIds } = require('../../dist/services/novel/runtime/context/chapterParticipantSelection.js');

function makeContext(count = 10) {
  const roster = Array.from({ length: count }, (_, i) => ({ id: `id-${i}`, name: `角色${i}`, role: '配角', prohibitions: [`禁止泄露${i}`] }));
  return generationContextPackageSchema.parse({
    chapter: { id: 'chapter', title: '群像', order: 5 },
    plan: { id: 'plan', title: '群像', objective: '每位角色完成自己的任务', participants: roster.map(c => c.name), reveals: [], riskNotes: [], scenes: [], createdAt: '', updatedAt: '' },
    stateSnapshot: null, openConflicts: [], characterRoster: roster,
    characterHardFacts: roster.map(c => ({ characterId: c.id, name: c.name, prohibitions: c.prohibitions, currentGoal: `目标${c.id}` })),
    characterMindStates: roster.map(c => ({ characterId: c.id, currentInterpretation: `仅${c.id}知道的证据`, sourceChapterId: 'earlier', sourceChapterOrder: 4, beliefs: [], misbeliefs: [], evidence: [] })),
    creativeDecisions: [], openAuditIssues: [], previousChaptersSummary: [], openingHint: '',
    continuation: { enabled: false, sourceType: null, sourceId: null, sourceTitle: '', systemRule: '', humanBlock: '', antiCopyCorpus: [] },
  });
}
function writeContext(context) {
  return buildChapterWriteContext({ contextPackage: context, bookContract: buildBookContractContext({ title: '群像' }), macroConstraints: null, volumeWindow: null });
}

test('explicit IDs win, unique names bind, and ambiguous/unknown plan references never guess', () => {
  const roster = [{ id: 'a', name: '同名' }, { id: 'b', name: '同名' }, { id: 'c', name: 'a' }];
  assert.deepEqual(resolvePlanParticipants(['a', '同名', 'unknown', 'a'], roster), { characters: [roster[0]], unresolved: ['同名', 'unknown'] });
  assert.deepEqual(resolveChapterResourceCharacterIds({ plan: { participantsJson: '["同名","a"]' }, characters: roster }), ['a']);
});

test('all planned cast survive high-priority background and hard fact selection', () => {
  const context = makeContext();
  const backgrounds = Array.from({ length: 8 }, (_, i) => ({ id: `background-${i}`, name: `背景${i}`, role: '配角' }));
  context.characterRoster.unshift(...backgrounds);
  const guides = backgrounds.map(c => ({ characterId: c.id, name: c.name, shouldPreferAppearance: true, isCoreInVolume: true, relationStageLabels: [] }));
  const participants = buildParticipants(context, guides);
  assert.deepEqual(participants.map(c => c.id), Array.from({ length: 10 }, (_, i) => `id-${i}`));
  const written = writeContext(context);
  assert.equal(written.characterHardFacts.length, 10);
  assert.equal(written.plannedCast.knowledge.length, 10);
  assert.deepEqual(written.plannedCast.omittedBackgroundIds, backgrounds.map(c => c.id));
});

test('required identities, trailing facts and knowledge survive tiny budgets in every writing mode', () => {
  const written = writeContext(makeContext());
  for (const mode of ['full', 'incremental', 'review', 'repair']) {
    const selected = selectContextBlocks(buildChapterWriterContextBlocks(written, { mode }), { maxTokensBudget: 1 });
    const byId = new Map(selected.selectedBlocks.map(b => [b.id, b]));
    assert.match(byId.get('participant_subset').content, /仅id-9知道的证据/);
    assert.match(byId.get('character_hard_facts').content, /禁止泄露9/);
    assert.match(byId.get('participant_subset').content, /角色9/);
    assert.ok(!selected.summarizedBlockIds.includes('participant_subset'));
    assert.ok(selected.estimatedTokens > 1);
  }
});

test('future, same-chapter, unknown-age and offstage private knowledge are excluded', () => {
  const context = makeContext(2);
  context.characterMindStates.push(
    { characterId: 'id-0', currentInterpretation: 'future-secret', sourceChapterId: 'future', sourceChapterOrder: 9 },
    { characterId: 'id-0', currentInterpretation: 'current-secret', sourceChapterId: 'chapter', sourceChapterOrder: 5 },
    { characterId: 'id-0', currentInterpretation: 'unknown-age-secret', sourceChapterId: 'unknown' },
    { characterId: 'offstage', currentInterpretation: 'offstage-secret', sourceChapterId: null },
  );
  const cast = writeContext(context).plannedCast;
  assert.equal(cast.knowledge.length, 2);
  assert.doesNotMatch(JSON.stringify(cast), /future-secret|current-secret|unknown-age-secret|offstage-secret/);
});

test('unresolved same-name cast is diagnostic only even when dynamics prefers both identities', () => {
  const context = makeContext(2);
  context.characterRoster.forEach(c => c.name = '同名');
  context.plan.participants = ['同名', '不存在'];
  context.characterDynamics = { relations: [], candidates: [], characters: context.characterRoster.map(c => ({ characterId: c.id, name: c.name, role: c.role, isCoreInVolume: true, plannedChapterOrders: [5], absenceRisk: 'high', absenceSpan: 2 })) };
  const guides = buildDynamicCharacterGuidance(context).characterBehaviorGuides;
  assert.deepEqual(guides, []);
  const written = writeContext(context);
  assert.deepEqual(written.participants, []);
  assert.deepEqual(written.characterHardFacts, []);
  assert.deepEqual(written.plannedCast.knowledge, []);
  assert.deepEqual(written.plannedCast.unresolved, ['同名', '不存在']);
});

test('legacy context remains readable and no-plan fallback stays bounded', () => {
  const context = makeContext(); context.plan = null;
  const written = writeContext(context);
  assert.equal(written.participants.length, 4);
  delete written.plannedCast;
  assert.equal(chapterWriteContextSchema.parse(written).plannedCast, undefined);
});

test('retrieval keeps every planned name even when optional mission text exhausts its soft cap', () => {
  const names = Array.from({ length: 12 }, (_, i) => `参与者${i}`);
  const query = buildChapterRagQuery({ chapterOrder: 5, novelTitle: '小说', chapterTitle: '群像', objective: '长任务'.repeat(400), participantNames: names });
  for (const name of names) assert.ok(query.includes(name));
  assert.ok(query.length <= 600);
  const longName = '实名'.repeat(400);
  assert.ok(buildChapterRagQuery({ chapterOrder: 5, novelTitle: '小说', participantNames: [longName] }).includes(longName));
});

test('heavy repair fallback retains the last planned character without a repair-context snapshot', async () => {
  const written = writeContext(makeContext());
  const result = await prepareChapterRepairExecution({ novelId: 'novel', chapterId: 'chapter', novelTitle: '群像', chapterTitle: '群像', content: '正文', issues: [], runtimePackage: { context: { chapterWriteContext: written }, audit: { openIssues: [] }, obligationCoverage: { missing: [] } }, options: { repairMode: 'heavy_repair' } });
  assert.equal(result.kind, 'heavy_repair');
  assert.match(result.prompt.promptInput.ragContext, /禁止泄露9/);
  assert.match(result.prompt.promptInput.ragContext, /仅id-9知道的证据/);
});
