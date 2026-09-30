import test from "node:test";
import assert from "node:assert/strict";
import {
  getRequestProtocolLabel,
  getSharedSuccessfulRequestProtocol,
} from "./requestProtocolOptions.ts";

test("request protocol labels distinguish Responses from Chat Completions", () => {
  assert.equal(getRequestProtocolLabel("openai_responses"), "Responses API");
  assert.equal(getRequestProtocolLabel("openai_compatible"), "Chat Completions（OpenAI 兼容）");
});

test("auto detection adopts a protocol only when both probe modes pass on the same protocol", () => {
  assert.equal(getSharedSuccessfulRequestProtocol({
    plain: { ok: true, requestProtocol: "openai_responses" },
    structured: { ok: true, requestProtocol: "openai_responses" },
  }), "openai_responses");

  assert.equal(getSharedSuccessfulRequestProtocol({
    plain: { ok: true, requestProtocol: "openai_compatible" },
    structured: { ok: true, requestProtocol: "openai_responses" },
  }), null);

  assert.equal(getSharedSuccessfulRequestProtocol({
    plain: { ok: true, requestProtocol: "openai_responses" },
    structured: { ok: false, requestProtocol: "openai_responses" },
  }), null);
});
