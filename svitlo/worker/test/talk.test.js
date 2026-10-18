import assert from "node:assert/strict";
import test from "node:test";
import { cityIndex, rowsFor, streetIndex } from "../src/catalog.js";
import { matchStreet } from "../src/match.js";
import { Store } from "../src/store.js";
import { buttonAction, handleCallback, handleText, MAX_ADDRESSES } from "../src/talk.js";
import { memorySql } from "./helpers.js";

const CHAT = "505113365";
const NOW = new Date("2026-10-18T12:00:00Z");
const SCHEDULE = {
  today: { label: "18.10.2026", iso: "2026-10-18", image: "", ranges: () => [["14:30", "18:00"]] },
  tomorrow: null,
};

function setup() {
  const db = new Store(memorySql());
  db.migrate();
  const say = (text, options = {}) => list(handleText(db, SCHEDULE, CHAT, text, { now: NOW, ...options }));
  const tap = (data, chat = CHAT) => list(handleCallback(db, SCHEDULE, chat, data, { now: NOW }));
  return { db, say, tap };
}

const list = (result) => (Array.isArray(result) ? result : [result]);
const buttons = (result) => (result.markup?.inline_keyboard ?? []).flat();
const button = (result, pattern) => buttons(result).find((item) => pattern.test(item.callback_data));

test("known Volyn addresses resolve to one queue", () => {
  const cases = [
    ["Луцьк", "Волі", "44а", 2, 2],
    ["Луцьк", "Соборності", "15", 4, 2],
    ["Баїв", "Набережна", "21", 1, 2],
    ["Струмівка", "Рівненська", "126", 6, 2],
  ];
  for (const [city, street, house, queue, subqueue] of cases) {
    const hit = matchStreet(rowsFor(city, street), house);
    assert.deepEqual(hit.queues, [[queue, subqueue]], `${city} ${street} ${house}`);
  }
});

test("a one-line address is saved and answered with a rich card", () => {
  const { db, say } = setup();
  const [result] = say("Луцьк, Волі, 44а");
  assert.match(result.text, /Адресу збережено/);
  assert.match(result.text, /Черга <b>2\.2<\/b>/);
  assert.match(result.text, /14:30 – 18:00/);
  assert.match(result.text, /Зараз світла немає/);
  assert.equal(result.effect, "celebrate");
  assert.equal(buttons(result)[0].callback_data, "open:1");
  assert.ok(button(result, /^mute:1$/));
  assert.ok(button(result, /^del:1$/));
  const saved = db.listForChat(CHAT);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].queue, 2);
});

test("/start greets a new user, shows the menu and starts step 1 with city buttons", () => {
  const { db, say } = setup();
  const [welcome, step] = say("/start", { user: { first_name: "Оля <3" } });
  assert.match(welcome.text, /Вітаю, Оля &lt;3!/);
  assert.ok(welcome.markup.keyboard, "reply keyboard with the main menu");
  assert.match(step.text, /крок 1 з 3/);
  assert.ok(button(step, new RegExp(`^pc:${cityIndex("Луцьк")}$`)), "popular city button");
  assert.ok(button(step, /^cancel$/));
  assert.equal(db.getDialog(CHAT).step, "city");
});

test("/start for a returning user lists their addresses", () => {
  const { say } = setup();
  say("Луцьк, Волі, 44а");
  const [welcome, addresses] = say("/start", { user: { first_name: "Оля" } });
  assert.match(welcome.text, /З поверненням/);
  assert.match(addresses.text, /Ваші адреси/);
});

test("guided flow: city, street, house", () => {
  const { db, say } = setup();
  say("➕ Додати адресу");
  const [step2] = say("Луцьк");
  assert.match(step2.text, /крок 2 з 3/);
  assert.match(step2.text, /Луцьк/);
  assert.equal(db.getDialog(CHAT).step, "street");
  const [step3] = say("Волі");
  assert.match(step3.text, /крок 3 з 3/);
  assert.equal(db.getDialog(CHAT).step, "house");
  const [card] = say("44а");
  assert.match(card.text, /Адресу збережено/);
  assert.equal(db.getDialog(CHAT), null);
});

test("step 2 accepts street and house together", () => {
  const { db, say } = setup();
  say("Луцьк");
  const [card] = say("Волі 44а");
  assert.match(card.text, /Адресу збережено/);
  assert.equal(db.listForChat(CHAT)[0].house, "44а");
});

test("a misspelt city offers buttons, and a tap continues to step 2", () => {
  const { say, tap } = setup();
  const [hint] = say("Луцк");
  const choice = button(hint, new RegExp(`^pc:${cityIndex("Луцьк")}$`));
  assert.ok(choice, "Луцьк is suggested");
  const [step2] = tap(choice.callback_data);
  assert.equal(step2.edit, true);
  assert.match(step2.text, /крок 2 з 3/);
});

test("a partial street offers matching streets", () => {
  const { db, say, tap } = setup();
  say("Луцьк");
  const [hint] = say("Лесі");
  const expected = `ps:${cityIndex("Луцьк")}:${streetIndex("Луцьк", "Лесі Українки")}`;
  assert.ok(buttons(hint).some((item) => item.callback_data === expected), "Лесі Українки is suggested");
  const [step3] = tap(expected);
  assert.match(step3.text, /крок 3 з 3/);
  assert.equal(db.getDialog(CHAT).street, "Лесі Українки");
});

test("a house outside the schedules is not saved and the user can retry", () => {
  const { db, say } = setup();
  const [result] = say("Луцьк, Волі, 1000");
  assert.match(result.text, /немає в графіках відключень/);
  assert.equal(db.listForChat(CHAT).length, 0);
  const dialog = db.getDialog(CHAT);
  assert.equal(dialog.step, "house");
  assert.equal(dialog.street, "Волі");
  const [card] = say("44а");
  assert.match(card.text, /Адресу збережено/);
});

test("card buttons: refresh, mute, label presets and a custom label", () => {
  const { db, say, tap } = setup();
  say("Луцьк, Волі, 44а");
  const [refreshed] = tap("open:1");
  assert.equal(refreshed.edit, true);
  assert.match(refreshed.text, /Луцьк, Волі, 44а/);
  const [muted] = tap("mute:1");
  assert.equal(db.getAddress(1).muted, 1);
  assert.match(muted.toast, /вимкнено/);
  assert.match(muted.text, /🔕/);
  tap("mute:1");
  assert.equal(db.getAddress(1).muted, 0);
  const [naming] = tap("name:1");
  const home = button(naming, /^lbl:1:0$/);
  assert.match(home.text, /Дім/);
  const [named] = tap(home.callback_data);
  assert.equal(db.getAddress(1).label, "🏠 Дім");
  assert.match(named.text, /🏠 <b>Дім<\/b>/);
  tap("name:1");
  const [custom] = say("Бабуся Галя");
  assert.equal(db.getAddress(1).label, "Бабуся Галя");
  assert.match(custom.text, /🏷 <b>Бабуся Галя<\/b>/);
  tap("lbl:1:x");
  assert.equal(db.getAddress(1).label, "");
});

test("delete asks for confirmation and then removes the address", () => {
  const { db, say, tap } = setup();
  say("Луцьк, Волі, 44а");
  const [confirm] = tap("del:1");
  assert.ok(button(confirm, /^delyes:1$/));
  assert.ok(button(confirm, /^open:1$/), "No goes back to the card");
  const [after] = tap("delyes:1");
  assert.equal(after.edit, true);
  assert.match(after.toast, /Видалено/);
  assert.equal(db.getAddress(1), null);
});

test("address list shows status per address and buttons to open each one", () => {
  const { say } = setup();
  say("Луцьк, Волі, 44а");
  say("Луцьк, Соборності, 15");
  for (const label of ["📋 Мої адреси", "Мої адреси", "/list"]) {
    const [result] = say(label);
    assert.match(result.text, /Ваші адреси/);
    assert.match(result.text, new RegExp(`2 з ${MAX_ADDRESSES}`));
    assert.match(result.text, /зараз без світла/);
    assert.ok(button(result, /^open:1$/));
    assert.ok(button(result, /^open:2$/));
    assert.ok(button(result, /^add$/));
  }
});

test("edit replaces the chosen address instead of adding a new one", () => {
  const { db, say, tap } = setup();
  say("Луцьк, Волі, 44а");
  const [prompt] = tap("edit:1");
  assert.match(prompt.text, /Зміна адреси/);
  const [result] = say("Луцьк, Соборності, 15");
  assert.match(result.text, /Адресу оновлено/);
  const rows = db.listForChat(CHAT);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].street, "Соборності");
  assert.equal(rows[0].queue, 4);
});

test("cancel and back buttons steer the dialog", () => {
  const { db, say, tap } = setup();
  say("Луцьк");
  const [back] = tap("back");
  assert.match(back.text, /крок 1 з 3/);
  assert.equal(db.getDialog(CHAT).step, "city");
  const [cancelled] = tap("cancel");
  assert.match(cancelled.text, /Скасовано/);
  assert.equal(db.getDialog(CHAT), null);
});

test("one chat cannot touch another chat's address", () => {
  const { say, tap } = setup();
  say("Луцьк, Волі, 44а");
  const [result] = tap("del:1", "777");
  assert.match(result.text, /Цієї адреси вже немає/);
});

test("the number of addresses per chat is capped", () => {
  const { db, say } = setup();
  for (let index = 0; index < MAX_ADDRESSES; index += 1) db.savePlace("Луцьк", "Волі", String(index + 1), CHAT);
  const [result] = say("Луцьк, Соборності, 15");
  assert.match(result.text, new RegExp(`до ${MAX_ADDRESSES} адрес`));
  assert.equal(db.listForChat(CHAT).length, MAX_ADDRESSES);
});

test("menu buttons work with and without emoji", () => {
  assert.equal(buttonAction("➕ Додати адресу"), "add");
  assert.equal(buttonAction("Додати адресу"), "add");
  assert.equal(buttonAction("❓ Допомога"), "help");
  assert.equal(buttonAction("Як користуватись"), "help");
  assert.equal(buttonAction("📊 Адмін-панель"), "admin");
  assert.equal(buttonAction("Луцьк"), null);
});
