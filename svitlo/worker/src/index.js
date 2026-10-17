import { SvitloBot } from "./bot.js";

export { SvitloBot };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/telegram" && request.method === "POST") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      return stub(env).fetch("https://bot.internal/telegram", {
        method: "POST",
        body: await request.text(),
        headers: { "Content-Type": "application/json" },
      });
    }
    if ((url.pathname === "/import" || url.pathname === "/tick") && request.method === "POST") {
      if (request.headers.get("Authorization") !== `Bearer ${env.IMPORT_SECRET}`) {
        return new Response("forbidden", { status: 403 });
      }
      return stub(env).fetch(`https://bot.internal${url.pathname}`, {
        method: "POST",
        body: url.pathname === "/import" ? await request.text() : "{}",
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/health") return stub(env).fetch("https://bot.internal/health");
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Графік світла. Бот: https://t.me/volunsvitlo_bot", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(stub(env).fetch("https://bot.internal/tick", { method: "POST", body: "{}" }));
  },
};

function stub(env) {
  return env.BOT.get(env.BOT.idFromName("main"));
}
