import assert from "node:assert/strict";
import test from "node:test";
import { rowsFor } from "../src/catalog.js";
import { matchStreet } from "../src/match.js";
import { handleText } from "../src/talk.js";

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

test("a full address reply includes today's hours", () => {
  const db = new MemoryDb();
  const schedule = {
    today: { label: "17.10.2026", iso: "2026-10-17", image: "", ranges: () => [["14:30", "18:00"]] },
    tomorrow: null,
  };
  const started = performance.now();
  const result = handleText(db, schedule, "505113365", "Луцьк, Волі, 44а");
  console.log("reply ms", Math.round(performance.now() - started));
  assert.match(result.text, /черга 2\.2/);
  assert.match(result.text, /14:30/);
  assert.match(result.text, /відключення/);
  assert.equal(result.markup.inline_keyboard[0][0].callback_data, "open:1");
});

class MemoryDb {
  constructor() {
    this.addresses = [];
    this.dialogs = new Map();
    this.next = 1;
  }
  getDialog(chatId) { return this.dialogs.get(String(chatId)) ?? null; }
  setDialog(chatId, step, city = "", street = "", targetId = 0) {
    this.dialogs.set(String(chatId), { step, city, street, target_id: targetId });
  }
  clearDialog(chatId) { this.dialogs.delete(String(chatId)); }
  listForChat(chatId) { return this.addresses.filter((row) => row.chat_id === String(chatId)); }
  getAddress(id) { return this.addresses.find((row) => row.id === Number(id)) ?? null; }
  savePlace(city, street, house, chatId) {
    const row = { id: this.next, city, street, house, queue: 0, subqueue: 0, chat_id: String(chatId) };
    this.next += 1;
    this.addresses.push(row);
    return row.id;
  }
  updateAddress(id, city, street, house) {
    const row = this.getAddress(id);
    Object.assign(row, { city, street, house, queue: 0, subqueue: 0 });
    return Number(id);
  }
  setQueue(id, queue, subqueue) {
    const row = this.getAddress(id);
    row.queue = queue;
    row.subqueue = subqueue;
  }
  deleteAddress() {}
  deleteLastForChat() { return null; }
  remember() {}
}
