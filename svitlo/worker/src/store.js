import { partState } from "./sync.js";

// Усі запити до SQLite в Durable Object. Приймає ctx.storage.sql або сумісний адаптер.
export class Store {
  constructor(sql) {
    this.sql = sql;
  }

  migrate() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      street TEXT NOT NULL DEFAULT '',
      house TEXT NOT NULL DEFAULT '',
      queue INTEGER NOT NULL DEFAULT 0,
      subqueue INTEGER NOT NULL DEFAULT 0,
      chat_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    )`);
    this.addColumn("addresses", "label", "TEXT NOT NULL DEFAULT ''");
    this.addColumn("addresses", "muted", "INTEGER NOT NULL DEFAULT 0");
    this.sql.exec(`CREATE TABLE IF NOT EXISTS dialogs (
      chat_id TEXT PRIMARY KEY,
      step TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      street TEXT NOT NULL DEFAULT '',
      target_id INTEGER NOT NULL DEFAULT 0
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS states (
      address_id INTEGER NOT NULL,
      part TEXT NOT NULL,
      signature TEXT NOT NULL,
      schedule_date TEXT NOT NULL,
      ranges_json TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (address_id, part)
    )`);
    this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (
      chat_id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT '',
      first_seen TEXT NOT NULL DEFAULT '',
      last_seen TEXT NOT NULL DEFAULT '',
      actions INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0
    )`);
    this.backfillUsers();
  }

  addColumn(table, column, definition) {
    const columns = this.sql.exec(`PRAGMA table_info(${table})`).toArray().map((row) => row.name);
    if (!columns.includes(column)) this.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  // Люди, які зберегли адресу ще до появи таблиці users.
  backfillUsers() {
    this.sql.exec(`INSERT OR IGNORE INTO users (chat_id, first_seen, last_seen)
      SELECT chat_id, MIN(created_at), MAX(created_at) FROM addresses WHERE chat_id != '' GROUP BY chat_id`);
  }

  touchUser(chatId, from = {}, now = new Date()) {
    const seen = now.toISOString();
    this.sql.exec(
      `INSERT INTO users (chat_id, first_name, last_name, username, language, first_seen, last_seen, actions, blocked)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
       ON CONFLICT(chat_id) DO UPDATE SET
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         username = excluded.username,
         language = excluded.language,
         first_seen = CASE WHEN users.first_seen = '' THEN excluded.first_seen ELSE users.first_seen END,
         last_seen = excluded.last_seen,
         actions = users.actions + 1,
         blocked = 0`,
      String(chatId),
      String(from.first_name || ""),
      String(from.last_name || ""),
      String(from.username || ""),
      String(from.language_code || ""),
      seen,
      seen,
    );
  }

  markBlocked(chatId) {
    this.sql.exec("UPDATE users SET blocked = 1 WHERE chat_id = ?", String(chatId));
  }

  getUser(chatId) {
    return this.sql.exec("SELECT * FROM users WHERE chat_id = ?", String(chatId)).toArray()[0] ?? null;
  }

  listUsers() {
    return this.sql.exec("SELECT * FROM users ORDER BY first_seen DESC, chat_id").toArray();
  }

  getDialog(chatId) {
    return this.sql.exec("SELECT * FROM dialogs WHERE chat_id = ?", String(chatId)).toArray()[0] ?? null;
  }

  setDialog(chatId, step, city = "", street = "", targetId = 0) {
    this.sql.exec(
      `INSERT INTO dialogs (chat_id, step, city, street, target_id) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET step = excluded.step, city = excluded.city, street = excluded.street, target_id = excluded.target_id`,
      String(chatId),
      step,
      city,
      street,
      Number(targetId) || 0,
    );
  }

  clearDialog(chatId) {
    this.sql.exec("DELETE FROM dialogs WHERE chat_id = ?", String(chatId));
  }

  listForChat(chatId) {
    return this.sql.exec("SELECT * FROM addresses WHERE chat_id = ? ORDER BY id", String(chatId)).toArray();
  }

  listAddresses() {
    return this.sql.exec("SELECT * FROM addresses ORDER BY id").toArray();
  }

  countAddresses() {
    return Number(this.sql.exec("SELECT COUNT(*) AS n FROM addresses").one().n);
  }

  addressesAfter(lastId, limit) {
    return this.sql.exec("SELECT * FROM addresses WHERE id > ? ORDER BY id LIMIT ?", Number(lastId) || 0, Number(limit)).toArray();
  }

  getAddress(id) {
    return this.sql.exec("SELECT * FROM addresses WHERE id = ?", Number(id)).toArray()[0] ?? null;
  }

  savePlace(city, street, house, chatId) {
    // lower() у SQLite не знає кирилиці, тому порівнюємо в JS.
    const key = [city, street, house].map((part) => String(part).trim().toLowerCase()).join("|");
    const existing = this.listForChat(chatId)
      .find((row) => [row.city, row.street, row.house].map((part) => String(part).trim().toLowerCase()).join("|") === key);
    if (existing) return Number(existing.id);
    this.sql.exec(
      "INSERT INTO addresses (city, street, house, queue, subqueue, chat_id, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)",
      city,
      street,
      house,
      String(chatId),
      new Date().toISOString(),
    );
    return Number(this.sql.exec("SELECT last_insert_rowid() AS id").one().id);
  }

  updateAddress(id, city, street, house) {
    this.sql.exec(
      "UPDATE addresses SET city = ?, street = ?, house = ?, queue = 0, subqueue = 0 WHERE id = ?",
      city,
      street,
      house,
      Number(id),
    );
    this.sql.exec("DELETE FROM states WHERE address_id = ?", Number(id));
    return Number(id);
  }

  setQueue(id, queue, subqueue) {
    this.sql.exec("UPDATE addresses SET queue = ?, subqueue = ? WHERE id = ?", queue, subqueue, Number(id));
  }

  setLabel(id, label) {
    this.sql.exec("UPDATE addresses SET label = ? WHERE id = ?", String(label || ""), Number(id));
  }

  setMuted(id, muted) {
    this.sql.exec("UPDATE addresses SET muted = ? WHERE id = ?", muted ? 1 : 0, Number(id));
  }

  deleteAddress(id) {
    this.sql.exec("DELETE FROM states WHERE address_id = ?", Number(id));
    this.sql.exec("DELETE FROM addresses WHERE id = ?", Number(id));
  }

  deleteLastForChat(chatId) {
    const row = this.sql.exec("SELECT * FROM addresses WHERE chat_id = ? ORDER BY id DESC LIMIT 1", String(chatId)).toArray()[0];
    if (!row) return null;
    this.deleteAddress(row.id);
    return row;
  }

  // Запам'ятовує поточні години, щоб наступна перевірка не дублювала вже показаний графік.
  remember(addressId, schedule) {
    const address = this.getAddress(addressId);
    if (!address || Number(address.queue) <= 0) return;
    for (const part of ["today", "tomorrow"]) {
      const state = partState(schedule[part], address.queue, address.subqueue);
      if (state) this.saveState(address.id, part, state);
      else if (!schedule[part]) this.clearState(address.id, part);
    }
  }

  getState(addressId, part) {
    return this.sql.exec("SELECT * FROM states WHERE address_id = ? AND part = ?", Number(addressId), part).toArray()[0] ?? null;
  }

  saveState(addressId, part, state) {
    this.sql.exec(
      `INSERT INTO states (address_id, part, signature, schedule_date, ranges_json, image_url)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(address_id, part) DO UPDATE SET
         signature = excluded.signature,
         schedule_date = excluded.schedule_date,
         ranges_json = excluded.ranges_json,
         image_url = excluded.image_url`,
      Number(addressId),
      part,
      state.signature,
      state.schedule_date,
      JSON.stringify(state.ranges),
      state.image_url || "",
    );
  }

  clearState(addressId, part) {
    this.sql.exec("DELETE FROM states WHERE address_id = ? AND part = ?", Number(addressId), part);
  }

  metaGet(key) {
    return this.sql.exec("SELECT value FROM meta WHERE key = ?", key).toArray()[0]?.value ?? "";
  }

  metaSet(key, value) {
    this.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      String(value ?? ""),
    );
  }

  importState(body) {
    this.sql.exec("DELETE FROM states");
    this.sql.exec("DELETE FROM dialogs");
    this.sql.exec("DELETE FROM addresses");
    for (const row of body.addresses || []) {
      this.sql.exec(
        `INSERT INTO addresses (id, city, street, house, queue, subqueue, chat_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        Number(row.id),
        row.city || "",
        row.street || "",
        row.house || "",
        Number(row.queue) || 0,
        Number(row.subqueue) || 0,
        String(row.chat_id || ""),
        row.created_at || "",
      );
    }
    for (const row of body.states || []) {
      this.sql.exec(
        `INSERT INTO states (address_id, part, signature, schedule_date, ranges_json, image_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        Number(row.address_id),
        row.part,
        row.signature,
        row.schedule_date,
        row.ranges_json || "[]",
        row.image_url || "",
      );
    }
    this.backfillUsers();
    return { ok: true, addresses: (body.addresses || []).length, states: (body.states || []).length };
  }
}
