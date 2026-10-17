import { rowsFor, districtFor, places, streets, topCities, cityCount } from "./catalog.js";
import {
  buildReport,
  cleanLine,
  correctPlace,
  formatAddress,
  looksLikeHouse,
  matchStreet,
  parseAddressMessage,
  parseLooseAddress,
  placeLabel,
} from "./match.js";

const SITE = "https://energy.volyn.ua/spozhyvacham/perervy-u-elektropostachanni/hrafik-vidkliuchen/page.php#move";
const BUTTONS = new Map([
  ["додати адресу", "add"],
  ["мої адреси", "list"],
  ["де працює", "where"],
  ["як користуватись", "help"],
  ["сайт стеження", "site"],
]);

export const HELP = [
  "Надішліть адресу, і я пришлю графік на сьогодні й на завтра.",
  "",
  "Можна трьома рядками:",
  "Луцьк",
  "Лесі Українки",
  "15",
  "",
  "Або одним рядком: Луцьк, Лесі Українки, 15",
  "",
  "Назву пункту пишіть без «місто» і «село», вулицю без «вул.». Далі писатиму сюди, якщо години зміняться, відключень не буде або з’явиться графік на завтра.",
  "",
  "Команди: /list — збережені адреси, /remove — прибрати останню.",
].join("\n");

export function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "Додати адресу" }, { text: "Мої адреси" }],
      [{ text: "Де працює" }, { text: "Як користуватись" }],
      [{ text: "Сайт стеження" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function handleText(db, schedule, chatId, text) {
  const cleaned = String(text ?? "").trim();
  const action = BUTTONS.get(cleaned.toLowerCase());
  const command = cleaned.startsWith("/") ? cleaned.split(/\s+/)[0].toLowerCase().split("@")[0] : "";
  if (action === "help" || command === "/start" || command === "/help") {
    db.clearDialog(chatId);
    db.setDialog(chatId, "city");
    return reply(HELP);
  }
  if (action === "add") {
    db.setDialog(chatId, "city");
    return reply("Крок 1. Надішліть населений пункт, без слова «місто» чи «село».");
  }
  if (action === "where") return reply(coverageText());
  if (action === "site") {
    return reply(`Офіційний графік Волиньобленерго:\n${SITE}\n\nЦей бот перевіряє збережені адреси кожні 5 хвилин і пише, коли години змінились.`);
  }
  if (command === "/cancel") {
    db.clearDialog(chatId);
    return reply("Гаразд, адресу не записую. Натисніть «Додати адресу», коли будете готові.");
  }
  if (action === "list" || command === "/list") return addressList(db, chatId);
  if (command === "/remove") {
    const removed = db.deleteLastForChat(chatId);
    if (!removed) return reply("Збережених адрес ще немає.");
    return reply(`Прибрав адресу ${formatAddress(removed.city, removed.street, 0, 0, removed.house)}.`);
  }

  const parsed = parseAddressMessage(cleaned) || parseLooseAddress(cleaned, places().map((item) => item[0]));
  if (parsed) {
    const editing = db.getDialog(chatId);
    const targetId = editing && editing.step === "edit" ? Number(editing.target_id) : 0;
    db.clearDialog(chatId);
    return saveAndReport(db, schedule, chatId, parsed.city, withoutHouseSuffix(parsed.street, parsed.house), parsed.house, targetId);
  }

  const dialog = db.getDialog(chatId);
  const step = dialog ? dialog.step : "city";
  const line = cleanLine(cleaned);
  if (!line || line.startsWith("/")) return reply(HELP);
  if (step === "street" && dialog) {
    db.setDialog(chatId, "house", dialog.city, line);
    return reply(`Крок 3. Вулиця: ${line}. Надішліть номер будинку, наприклад 15 або 44а.`);
  }
  if (step === "house" && dialog) {
    if (!looksLikeHouse(line)) {
      return reply(`«${line}» не схоже на номер будинку. Напишіть лише номер, за потреби з літерою разом: 15 або 44а. Без слова «буд.» і без зайвих пробілів.`);
    }
    db.clearDialog(chatId);
    return saveAndReport(db, schedule, chatId, dialog.city, withoutHouseSuffix(dialog.street, line), line, 0);
  }
  db.setDialog(chatId, "street", line, "");
  return reply(`Крок 2. Населений пункт: ${line}. Надішліть вулицю без «вул.».`);
}

export function handleCallback(db, schedule, chatId, data) {
  if (data.startsWith("open:")) {
    const address = db.getAddress(Number(data.slice(5)));
    if (!address || String(address.chat_id) !== String(chatId)) return reply("Цієї адреси вже немає.");
    return oneAddress(db, schedule, address);
  }
  if (data.startsWith("edit:")) {
    const address = db.getAddress(Number(data.slice(5)));
    if (!address || String(address.chat_id) !== String(chatId)) return reply("Цієї адреси вже немає.");
    db.setDialog(chatId, "edit", "", "", Number(address.id));
    return reply(`Надішліть нову адресу замість ${placeWithDistrict(address)}.\nТрьома рядками: населений пункт, вулиця, будинок. Або через кому.`);
  }
  if (data.startsWith("del:")) {
    const address = db.getAddress(Number(data.slice(4)));
    if (!address || String(address.chat_id) !== String(chatId)) return reply("Цієї адреси вже немає.");
    return {
      text: `Видалити ${placeWithDistrict(address)}?`,
      markup: {
        inline_keyboard: [[
          { text: "Так, видалити", callback_data: `delyes:${address.id}` },
          { text: "Ні", callback_data: "delno" },
        ]],
      },
    };
  }
  if (data.startsWith("delyes:")) {
    const addressId = Number(data.slice(7));
    const address = db.getAddress(addressId);
    if (!address || String(address.chat_id) !== String(chatId)) return reply("Цієї адреси вже немає.");
    const place = placeWithDistrict(address);
    db.deleteAddress(addressId);
    return reply(`Видалив ${place}.`);
  }
  if (data === "delno") return addressList(db, chatId);
  return reply("Не зрозумів цю кнопку. Відкрийте «Мої адреси» ще раз.");
}

export function groupsFor(city, street, house) {
  return matchStreet(rowsFor(city, street), house);
}

function saveAndReport(db, schedule, chatId, city, street, house, targetId) {
  const corrected = correctPlace(city, street, places(), (name) => streets(name));
  if (corrected.blocked) {
    let text = corrected.note;
    if (text.includes("немає")) text = `Вашої адреси немає в графіках відключень.\n\n${text}`;
    return reply(text);
  }
  city = corrected.city;
  street = corrected.street;
  const addressId = targetId ? db.updateAddress(targetId, city, street, house) : db.savePlace(city, street, house, chatId);
  const hit = groupsFor(city, street, house);
  if (hit.queues.length === 1) db.setQueue(addressId, hit.queues[0][0], hit.queues[0][1]);
  let groups = hit.queues;
  if (!groups.length) {
    const address = db.getAddress(addressId);
    if (address && Number(address.queue) > 0 && !hit.streetKnown) groups = [[Number(address.queue), Number(address.subqueue)]];
  }
  if (!groups.length && hit.streetKnown) {
    const text = `Вашої адреси немає в графіках відключень.\n\nПеревірив ${placeLabel(city, districtFor(city))}, вулицю «${street}», будинок ${house}.`;
    return reply(text);
  }
  let report = buildReport({ city, street, house, groups, today: schedule.today, tomorrow: schedule.tomorrow });
  if (corrected.note) report = `${corrected.note}\n\n${report}`;
  if (groups.length) db.remember(addressId, schedule);
  const address = db.getAddress(addressId);
  const label = address ? addressLabel(address) : report.split("\n")[0];
  return {
    text: report,
    markup: { inline_keyboard: [[{ text: clip(label), callback_data: `open:${addressId}` }]] },
  };
}

function oneAddress(db, schedule, address) {
  const hit = groupsFor(address.city, address.street, address.house);
  const groups = hit.queues.length ? hit.queues : (Number(address.queue) > 0 ? [[Number(address.queue), Number(address.subqueue)]] : []);
  const report = buildReport({
    city: address.city,
    street: address.street,
    house: address.house,
    groups,
    today: schedule.today,
    tomorrow: schedule.tomorrow,
  });
  if (groups.length) db.remember(Number(address.id), schedule);
  return {
    text: `Оновлення\n\n${placeWithDistrict(address)}\n\n${report}`,
    markup: {
      inline_keyboard: [[
        { text: "Змінити", callback_data: `edit:${address.id}` },
        { text: "Видалити", callback_data: `del:${address.id}` },
      ]],
    },
  };
}

function addressList(db, chatId) {
  const rows = db.listForChat(chatId);
  if (!rows.length) return reply("Збережених адрес ще немає. Натисніть «Додати адресу».");
  return {
    text: "Натисніть адресу, щоб отримати свіжий графік:",
    markup: {
      inline_keyboard: rows.map((row) => [{ text: clip(addressLabel(row)), callback_data: `open:${row.id}` }]),
    },
  };
}

function coverageText() {
  const cities = topCities(12);
  const listed = cities.length ? cities.join(", ") : "Луцьк, Ковель, Володимир";
  const extra = cityCount() > 12 ? ` і ще ${cityCount() - 12}` : "";
  return `Бот працює у Волинській області.\nІнші області України поки не підключені.\n\nУ довіднику зараз: ${listed}${extra}.\nЗбережені адреси перевіряються кожні 5 хвилин.`;
}

function placeWithDistrict(address) {
  let place = formatAddress(address.city, address.street, 0, 0, address.house);
  const district = districtFor(address.city);
  const label = placeLabel(address.city, district);
  if (district && place.includes(address.city)) place = place.replace(address.city, label);
  return place;
}

function addressLabel(address) {
  return clip(formatAddress(address.city, address.street, 0, 0, address.house));
}

function clip(value) {
  const text = String(value ?? "").trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function withoutHouseSuffix(street, house) {
  const suffix = ` ${house}`.toLowerCase();
  if (street.toLowerCase().endsWith(suffix)) return street.slice(0, -suffix.length).trim();
  return street;
}

function reply(text) {
  return { text, markup: mainKeyboard() };
}
