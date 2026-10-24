import assert from "node:assert/strict";
import test from "node:test";
import { adminDigest, renderAdmin, renderLocked, summarize } from "../src/admin.js";

const NOW = new Date("2026-10-18T12:00:00Z");
const USERS = [
  { chat_id: "10", first_name: "Оля", last_name: "К", username: "olya", first_seen: "2026-10-18T08:00:00Z", last_seen: "2026-10-18T11:00:00Z", actions: 12, blocked: 0 },
  { chat_id: "20", first_name: "Іван", username: "", first_seen: "2026-10-01T08:00:00Z", last_seen: "2026-10-02T08:00:00Z", actions: 3, blocked: 0 },
  { chat_id: "30", first_name: "Петро", username: "petro", first_seen: "2026-10-15T08:00:00Z", last_seen: "2026-10-16T08:00:00Z", actions: 5, blocked: 1 },
  { chat_id: "40", first_name: "Без адрес", username: "", first_seen: "2026-10-17T08:00:00Z", last_seen: "2026-10-17T08:00:00Z", actions: 1, blocked: 0 },
];
const ADDRESSES = [
  { id: 1, city: "Луцьк", street: "Волі", house: "44а", queue: 2, subqueue: 2, chat_id: "10", created_at: "2026-10-18T08:05:00Z", label: "🏠 Дім", muted: 0 },
  { id: 2, city: "Луцьк", street: "Соборності", house: "15", queue: 4, subqueue: 2, chat_id: "10", created_at: "2026-10-18T08:10:00Z", label: "", muted: 1 },
  { id: 3, city: "Баїв", street: "Набережна", house: "21", queue: 1, subqueue: 2, chat_id: "20", created_at: "2026-10-01T08:10:00Z", label: "", muted: 0 },
  { id: 4, city: "Луцьк", street: "Волі", house: "1", queue: 2, subqueue: 2, chat_id: "30", created_at: "2026-10-15T08:10:00Z", label: "", muted: 0 },
  { id: 5, city: "Ковель", street: "Миру", house: "3", queue: 0, subqueue: 0, chat_id: "50", created_at: "2026-10-10T08:10:00Z", label: "", muted: 0 },
];

test("summary counts who started the bot, who uses it and who is active", () => {
  const report = summarize({ users: USERS, addresses: ADDRESSES, now: NOW });
  assert.equal(report.users, 5, "chat 50 has an address but no user row and still counts");
  assert.equal(report.using, 3, "chats 10, 20, 50 have addresses and did not block the bot");
  assert.equal(report.active7, 3, "10, 30 and 40 were seen in the last 7 days");
  assert.equal(report.new7, 3);
  assert.equal(report.newToday, 1);
  assert.equal(report.blocked, 1);
  assert.equal(report.addresses, 5);
  assert.equal(report.settlements, 3);
  assert.equal(report.muted, 1);
  assert.equal(report.cities[0].city, "Луцьк");
  assert.equal(report.cities[0].addresses, 3);
  assert.equal(report.cities[0].users, 2);
});

test("summary builds a 14-day signup chart and a queue chart", () => {
  const report = summarize({ users: USERS, addresses: ADDRESSES, now: NOW });
  assert.equal(report.daily.length, 14);
  assert.deepEqual(report.daily.at(-1), { iso: "2026-10-18", label: "18.10", count: 1 });
  assert.equal(report.daily.find((day) => day.iso === "2026-10-15").count, 1);
  assert.equal(report.queues.length, 12);
  assert.equal(report.queues.find((item) => item.queue === "2.2").count, 2);
  assert.equal(report.unknownQueue, 1);
});

test("people are listed by last activity with their addresses", () => {
  const report = summarize({ users: USERS, addresses: ADDRESSES, now: NOW });
  assert.equal(report.people[0].chatId, "10");
  assert.equal(report.people[0].addresses.length, 2);
  assert.equal(report.people[0].status, "active");
  assert.equal(report.people.find((person) => person.chatId === "30").status, "blocked");
  assert.equal(report.people.find((person) => person.chatId === "20").status, "idle");
});

test("admin page shows the key numbers and escapes everything", () => {
  const html = renderAdmin({
    users: [...USERS, { chat_id: "60", first_name: "</script><script>alert(1)</script>", first_seen: "2026-10-18T09:00:00Z", last_seen: "2026-10-18T09:00:00Z" }],
    addresses: [...ADDRESSES, { id: 9, city: "<Луцьк>", street: "Волі", house: "1", queue: 1, subqueue: 1, chat_id: "60", created_at: "", label: "", muted: 0 }],
    districtOf: (city) => (city === "Луцьк" ? "Луцький" : ""),
    lastCheck: "2026-10-18T11:55:00Z",
    now: NOW,
  });
  assert.equal(html.includes("<script>alert(1)"), false);
  assert.equal(html.includes("<Луцьк>"), false);
  assert.match(html, /&lt;Луцьк&gt;/);
  assert.match(html, /Луцький район/);
  assert.match(html, /data-kpi="users">6</);
  assert.match(html, /data-kpi="using">4</);
  assert.match(html, /@olya/);
  assert.match(html, /🏠 Дім/);
  assert.match(html, /prefers-color-scheme: dark/);
});

test("telegram digest for the owner is short and has the numbers", () => {
  const text = adminDigest(summarize({ users: USERS, addresses: ADDRESSES, now: NOW }), "2026-10-18T11:55:00Z");
  assert.match(text, /Користувачів: <b>5<\/b>/);
  assert.match(text, /Користуються: <b>3<\/b>/);
  assert.match(text, /Адрес: <b>5<\/b>/);
  assert.match(text, /Заблокували бота: 1/);
});

test("locked page explains how to get in", () => {
  assert.match(renderLocked(), /\/admin/);
});
