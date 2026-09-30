const test = require("node:test");
const assert = require("node:assert/strict");
const { HumanMessage } = require("@langchain/core/messages");
const { createAnthropicLLM } = require("../dist/llm/anthropicClient.js");
const { createOpenAIProtocolClient } = require("../dist/llm/protocols/OpenAIProtocolClient.js");
const { buildOpenAICompatibleDefaultHeaders, buildOpenAICompatibleFetch } = require("../dist/llm/factory.js");
const { resolveProviderReasoningBehavior } = require("../dist/llm/reasoning.js");
const { buildProviderModelHeaders, resolveModelsEndpoint, parseHiddenModels, filterHiddenModels, refreshProviderModelsWithFallback } = require("../dist/llm/modelCatalog.js");

test("custom authentication applies to actual Anthropic and OpenAI requests", async () => {
  const originalFetch = global.fetch;
  try {
    for (const authMode of ["bearer", "x-api-key", "none"]) {
      let headers;
      global.fetch = async (_url, init) => {
        headers = new Headers(init.headers);
        return new Response(JSON.stringify({ content: [{type:"text",text:"ok"}] }), {headers:{"content-type":"application/json"}});
      };
      await createAnthropicLLM({apiKey:"test-key", authMode, baseURL:"https://gateway.example/v1", model:"probe",temperature:0}).invoke([new HumanMessage("ok")]);
      assert.equal(headers.get("authorization"), authMode === "bearer" ? "Bearer test-key" : null);
      assert.equal(headers.get("x-api-key"), authMode === "x-api-key" ? "test-key" : null);
      assert.ok(headers.get("anthropic-version"));
      global.fetch = async (_url, init) => {
        headers = new Headers(init.headers);
        return new Response(JSON.stringify({id:"probe",object:"chat.completion",choices:[{message:{role:"assistant",content:"ok"},finish_reason:"stop",index:0}]}), {headers:{"content-type":"application/json"}});
      };
      const llm = createOpenAIProtocolClient({apiKey:"test-key",model:"probe",configuration:{baseURL:"https://gateway.example/v1",fetch:buildOpenAICompatibleFetch(authMode,"test-key") ?? global.fetch,defaultHeaders:buildOpenAICompatibleDefaultHeaders(authMode,"test-key")}}, "openai_compatible");
      await llm.invoke([new HumanMessage("ok")]);
      assert.equal(headers.get("authorization"), authMode === "bearer" ? "Bearer test-key" : null);
      assert.equal(headers.get("x-api-key"), authMode === "x-api-key" ? "test-key" : null);
      const modelHeaders = new Headers(buildProviderModelHeaders("custom_probe", "test-key", authMode));
      assert.equal(modelHeaders.get("authorization"), headers.get("authorization"));
      assert.equal(modelHeaders.get("x-api-key"), headers.get("x-api-key"));
    }
  } finally { global.fetch = originalFetch; }
});

test("catalog URL and missing endpoint preserve manual model without masking authentication failures", async () => {
  assert.equal(resolveModelsEndpoint("https://gateway.example/v1/models/?scope=all"), "https://gateway.example/v1/models?scope=all");
  const originalFetch=global.fetch; const visited=[];
  try {
    global.fetch=async (url)=>{visited.push(url);return new Response("absent",{status:404});};
    const result=await refreshProviderModelsWithFallback("custom_probe",undefined,"https://gateway.example",["manual"],"none");
    assert.deepEqual(result,{models:["manual"],catalogAvailable:false});
    assert.deepEqual(visited,["https://gateway.example/models","https://gateway.example/v1/models"]);
    visited.length=0;
    await refreshProviderModelsWithFallback("custom_probe",undefined,"https://gateway.example?scope=all",["manual"],"none");
    assert.deepEqual(visited,["https://gateway.example/models?scope=all","https://gateway.example/v1/models?scope=all"]);
    visited.length=0;
    await refreshProviderModelsWithFallback("custom_probe",undefined,"https://gateway.example/v1/models",["manual"],"none");
    assert.deepEqual(visited,["https://gateway.example/v1/models"]);
    global.fetch=async ()=>new Response("unauthorized",{status:401});
    await assert.rejects(refreshProviderModelsWithFallback("custom_probe",undefined,"https://gateway.example",["manual"]),/401/);
  } finally {global.fetch=originalFetch;}
});

test("hidden models protect current model and thinking effort only applies while enabled", () => {
  assert.deepEqual(parseHiddenModels('["a","a",null,"b"]'),["a","b"]);
  assert.deepEqual(filterHiddenModels(["a","b","c"],["a","b"],"a"),["a","c"]);
  for(const effort of ["low","high","max"]){
    const base={provider:"deepseek",model:"deepseek-v4-pro",reasoningEffort:effort};
    assert.equal(resolveProviderReasoningBehavior({...base,reasoningEnabled:true}).modelKwargs.reasoning_effort,effort);
    assert.equal(resolveProviderReasoningBehavior({...base,reasoningEnabled:false}).modelKwargs.reasoning_effort,undefined);
  }
});
