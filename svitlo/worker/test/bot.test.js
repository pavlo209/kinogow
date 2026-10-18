import assert from "node:assert/strict";
import test from "node:test";
import { SvitloBot } from "../src/bot.js";
import { fakeTelegram, memorySql } from "./helpers.js";

const ADMIN = "505113365";
const NOW = new Date("2026-10-18T12:00:00Z");

async function makeBot(respond) {
  const telegram = await fakeTelegram(respond);
  const alarms = [];
  const ctx = {
    storage: { sql: memorySql(), setAlarm: async (time) => alarms.push(time) },
    blockConcurrencyWhile: (fn) => fn(),
  };
  const env = { TELEGRAM_TOKEN: "T", ADMIN_CHAT_ID: ADMIN, PUBLIC_URL: "https://bot.example" };
  const bot = new SvitloBot(ctx, env, { telegram: telegram.call });
  return { bot, calls: telegram.calls, alarms };
}

function seedSchedule(bot, ranges, iso = "2026-10-18", label = "18.10.2026") {
  const flags = new Array(48).fill(0);
  for (const [start, end] of ranges) {
    const from = Number(start.slice(0, 2)) * 2 + (start.endsWith("30") ? 1 : 0);
    const to = Number(end.slice(0, 2)) * 2 + (end.endsWith("30") ? 1 : 0);
    for (let slot = from; slot < to; slot += 1) flags[slot] = 1;
  }
  const slots = {};
  for (let queue = 1; queue <= 6; queue += 1) for (const sub of [1, 2]) slots[`${queue}.${sub}`] = flags;
  bot.store.metaSet("today_slots", JSON.stringify(slots));
  bot.store.metaSet("today_iso", iso);
  bot.store.metaSet("today_label", label);
}

const message = (chatId, text, extra = {}) => ({ message: { message_id: 1, chat: { id: Number(chatId) }, from: { id: Number(chatId), first_name: "Оля", username: "olya" }, text, ...extra } });
const tap = (chatId, data, messageId = 77) => ({ callback_query: { id: "cb1", data, from: { id: Number(chatId), first_name: "Оля" }, message: { message_id: messageId, chat: { id: Number(chatId) } } } });

test("a message registers the user and gets an HTML reply", async () => {
  const { bot, calls } = await makeBot();
  seedSchedule(bot, [["14:30", "18:00"]]);
  await bot.onUpdate(message("10", "Луцьк, Волі, 44а"), NOW);
  const user = bot.store.getUser("10");
  assert.equal(user.first_name, "Оля");
  assert.equal(user.username, "olya");
  const sent = calls.find((call) => call.method === "sendMessage");
  assert.equal(sent.payload.parse_mode, "HTML");
  assert.match(sent.payload.text, /Адресу збережено/);
  assert.ok(sent.payload.message_effect_id, "celebration effect on a new address");
});

test("/start sends the welcome with the menu and then step 1", async () => {
  const { bot, calls } = await makeBot();
  await bot.onUpdate(message("10", "/start"), NOW);
  const sends = calls.filter((call) => call.method === "sendMessage");
  assert.equal(sends.length, 2);
  assert.ok(sends[0].payload.reply_markup.keyboard);
  assert.match(sends[1].payload.text, /крок 1 з 3/);
});

test("a button tap answers with a toast and edits the message in place", async () => {
  const { bot, calls } = await makeBot();
  seedSchedule(bot, [["14:30", "18:00"]]);
  await bot.onUpdate(message("10", "Луцьк, Волі, 44а"), NOW);
  calls.length = 0;
  await bot.onUpdate(tap("10", "mute:1"), NOW);
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.match(calls[0].payload.text, /вимкнено/);
  assert.equal(calls[1].method, "editMessageText");
  assert.equal(calls[1].payload.message_id, 77);
  assert.equal(bot.store.getAddress(1).muted, 1);
});

test("the owner gets live numbers and a link; others are refused", async () => {
  const { bot, calls } = await makeBot();
  await bot.onUpdate(message("10", "Луцьк, Волі, 44а"), NOW);
  calls.length = 0;
  await bot.onUpdate(message(ADMIN, "📊 Адмін-панель"), NOW);
  assert.match(calls[0].payload.text, /Користувачів: <b>2<\/b>/);
  assert.match(calls[0].payload.reply_markup.inline_keyboard[0][0].url, /^https:\/\/bot\.example\/admin\/enter\/[0-9a-f]{48}$/);
  calls.length = 0;
  await bot.onUpdate(message("10", "/admin"), NOW);
  assert.match(calls[0].payload.text, /лише власнику/);
});

test("users who block the bot are marked, and come back when they write again", async () => {
  const { bot } = await makeBot((method) => (method === "sendMessage" ? { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" } : { ok: true }));
  await bot.onUpdate(message("10", "/help"), NOW);
  assert.equal(bot.store.getUser("10").blocked, 1);
  await bot.onUpdate({ my_chat_member: { chat: { id: 20 }, from: { id: 20 }, new_chat_member: { status: "kicked" } } }, NOW);
  assert.equal(bot.store.getUser("20").blocked, 1);
  await bot.onUpdate({ my_chat_member: { chat: { id: 20 }, from: { id: 20, first_name: "Іван" }, new_chat_member: { status: "member" } } }, NOW);
  assert.equal(bot.store.getUser("20").blocked, 0);
});

test("non-text messages get a friendly hint", async () => {
  const { bot, calls } = await makeBot();
  await bot.onUpdate({ message: { message_id: 1, chat: { id: 10 }, from: { id: 10 }, sticker: { emoji: "⚡" } } }, NOW);
  assert.match(calls[0].payload.text, /текстом/);
});

test("sync notifies each address once, skips muted ones and remembers state", async () => {
  const { bot, calls } = await makeBot();
  seedSchedule(bot, [["14:30", "18:00"]]);
  const loud = bot.store.savePlace("Луцьк", "Волі", "44а", "10");
  const quiet = bot.store.savePlace("Луцьк", "Соборності", "15", "20");
  bot.store.setMuted(quiet, true);
  bot.startSync(false);
  await bot.syncStep(NOW);
  const notices = calls.filter((call) => call.method === "sendMessage");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].payload.chat_id, "10");
  assert.match(notices[0].payload.text, /Графік на сьогодні/);
  assert.equal(notices[0].payload.reply_markup.inline_keyboard[0][0].callback_data, `show:${loud}`);
  assert.ok(bot.store.getState(quiet, "today"), "muted address still remembers the schedule");
  assert.equal(bot.phase, "");
  calls.length = 0;
  bot.startSync(false);
  await bot.syncStep(NOW);
  assert.equal(calls.length, 0, "nothing new, nothing sent");
  seedSchedule(bot, [["16:00", "20:00"]]);
  bot.startSync(false);
  await bot.syncStep(NOW);
  assert.match(calls[0].payload.text, /Графік змінився/);
});

test("sync backs off on flood limits without losing its place", async () => {
  let flood = true;
  const { bot, calls, alarms } = await makeBot((method) => {
    if (method === "sendMessage" && flood) return { ok: false, error_code: 429, parameters: { retry_after: 3 } };
    return { ok: true };
  });
  seedSchedule(bot, [["14:30", "18:00"]]);
  bot.store.savePlace("Луцьк", "Волі", "44а", "10");
  bot.startSync(false);
  await bot.syncStep(NOW);
  assert.equal(bot.phase, "sync");
  assert.ok(alarms.at(-1) >= NOW.getTime() + 3000);
  assert.equal(bot.store.getState(1, "today"), null);
  flood = false;
  await bot.syncStep(NOW);
  assert.ok(bot.store.getState(1, "today"));
  assert.equal(calls.filter((call) => call.method === "sendMessage").length, 2);
});

test("sync walks addresses in batches", async () => {
  const { bot, calls } = await makeBot();
  seedSchedule(bot, [["14:30", "18:00"]]);
  for (let index = 1; index <= 25; index += 1) bot.store.savePlace("Луцьк", "Волі", "44а", String(index));
  bot.startSync(false);
  await bot.syncStep(NOW);
  assert.equal(calls.length, 20);
  assert.equal(bot.phase, "sync");
  await bot.syncStep(NOW);
  assert.equal(calls.length, 25);
  assert.equal(bot.phase, "");
  assert.ok(bot.store.metaGet("last_check"));
});
