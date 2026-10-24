// Як виглядають картка адреси, список адрес і клавіатури під ними.
import { districtFor, groupsFor } from "./catalog.js";
import { addressCard, esc, kyivNow, placeLine, splitLabel, toMinutes } from "./format.js";
import * as T from "./texts.js";

export const MAX_ADDRESSES = 10;
export const LABELS = ["🏠 Дім", "🏢 Робота", "👵 Батьки", "🏡 Дача", "🏫 Навчання", "🏪 Бізнес"];
export const CANCEL = { text: "✖️ Скасувати", callback_data: "cancel" };
export const BACK = { text: "⬅️ Назад", callback_data: "back" };

export function card(ctx, address, header = "") {
  const text = addressCard({
    address,
    district: districtFor(address.city),
    groups: groupsOf(address),
    today: ctx.schedule.today,
    tomorrow: ctx.schedule.tomorrow,
    now: ctx.now,
  });
  return { text: header ? `${header}\n\n${text}` : text, markup: cardKeyboard(address) };
}

export function cardKeyboard(address) {
  const id = address.id;
  return inline([
    [
      { text: "🔄 Оновити", callback_data: `open:${id}` },
      { text: "✏️ Змінити", callback_data: `edit:${id}` },
      { text: "🏷 Назва", callback_data: `name:${id}` },
    ],
    [{ text: Number(address.muted) ? "🔔 Увімкнути сповіщення" : "🔕 Вимкнути сповіщення", callback_data: `mute:${id}` }],
    [
      { text: "🗑 Видалити", callback_data: `del:${id}` },
      { text: "📋 Мої адреси", callback_data: "list" },
    ],
  ]);
}

export function labelKeyboard(address) {
  const presets = LABELS.map((label, index) => ({ text: label, callback_data: `lbl:${address.id}:${index}` }));
  const rows = [];
  for (let index = 0; index < presets.length; index += 3) rows.push(presets.slice(index, index + 3));
  rows.push([
    { text: "🚫 Без назви", callback_data: `lbl:${address.id}:x` },
    { text: "↩️ Назад", callback_data: `open:${address.id}` },
  ]);
  return inline(rows);
}

export function addressList(ctx, edit) {
  const rows = ctx.db.listForChat(ctx.chatId);
  const add = { text: T.MENU.add, callback_data: "add" };
  if (!rows.length) return { text: T.EMPTY_LIST, markup: inline([[add]]), edit };
  const lines = [`📋 <b>Ваші адреси</b> · ${rows.length} з ${MAX_ADDRESSES}`, ""];
  rows.forEach((row, index) => {
    lines.push(`${index + 1}. ${shortTitle(row)}`, `      ${shortStatus(ctx, row)}`);
  });
  lines.push("", "Натисніть адресу, щоб відкрити графік 👇");
  const buttons = rows.map((row) => [{ text: clip(buttonLabel(row), 60), callback_data: `open:${row.id}` }]);
  if (rows.length < MAX_ADDRESSES) buttons.push([add]);
  return { text: lines.join("\n"), markup: inline(buttons), edit };
}

export function shortTitle(row) {
  if (!String(row.label ?? "").trim()) return `📍 <b>${esc(placeLine(row))}</b>`;
  const [icon, name] = splitLabel(row.label);
  return `${icon} <b>${esc(name)}</b> · ${esc(placeLine(row))}`;
}

export function buttonLabel(row) {
  const place = placeLine(row);
  if (!String(row.label ?? "").trim()) return `📍 ${place}`;
  const [icon, name] = splitLabel(row.label);
  return `${icon} ${name} · ${[row.street, row.house].filter(Boolean).join(", ")}`;
}

export function shortStatus(ctx, row) {
  const groups = groupsOf(row);
  const mute = Number(row.muted) ? " · 🔕" : "";
  if (!groups.length) return `❔ чергу не визначено${mute}`;
  if (groups.length > 1) return `⚡ черги ${groups.map(([queue, subqueue]) => `${queue}.${subqueue}`).join(", ")}${mute}`;
  const [queue, subqueue] = groups[0];
  const today = ctx.schedule.today;
  const clock = kyivNow(ctx.now);
  let status = "графік на сьогодні ще не опубліковано";
  if (today && today.iso === clock.iso) status = liveStatus(safeRanges(today, queue, subqueue), clock.minutes);
  return `⚡ ${queue}.${subqueue} · ${status}${mute}`;
}

export function liveStatus(ranges, minute) {
  for (const [start, end] of ranges) {
    if (minute >= toMinutes(start) && minute < toMinutes(end)) return `🔴 зараз без світла до ${end}`;
    if (toMinutes(start) > minute) return `🟢 світло є, вимкнуть о ${start}`;
  }
  return "🟢 світло є, сьогодні без відключень";
}

export function groupsOf(address) {
  const hit = groupsFor(address.city, address.street, address.house);
  if (hit.queues.length) return hit.queues;
  return Number(address.queue) > 0 ? [[Number(address.queue), Number(address.subqueue)]] : [];
}

export function own(ctx, id) {
  const address = ctx.db.getAddress(Number(id));
  return address && String(address.chat_id) === ctx.chatId ? address : null;
}

export function ownTarget(ctx, dialog) {
  const target = Number(dialog?.target_id) || 0;
  return target && own(ctx, target) ? target : 0;
}

export function safeRanges(chart, queue, subqueue) {
  try {
    return chart.ranges(queue, subqueue);
  } catch {
    return [];
  }
}

export function withNotes(notes, text) {
  const shown = notes.map((note) => String(note ?? "").trim()).filter(Boolean).map((note) => `✏️ ${esc(note)}`);
  return shown.length ? `${shown.join("\n")}\n\n${text}` : text;
}

export function withNotesResult(notes, result) {
  return { ...result, text: withNotes(notes, result.text) };
}

export function pairs(items) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return rows;
}

export function inline(rows) {
  return { inline_keyboard: rows };
}

export function reply(ctx, text) {
  return { text, markup: T.mainKeyboard(ctx.admin) };
}

export function clip(value, size) {
  const text = String(value ?? "").trim();
  return text.length > size ? `${text.slice(0, size - 1)}…` : text;
}
