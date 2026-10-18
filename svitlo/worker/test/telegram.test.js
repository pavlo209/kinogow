import assert from "node:assert/strict";
import test from "node:test";
import { createTelegram, deliver, EFFECTS } from "../src/telegram.js";
import { fakeTelegram } from "./helpers.js";

test("calls go to the configured API base with the bot token", async () => {
  const { calls, call } = await fakeTelegram(undefined, { TELEGRAM_API: "http://127.0.0.1:9999/" });
  const response = await call("getMe", {});
  assert.equal(response.ok, true);
  assert.equal(calls[0].url, "http://127.0.0.1:9999/botT/getMe");
});

test("a missing token never hits the network", async () => {
  const call = createTelegram({}, () => assert.fail("no fetch without token"));
  assert.equal((await call("getMe")).ok, false);
});

test("send uses HTML, hides link previews and adds the celebration effect", async () => {
  const { calls, call } = await fakeTelegram();
  const outcome = await deliver(call, "10", { text: "<b>Привіт</b>", markup: { inline_keyboard: [] }, effect: "celebrate" });
  assert.equal(outcome.ok, true);
  assert.equal(calls[0].method, "sendMessage");
  assert.equal(calls[0].payload.parse_mode, "HTML");
  assert.deepEqual(calls[0].payload.link_preview_options, { is_disabled: true });
  assert.equal(calls[0].payload.message_effect_id, EFFECTS.celebrate);
});

test("a rejected effect is retried without it", async () => {
  const { calls, call } = await fakeTelegram((method, payload) =>
    payload.message_effect_id ? { ok: false, error_code: 400, description: "Bad Request: EFFECT_ID_INVALID" } : { ok: true });
  const outcome = await deliver(call, "10", { text: "x", effect: "celebrate" });
  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].payload.message_effect_id, undefined);
});

test("edit updates in place and ignores 'message is not modified'", async () => {
  const { calls, call } = await fakeTelegram(() => ({ ok: false, error_code: 400, description: "Bad Request: message is not modified" }));
  const outcome = await deliver(call, "10", { text: "x", markup: { inline_keyboard: [] }, edit: true }, { messageId: 55 });
  assert.equal(outcome.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "editMessageText");
  assert.equal(calls[0].payload.message_id, 55);
});

test("a failed edit falls back to a new message; reply keyboards are never edits", async () => {
  const { calls, call } = await fakeTelegram((method) =>
    method === "editMessageText" ? { ok: false, error_code: 400, description: "message can't be edited" } : { ok: true });
  await deliver(call, "10", { text: "x", edit: true }, { messageId: 1 });
  assert.deepEqual(calls.map((item) => item.method), ["editMessageText", "sendMessage"]);
  calls.length = 0;
  await deliver(call, "10", { text: "x", markup: { keyboard: [] }, edit: true }, { messageId: 1 });
  assert.deepEqual(calls.map((item) => item.method), ["sendMessage"]);
});

test("blocked bots and flood limits are reported", async () => {
  const blocked = await fakeTelegram(() => ({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }));
  assert.equal((await deliver(blocked.call, "10", { text: "x" })).blocked, true);
  const flood = await fakeTelegram(() => ({ ok: false, error_code: 429, parameters: { retry_after: 7 } }));
  assert.equal((await deliver(flood.call, "10", { text: "x" })).retryAfter, 7);
});

test("several replies go out in order", async () => {
  const { calls, call } = await fakeTelegram();
  await deliver(call, "10", [{ text: "one" }, { text: "two" }]);
  assert.deepEqual(calls.map((item) => item.payload.text), ["one", "two"]);
});
