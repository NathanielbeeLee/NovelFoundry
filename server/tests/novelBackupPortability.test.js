const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// No real database is constructed or queried in this suite.
const fakePrisma = {};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.endsWith('/db/prisma') || request.endsWith('/db/prisma.js')) return { prisma: fakePrisma };
  return originalLoad.call(this, request, parent, isMain);
};
const base = '../dist/modules/novel/export/backup/';
const { BACKUP_MODELS, BACKUP_ENUMS } = require(base + 'domain/catalog.js');
const { EXCLUSIONS, FORMAT, FORMAT_VERSION, entityCounts, canonicalJson, sha256 } = require(base + 'domain/archive.js');
const { parseNovelBackup } = require(base + 'domain/validation.js');
const { portableRow, remapTables } = require(base + 'domain/portability.js');
const { assertCatalogCurrent, insertBookSnapshot, readBookSnapshot, requiredInsertOrder } = require(base + 'infrastructure/backupStore.js');
const { exportAssetFiles, publishAssetFiles } = require(base + 'infrastructure/assetFiles.js');
const service = require(base + 'application/novelBackupService.js');
Module._load = originalLoad;

const date = '2026-09-11T00:00:00.000Z';
function row(model, id, values = {}) {
  for(const key of Object.keys(values)) assert.ok(BACKUP_MODELS[model].fields[key], `fixture unknown ${model}.${key}`);
  const data = {};
  for (const [field, spec] of Object.entries(BACKUP_MODELS[model].fields)) {
    data[field] = spec.nullable ? null : spec.type === 'String' ? '' : spec.type === 'DateTime' ? date : spec.type === 'Boolean' ? false : ['Int', 'Float'].includes(spec.type) ? 0 : BACKUP_ENUMS[spec.type][0];
  }
  return { ...data, id, ...values };
}
function fixture() {
  const t = {
    Novel: [row('Novel','novel-old',{title:'完整作品', worldId:'world-old', sourceKnowledgeDocumentId:'doc-old', continuationBookAnalysisId:'analysis-old'})],
    Chapter: [row('Chapter','chapter-old',{novelId:'novel-old', title:'第一章', order:1,content:'原文保留 chapter-old 与 model-id', chapterStatus:'generating'})],
    Character: [row('Character','char-old',{novelId:'novel-old',name:'主角',baseCharacterId:'base-old'})],
    BaseCharacter:[row('BaseCharacter','base-old',{name:'角色库原型'})],
    BaseCharacterRevision:[row('BaseCharacterRevision','base-version',{baseCharacterId:'base-old',snapshotJson:'{"characterId":"char-old","modelId":"model-id"}'})],
    CharacterLibraryLink:[row('CharacterLibraryLink','lib-link',{novelId:'novel-old',characterId:'char-old',baseCharacterId:'base-old',baseRevisionId:'base-version',syncPolicy:'auto'})],
    NovelWorkflowTask:[row('NovelWorkflowTask','task-old',{novelId:'novel-old',lane:'auto_director',title:'执行中',status:'running',seedPayloadJson:'{"execute":true}',checkpointType:'replan_required',pendingManualRecovery:true})],
    NovelIntentVersion:[row('NovelIntentVersion','intent-old',{novelId:'novel-old',workflowTaskId:'task-old',structuredIntentJson:'{}',impactScopeJson:'[]'})],
    ShortStoryPlan:[row('ShortStoryPlan','short-old',{novelId:'novel-old',intentVersionId:'intent-old',structureJson:'{}'})],
    ShortStorySegment:[row('ShortStorySegment','segment-old',{novelId:'novel-old',planId:'short-old'})],
    World:[row('World','world-old',{name:'世界', structureJson:'{"locations":[{"id":"location-local"}],"providerId":"model-id"}'})],
    NovelWorld:[row('NovelWorld','nworld-old',{novelId:'novel-old',sourceWorldId:'world-old',title:'书内世界',syncEnabled:true})],
    WorldAsset:[row('WorldAsset','world-asset',{worldId:'world-old',title:'地图'})],
    KnowledgeDocument:[row('KnowledgeDocument','doc-old',{title:'参考资料',activeVersionId:'doc-version',sourceAnalysisId:'analysis-old',latestIndexStatus:'running'})],
    KnowledgeDocumentVersion:[row('KnowledgeDocumentVersion','doc-version',{documentId:'doc-old'})],
    DocumentChapter:[row('DocumentChapter','doc-chapter',{documentVersionId:'doc-version'})],
    BookAnalysis:[row('BookAnalysis','analysis-old',{documentId:'doc-old',documentVersionId:'doc-version',title:'参考拆书',status:'succeeded'})],
    BookAnalysisCharacter:[row('BookAnalysisCharacter','analysis-char',{analysisId:'analysis-old',name:'参考人物'})],
    KnowledgeBinding:[row('KnowledgeBinding','knowledge-binding',{targetType:'world',targetId:'world-old',documentId:'doc-old'})],
    StyleProfile:[row('StyleProfile','style-old',{name:'写法',sourceType:'from_book_analysis',sourceRefId:'analysis-old'})],
    StyleBinding:[row('StyleBinding','style-binding',{styleProfileId:'style-old',targetType:'chapter',targetId:'chapter-old'})],
    AntiAiRule:[row('AntiAiRule','rule-old',{key:'stable-rule',name:'规则',globalBaselineEnabled:true})],
    StyleProfileAntiAiRule:[row('StyleProfileAntiAiRule','rule-binding',{styleProfileId:'style-old',antiAiRuleId:'rule-old'})],
    CharacterConversationSession:[row('CharacterConversationSession','conversation-old',{subjectKind:'novel_character',subjectId:'char-old',scopeKind:'novel',scopeId:'novel-old',interactionPolicy:'novel_influence'})],
    CharacterConversationTurn:[row('CharacterConversationTurn','turn-old',{sessionId:'conversation-old',content:'对话正文'})],
    StoryTimelineEvent:[row('StoryTimelineEvent','event-old',{novelId:'novel-old',chapterId:'chapter-old',participantIdsJson:'["char-old"]',locationId:'location-local'})],
    ChapterTimeAnchor:[row('ChapterTimeAnchor','anchor-old',{novelId:'novel-old',chapterId:'chapter-old',plannedEventIdsJson:'["event-old"]'})],
    CharacterResourceLedgerItem:[row('CharacterResourceLedgerItem','resource-old',{novelId:'novel-old',resourceKey:'钥匙:char-old',holderCharacterId:'char-old',knownByCharacterIdsJson:'["char-old"]'})],
    CanonicalStateVersion:[row('CanonicalStateVersion','canonical-old',{novelId:'novel-old',chapterId:'chapter-old',snapshotJson:'{"characters":[{"characterId":"char-old"}],"resourceKey":"钥匙:char-old","modelId":"model-id","promptId":"business.prompt"}'})],
    PromptTemplateOverride:[row('PromptTemplateOverride','override-old',{novelId:'novel-old',promptId:'business.prompt',activeVersionId:'prompt-version'})],
    PromptTemplateVersion:[row('PromptTemplateVersion','prompt-version',{overrideId:'override-old',templateJson:'{"messages":[{"id":"system","content":"hello char-old"}]}',contextRefsJson:'{"context":["novelId"]}'})],
    ChapterPolishRevision:[row('ChapterPolishRevision','revision-old',{novelId:'novel-old',chapterId:'chapter-old',operationKey:'original-op',beforeContent:'before',afterContent:'after',beforeRawHash:'hash-before',afterChapterStateJson:'{"captureComplete":true,"chapter":{"id":"chapter-old"}}'})],
    ChapterPolishMutation:[row('ChapterPolishMutation','mutation-old',{revisionId:'revision-old',entityType:'Character',entityId:'char-old',beforeJson:'{"id":"char-old","name":"角色"}'})],
  };
  const warnings=new Set();
  for(const [model,rows] of Object.entries(t)) t[model]=rows.map(item=>portableRow(model,item,warnings));
  return {format:FORMAT,formatVersion:FORMAT_VERSION,createdAt:date,novelId:'novel-old',tables:t,resources:[],manifest:{entityCounts:entityCounts(t),exclusions:[...EXCLUSIONS],warnings:[...warnings]}};
}
function memoryDb(initial={}) {
  let tables=structuredClone(initial);
  const receipts=[];
  let failModel=null;
  const operations=[];
  const matches=(entry,where)=>Object.entries(where ?? {}).every(([key,value])=>value && typeof value==='object' && 'in' in value ? value.in.includes(entry[key]) : entry[key]===value);
  const tx={};
  for(const [model,spec] of Object.entries(BACKUP_MODELS)) {
    tx[model[0].toLowerCase()+model.slice(1)]={
      findMany: async({where})=>(tables[model]??[]).filter(entry=>matches(entry,where)).map(entry=>({...entry})),
      create: async({data})=>{
        if(model===failModel) throw new Error('injected persistence failure');
        if((tables[model]??[]).some(entry=>entry.id===data.id)) throw new Error('duplicate id');
        for(const [field,target] of Object.entries(spec.refs)) if(data[field] && !(tables[target]??[]).some(entry=>entry.id===data[field])) throw new Error(`FK ${model}.${field}`);
        (tables[model]??=[]).push({...data});operations.push([model,data.id]);return data;
      },
      update:async({where,data})=>Object.assign(tables[model].find(entry=>entry.id===where.id),data),
      findUnique:async({where})=>(tables[model]??[]).find(entry=>matches(entry,where))??null,
    };
  }
  tx.novelBackupImportReceipt={
    findUnique:async({where})=>receipts.find(entry=>entry.requestId===where.requestId)??null,
    create:async({data})=>{if(receipts.some(entry=>entry.requestId===data.requestId))throw new Error('duplicate receipt'); receipts.push(data);return data;},
  };
  return { tx, get tables(){return tables;},receipts,operations,setFail(model){failModel=model;},async transaction(run,options){
    assert.equal(options.isolationLevel,'Serializable');
    const before=structuredClone(tables),beforeReceipts=structuredClone(receipts);
    try{return await run(tx);}catch(error){tables=before;receipts.splice(0,receipts.length,...beforeReceipts);throw error;}
  }};
}
function bindDb(db) { Object.assign(fakePrisma,db.tx);fakePrisma.$transaction=db.transaction; }

test('catalog matches current schema and package including short-story FK shells validates',()=>{
  assertCatalogCurrent();
  const {preview}=parseNovelBackup(fixture());
  assert.equal(preview.chapterCount,1);assert.equal(preview.characterCount,1);
  assert.ok(preview.entityCounts.DocumentChapter);assert.ok(preview.entityCounts.CharacterConversationTurn);
});
test('new identities preserve prose and stable AI ids, remap soft references and resource keys',()=>{
  const archive=fixture();const mapped=remapTables(archive.tables,archive.novelId,'新书');
  const oldIds=new Set(Object.values(archive.tables).flat().map(entry=>entry.id));
  assert.ok(Object.values(mapped.tables).flat().every(entry=>!oldIds.has(entry.id)));
  assert.equal(mapped.tables.Chapter[0].content,archive.tables.Chapter[0].content);
  assert.equal(mapped.tables.Chapter[0].chapterStatus,'pending_review');
  assert.equal(mapped.tables.NovelWorkflowTask[0].lane,'manual_create');
  assert.equal(mapped.tables.NovelWorkflowTask[0].resumeTargetJson,null);
  assert.equal(mapped.tables.BookAnalysis[0].status,'succeeded');
  assert.equal(mapped.tables.CharacterConversationSession[0].subjectId,mapped.ids.get('char-old'));
  assert.deepEqual(JSON.parse(mapped.tables.ChapterTimeAnchor[0].plannedEventIdsJson),[mapped.ids.get('event-old')]);
  const canonical=JSON.parse(mapped.tables.CanonicalStateVersion[0].snapshotJson);
  assert.equal(canonical.modelId,'model-id');assert.equal(canonical.promptId,'business.prompt');
  assert.equal(canonical.characters[0].characterId,mapped.ids.get('char-old'));
  assert.equal(canonical.resourceKey,`钥匙:${mapped.ids.get('char-old').slice(0,32)}`);
  assert.equal(mapped.tables.PromptTemplateOverride[0].promptId,'business.prompt');
  assert.equal(mapped.tables.PromptTemplateVersion[0].contextRefsJson,archive.tables.PromptTemplateVersion[0].contextRefsJson);
  assert.equal(JSON.parse(mapped.tables.ChapterPolishRevision[0].afterChapterStateJson).captureComplete,false);
  assert.equal(mapped.tables.ChapterPolishMutation[0].entityId,mapped.ids.get('char-old'));
});
test('chapter identity arrays in stored planning content map to restored chapters',()=>{
  const archive=fixture();
  archive.tables.Novel[0].structuredOutline=JSON.stringify({chapterIds:['chapter-old']});
  parseNovelBackup(archive);
  const mapped=remapTables(archive.tables,archive.novelId,'新书');
  assert.deepEqual(JSON.parse(mapped.tables.Novel[0].structuredOutline).chapterIds,[mapped.ids.get('chapter-old')]);
});
test('snapshot reads a selected dependency closure instead of all inverse relations',async()=>{
  const archive=fixture();const tables=structuredClone(archive.tables);
  tables.Novel.push(row('Novel','other-novel',{title:'不能携带'}));
  tables.Chapter.push(row('Chapter','other-chapter',{novelId:'other-novel',title:'其他章节'}));
  tables.KnowledgeDocument.push(row('KnowledgeDocument','unrelated-doc',{title:'无关资料'}));
  const result=await readBookSnapshot(memoryDb(tables).tx,'novel-old');
  assert.equal(result.tables.Novel.length,1);assert.equal(result.tables.Chapter.length,1);
  assert.equal(result.tables.KnowledgeDocument.length,1);assert.equal(result.tables.DocumentChapter.length,1);
  assert.equal(result.tables.CharacterConversationTurn.length,1);assert.equal(result.tables.AntiAiRule.length,1);
});
test('required insert ordering and two-pass nullable cycles preserve complete data',async()=>{
  const archive=fixture();const mapped=remapTables(archive.tables,archive.novelId,'新书');const db=memoryDb();
  requiredInsertOrder(mapped.tables);
  await insertBookSnapshot(db.tx,mapped.tables);
  assert.equal(db.tables.KnowledgeDocument[0].activeVersionId,mapped.ids.get('doc-version'));
  assert.equal(db.tables.PromptTemplateOverride[0].activeVersionId,mapped.ids.get('prompt-version'));
  assert.equal(db.operations.length,Object.values(archive.tables).flat().length);
});
test('unknown models/fields, duplicate ids, missing FK and unrelated dependency islands fail before writes',()=>{
  for(const mutate of [
    a=>{a.tables.APIKey=[];},
    a=>{a.tables.toString=[];},
    a=>{delete a.tables.Novel[0].description;},
    a=>{a.tables.Novel[0].inject='x';},
    a=>{a.tables.Chapter[0].id='novel-old';},
    a=>{a.tables.Character[0].novelId='other-novel';},
    a=>{a.tables.ShortStoryPlan[0].intentVersionId='missing';},
    a=>{a.tables.World.push(row('World','evil-world',{name:'无关世界'}));a.tables.KnowledgeBinding.push(row('KnowledgeBinding','evil-binding',{targetType:'world',targetId:'evil-world',documentId:'doc-old'}));a.manifest.entityCounts=entityCounts(a.tables);},
  ]){const a=fixture();mutate(a);assert.throws(()=>parseNovelBackup(a),/校验失败/);}
});
test('active shell or cross-book source links cannot be smuggled into a validated archive',()=>{
  const a=fixture();a.tables.NovelWorkflowTask[0].status='running';assert.throws(()=>parseNovelBackup(a),/运行状态/);
  const b=fixture();b.tables.Novel[0].sourceNovelId='foreign';assert.throws(()=>parseNovelBackup(b),/缺少对应资产/);
});
test('restore failure rolls back all creative rows and receipt; retry is idempotent',async()=>{
  const a=fixture();const preview=service.previewNovelBackup(a);const db=memoryDb();bindDb(db);
  const options={expectedDigest:preview.digest,requestId:'request-id-1234567890',title:'恢复书'};
  db.setFail('CharacterConversationTurn');
  await assert.rejects(service.restoreNovelBackup(a,options),/injected persistence failure/);
  assert.equal(Object.values(db.tables).flat().length,0);assert.equal(db.receipts.length,0);
  db.setFail(null);
  const first=await service.restoreNovelBackup(a,options);const count=Object.values(db.tables).flat().length;
  const second=await service.restoreNovelBackup(a,options);assert.equal(first.novelId,second.novelId);
  assert.equal(Object.values(db.tables).flat().length,count);assert.equal(db.receipts.length,1);
  await assert.rejects(service.restoreNovelBackup(a,{...options,title:'另一标题'}),/不能用于不同备份或标题/);
  await assert.rejects(service.restoreNovelBackup(a,{...options,expectedDigest:'changed'}),/预检结果不一致/);
});
test('managed image bytes roundtrip with new files; missing resources and arbitrary metadata paths are rejected',async(t)=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'novel-backup-test-')));
  const oldRuntime=process.env.NOVELFOUNDRY_RUNTIME,oldRoot=process.env.NOVELFOUNDRY_APP_DATA_DIR;
  process.env.NOVELFOUNDRY_RUNTIME='desktop';process.env.NOVELFOUNDRY_APP_DATA_DIR=root;
  t.after(async()=>{if(oldRuntime===undefined)delete process.env.NOVELFOUNDRY_RUNTIME;else process.env.NOVELFOUNDRY_RUNTIME=oldRuntime;if(oldRoot===undefined)delete process.env.NOVELFOUNDRY_APP_DATA_DIR;else process.env.NOVELFOUNDRY_APP_DATA_DIR=oldRoot;await fs.rm(root,{recursive:true,force:true});});
  const storage=path.join(root,'storage','generated-images');await fs.mkdir(storage,{recursive:true});
  const file=path.join(storage,'original.png');const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYQAAAABJRU5ErkJggg==','base64');await fs.writeFile(file,bytes);
  const a=fixture();a.tables.ImageGenerationTask=[portableRow('ImageGenerationTask',row('ImageGenerationTask','image-task',{novelId:'novel-old'}),new Set())];
  a.tables.ImageAsset=[row('ImageAsset','image-old',{taskId:'image-task',novelId:'novel-old',url:file,mimeType:'image/png',metadata:JSON.stringify({storageDriver:'local',localPath:file})})];
  a.resources=await exportAssetFiles(a.tables);a.manifest.entityCounts=entityCounts(a.tables);
  assert.ok(!canonicalJson(a).includes(root));parseNovelBackup(a);
  const mapped=remapTables(a.tables,a.novelId,'图片书');const published=await publishAssetFiles(a.resources,mapped.ids,mapped.tables);
  assert.deepEqual(await fs.readFile(mapped.tables.ImageAsset[0].url),bytes);await published.cleanup();
  const incomplete=structuredClone(a);incomplete.resources=[];assert.throws(()=>parseNovelBackup(incomplete),/图片文件不完整/);
  const bad=structuredClone(a);bad.resources[0].digest='bad';assert.throws(()=>parseNovelBackup(bad),/校验和/);
  const outside=path.join(root,'secret');await fs.writeFile(outside,'secret');a.tables.ImageAsset[0].url=outside;a.tables.ImageAsset[0].metadata=JSON.stringify({localPath:outside});
  await assert.rejects(exportAssetFiles(a.tables),/受管目录/);
});
test('verified pre-reversal backup is persisted and read back with an exact digest',async(t)=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'novel-backup-verified-')));
  const oldRuntime=process.env.NOVELFOUNDRY_RUNTIME,oldRoot=process.env.NOVELFOUNDRY_APP_DATA_DIR;
  process.env.NOVELFOUNDRY_RUNTIME='desktop';process.env.NOVELFOUNDRY_APP_DATA_DIR=root;
  t.after(async()=>{if(oldRuntime===undefined)delete process.env.NOVELFOUNDRY_RUNTIME;else process.env.NOVELFOUNDRY_RUNTIME=oldRuntime;if(oldRoot===undefined)delete process.env.NOVELFOUNDRY_APP_DATA_DIR;else process.env.NOVELFOUNDRY_APP_DATA_DIR=oldRoot;await fs.rm(root,{recursive:true,force:true});});
  bindDb(memoryDb(fixture().tables));
  const result=await service.createVerifiedNovelBackup('novel-old','polish undo');
  const bytes=await fs.readFile(result.path);assert.equal(result.bytes,bytes.length);assert.equal(result.digest,sha256(bytes));assert.equal(result.schemaVersion,1);
});

test('explicit structured references reject missing current characters and preserve unrelated semantic IDs',()=>{
  const missing=fixture();missing.tables.StoryTimelineEvent[0].participantIdsJson='["foreign-char"]';
  assert.throws(()=>parseNovelBackup(missing),/未携带的Character/);
  const good=fixture();good.tables.StoryTimelineEvent[0].stateChangesJson='[{"modelId":"char-old","providerId":"model-provider","promptId":"chapter-old"}]';
  parseNovelBackup(good);
  const mapped=remapTables(good.tables,good.novelId,'副本');
  assert.deepEqual(JSON.parse(mapped.tables.StoryTimelineEvent[0].stateChangesJson),[{modelId:'char-old',providerId:'model-provider',promptId:'chapter-old'}]);
});
test('embedded managed image URL is an ownership edge even when the image has no novel FK',()=>{
  const a=fixture();const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYQAAAABJRU5ErkJggg==','base64');
  a.tables.ImageGenerationTask=[portableRow('ImageGenerationTask',row('ImageGenerationTask','shared-image-task'),new Set())];
  a.tables.ImageAsset=[row('ImageAsset','shared-image',{taskId:'shared-image-task',url:'/api/images/assets/shared-image/file',mimeType:'image/png',metadata:JSON.stringify({storageDriver:'portable',assetId:'shared-image'})})];
  a.tables.Chapter[0].content+=' ![插图](/api/images/assets/shared-image/file)';
  a.resources=[{assetId:'shared-image',mimeType:'image/png',bytes:bytes.length,digest:sha256(bytes),base64:bytes.toString('base64')}];
  a.manifest.entityCounts=entityCounts(a.tables);parseNovelBackup(a);
  const mapped=remapTables(a.tables,a.novelId,'副本');assert.ok(mapped.tables.Chapter[0].content.includes(`/api/images/assets/${mapped.ids.get('shared-image')}/file`));
});
test('catalog rejects a stale generated client scalar type',()=>{
  const {Prisma}=require('../node_modules/@prisma/client');const field=Prisma.dmmf.datamodel.models.find(m=>m.name==='Novel').fields.find(f=>f.name==='title');
  const prior=field.type;try{field.type='Int';assert.throws(()=>assertCatalogCurrent(),/结构不一致/);}finally{field.type=prior;}
});
test('an acknowledged receipt survives a lost commit response without producing a second book',async()=>{
  const a=fixture();const db=memoryDb();bindDb(db);
  fakePrisma.$transaction=async(run,options)=>{await db.transaction(run,options);throw new Error('lost commit acknowledgment');};
  const result=await service.restoreNovelBackup(a,{requestId:'lost-response-12345678',expectedDigest:service.previewNovelBackup(a).digest});
  assert.equal(db.receipts[0].novelId,result.novelId);assert.equal(db.tables.Novel.length,1);
});

test('internal image URL remapping adjusts reference-document offsets/hash and template hash',()=>{
  const a=fixture();const content='前文 /api/images/assets/shared-image/file 后文';
  a.tables.KnowledgeDocumentVersion[0].content=content;
  a.tables.KnowledgeDocumentVersion[0].contentHash=sha256(content);
  a.tables.DocumentChapter[0].startOffset=content.indexOf('后文');a.tables.DocumentChapter[0].endOffset=content.length;
  a.tables.ImageGenerationTask=[portableRow('ImageGenerationTask',row('ImageGenerationTask','image-task'),new Set())];
  a.tables.ImageAsset=[row('ImageAsset','shared-image',{taskId:'image-task'})];
  a.tables.PromptTemplateVersion[0].templateJson=JSON.stringify({messages:[{content:'/api/images/assets/shared-image/file'}]});
  const mapped=remapTables(a.tables,a.novelId,'副本');const version=mapped.tables.KnowledgeDocumentVersion[0];
  assert.equal(version.contentHash,sha256(version.content));assert.equal(version.charCount,version.content.length);
  assert.equal(version.content.slice(mapped.tables.DocumentChapter[0].startOffset,mapped.tables.DocumentChapter[0].endOffset),'后文');
  const crypto=require('node:crypto');assert.equal(mapped.tables.PromptTemplateVersion[0].compiledHash,crypto.createHash('sha1').update(mapped.tables.PromptTemplateVersion[0].templateJson).digest('hex').slice(0,16));
});

test('research backup follows only this novel adoption dependencies and remaps provenance without cross-book selections', async () => {
  const text = '引用：可信原文。';
  const tables = {
    Novel: [row('Novel','research-book',{title:'研究小说'}), row('Novel','other-book',{title:'其他小说'})],
    KnowledgeDocument: [row('KnowledgeDocument','research-doc',{title:'来源',activeVersionId:'research-version',status:'enabled'})],
    KnowledgeDocumentVersion: [row('KnowledgeDocumentVersion','research-version',{documentId:'research-doc',content:text,contentHash:sha256(text),charCount:text.length})],
    KnowledgeResearchSource: [row('KnowledgeResearchSource','research-source',{documentVersionId:'research-version',title:'来源',reliabilityReason:'单一来源',enabled:true,revision:'revision-token',contentHash:sha256(text)})],
    KnowledgeResearchFinding: [row('KnowledgeResearchFinding','finding-own',{sourceId:'research-source',sourceRevision:'revision-token',contentHash:sha256(text),claim:'结论',quote:'可信原文',startOffset:3,endOffset:7,uncertainty:'未交叉验证'}),
      row('KnowledgeResearchFinding','finding-other',{sourceId:'research-source',sourceRevision:'older-token',contentHash:sha256(text),claim:'他书结论',quote:'可信原文',startOffset:3,endOffset:7,uncertainty:'未验证'})],
    KnowledgeResearchAdoption: [row('KnowledgeResearchAdoption','adoption-own',{findingId:'finding-own',novelId:'research-book'}),
      row('KnowledgeResearchAdoption','adoption-other',{findingId:'finding-other',novelId:'other-book'})],
  };
  const selected = await readBookSnapshot(memoryDb(tables).tx, 'research-book');
  assert.deepEqual(selected.tables.KnowledgeResearchAdoption.map(item=>item.id), ['adoption-own']);
  assert.deepEqual(selected.tables.KnowledgeResearchFinding.map(item=>item.id), ['finding-own']);
  assert.equal(selected.tables.KnowledgeResearchSource.length,1);
  assert.equal(selected.tables.KnowledgeDocumentVersion.length,1);
  const mapped=remapTables(selected.tables,'research-book','复制小说');
  assert.equal(mapped.tables.KnowledgeResearchAdoption[0].novelId,mapped.novelId);
  assert.equal(mapped.tables.KnowledgeResearchAdoption[0].findingId,mapped.ids.get('finding-own'));
  assert.equal(mapped.tables.KnowledgeResearchFinding[0].sourceId,mapped.ids.get('research-source'));
  assert.equal(mapped.tables.KnowledgeResearchSource[0].documentVersionId,mapped.ids.get('research-version'));
  assert.equal(mapped.tables.KnowledgeResearchFinding[0].sourceRevision,mapped.tables.KnowledgeResearchSource[0].revision);
  assert.equal(mapped.tables.KnowledgeResearchFinding[0].contentHash,sha256(text));
  assert.equal(mapped.tables.KnowledgeResearchFinding[0].quote,text.slice(3,7));
  await insertBookSnapshot(memoryDb().tx,mapped.tables);
});

test('research image references repair hashes and UTF-16 offsets while retaining stale revision identity', () => {
  const text='🧪前文 /api/images/assets/research-image/file 后文引用。';
  const quote='后文引用'; const start=text.indexOf(quote);
  const tables={
    Novel:[row('Novel','research-book',{title:'小说'})],
    KnowledgeDocument:[row('KnowledgeDocument','research-doc',{title:'来源',activeVersionId:'research-version'})],
    KnowledgeDocumentVersion:[row('KnowledgeDocumentVersion','research-version',{documentId:'research-doc',content:text,contentHash:sha256(text),charCount:text.length})],
    KnowledgeResearchSource:[row('KnowledgeResearchSource','research-source',{documentVersionId:'research-version',title:'来源',revision:'current',contentHash:sha256(text)})],
    KnowledgeResearchFinding:[row('KnowledgeResearchFinding','research-finding',{sourceId:'research-source',sourceRevision:'older',contentHash:sha256(text),quote,startOffset:start,endOffset:start+quote.length})],
    KnowledgeResearchAdoption:[row('KnowledgeResearchAdoption','research-adoption',{findingId:'research-finding',novelId:'research-book'})],
    ImageAsset:[row('ImageAsset','research-image',{novelId:'research-book'})],
  };
  const mapped=remapTables(tables,'research-book','新小说');
  const content=mapped.tables.KnowledgeDocumentVersion[0].content;
  const source=mapped.tables.KnowledgeResearchSource[0], finding=mapped.tables.KnowledgeResearchFinding[0];
  assert.equal(source.contentHash,sha256(content)); assert.equal(finding.contentHash,sha256(content));
  assert.equal(content.slice(finding.startOffset,finding.endOffset),quote);
  assert.equal(finding.sourceRevision,'older'); assert.equal(source.revision,'current');
});
