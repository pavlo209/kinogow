import { DatabaseSync } from "node:sqlite";

// Те саме API, що й ctx.storage.sql у Durable Object: exec(query, ...bindings).
export function memorySql() {
  const db = new DatabaseSync(":memory:");
  return {
    exec(query, ...bindings) {
      const rows = db.prepare(query).all(...bindings).map((row) => ({ ...row }));
      return {
        toArray: () => rows,
        one: () => {
          if (rows.length !== 1) throw new Error(`Expected one row, got ${rows.length}`);
          return rows[0];
        },
      };
    },
  };
}

// Telegram API без мережі: записує виклики й відповідає як respond(method, payload).
export async function fakeTelegram(respond = () => ({ ok: true, result: {} }), env = {}) {
  const { createTelegram } = await import("../src/telegram.js");
  const calls = [];
  const fetcher = async (url, init) => {
    const method = url.split("/").pop();
    const payload = JSON.parse(init.body);
    calls.push({ url, method, payload });
    return new Response(JSON.stringify(respond(method, payload, calls)), { headers: { "Content-Type": "application/json" } });
  };
  return { calls, call: createTelegram({ TELEGRAM_TOKEN: "T", ...env }, fetcher) };
}
