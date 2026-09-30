const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { buildContentHash, StaleChapterSourceError } = require("../dist/services/novel/artifacts/persistence.js");
const { RagSourceDocumentLoader } = require("../dist/services/rag/indexing/infrastructure/RagSourceDocumentLoader.js");
const { RagIndexStore } = require("../dist/services/rag/indexing/infrastructure/RagIndexStore.js");
const { filterCurrentRagChunks } = require("../dist/services/rag/retrieval/index.js");
const { HybridRetrievalService } = require("../dist/services/rag/HybridRetrievalService.js");
const { ragConfig } = require("../dist/config/rag.js");
const { buildSummarySourceHash } = require("../dist/services/rag/indexing/sourceIdentity.js");

function replace(t, object, key, value) {
  const previous = object[key]; object[key] = value; t.after(() => { object[key] = previous; });
}
function chunk(id, ownerType = "chapter", content = "正文", hash = buildContentHash(content)) {
  return { id, ownerType, ownerId: "c1", tenantId: "default", novelId: "n1", worldId: null,
    title: "第一章", chunkText: content, chunkOrder: 0, chunkHash: id, metadataJson: hash ? JSON.stringify({sourceContentHash:hash}) : null,
    tokenEstimate: 10, language: "zh", embedProvider: "test", embedModel: "test", embedVersion:1 };
}
function hit(record) { return {...record, worldId:undefined, score:1, source:"vector"}; }

test("chapter index loader rejects summary from older or unknown body source", async (t) => {
  const chapter={id:"c1",novelId:"n1",content:"正文",title:"第一章",order:1,updatedAt:new Date(),generationState:"done"};
  const summary={chapterId:"c1",novelId:"n1",summary:"摘要",updatedAt:new Date(),sourceContentHash:null};
  replace(t,prisma.chapter,"findUnique",async()=>chapter);
  replace(t,prisma.chapterSummary,"findUnique",async()=>summary);
  const loader=new RagSourceDocumentLoader();
  assert.deepEqual(await loader.loadSourceDocuments("chapter_summary","c1","default"),[]);
  summary.sourceContentHash=buildContentHash("旧正文");
  assert.deepEqual(await loader.loadSourceDocuments("chapter_summary","c1","default"),[]);
  summary.sourceContentHash=buildContentHash(chapter.content);
  const docs=await loader.loadSourceDocuments("chapter_summary","c1","default");
  assert.equal(docs[0].metadata.sourceContentHash,summary.sourceContentHash);
  assert.equal(docs[0].metadata.sourceSummaryHash,buildSummarySourceHash(summary));
  assert.equal((await loader.loadSourceDocuments("chapter","c1","default"))[0].metadata.sourceContentHash,summary.sourceContentHash);
});

test("same-body summary regeneration rejects an obsolete prepared index and retrieval chunk", async (t) => {
  const summary={chapterId:"c1",novelId:"n1",summary:"新版摘要",sourceContentHash:buildContentHash("正文"),updatedAt:new Date()};
  const row=chunk("summary-old","chapter_summary");
  row.metadataJson=JSON.stringify({sourceContentHash:summary.sourceContentHash,sourceSummaryHash:buildSummarySourceHash({...summary,summary:"旧版摘要"})});
  const events=[];
  const tx={chapter:{findFirst:async()=>({content:"正文",updatedAt:new Date()}),updateMany:async()=>({count:1})},
    chapterSummary:{findUnique:async()=>summary,updateMany:async()=>{throw new Error("must reject obsolete summary");}}};
  replace(t,prisma,"$transaction",async(callback)=>callback(tx));
  const store=new RagIndexStore({upsertPoints:async()=>events.push("staged"),deletePoints:async(ids)=>events.push(ids)});
  await assert.rejects(store.replaceOwnerChunks({ownerType:"chapter_summary",ownerId:"c1",tenantId:"default",candidates:[row],vectors:[[1]]}),/summary changed/);
  assert.deepEqual(events,["staged",["summary-old"]]);
  replace(t,prisma.knowledgeChunk,"findMany",async()=>[row]);
  replace(t,prisma.chapter,"findMany",async()=>[{id:"c1",novelId:"n1",content:"正文"}]);
  replace(t,prisma.chapterSummary,"findMany",async()=>[summary]);
  assert.deepEqual(await filterCurrentRagChunks([hit(row)],"default"),[]);
  row.metadataJson=JSON.stringify({sourceContentHash:summary.sourceContentHash,sourceSummaryHash:buildSummarySourceHash(summary)});
  assert.equal((await filterCurrentRagChunks([hit(row)],"default")).length,1);
});

test("current summary replacement checks and locks the actual summary row before metadata commit", async (t) => {
  const summary={chapterId:"c1",novelId:"n1",summary:"当前摘要",keyEvents:null,characterStates:null,hook:null,
    sourceContentHash:buildContentHash("正文"),updatedAt:new Date()};
  const row=chunk("summary-new","chapter_summary");
  row.metadataJson=JSON.stringify({sourceContentHash:summary.sourceContentHash,sourceSummaryHash:buildSummarySourceHash(summary)});
  const events=[];
  const tx={chapter:{findFirst:async()=>({content:"正文",updatedAt:new Date()}),updateMany:async()=>({count:1})},
    chapterSummary:{findUnique:async()=>summary,updateMany:async({where,data})=>{
      assert.equal(where.summary,summary.summary);assert.equal(data.updatedAt,summary.updatedAt);events.push("summary-lock");return {count:1};
    }},knowledgeChunk:{findMany:async()=>[],createMany:async()=>events.push("metadata")}};
  replace(t,prisma,"$transaction",async(callback)=>callback(tx));
  const store=new RagIndexStore({upsertPoints:async()=>{},deletePoints:async()=>{}});
  await store.replaceOwnerChunks({ownerType:"chapter_summary",ownerId:"c1",tenantId:"default",candidates:[row],vectors:[[1]]});
  assert.deepEqual(events,["summary-lock","metadata"]);
});

test("deleting a captured index cannot erase a concurrently committed new chunk id", async (t) => {
  const { RagOwnerIndexingService } = require("../dist/services/rag/indexing/index.js");
  let ids=["old"];
  replace(t,prisma.knowledgeChunk,"findMany",async()=>ids.map(id=>({id})));
  replace(t,prisma.knowledgeChunk,"deleteMany",async({where})=>{ids=ids.filter(id=>!where.id.in.includes(id));});
  const service=new RagOwnerIndexingService({}, {deletePoints:async()=>{ids.push("new");}}, {}, {});
  assert.deepEqual(await service.deleteOwnerChunks("chapter","c1","default"),{deleted:1});
  assert.deepEqual(ids,["new"]);
});

test("stale chapter index cannot commit metadata even after vectors were prepared", async (t) => {
  const events=[]; const row=chunk("new");
  const tx={chapter:{findFirst:async()=>({content:"正文被改写",updatedAt:new Date()}),updateMany:async()=>{throw new Error("must not lock stale source");}},knowledgeChunk:{createMany:async()=>events.push("metadata")}};
  replace(t,prisma,"$transaction",async(callback)=>callback(tx));
  const store=new RagIndexStore({upsertPoints:async()=>events.push("staged"),deletePoints:async(ids)=>events.push(["clean",...ids])});
  await assert.rejects(store.replaceOwnerChunks({ownerType:"chapter",ownerId:"c1",tenantId:"default",candidates:[row],vectors:[[1]]}),StaleChapterSourceError);
  assert.deepEqual(events,["staged",["clean","new"]]);
});

test("current index metadata replacement holds source fence and cleans only superseded ids", async (t) => {
  const events=[];const row=chunk("new");
  const tx={chapter:{findFirst:async()=>({content:"正文",updatedAt:new Date()}),updateMany:async()=>{events.push("locked");return {count:1};}},knowledgeChunk:{
    findMany:async()=>[{id:"old"}],createMany:async({data})=>{events.push(["insert",data[0].id]);},deleteMany:async({where})=>events.push(["retire",...where.id.in]),
  }};
  replace(t,prisma,"$transaction",async(callback)=>{events.push("transaction");const result=await callback(tx);events.push("commit");return result;});
  const store=new RagIndexStore({upsertPoints:async()=>events.push("staged"),deletePoints:async(ids)=>events.push(["clean",...ids])});
  await store.replaceOwnerChunks({ownerType:"chapter",ownerId:"c1",tenantId:"default",candidates:[row],vectors:[[1]]});
  assert.deepEqual(events,["staged","transaction","locked",["insert","new"],["retire","old"],"commit",["clean","old"]]);
});

test("retrieval excludes orphan vectors, legacy/old hashes and stale summaries", async (t) => {
  const rows=[chunk("current"),chunk("old","chapter","旧正文"),chunk("legacy","chapter","正文",null),chunk("summary","chapter_summary")];
  replace(t,prisma.knowledgeChunk,"findMany",async()=>rows);
  replace(t,prisma.chapter,"findMany",async()=>[{id:"c1",novelId:"n1",content:"正文"}]);
  replace(t,prisma.chapterSummary,"findMany",async()=>[{chapterId:"c1",novelId:"n1",sourceContentHash:buildContentHash("旧正文")}]);
  const result=await filterCurrentRagChunks([...rows.map(hit),hit(chunk("orphan"))],"default");
  assert.deepEqual(result.map(row=>row.id),["current"]);
});

test("hybrid retrieval checks body again after asynchronous reranking", async (t) => {
  let content="正文";const record=chunk("current");
  replace(t,prisma.knowledgeChunk,"findMany",async()=>[record]);
  replace(t,prisma.chapter,"findMany",async()=>[{id:"c1",novelId:"n1",content}]);
  replace(t,prisma.chapterSummary,"findMany",async()=>[]);
  replace(t,ragConfig,"enabled",true);replace(t,ragConfig,"retrievalTraceSampleRate",0);
  const service=new HybridRetrievalService({}, {}, {rerank:async()=>{content="改写正文";return {used:false,results:[]};}});
  service.vectorSearch=async()=>[hit(record)];service.keywordSearch=async()=>[];
  assert.deepEqual(await service.retrieve("正文",{ownerTypes:["chapter"],rerankerEnabled:true}),[]);
});

test("empty chapter source and empty preparation cannot delete a concurrent newer index", async (t) => {
  const { RagOwnerIndexingService } = require("../dist/services/rag/indexing/index.js");
  const settings = require("../dist/services/settings/RagSettingsService.js");
  const preparation = require("../dist/services/rag/indexing/domain/RagChunkPreparation.js");
  replace(t, prisma.ragIndexJob, "findUnique", async () => ({payloadJson:null}));
  replace(t, settings, "getRagEmbeddingSettings", async () => ({embeddingProvider:"openai",embeddingModel:"test"}));
  replace(t, preparation, "buildChunkCandidates", () => []);
  for (const ownerType of ["chapter", "chapter_summary"]) {
    for (const documents of [[], [{ownerType,ownerId:"c1",tenantId:"default",novelId:"n1",content:"正文"}]]) {
      let deletes=0;
      const service = new RagOwnerIndexingService({}, {}, {applyToCandidates:async()=>{}}, {
        parseJobPayload:()=>({}),assertJobNotCancelled:async()=>{},updateJobProgress:async()=>{},
      });
      service.sourceLoader.loadSourceDocuments=async()=>documents;
      service.deleteOwnerChunks=async()=>{deletes++;};
      assert.deepEqual(await service.upsertOwnerChunks(ownerType,"c1","default","job"),{chunks:0});
      assert.equal(deletes,0);
    }
  }
});
