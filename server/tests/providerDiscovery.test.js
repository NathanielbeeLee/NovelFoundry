const test = require("node:test");
const assert = require("node:assert/strict");
const { Router } = require("express");

// Isolated in-memory persistence: never connect to a user's database or model service.
let provider;
const settings = new Map();
const same = (a, b) => a instanceof Date && b instanceof Date ? +a === +b : a === b;
const db = {
  aPIKey: {
    findUnique: async () => provider,
    findMany: async () => provider ? [provider] : [],
    update: async ({ data }) => (provider = { ...provider, ...data, updatedAt: new Date(+provider.updatedAt + 1) }),
    updateMany: async ({ where }) => ({ count: provider && Object.entries(where).every(([k, v]) => same(provider[k], v)) ? 1 : 0 }),
  },
  appSetting: {
    findUnique: async ({ where }) => settings.get(where.key) ?? null,
    findMany: async () => [],
    upsert: async ({ where, create, update }) => {
      const value = settings.has(where.key) ? { ...settings.get(where.key), ...update } : create;
      settings.set(where.key, value);
      return value;
    },
    deleteMany: async ({ where }) => {
      if (!where.value || settings.get(where.key)?.value === where.value) settings.delete(where.key);
      return { count: 1 };
    },
  },
  $transaction: async (callback) => callback(db),
  $executeRaw: async () => provider ? 1 : 0,
};
require.cache[require.resolve("../dist/db/prisma.js")] = { exports: { prisma: db } };
const storePath = require.resolve("../dist/services/settings/providers/infrastructure/ProviderDiscoveryStore.js");
const store = require(storePath);
const { resolveProviderDiscovery } = require("../dist/services/settings/providers/application/ProviderDiscoveryService.js");
const { buildCustomProviderStatus, saveProviderSettings } = require("../dist/services/settings/providers/application/ProviderSettingsService.js");
const { registerProviderSettingsRoutes } = require("../dist/services/settings/providers/http/providerSettingsRoutes.js");
const catalog = require("../dist/llm/modelCatalog.js");
const originalFetch = global.fetch;
const modelResponse = (...models) => new Response(JSON.stringify({ data: models.map(id => ({ id })) }), { headers: { "content-type": "application/json" } });

test.beforeEach(() => {
  settings.clear();
  provider = {
    provider: "custom_discovery", displayName: "Discovery", key: "secret-fixture", model: "manual",
    baseURL: "https://fixture.invalid/v1", authMode: "bearer", requestProtocol: "auto",
    createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-02"), hiddenModels: "[]",
    isActive: true, reasoningEnabled: true, reasoningEffort: null, concurrencyLimit: 0, requestIntervalMs: 0,
  };
  global.fetch = async () => { throw new Error("Unexpected remote request"); };
});
test.afterEach(() => { global.fetch = originalFetch; });

async function callRoute(path, method = "post") {
  const router = Router();
  registerProviderSettingsRoutes(router);
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  let result;
  let error;
  const res = { status: () => res, json: value => { result = value; } };
  await route.stack.at(-1).handle({ params: { provider: "custom_discovery" } }, res, e => { error = e; });
  if (error) throw error;
  return result;
}

test("discovery survives module reload and does not persist secrets or endpoint", async () => {
  assert.equal(await store.saveProviderDiscovery(provider, [" a ", "a", "b"], 100), true);
  const saved = [...settings.values()][0].value;
  assert.equal(saved.includes(provider.key), false);
  assert.equal(saved.includes(provider.baseURL), false);
  delete require.cache[storePath];
  const reloaded = require(storePath);
  assert.deepEqual((await reloaded.readProviderDiscovery(provider)).models, ["a", "b"]);
  for (const patch of [
    { provider: "custom_other" }, { key: "another-key" }, { baseURL: "https://other.invalid/v1" },
    { authMode: "none" }, { requestProtocol: "openai_responses" }, { createdAt: new Date("2026-10-03") },
  ]) assert.equal(await reloaded.readProviderDiscovery({ ...provider, ...patch }), null);
  assert.ok(await reloaded.readProviderDiscovery({ ...provider, model: "other-manual", updatedAt: new Date() }));
});

test("older completions and stale configuration cannot overwrite newer discovery", async () => {
  const record = provider;
  await store.saveProviderDiscovery(record, ["newer"], 200);
  assert.equal(await store.saveProviderDiscovery(record, ["older"], 100), false);
  assert.deepEqual((await resolveProviderDiscovery(record, 100, ["older"])).models, ["newer"]);
  provider = { ...record, baseURL: "https://changed.invalid", updatedAt: new Date(+record.updatedAt + 1) };
  assert.equal(await store.saveProviderDiscovery(record, ["stale"], 300), false);
  await assert.rejects(resolveProviderDiscovery(record, 300, ["stale"]), error => error.statusCode === 409);
  provider = null;
  assert.equal(await store.saveProviderDiscovery(record, ["deleted"], 400), false);
  await assert.rejects(resolveProviderDiscovery(record, 400), error => error.statusCode === 409);
});

test("GET settings merges history and manual selection while honoring hidden models", async () => {
  provider.hiddenModels = '["hidden","manual"]';
  await store.saveProviderDiscovery(provider, ["visible", "hidden"], 100);
  const response = await callRoute("/api-keys", "get");
  const item = response.data.find(item => item.provider === provider.provider);
  assert.deepEqual(item.models, ["visible", "manual"]);
  assert.ok(item.modelsDiscoveredAt);
  assert.equal("identity" in item, false);
  assert.deepEqual(buildCustomProviderStatus(provider).models, ["manual"]);
});

test("refresh persists remote models; 404 retains history without updating its timestamp", async () => {
  global.fetch = async () => modelResponse("remote", "hidden");
  provider.hiddenModels = '["hidden"]';
  const first = await callRoute("/api-keys/:provider/refresh-models");
  assert.deepEqual(first.data.models, ["remote", "manual"]);
  const saved = [...settings.values()][0].value;
  global.fetch = async () => new Response("absent", { status: 404 });
  const second = await callRoute("/api-keys/:provider/refresh-models");
  assert.deepEqual(second.data.models, ["remote", "manual"]);
  assert.equal(second.data.modelsDiscoveredAt, first.data.modelsDiscoveredAt);
  assert.equal([...settings.values()][0].value, saved);
  assert.match(second.message, /历史列表/);
  global.fetch = async () => new Response("unauthorized", { status: 401 });
  await assert.rejects(callRoute("/api-keys/:provider/refresh-models"), /401/);
  assert.equal([...settings.values()][0].value, saved);
});

test("configuration changed during pending refresh returns conflict without leaking old list", async () => {
  let complete;
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  global.fetch = () => new Promise(resolve => { complete = resolve; started(); });
  const response = callRoute("/api-keys/:provider/refresh-models");
  await waiting;
  provider = { ...provider, key: "rotated", updatedAt: new Date(+provider.updatedAt + 1) };
  complete(modelResponse("old-account-model"));
  await assert.rejects(response, error => error.statusCode === 409);
  assert.equal(settings.size, 0);
});

test("save with changed endpoint and failed discovery only returns manual model", async () => {
  await store.saveProviderDiscovery(provider, ["old-account-model"], 100);
  global.fetch = async () => new Response("unavailable", { status: 503 });
  const response = await saveProviderSettings(provider.provider, { baseURL: "https://new.invalid/v1" });
  assert.deepEqual(response.data.models, ["manual"]);
  assert.equal(response.data.modelsDiscoveredAt, null);
  assert.equal(await store.readProviderDiscovery(provider), null);
});

test("deleting an earlier provider incarnation cannot erase a recreated provider's discovery", async () => {
  const original = provider;
  await store.saveProviderDiscovery(original, ["old"], 100);
  provider = { ...provider, createdAt: new Date("2026-10-03"), updatedAt: new Date("2026-10-03") };
  await store.saveProviderDiscovery(provider, ["new"], 200);
  await store.deleteProviderDiscovery(original);
  assert.deepEqual((await store.readProviderDiscovery(provider)).models, ["new"]);
  await store.deleteProviderDiscovery(provider);
  assert.equal(settings.size, 0);
});

test("model cache is isolated by credentials and authentication mode", async () => {
  let calls = 0;
  global.fetch = async () => modelResponse(`remote-${++calls}`);
  const options = { baseURL: provider.baseURL, apiKey: "key-one", authMode: "bearer" };
  assert.deepEqual(await catalog.getProviderModels("custom_cache_identity", options), ["remote-1"]);
  assert.deepEqual(await catalog.getProviderModels("custom_cache_identity", { ...options, apiKey: "key-two" }), ["remote-2"]);
  assert.deepEqual(await catalog.getProviderModels("custom_cache_identity", { ...options, authMode: "x-api-key" }), ["remote-3"]);
  assert.deepEqual(await catalog.getProviderModels("custom_cache_identity", options), ["remote-1"]);
  assert.equal(calls, 3);
});

test("slower model refresh cannot replace a newer request's cache", async () => {
  const pending = [];
  global.fetch = () => new Promise(resolve => pending.push(resolve));
  const old = catalog.refreshProviderModels("custom_cache_order", "fixture-key", provider.baseURL);
  const recent = catalog.refreshProviderModels("custom_cache_order", "fixture-key", provider.baseURL);
  pending[1](modelResponse("new"));
  assert.deepEqual(await recent, ["new"]);
  pending[0](modelResponse("old"));
  assert.deepEqual(await old, ["new"]);
  assert.deepEqual(await catalog.getProviderModels("custom_cache_order", { apiKey: "fixture-key", baseURL: provider.baseURL }), ["new"]);
});
