import { SvitloBot } from "./bot.js";

export { SvitloBot };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/telegram" && request.method === "POST") {
      const provided = (request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "").trim();
      if (!env.WEBHOOK_SECRET || provided !== String(env.WEBHOOK_SECRET).trim()) {
        return new Response("forbidden", { status: 403 });
      }
      return stub(env).fetch("https://bot.internal/telegram", {
        method: "POST",
        body: await request.text(),
        headers: { "Content-Type": "application/json" },
      });
    }
    if (["/import", "/tick", "/setup", "/admin/link"].includes(url.pathname) && request.method === "POST") {
      const provided = (request.headers.get("X-Import-Secret") || "").trim();
      if (!env.IMPORT_SECRET || provided !== String(env.IMPORT_SECRET).trim()) {
        return new Response("forbidden", { status: 403 });
      }
      return stub(env).fetch(`https://bot.internal${url.pathname}`, {
        method: "POST",
        body: url.pathname === "/import" ? await request.text() : "{}",
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.pathname === "/health") return stub(env).fetch("https://bot.internal/health");
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/enter/")) {
      const headers = new Headers();
      const cookie = request.headers.get("Cookie");
      if (cookie) headers.set("Cookie", cookie);
      const key = url.pathname.startsWith("/admin/enter/")
        ? decodeURIComponent(url.pathname.slice("/admin/enter/".length))
        : (url.searchParams.get("k") || "");
      if (key) headers.set("X-Admin-Key", key);
      return stub(env).fetch("https://bot.internal/admin", { headers });
    }
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
