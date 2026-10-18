const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildContentHash } = require("../dist/services/novel/artifacts/domain/ChapterSourceIdentity.js");

function snapshot(id, chapterOrder, createdAt, overrides = {}) {
  const content = `正文：${id}`;
  return {
    id,
    novelId: "novel-1",
    sourceContentHash: buildContentHash(content),
    sourceChapter: chapterOrder === null ? null : { order: chapterOrder, content },
    createdAt,
    ...overrides,
  };
}

function fixture(rows) {
  const calls = [];
  const prisma = { storyStateSnapshot: { async findMany(query) {
    calls.push(query);
    const boundary = query.where.sourceChapter?.is?.order?.lt;
    return rows
      .filter(row => row.novelId === query.where.novelId)
      .filter(row => boundary === undefined || (row.sourceChapter && row.sourceChapter.order < boundary))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, query.take);
  } } };
  const stubs = {
    "services/novel/artifacts/persistence.js": { artifactPrisma: prisma, buildContentHash },
    "services/novel/novelP0Utils.js": {},
    "services/payoff/PayoffLedgerSyncService.js": {},
    "services/state/OpenConflictService.js": {},
    "services/state/stateSnapshotExtraction.js": {},
    "services/state/stateConflictDetection.js": {},
  };
  const servicePath = require.resolve("../dist/services/state/StateService.js");
  const saved = new Map([[servicePath, require.cache[servicePath]]]);
  try {
    for (const [relativePath, exports] of Object.entries(stubs)) {
      const resolved = require.resolve(path.join(__dirname, "../dist", relativePath));
      saved.set(resolved, require.cache[resolved]);
      require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
    }
    delete require.cache[servicePath];
    const { StateService } = require(servicePath);
    return { service: new StateService(), calls };
  } finally {
    // The fast runner shares a process with other suites; leave no mock modules behind.
    for (const [resolved, previous] of saved) {
      if (previous) require.cache[resolved] = previous;
      else delete require.cache[resolved];
    }
  }
}

test("early-chapter state survives more than 50 snapshots from later chapters", async () => {
  const previous = snapshot("prior", 1, 1);
  const future = Array.from({ length: 60 }, (_, index) => snapshot(`future-${index}`, index + 3, index + 2));
  const { service, calls } = fixture([previous, ...future]);

  assert.equal((await service.getLatestSnapshotBeforeChapter("novel-1", 2))?.id, previous.id);
  assert.deepEqual(calls[0].where.sourceChapter, { is: { order: { lt: 2 } } });
  assert.deepEqual(calls[0].orderBy, { createdAt: "desc" });
  assert.equal(calls[0].take, 50);
});

test("chapter-state boundary excludes current, future, orphaned and other-book snapshots", async () => {
  const { service } = fixture([
    snapshot("prior", 3, 1),
    snapshot("current", 4, 10),
    snapshot("future", 5, 20),
    snapshot("orphaned", null, 30),
    snapshot("other-book", 2, 40, { novelId: "novel-2" }),
  ]);

  assert.equal((await service.getLatestSnapshotBeforeChapter("novel-1", 4))?.id, "prior");
  assert.equal(await service.getLatestSnapshotBeforeChapter("novel-1", 1), null);
  assert.equal(await service.getLatestSnapshotBeforeChapter("unknown-book", 4), null);
});

test("state lookup keeps source-hash validation and existing creation-time preference", async () => {
  const { service } = fixture([
    snapshot("nearest-chapter", 3, 1),
    snapshot("more-recent-extraction", 2, 2),
    snapshot("stale", 3, 3, { sourceContentHash: buildContentHash("旧正文") }),
    snapshot("legacy-unverified", 3, 4, { sourceContentHash: null }),
  ]);

  assert.equal((await service.getLatestSnapshotBeforeChapter("novel-1", 4))?.id, "more-recent-extraction");
  const staleOnly = fixture([snapshot("stale-only", 1, 1, { sourceContentHash: "outdated" })]);
  assert.equal(await staleOnly.service.getLatestSnapshotBeforeChapter("novel-1", 2), null);
});
