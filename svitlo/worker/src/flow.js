// Покрокове додавання й зміна адреси: населений пункт → вулиця → будинок.
import {
  cityAt,
  cityIndex,
  districtFor,
  groupsFor,
  places,
  streetAt,
  streetIndex,
  streets,
  suggestCities,
  suggestStreets,
  topCities,
} from "./catalog.js";
import { esc } from "./format.js";
import { correctPlace, looksLikeHouse, placeLabel } from "./match.js";
import * as T from "./texts.js";
import { BACK, CANCEL, MAX_ADDRESSES, card, clip, inline, ownTarget, pairs, reply, withNotes, withNotesResult } from "./views.js";

const HOUSE_TAIL = /^(.*?\S)[\s,]+(\d+\s?[a-zа-яіїєґ]?(?:[/-]\d+[a-zа-яіїєґ]?)?)$/iu;

export function startFlow(ctx, target, edit) {
  ctx.db.setDialog(ctx.chatId, "city", "", "", target);
  const popular = topCities(6).map((name) => ({ text: `🏙 ${name}`, callback_data: `pc:${cityIndex(name)}` }));
  return { text: T.stepCity(Boolean(target)), markup: inline([...pairs(popular), [CANCEL]]), edit };
}

function streetStep(ctx, city, target, edit, notes = []) {
  ctx.db.setDialog(ctx.chatId, "street", city, "", target);
  const text = withNotes(notes, T.stepStreet(esc(placeLabel(city, districtFor(city))), Boolean(target)));
  return { text, markup: inline([[BACK, CANCEL]]), edit };
}

function houseStep(ctx, city, street, target, edit, notes = []) {
  ctx.db.setDialog(ctx.chatId, "house", city, street, target);
  const text = withNotes(notes, T.stepHouse(`${esc(city)}, вулиця ${esc(street)}`, Boolean(target)));
  return { text, markup: inline([[BACK, CANCEL]]), edit };
}

export function onCity(ctx, line, target) {
  const city = resolveCity(line);
  if (city) return streetStep(ctx, city.name, target, false, [city.note]);
  return citySuggestions(ctx, line, target);
}

function citySuggestions(ctx, typed, target) {
  ctx.db.setDialog(ctx.chatId, "city", "", "", target);
  const names = suggestCities(typed, 6);
  if (!names.length) {
    const popular = topCities(6).map((name) => ({ text: `🏙 ${name}`, callback_data: `pc:${cityIndex(name)}` }));
    return {
      text: `😕 Населеного пункту «${esc(typed)}» немає в довіднику Волинської області.\nПеревірте назву або оберіть нижче 👇`,
      markup: inline([...pairs(popular), [CANCEL]]),
    };
  }
  const rows = names.map((name) => [{ text: `📍 ${clip(placeLabel(name, districtFor(name)), 48)}`, callback_data: `pc:${cityIndex(name)}` }]);
  return {
    text: `🤔 Не знайшов «${esc(typed)}» серед населених пунктів Волині.\nМожливо, ви мали на увазі 👇`,
    markup: inline([...rows, [CANCEL]]),
  };
}

export function onStreet(ctx, city, line, target) {
  const street = resolveStreet(city, line);
  if (street) return houseStep(ctx, city, street.name, target, false, [street.note]);
  const tail = line.match(HOUSE_TAIL);
  if (tail) {
    const withHouse = resolveStreet(city, tail[1]);
    if (withHouse) return saveHouse(ctx, city, withHouse.name, tail[2].replace(/\s+/g, ""), target, [withHouse.note]);
  }
  return streetSuggestions(ctx, city, line, target);
}

function streetSuggestions(ctx, city, typed, target) {
  ctx.db.setDialog(ctx.chatId, "street", city, "", target);
  const names = suggestStreets(city, typed, 8);
  const where = esc(placeLabel(city, districtFor(city)));
  if (!names.length) {
    return {
      text: `😕 ${where}: вулиці «${esc(typed)}» немає в довіднику.\nНапишіть назву без «вул.», наприклад <i>Лесі Українки</i>.`,
      markup: inline([[BACK, CANCEL]]),
    };
  }
  const cityAtIndex = cityIndex(city);
  const options = names.map((name) => ({ text: clip(name, 30), callback_data: `ps:${cityAtIndex}:${streetIndex(city, name)}` }));
  return {
    text: `🔎 ${where}: знайшов такі вулиці. Оберіть свою 👇`,
    markup: inline([...pairs(options), [BACK, CANCEL]]),
  };
}

export function pickCity(ctx, index) {
  const city = cityAt(index);
  if (!city) return reply(ctx, T.STALE_BUTTON);
  return streetStep(ctx, city, ownTarget(ctx, ctx.db.getDialog(ctx.chatId)), true);
}

export function pickStreet(ctx, cityPosition, streetPosition) {
  const city = cityAt(cityPosition);
  const street = city ? streetAt(city, streetPosition) : null;
  if (!street) return reply(ctx, T.STALE_BUTTON);
  return houseStep(ctx, city, street, ownTarget(ctx, ctx.db.getDialog(ctx.chatId)), true);
}

export function back(ctx) {
  const dialog = ctx.db.getDialog(ctx.chatId);
  const target = ownTarget(ctx, dialog);
  if (dialog?.step === "house") return streetStep(ctx, dialog.city, target, true);
  if (dialog?.step === "label" && target) return { ...card(ctx, ctx.db.getAddress(target)), edit: true };
  return startFlow(ctx, target, true);
}

export function submitAddress(ctx, cityText, streetText, house, target) {
  const city = resolveCity(cityText);
  if (!city) return citySuggestions(ctx, cityText, target);
  const street = resolveStreet(city.name, streetText);
  if (!street) return withNotesResult([city.note], streetSuggestions(ctx, city.name, streetText, target));
  return saveHouse(ctx, city.name, street.name, house, target, [city.note, street.note]);
}

export function saveHouse(ctx, city, street, house, target, notes) {
  const { db, chatId } = ctx;
  if (!looksLikeHouse(house)) {
    db.setDialog(chatId, "house", city, street, target);
    return { text: T.notHouse(esc(house)), markup: inline([[BACK, CANCEL]]) };
  }
  const hit = groupsFor(city, street, house);
  if (!hit.queues.length && hit.streetKnown) {
    db.setDialog(chatId, "house", city, street, target);
    const place = `${esc(placeLabel(city, districtFor(city)))}, вулиця «${esc(street)}»`;
    return { text: withNotes(notes, T.notInSchedule(place, esc(house), hit.notEnrolled)), markup: inline([[BACK, CANCEL]]) };
  }
  const existing = target ? null : db.findPlace(city, street, house, chatId);
  if (!target && !existing && db.listForChat(chatId).length >= MAX_ADDRESSES) {
    db.clearDialog(chatId);
    return reply(ctx, T.capReached(MAX_ADDRESSES));
  }
  const id = target ? db.updateAddress(target, city, street, house) : db.savePlace(city, street, house, chatId);
  if (hit.queues.length === 1) db.setQueue(id, hit.queues[0][0], hit.queues[0][1]);
  db.clearDialog(chatId);
  db.remember(id, ctx.schedule);
  let header = "🎉 <b>Адресу збережено!</b>";
  if (target) header = "✏️ <b>Адресу оновлено</b>";
  else if (existing) header = "ℹ️ <b>Ця адреса вже є у вашому списку</b>";
  const result = card(ctx, db.getAddress(id), withNotes(notes, header));
  if (!target && !existing) result.effect = "celebrate";
  return result;
}

function resolveCity(typed) {
  const corrected = correctPlace(typed, "", places(), (name) => streets(name));
  if (corrected.blocked) return null;
  return { name: corrected.city, note: corrected.note };
}

function resolveStreet(city, typed) {
  const corrected = correctPlace(city, typed, places(), (name) => streets(name));
  if (corrected.blocked) return null;
  return { name: corrected.street, note: corrected.note };
}
