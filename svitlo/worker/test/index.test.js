import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

function envWith(seen) {
  const stub = { fetch: async (url, init = {}) => { seen.push({ url: String(url), method: init.method || "GET" }); return new Response("ok"); } };
  return { WEBHOOK_SECRET: "hook", IMPORT_SECRET: "imp", BOT: { idFromName: () => "id", get: () => stub } };
}

test("telegram webhook needs the secret header", async () => {
  const seen = [];
  const env = envWith(seen);
  const denied = await worker.fetch(new Request("https://x/telegram", { method: "POST", body: "{}" }), env);
  assert.equal(denied.status, 403);
  const allowed = await worker.fetch(new Request("https://x/telegram", { method: "POST", body: "{}", headers: { "X-Telegram-Bot-Api-Secret-Token": "hook" } }), env);
  assert.equal(allowed.status, 200);
  assert.equal(seen[0].url, "https://bot.internal/telegram");
});

test("setup, tick and import need the import secret", async () => {
  for (const path of ["/setup", "/tick", "/import"]) {
    const seen = [];
    const env = envWith(seen);
    const denied = await worker.fetch(new Request(`https://x${path}`, { method: "POST", body: "{}" }), env);
    assert.equal(denied.status, 403, path);
    const allowed = await worker.fetch(new Request(`https://x${path}`, { method: "POST", body: "{}", headers: { "X-Import-Secret": "imp" } }), env);
    assert.equal(allowed.status, 200, path);
    assert.equal(seen[0].url, `https://bot.internal${path}`);
  }
});
