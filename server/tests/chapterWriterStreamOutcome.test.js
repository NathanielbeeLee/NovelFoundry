const test = require("node:test");
const assert = require("node:assert/strict");
const runner = require("../dist/prompting/core/promptRunner.js");
const blocks = require("../dist/prompting/prompts/novel/context/chapterContextBlocks.js");
const resolution = require("../dist/prompting/context/promptContextResolution.js");
const { prisma } = require("../dist/db/prisma.js");
const { chapterLifecycleService } = require("../dist/services/novel/runtime/lifecycle/index.js");
const { ChapterWritingGraph } = require("../dist/services/novel/chapterWritingGraph.js");
const { StreamOutcomeError } = require("../dist/llm/streamOutcome/index.js");

async function harness(run) {
  const originals = [runner.streamTextPrompt, blocks.buildChapterWriterContextBlocks, resolution.resolvePromptContextBlocksForAsset, prisma.novel.findUnique, chapterLifecycleService.markChapterStatus];
  blocks.buildChapterWriterContextBlocks = () => [];
  resolution.resolvePromptContextBlocksForAsset = async () => ({ blocks: [] });
  prisma.novel.findUnique = async () => null;
  const saves = [], statuses = [], continuations = [];
  let continuityCalls = 0;
  chapterLifecycleService.markChapterStatus = async (...args) => { statuses.push(args); };
  const graph = new ChapterWritingGraph({ enforceOpeningDiversity: async () => { throw Error("unexpected"); }, saveDraftAndArtifacts: async (...args) => { saves.push(args); }, logInfo() {}, logWarn() {} });
  graph.continuityNode = async (_novel, _chapter, content) => { continuityCalls++; return content; };
  graph.enforceTargetLength = async (input) => { continuations.push(input); return input.content + "补足收尾"; };
  const input = { novelId: "n", novelTitle: "测试", chapter: { id: "c", order: 1, title: "章节" }, options: {}, contextPackage: { continuation: {}, chapterWriteContext: { chapterMission: { targetWordCount: 3000 } } } };
  try { await run({ graph, input, saves, statuses, continuations, continuityCalls: () => continuityCalls }); }
  finally { [runner.streamTextPrompt, blocks.buildChapterWriterContextBlocks, resolution.resolvePromptContextBlocksForAsset, prisma.novel.findUnique, chapterLifecycleService.markChapterStatus] = originals; }
}
function failedStream(kind, content = "部分正文") {
  const error = new StreamOutcomeError(kind, content);
  const complete = Promise.reject(error); void complete.catch(() => undefined);
  return { stream: { async *[Symbol.asyncIterator]() { yield { content }; throw error; } }, complete };
}
async function consume(handle) { let content = ""; for await (const chunk of handle.stream) content += chunk.content; return content; }

for (const kind of ["interrupted", "cancelled", "idle_timeout"]) {
  test(`${kind} keeps working draft but never calls continuity, continuation or successful save`, async () => harness(async ({ graph, input, saves, statuses, continuations, continuityCalls }) => {
    runner.streamTextPrompt = async (request) => { assert.equal(request.options.streamPolicy.requireTerminal, true); return failedStream(kind); };
    const handle = await graph.createChapterStream(input);
    await assert.rejects(consume(handle), error => error.kind === kind);
    await assert.rejects(handle.onDone("不应接受"), error => error.kind === kind);
    assert.equal(continuations.length, 0);
    assert.equal(continuityCalls(), 0);
    assert.equal(saves.length, 1);
    assert.equal(saves[0][2], "部分正文");
    assert.deepEqual(saves[0][4], { scheduleBackgroundSync: false, syncArtifacts: false });
    assert.equal(statuses.at(-1)[1], "needs_repair");
  }));
}

test("protocol output limit allows exactly one continuation and skips an additional length recovery", async () => harness(async ({ graph, input, continuations }) => {
  runner.streamTextPrompt = async () => failedStream("output_limit");
  const handle = await graph.createChapterStream(input);
  await consume(handle);
  const result = await handle.onDone("部分正文补足收尾");
  assert.equal(result.finalContent, "部分正文补足收尾");
  assert.equal(continuations.length, 1);
  assert.equal(continuations[0].reason, "output_limit");
}));

test("a second output limit saves combined partial content without another AI call", async () => harness(async ({ graph, input, saves }) => {
  let calls = 0;
  runner.streamTextPrompt = async () => failedStream("output_limit");
  graph.enforceTargetLength = async () => { calls++; throw new StreamOutcomeError("output_limit", "续写的一半"); };
  const handle = await graph.createChapterStream(input);
  await assert.rejects(consume(handle), error => error.kind === "output_limit");
  assert.equal(calls, 1);
  assert.equal(saves[0][2], "部分正文\n\n续写的一半");
}));

test("confirmed normal completion retains the original one-time length recovery", async () => harness(async ({ graph, input, continuations }) => {
  runner.streamTextPrompt = async () => ({ stream: { async *[Symbol.asyncIterator]() { yield { content: "完成正文" }; } }, complete: Promise.resolve({ output: "完成正文" }) });
  const handle = await graph.createChapterStream(input);
  await consume(handle);
  await handle.onDone("完成正文");
  assert.equal(continuations.length, 1);
  assert.equal(continuations[0].reason, undefined);
}));

test("consumer cancellation preserves only text blocks from Responses arrays", async () => harness(async ({ graph, input, saves, statuses }) => {
  const complete = new Promise(() => {});
  runner.streamTextPrompt = async () => ({ stream: { async *[Symbol.asyncIterator]() { yield { content: [{ type: "reasoning", text: "思考不入稿" }, { type: "text", text: "正文部分" }] }; } }, complete });
  const handle = await graph.createChapterStream(input);
  for await (const _chunk of handle.stream) break;
  assert.equal(saves[0][2], "正文部分");
  assert.equal(statuses.at(-1)[1], "needs_repair");
  await assert.rejects(handle.onDone(""), error => error.kind === "cancelled");
}));

test("continuity failure after complete stream preserves the full draft and leaves recovery status", async () => harness(async ({ graph, input, saves, statuses }) => {
  runner.streamTextPrompt = async () => ({ stream: { async *[Symbol.asyncIterator]() { yield { content: "完整初稿" }; } }, complete: Promise.resolve({ output: "完整初稿" }) });
  graph.continuityNode = async () => { throw new Error("continuity unavailable"); };
  const handle = await graph.createChapterStream(input);
  await consume(handle);
  await assert.rejects(handle.onDone("完整初稿"), /continuity unavailable/);
  assert.equal(saves.at(-1)[2], "完整初稿");
  assert.equal(statuses.at(-1)[1], "needs_repair");
}));

test("cancellation during continuity preserves its latest completed text rather than raw stream text", async () => harness(async ({ graph, input, saves }) => {
  runner.streamTextPrompt = async () => ({ stream: { async *[Symbol.asyncIterator]() { yield { content: "原始初稿" }; } }, complete: Promise.resolve({ output: "原始初稿" }) });
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  graph.continuityNode = async () => { started(); await new Promise(resolve => { release = resolve; }); return "完成连续性改写的正文"; };
  const handle = await graph.createChapterStream(input);
  await consume(handle);
  const done = handle.onDone("原始初稿");
  await entered;
  await handle.stream.cancel();
  assert.equal(saves.length, 0);
  release();
  await assert.rejects(done, error => error.kind === "cancelled");
  assert.equal(saves.at(-1)[2], "完成连续性改写的正文");
}));

test("disconnect after onDone saved an extended draft cannot overwrite it with the raw stream", async () => harness(async ({ graph, input, saves }) => {
  runner.streamTextPrompt = async () => ({ stream: { async *[Symbol.asyncIterator]() { yield { content: "原始初稿" }; } }, complete: Promise.resolve({ output: "原始初稿" }) });
  graph.continuityNode = async () => "改写正文";
  const handle = await graph.createChapterStream(input);
  await consume(handle);
  await handle.onDone("原始初稿");
  const count = saves.length;
  await handle.stream.cancel();
  assert.equal(saves.length, count);
  assert.equal(saves.at(-1)[2], "改写正文补足收尾");
}));

test("pre-finalization external cancellation still preserves a complete draft", async () => harness(async ({ graph, input, saves }) => {
  const controller = new AbortController(); input.options.signal = controller.signal;
  runner.streamTextPrompt = async () => ({ stream: { async *[Symbol.asyncIterator]() { yield { content: "完整正文" }; } }, complete: Promise.resolve({ output: "完整正文" }) });
  const handle = await graph.createChapterStream(input);
  await consume(handle);
  controller.abort(new Error("cancelled"));
  await assert.rejects(handle.onDone("完整正文"), /cancelled/);
  assert.equal(saves.at(-1)[2], "完整正文");
}));
