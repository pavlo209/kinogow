import assert from "node:assert/strict";
import test from "node:test";
import { Store } from "../src/store.js";
import { memorySql } from "./helpers.js";

function freshStore() {
  const store = new Store(memorySql());
  store.migrate();
  return store;
}

test("migrate upgrades the old addresses table and backfills users", () => {
  const sql = memorySql();
  sql.exec(`CREATE TABLE addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, city TEXT NOT NULL, street TEXT NOT NULL DEFAULT '',
    house TEXT NOT NULL DEFAULT '', queue INTEGER NOT NULL DEFAULT 0, subqueue INTEGER NOT NULL DEFAULT 0,
    chat_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT '')`);
  sql.exec("INSERT INTO addresses (city, street, house, chat_id, created_at) VALUES ('Луцьк', 'Волі', '44а', '10', '2026-10-01T10:00:00Z')");
  sql.exec("INSERT INTO addresses (city, street, house, chat_id, created_at) VALUES ('Луцьк', 'Соборності', '15', '10', '2026-09-01T10:00:00Z')");
  sql.exec("INSERT INTO addresses (city, street, house, chat_id, created_at) VALUES ('Баїв', 'Набережна', '21', '', '')");
  const store = new Store(sql);
  store.migrate();
  store.migrate();
  const address = store.getAddress(1);
  assert.equal(address.label, "");
  assert.equal(address.muted, 0);
  const users = store.listUsers();
  assert.equal(users.length, 1);
  assert.equal(users[0].chat_id, "10");
  assert.equal(users[0].first_seen, "2026-09-01T10:00:00Z");
});

test("touchUser records a new user and updates a returning one", () => {
  const store = freshStore();
  store.touchUser("10", { first_name: "Оля", username: "olya" }, new Date("2026-10-18T08:00:00Z"));
  store.markBlocked("10");
  store.touchUser("10", { first_name: "Ольга", last_name: "К", username: "olya_k", language_code: "uk" }, new Date("2026-10-18T09:00:00Z"));
  const user = store.getUser("10");
  assert.equal(user.first_name, "Ольга");
  assert.equal(user.last_name, "К");
  assert.equal(user.username, "olya_k");
  assert.equal(user.language, "uk");
  assert.equal(user.first_seen, "2026-10-18T08:00:00.000Z");
  assert.equal(user.last_seen, "2026-10-18T09:00:00.000Z");
  assert.equal(user.actions, 2);
  assert.equal(user.blocked, 0, "writing again means the bot is unblocked");
});

test("markBlocked flags a user who blocked the bot", () => {
  const store = freshStore();
  store.touchUser("20", {}, new Date("2026-10-18T08:00:00Z"));
  store.markBlocked("20");
  assert.equal(store.getUser("20").blocked, 1);
});

test("addresses: dedupe per chat, label, mute and delete with states", () => {
  const store = freshStore();
  const first = store.savePlace("Луцьк", "Волі", "44а", "10");
  const again = store.savePlace("луцьк", "волі", "44А", "10");
  const other = store.savePlace("Луцьк", "Волі", "44а", "20");
  assert.equal(first, again);
  assert.notEqual(first, other);
  store.setLabel(first, "🏠 Дім");
  store.setMuted(first, true);
  const row = store.getAddress(first);
  assert.equal(row.label, "🏠 Дім");
  assert.equal(row.muted, 1);
  store.saveState(first, "today", { signature: "s", schedule_date: "18.10.2026", ranges: [["10:00", "12:00"]], image_url: "" });
  assert.deepEqual(JSON.parse(store.getState(first, "today").ranges_json), [["10:00", "12:00"]]);
  store.deleteAddress(first);
  assert.equal(store.getAddress(first), null);
  assert.equal(store.getState(first, "today"), null);
});

test("addressesAfter pages through addresses by id", () => {
  const store = freshStore();
  for (let house = 1; house <= 5; house += 1) store.savePlace("Луцьк", "Волі", String(house), "10");
  assert.deepEqual(store.addressesAfter(0, 2).map((row) => row.id), [1, 2]);
  assert.deepEqual(store.addressesAfter(2, 2).map((row) => row.id), [3, 4]);
  assert.deepEqual(store.addressesAfter(4, 2).map((row) => row.id), [5]);
  assert.deepEqual(store.addressesAfter(5, 2), []);
});

test("importState replaces data and backfills users", () => {
  const store = freshStore();
  store.savePlace("Ковель", "Миру", "1", "99");
  const result = store.importState({
    addresses: [{ id: 7, city: "Луцьк", street: "Волі", house: "44а", queue: 2, subqueue: 2, chat_id: "10", created_at: "2026-10-01T10:00:00Z" }],
    states: [{ address_id: 7, part: "today", signature: "x", schedule_date: "18.10.2026", ranges_json: "[]" }],
  });
  assert.deepEqual(result, { ok: true, addresses: 1, states: 1 });
  assert.equal(store.listAddresses().length, 1);
  assert.equal(store.getUser("10").first_seen, "2026-10-01T10:00:00Z");
});
