const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { registerNovelBackupRoutes } = require("../dist/modules/novel/export/http/novelBackupRoutes.js");

async function fixture(t, services) {
  const app = express();
  // Mirrors the app's ordinary JSON parser, without starting the app or any workers.
  app.use(express.json({limit:"20mb"}));
  const router = express.Router();
  registerNovelBackupRoutes(router, services);
  app.use("/novels",router);
  app.use((error,_req,res,_next)=>res.status(error.statusCode || (error.name==="ZodError"?400:500)).json({error:error.message}));
  const server=app.listen(0,"127.0.0.1");
  await new Promise(resolve=>server.once("listening",resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/novels`;
}

test("backup preflight rejects ordinary JSON/invalid bytes before calling domain services",async(t)=>{
  let calls=0;
  const base=await fixture(t,{previewNovelBackup:()=>{calls++;},exportNovelBackup:async()=>{},restoreNovelBackup:async()=>{calls++;}});
  for(const [type,body] of [["application/json","{}"],["application/octet-stream","not-json"],["application/octet-stream",""]]){
    const response=await fetch(`${base}/backup/preview`,{method:"POST",headers:{"Content-Type":type},body});
    assert.equal(response.status,400);
  }
  assert.equal(calls,0);
});

test("backup routes bind restore to preview digest and retry identity, with no-store responses",async(t)=>{
  const archive={format:"test",tables:{}};
  const digest="a".repeat(64);
  const requestId="8781d87b-a96b-4000-8333-ad33604e0c81";
  const writes=[];
  const base=await fixture(t,{
    exportNovelBackup:async(id)=>{assert.equal(id,"novel-a");return archive;},
    previewNovelBackup:(data)=>{assert.deepEqual(data,archive);return {title:"测试",digest};},
    restoreNovelBackup:async(data,options)=>{writes.push({data,options});return {novelId:"fresh",title:options.title,warnings:[]};},
  });
  const exported=await fetch(`${base}/novel-a/backup`);
  assert.equal(exported.headers.get("cache-control"),"no-store");
  assert.match(exported.headers.get("content-disposition"),/attachment/);
  assert.deepEqual(await exported.json(),archive);
  const options={method:"POST",headers:{"Content-Type":"application/octet-stream"},body:JSON.stringify(archive)};
  const preview=await fetch(`${base}/backup/preview`,options);
  assert.equal((await preview.json()).data.digest,digest);
  const invalid=await fetch(`${base}/backup/restore?title=副本&digest=bad&requestId=${requestId}`,options);
  assert.equal(invalid.status,400);assert.equal(writes.length,0);
  const params=new URLSearchParams({title:"副本",digest,requestId});
  const restored=await fetch(`${base}/backup/restore?${params}`,options);
  assert.equal(restored.status,201);
  assert.equal((await restored.json()).data.novelId,"fresh");
  assert.deepEqual(writes,[{data:archive,options:{title:"副本",expectedDigest:digest,requestId}}]);
});
