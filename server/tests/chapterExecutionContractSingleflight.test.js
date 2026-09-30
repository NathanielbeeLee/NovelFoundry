const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runChapterExecutionContractSingleflight,
} = require("../dist/services/novel/volume/ChapterExecutionContractService.js");

test("chapter execution contract shares one in-flight generation per chapter", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const work = async () => {
    calls += 1;
    await gate;
    return { taskSheet: "ready" };
  };

  const first = runChapterExecutionContractSingleflight("novel-1", "chapter-1", work);
  const second = runChapterExecutionContractSingleflight("novel-1", "chapter-1", work);
  release();

  assert.deepEqual(await Promise.all([first, second]), [{ taskSheet: "ready" }, { taskSheet: "ready" }]);
  assert.equal(calls, 1);
});

test("a rejected contract generation releases its flight for the next attempt", async () => {
  const failure = new Error("request cancelled");
  await assert.rejects(
    runChapterExecutionContractSingleflight("novel-2", "chapter-1", async () => { throw failure; }),
    (error) => error === failure,
  );
  assert.equal(await runChapterExecutionContractSingleflight(
    "novel-2", "chapter-1", async () => "recovered",
  ), "recovered");
});

test("contract singleflight keeps independent chapters and novels separate", async () => {
  const result = await Promise.all([
    runChapterExecutionContractSingleflight("novel-3", "chapter-1", async () => "first"),
    runChapterExecutionContractSingleflight("novel-3", "chapter-2", async () => "second"),
    runChapterExecutionContractSingleflight("novel-4", "chapter-1", async () => "third"),
  ]);
  assert.deepEqual(result, ["first", "second", "third"]);
});
