import { cityCount, places, topCities } from "./catalog.js";
import { back, onCity, onStreet, pickCity, pickStreet, saveHouse, startFlow, submitAddress } from "./flow.js";
import { addressTitle, esc, placeLine } from "./format.js";
import { cleanLine, parseAddressMessage, parseLooseAddress } from "./match.js";
import * as T from "./texts.js";
import { LABELS, MAX_ADDRESSES, addressList, card, inline, labelKeyboard, own, ownTarget, reply } from "./views.js";

export { groupsFor } from "./catalog.js";
export { mainKeyboard } from "./texts.js";
export { LABELS, MAX_ADDRESSES };

// Відповідь: { text, markup, edit?, toast?, effect? } або масив таких відповідей.
export function handleText(db, schedule, chatId, text, options = {}) {
  const ctx = context(db, schedule, chatId, options);
  const cleaned = String(text ?? "").trim();
  const action = buttonAction(cleaned);
  const command = commandOf(cleaned);
  if (command === "/start") return welcome(ctx, options.user);
  if (action === "help" || command === "/help") return reply(ctx, T.HELP);
  if (action === "add" || command === "/add") return startFlow(ctx, 0, false);
  if (action === "list" || command === "/list") return addressList(ctx, false);
  if (action === "where") return reply(ctx, T.coverage(topCities(12), cityCount()));
  if (action === "site") return reply(ctx, T.SITE);
  if (command === "/cancel") return cancel(ctx, false);
  if (command === "/remove") return removeLast(ctx);
  if (cleaned.startsWith("/")) return reply(ctx, T.HELP);

  const dialog = db.getDialog(chatId);
  if (dialog?.step === "label") return saveCustomLabel(ctx, dialog, cleaned);
  const target = ownTarget(ctx, dialog);
  const midFlow = dialog && (dialog.step === "street" || dialog.step === "house");
  const parsed = parseAddressMessage(cleaned) || (midFlow ? null : parseLooseAddress(cleaned, places().map((item) => item[0])));
  if (parsed) return submitAddress(ctx, parsed.city, withoutHouseSuffix(parsed.street, parsed.house), parsed.house, target);
  const line = cleanLine(cleaned);
  if (!line) return reply(ctx, T.HELP);
  if (dialog?.step === "street") return onStreet(ctx, dialog.city, line, target);
  if (dialog?.step === "house") return saveHouse(ctx, dialog.city, dialog.street, line.replace(/\s+/g, ""), target, []);
  return onCity(ctx, line, target);
}

export function handleCallback(db, schedule, chatId, data, options = {}) {
  const ctx = context(db, schedule, chatId, options);
  const [kind, first = "", second = ""] = String(data ?? "").split(":");
  if (kind === "add") return startFlow(ctx, 0, true);
  if (kind === "list" || kind === "delno") return addressList(ctx, true);
  if (kind === "cancel") return cancel(ctx, true);
  if (kind === "back") return back(ctx);
  if (kind === "pc") return pickCity(ctx, first);
  if (kind === "ps") return pickStreet(ctx, first, second);
  const address = ["open", "show", "edit", "name", "lbl", "mute", "del", "delyes"].includes(kind) ? own(ctx, first) : null;
  if (!address) return kind === "open" || kind === "show" || first ? reply(ctx, T.GONE) : reply(ctx, T.STALE_BUTTON);
  if (kind === "open") return { ...card(ctx, address), edit: true, toast: "🔄 Оновлено" };
  if (kind === "show") return card(ctx, address);
  if (kind === "edit") return startFlow(ctx, Number(address.id), true);
  if (kind === "name") {
    db.setDialog(chatId, "label", "", "", Number(address.id));
    return { text: T.labelPrompt(addressTitle(address)), markup: labelKeyboard(address), edit: true };
  }
  if (kind === "lbl") {
    const label = second === "x" ? "" : LABELS[Number(second)] ?? "";
    db.setLabel(address.id, label);
    db.clearDialog(chatId);
    return { ...card(ctx, db.getAddress(address.id)), edit: true, toast: label ? "🏷 Назву збережено" : "🏷 Назву прибрано" };
  }
  if (kind === "mute") {
    const muted = !Number(address.muted);
    db.setMuted(address.id, muted);
    return { ...card(ctx, db.getAddress(address.id)), edit: true, toast: muted ? "🔕 Сповіщення вимкнено" : "🔔 Сповіщення увімкнено" };
  }
  if (kind === "del") {
    return {
      text: T.deletePrompt(addressTitle(address)),
      markup: inline([
        [{ text: "✅ Так, видалити", callback_data: `delyes:${address.id}` }],
        [{ text: "↩️ Ні, залишити", callback_data: `open:${address.id}` }],
      ]),
      edit: true,
    };
  }
  db.deleteAddress(address.id);
  return { ...addressList(ctx, true), toast: "🗑 Видалено" };
}

export function buttonAction(text) {
  const key = String(text ?? "").replace(/^[^\p{L}]+/u, "").trim().toLowerCase();
  return T.BUTTON_ALIASES.get(key) ?? null;
}

export function isAdminRequest(text) {
  return commandOf(text) === "/admin" || buttonAction(text) === "admin";
}

function context(db, schedule, chatId, options) {
  return { db, schedule, chatId: String(chatId), admin: Boolean(options.admin), now: options.now ?? new Date() };
}

function welcome(ctx, user) {
  const name = user?.first_name ? `, ${esc(cleanLine(user.first_name))}` : "";
  if (ctx.db.listForChat(ctx.chatId).length) {
    return [reply(ctx, T.welcomeBack(name)), addressList(ctx, false)];
  }
  return [reply(ctx, T.welcomeNew(name)), startFlow(ctx, 0, false)];
}

function cancel(ctx, edit) {
  ctx.db.clearDialog(ctx.chatId);
  return edit ? { text: T.CANCELLED, edit: true } : reply(ctx, T.CANCELLED);
}

function saveCustomLabel(ctx, dialog, text) {
  const address = own(ctx, dialog.target_id);
  ctx.db.clearDialog(ctx.chatId);
  if (!address) return reply(ctx, T.GONE);
  const label = [...cleanLine(text)].slice(0, 24).join("");
  if (!label) return { ...card(ctx, address) };
  ctx.db.setLabel(address.id, label);
  return card(ctx, ctx.db.getAddress(address.id), "🏷 <b>Назву збережено</b>");
}

function removeLast(ctx) {
  const removed = ctx.db.deleteLastForChat(ctx.chatId);
  if (!removed) return reply(ctx, T.EMPTY_LIST);
  return reply(ctx, `🗑 Прибрав адресу ${esc(placeLine(removed))}.`);
}

function commandOf(text) {
  const cleaned = String(text ?? "").trim();
  return cleaned.startsWith("/") ? cleaned.split(/\s+/)[0].toLowerCase().split("@")[0] : "";
}

function withoutHouseSuffix(street, house) {
  const suffix = ` ${house}`.toLowerCase();
  if (street.toLowerCase().endsWith(suffix)) return street.slice(0, -suffix.length).trim();
  return street;
}
