import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getSyncDiagnosticsViewState } from "../src/pages/novels/components/chapterEditor/syncDiagnostics/viewState.ts";

const source = readFileSync(new URL("../src/pages/novels/components/chapterEditor/syncDiagnostics/ChapterSyncDiagnosticsView.tsx", import.meta.url), "utf8");
const buttonModule = `data:text/javascript;base64,${Buffer.from(`import {createElement} from ${JSON.stringify(import.meta.resolve("react"))}; export const Button = ({variant,size,...props}) => createElement("button",props);`).toString("base64")}`;
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replaceAll('"@/components/ui/button"', JSON.stringify(buttonModule));
const { default: View } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

const data = {
  novelId: "novel", chapterId: "chapter", checkedAt: "2026-10-29T10:00:00.000Z",
  source: { chapterUpdatedAt: "2026-10-29T09:00:00.000Z", contentHash: "never-display-hash", hasContent: true },
  consistency: "consistent",
  items: [{ key: "summary", status: "current", detail: "摘要对应已保存正文。", updatedAt: null, matchesCurrentSource: true }],
};
const input = {
  novelId: "novel", chapterId: "chapter", chapterUpdatedAt: data.source.chapterUpdatedAt,
  isSaving: false, isPending: false, isFetching: false, isError: false, data,
};
const render = (props) => renderToStaticMarkup(React.createElement(View, { data, isDirty: false, onRefresh() {}, ...props }));

test("only a successful consistent read for the loaded chapter version is ready", () => {
  assert.equal(getSyncDiagnosticsViewState(input), "ready");
  for (const patch of [
    { chapterId: "another" }, { novelId: "another" },
    { chapterUpdatedAt: "2026-10-29T09:01:00.000Z" },
    { data: { ...data, consistency: "changed_during_read" } },
  ]) assert.equal(getSyncDiagnosticsViewState({ ...input, ...patch }), "changed");
});

test("cached success is suppressed throughout save, refresh, failure and missing evidence", () => {
  for (const [patch, expected] of [
    [{ isSaving: true }, "saving"], [{ isPending: true }, "loading"],
    [{ isFetching: true }, "loading"], [{ isError: true }, "error"],
    [{ data: undefined }, "error"],
    [{ hasSaveConflict: true }, "conflict"],
  ]) {
    const state = getSyncDiagnosticsViewState({ ...input, ...patch });
    assert.equal(state, expected);
    const html = render({ state });
    assert.doesNotMatch(html, /摘要对应已保存正文/);
  }
  assert.doesNotMatch(render({ state: "changed" }), /摘要对应已保存正文/);
});

test("ready view labels all states, excludes draft edits and exposes no hashes or repair action", () => {
  const statuses = ["current", "running", "queued", "failed", "stale", "degraded", "unknown", "not_applicable"];
  const labels = ["对应已保存正文", "处理中", "等待处理", "处理失败", "待更新", "部分完成", "待确认", "无需处理"];
  for (let i = 0; i < statuses.length; i++) {
    const html = render({ state: "ready", isDirty: true, data: { ...data, items: [{ ...data.items[0], status: statuses[i] }] } });
    assert.ok(html.includes(labels[i]));
    assert.match(html, /未保存的修改不包含在此结果中/);
    assert.match(html, /刷新仅查看状态/);
    assert.doesNotMatch(html, /never-display-hash|补跑|重新生成|修复/);
    assert.equal((html.match(/<button/g) ?? []).length, 1);
  }
});

test("diagnostic API uses cancellable GET and rejects unsuccessful or absent evidence", async () => {
  const stub = `data:text/javascript;base64,${Buffer.from(`export const state = {calls:[],response:null}; export const apiClient = { get: async (...args) => { state.calls.push(args); return {data:state.response}; } };`).toString("base64")}`;
  const apiSource = readFileSync(new URL("../src/api/novel/chapters.ts", import.meta.url), "utf8");
  const apiCode = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replaceAll('"../client"', JSON.stringify(stub));
  const { getChapterSyncDiagnostics } = await import(`data:text/javascript;base64,${Buffer.from(apiCode).toString("base64")}`);
  const { state } = await import(stub);
  const signal = new AbortController().signal;
  state.response = { success: true, data };
  assert.deepEqual(await getChapterSyncDiagnostics("novel", "chapter", signal), data);
  assert.deepEqual(state.calls, [["/novels/novel/chapters/chapter/sync-diagnostics", { signal }]]);
  for (const response of [{ success: false, data }, { success: true }]) {
    state.response = response;
    await assert.rejects(getChapterSyncDiagnostics("novel", "chapter"));
  }
});
