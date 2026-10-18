// Статистика для адмін-панелі: хто запустив бота, хто користується, які адреси задано.
import { kyivNow } from "./format.js";

export { renderAdmin, renderLocked } from "./admin-page.js";

const DAY = 24 * 60 * 60 * 1000;
const QUEUES = [];
for (let queue = 1; queue <= 6; queue += 1) QUEUES.push(`${queue}.1`, `${queue}.2`);

export function summarize({ users = [], addresses = [], now = new Date() }) {
  const list = addresses.map(normalizeAddress);
  const byChat = new Map();
  for (const row of users) {
    const chatId = String(row.chat_id ?? "").trim();
    if (!chatId) continue;
    byChat.set(chatId, {
      chatId,
      name: [row.first_name, row.last_name].map((part) => String(part ?? "").trim()).filter(Boolean).join(" "),
      username: String(row.username ?? "").trim(),
      firstSeen: String(row.first_seen ?? ""),
      lastSeen: String(row.last_seen ?? ""),
      actions: Number(row.actions) || 0,
      blocked: Boolean(Number(row.blocked)),
      addresses: [],
    });
  }
  for (const row of list) {
    if (!row.chatId) continue;
    if (!byChat.has(row.chatId)) {
      byChat.set(row.chatId, { chatId: row.chatId, name: "", username: "", firstSeen: "", lastSeen: "", actions: 0, blocked: false, addresses: [] });
    }
    const person = byChat.get(row.chatId);
    person.addresses.push(row);
    if (row.createdAt && (!person.firstSeen || row.createdAt < person.firstSeen)) person.firstSeen = row.createdAt;
    if (row.createdAt && row.createdAt > person.lastSeen) person.lastSeen = row.createdAt;
  }
  const weekAgo = now.getTime() - 7 * DAY;
  const today = kyivNow(now).iso;
  const people = [...byChat.values()].map((person) => {
    const recent = time(person.lastSeen) >= weekAgo;
    return { ...person, addresses: person.addresses.sort(byPlace), status: person.blocked ? "blocked" : recent ? "active" : "idle" };
  });
  people.sort((left, right) => time(right.lastSeen) - time(left.lastSeen) || left.chatId.localeCompare(right.chatId));

  const cities = new Map();
  for (const row of list) {
    const key = row.city || "Без населеного пункту";
    if (!cities.has(key)) cities.set(key, []);
    cities.get(key).push(row);
  }
  const settlements = [...cities.entries()]
    .map(([city, items]) => ({
      city,
      users: new Set(items.map((item) => item.chatId).filter(Boolean)).size,
      addresses: items.length,
      items: items.sort(byPlace),
    }))
    .sort((left, right) => right.addresses - left.addresses || left.city.localeCompare(right.city, "uk"));

  const daily = [];
  for (let back = 13; back >= 0; back -= 1) {
    const iso = kyivNow(new Date(now.getTime() - back * DAY)).iso;
    daily.push({ iso, label: `${iso.slice(8, 10)}.${iso.slice(5, 7)}`, count: 0 });
  }
  for (const person of people) {
    const day = person.firstSeen ? kyivNow(new Date(person.firstSeen)).iso : "";
    const slot = daily.find((item) => item.iso === day);
    if (slot) slot.count += 1;
  }
  const queueCounts = new Map(QUEUES.map((queue) => [queue, 0]));
  let unknownQueue = 0;
  for (const row of list) {
    const key = `${row.queue}.${row.subqueue}`;
    if (queueCounts.has(key)) queueCounts.set(key, queueCounts.get(key) + 1);
    else unknownQueue += 1;
  }

  return {
    users: people.length,
    using: people.filter((person) => person.addresses.length && !person.blocked).length,
    active7: people.filter((person) => time(person.lastSeen) >= weekAgo).length,
    new7: people.filter((person) => time(person.firstSeen) >= weekAgo).length,
    newToday: people.filter((person) => person.firstSeen && kyivNow(new Date(person.firstSeen)).iso === today).length,
    blocked: people.filter((person) => person.blocked).length,
    addresses: list.length,
    settlements: settlements.length,
    muted: list.filter((row) => row.muted).length,
    daily,
    queues: QUEUES.map((queue) => ({ queue, count: queueCounts.get(queue) })),
    unknownQueue,
    cities: settlements,
    people,
  };
}

export function adminDigest(report, lastCheck = "") {
  return [
    "📊 <b>Адмін-панель</b>",
    "",
    `👥 Користувачів: <b>${report.users}</b> · нових за 7 днів: ${report.new7}`,
    `✅ Користуються: <b>${report.using}</b> · активні за 7 днів: ${report.active7}`,
    `📍 Адрес: <b>${report.addresses}</b> у ${report.settlements} ${plural(report.settlements, "населеному пункті", "населених пунктах", "населених пунктах")}`,
    `🚫 Заблокували бота: ${report.blocked}`,
    `🕐 Остання перевірка графіка: ${formatWhen(lastCheck) || "ще не було"}`,
    "",
    "Повна статистика й усі адреси на сторінці 👇",
  ].join("\n");
}

export function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function plural(count, one, few, many) {
  const n = Math.abs(Number(count)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function normalizeAddress(row) {
  return {
    id: Number(row.id) || 0,
    city: String(row.city ?? "").trim(),
    street: String(row.street ?? "").trim(),
    house: String(row.house ?? "").trim(),
    queue: Number(row.queue) || 0,
    subqueue: Number(row.subqueue) || 0,
    chatId: String(row.chat_id ?? row.chatId ?? "").trim(),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
    label: String(row.label ?? "").trim(),
    muted: Boolean(Number(row.muted)),
  };
}

function byPlace(left, right) {
  return left.city.localeCompare(right.city, "uk")
    || left.street.localeCompare(right.street, "uk")
    || left.house.localeCompare(right.house, "uk", { numeric: true });
}

function time(iso) {
  const value = Date.parse(iso || "");
  return Number.isNaN(value) ? 0 : value;
}
