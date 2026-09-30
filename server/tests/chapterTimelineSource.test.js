const test=require("node:test");
const assert=require("node:assert/strict");
const {prisma}=require("../dist/db/prisma.js");
const {buildContentHash,StaleChapterSourceError}=require("../dist/services/novel/artifacts/persistence.js");
const {ChapterTimelineFinalizationService}=require("../dist/services/novel/runtime/ChapterTimelineFinalizationService.js");
const {timelineExtractorService,timelineCheckerService}=require("../dist/modules/timeline/index.js");
function replace(t,object,key,value){const old=object[key];object[key]=value;t.after(()=>{object[key]=old;});}
function fixture(t,{abortAtEvent=false}={}){
  const state={content:"正式正文",committed:[],outside:[],controller:new AbortController()};
  const row=(data)=>({id:"record",createdAt:new Date(),updatedAt:new Date(),...data});
  replace(t,prisma.chapter,"findFirst",async()=>({id:"c1",novelId:"n1",content:state.content,updatedAt:new Date()}));
  replace(t,prisma.chapterArtifactSyncCheckpoint,"findFirst",async()=>null);
  replace(t,prisma.chapterArtifactSyncCheckpoint,"create",async({data})=>{state.outside.push(data.status);return row(data);});
  replace(t,prisma.chapterArtifactSyncCheckpoint,"updateMany",async({data})=>{state.outside.push(data.status);return {count:1};});
  replace(t,prisma,"$transaction",async(callback)=>{
    const pending=[];
    const tx={chapter:{findFirst:async()=>({content:state.content,updatedAt:new Date()}),updateMany:async()=>({count:1})},
      chapterArtifactSyncCheckpoint:{upsert:async({create})=>{pending.push(["checkpoint",create.status,JSON.parse(create.metadataJson).sourceContentHash]);return row(create);}},
      timelineCheckReport:{create:async({data})=>{pending.push(["report"]);return row(data);}},
      storyTimelineEvent:{create:async({data})=>{pending.push(["event",data.title]);if(abortAtEvent)state.controller.abort(new DOMException("cancelled","AbortError"));return row(data);}},
      chapterTimeAnchor:{upsert:async({create})=>{pending.push(["anchor"]);return row(create);}},
      timelineHook:{updateMany:async()=>({count:0}),createMany:async()=>({count:0})},
    };
    const result=await callback(tx);state.committed.push(...pending);return result;
  });
  const context={currentChapterIndex:1,currentTime:{label:"第一日"},previousEvents:[],plannedEventsThisChapter:[],openHooks:[],forbiddenEvents:[]};
  const event={title:"启程",summary:"主角启程",occurred:true,type:"action",confidence:1,stateChanges:[],possibleHooks:[]};
  const gate={sourceContentHash:buildContentHash("正式正文"),result:{status:"passed",score:1,issues:[]},extractedEvents:[event],extractedHooks:[],addressedHookIds:[],resolvedHookIds:[],extractorSucceeded:true,timelineContext:context};
  state.input={novelId:"n1",chapterId:"c1",content:"正式正文",sourceStage:"test",request:{signal:state.controller.signal},timelineGate:gate,contextPackage:{chapter:{id:"c1",title:"第一章",order:1},timelineContext:context}};
  state.gate=gate;return state;
}

test("current timeline facts, report and success checkpoint commit in the source transaction",async(t)=>{
  const state=fixture(t);const result=await new ChapterTimelineFinalizationService().finalizeCurrentContent(state.input);
  assert.equal(result.checkpointWritten,true);
  assert.deepEqual(state.committed,[["report"],["event","启程"],["anchor"],["checkpoint","succeeded",buildContentHash(state.content)]]);
  assert.deepEqual(state.outside,["running"]);
});

test("rewriting body during extraction prevents all timeline facts and success writes",async(t)=>{
  const state=fixture(t);state.input.timelineGate=null;
  const service=new ChapterTimelineFinalizationService();
  service.extractAndCheck=async()=>{state.content="改写的正文";return state.gate;};
  await assert.rejects(service.finalizeCurrentContent(state.input),StaleChapterSourceError);
  assert.deepEqual(state.committed,[]);assert.ok(!state.outside.includes("succeeded"));
});

test("cancellation after acceptance rolls back actual timeline repository writes",async(t)=>{
  const state=fixture(t,{abortAtEvent:true});
  await assert.rejects(new ChapterTimelineFinalizationService().finalizeCurrentContent(state.input),{name:"AbortError"});
  assert.deepEqual(state.committed,[]);assert.ok(!state.outside.includes("succeeded"));
});

test("degraded finalization cannot bypass stale source fence",async(t)=>{
  const state=fixture(t);state.content="改写正文";state.input.mode="degraded";
  await assert.rejects(new ChapterTimelineFinalizationService().finalizeCurrentContent(state.input),StaleChapterSourceError);
  assert.deepEqual(state.committed,[]);
});

test("mismatched prepared gate is re-extracted and cancellation cannot downgrade to success",async(t)=>{
  const state=fixture(t);state.input.timelineGate={...state.gate,sourceContentHash:buildContentHash("旧正文")};
  let extracts=0;const service=new ChapterTimelineFinalizationService();
  service.extractAndCheck=async()=>{extracts++;state.controller.abort(new DOMException("cancelled","AbortError"));return state.gate;};
  await assert.rejects(service.finalizeCurrentContent(state.input),{name:"AbortError"});
  assert.equal(extracts,1);assert.deepEqual(state.committed,[]);
});

test("extraction prepares result without writing a report before source validation",async(t)=>{
  const state=fixture(t);
  replace(t,timelineExtractorService,"extractFromChapter",async(input)=>{assert.equal(input.signal,state.controller.signal);return {events:[],hooks:[]};});
  replace(t,timelineCheckerService,"checkChapter",()=>({status:"passed",score:1,issues:[]}));
  replace(t,prisma.timelineCheckReport,"create",async()=>{throw new Error("report must be committed with source transaction");});
  const result=await new ChapterTimelineFinalizationService().extractAndCheck({...state.input,chapterIndex:1,novelTitle:"书",chapterTitle:"章",chapterGoal:"启程",timelineContext:state.gate.timelineContext});
  assert.equal(result.extractorSucceeded,true);assert.equal(result.sourceContentHash,buildContentHash(state.input.content));
  assert.deepEqual(state.committed,[]);
});

test("timeline gate normalization preserves existing source proof without inventing one",()=>{
  const {normalizeTimelineGateResult}=require("../dist/services/novel/runtime/chapterRuntimePackageBuilders.js");
  const report={status:"passed",score:1,issues:[]};
  const sourceContentHash=buildContentHash("正文");
  assert.equal(normalizeTimelineGateResult({result:report,sourceContentHash},null).sourceContentHash,sourceContentHash);
  assert.equal(normalizeTimelineGateResult(report,null).sourceContentHash,undefined);
});
