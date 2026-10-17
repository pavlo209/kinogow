import { ChartDecoder, rangesFor, readPng } from "./decode.js";
import { formatAddress, formatNotice } from "./match.js";
import { groupsFor, handleCallback, handleText } from "./talk.js";

const API = "https://api-voe-poweron.inneti.net";
const CHUNK = 1536;

export class SvitloBot {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.decoder = null;
    this.idat = null;
    this.offset = 0;
    this.job = null;
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
    });
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
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return Response.json(this.health());
      if (url.pathname === "/import") return Response.json(await this.importState(await request.json()));
      if (url.pathname === "/tick") {
        await this.tick();
        return Response.json(this.health());
      }
      if (url.pathname === "/telegram") {
        await this.onUpdate(await request.json());
        return new Response("ok");
      }
      return new Response("not found", { status: 404 });
    } catch (error) {
      this.metaSet("last_error", String(error?.message || error));
      return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
    }
  }

  async alarm() {
    try {
      if (this.phase === "sync") {
        await this.syncStep();
        return;
      }
      if (this.phase === "next") {
        await this.startNextJob();
        return;
      }
      await this.parseStep();
    } catch (error) {
      this.failParse(error);
    }
  }

  async onUpdate(update) {
    const callback = update.callback_query;
    if (callback) {
      await telegram(this.env, "answerCallbackQuery", { callback_query_id: callback.id });
      const message = callback.message || {};
      const chatId = message.chat?.id;
      if (chatId == null) return;
      const result = handleCallback(this, this.schedule(), String(chatId), callback.data || "");
      await this.send(chatId, result);
      return;
    }
    const message = update.message || {};
    const text = message.text || "";
    if (message.chat?.id == null || !text) return;
    const result = handleText(this, this.schedule(), String(message.chat.id), text);
    await this.send(message.chat.id, result);
  }

  async send(chatId, result) {
    await telegram(this.env, "sendMessage", {
      chat_id: chatId,
      text: String(result.text || "").slice(0, 4000),
      reply_markup: result.markup,
    });
  }

  async tick() {
    if (this.job || this.phase) return;
    const today = await readOption("pw_gpv_image_today");
    const tomorrow = await readOption("pw_gpv_image_tomorrow");
    if (!today) {
      this.metaSet("last_error", "Не вдалося отримати графік з сайту Волиньобленерго. Спробуйте ще раз трохи згодом.");
      return;
    }
    const todayImage = imageUrl(today.value);
    const tomorrowImage = imageUrl(tomorrow?.value || "");
    const same = todayImage === this.metaGet("today_image") && tomorrowImage === this.metaGet("tomorrow_image") && this.metaGet("today_slots");
    if (same) {
      this.syncIndex = 0;
      this.syncClearTomorrow = false;
      this.phase = "sync";
      this.metaSet("last_error", "");
      await this.ctx.storage.setAlarm(Date.now() + 50);
      return;
    }
    if (!todayImage) {
      this.metaSet("last_error", "Графік на сьогодні ще не опубліковано.");
      return;
    }
    this.queue = [
      ["today", todayImage, kyivDate(today.date), today.date || ""],
    ];
    if (tomorrowImage) {
      const base = kyivDate(today.date);
      this.queue.push(["tomorrow", tomorrowImage, addDays(base, 1), tomorrow.date || ""]);
    } else {
      this.metaSet("tomorrow_image", "");
      this.metaSet("tomorrow_slots", "");
    }
    this.metaSet("last_error", "");
    await this.startNextJob();
  }

  async startNextJob() {
    const next = this.queue?.shift();
    if (!next) {
      this.syncIndex = 0;
      this.syncClearTomorrow = true;
      this.phase = "sync";
      await this.ctx.storage.setAlarm(Date.now() + 50);
      return;
    }
    const [part, image, iso, updated] = next;
    const response = await fetch(image, { headers: { "User-Agent": "SvitloMonitor/1.0" } });
    if (!response.ok) throw new Error("Зображення графіка не завантажилось.");
    const png = readPng(new Uint8Array(await response.arrayBuffer()));
    this.decoder = new ChartDecoder(png.width, png.height, png.colorType);
    this.idat = png.idat;
    this.offset = 0;
    this.job = { part, image, iso, updated };
    this.phase = "parse";
    await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  async syncStep() {
    const addresses = this.listAddresses();
    const index = this.syncIndex || 0;
    if (index >= addresses.length) {
      this.phase = "";
      this.syncClearTomorrow = false;
      this.metaSet("last_check", new Date().toISOString());
      return;
    }
    await this.syncOne(addresses[index], Boolean(this.syncClearTomorrow));
    this.syncIndex = index + 1;
    if (this.syncIndex < addresses.length) await this.ctx.storage.setAlarm(Date.now() + 40);
    else {
      this.phase = "";
      this.syncClearTomorrow = false;
      this.metaSet("last_check", new Date().toISOString());
    }
  }

  async syncOne(address, allowEmptyTomorrow) {
    const schedule = this.schedule();
    if (!schedule.today) return;
    const hit = groupsFor(address.city, address.street, address.house);
    if (hit.queues.length === 1) this.setQueue(Number(address.id), hit.queues[0][0], hit.queues[0][1]);
    const fresh = this.getAddress(Number(address.id)) || address;
    if (Number(fresh.queue) <= 0 || Number(fresh.subqueue) <= 0) return;
    await this.storePart(fresh, "today", "Сьогодні", schedule.today, true);
    if (schedule.tomorrow || allowEmptyTomorrow) {
      await this.storePart(fresh, "tomorrow", "На завтра", schedule.tomorrow, true);
    }
  }

  async parseStep() {
    if (!this.job || !this.decoder) {
      this.job = null;
      return;
    }
    const started = performance.now();
    let wrote = false;
    if (this.decoder.pending.length < this.decoder.rowSize && this.offset < this.idat.length) {
      const next = Math.min(this.offset + CHUNK, this.idat.length);
      this.decoder.write(this.idat.subarray(this.offset, next), next === this.idat.length);
      this.offset = next;
      wrote = true;
    }
    if (!wrote || performance.now() - started < 3) this.decoder.drain(3);
    if (this.decoder.error) throw this.decoder.error;
    if (!this.decoder.finished) {
      await this.ctx.storage.setAlarm(Date.now() + 80);
      return;
    }
    const record = {
      iso: this.job.iso,
      label: labelFromIso(this.job.iso),
      image: this.job.image,
      updated: this.job.updated,
      slots: this.decoder.schedule,
    };
    this.metaSet(`${this.job.part}_slots`, JSON.stringify(record.slots));
    this.metaSet(`${this.job.part}_iso`, record.iso);
    this.metaSet(`${this.job.part}_label`, record.label);
    this.metaSet(`${this.job.part}_image`, record.image);
    this.metaSet(`${this.job.part}_updated`, record.updated);
    this.decoder = null;
    this.idat = null;
    this.job = null;
    this.phase = "next";
    await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  failParse(error) {
    this.metaSet("last_error", "Графік опубліковано, але його таблицю не вдалося прочитати. Розмітка зображення змінилась.");
    this.metaSet("last_error_detail", String(error?.message || error).slice(0, 300));
    this.decoder = null;
    this.idat = null;
    this.job = null;
    this.queue = [];
    this.phase = "";
  }

  async storePart(address, part, when, chart, notify) {
    if (!chart) {
      this.clearState(Number(address.id), part);
      return;
    }
    let ranges;
    try {
      ranges = chart.ranges(Number(address.queue), Number(address.subqueue));
    } catch {
      return;
    }
    const signature = `${chart.iso}|${ranges.map(([start, end]) => `${start}-${end}`).join(";")}`;
    const previous = this.getState(Number(address.id), part);
    if (previous && previous.signature === signature) return;
    const changed = Boolean(previous && previous.schedule_date === chart.label);
    const place = formatAddress(address.city, address.street, address.queue, address.subqueue, address.house);
    if (notify && address.chat_id) {
      const text = formatNotice({ when, scheduleDate: chart.label, address: place, ranges, changed });
      const sent = await telegram(this.env, "sendMessage", {
        chat_id: address.chat_id,
        text,
        reply_markup: { inline_keyboard: [[{ text: clip(place), callback_data: `open:${address.id}` }]] },
      });
      if (!sent.ok) return;
    }
    this.sql.exec(
      `INSERT INTO states (address_id, part, signature, schedule_date, ranges_json, image_url)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(address_id, part) DO UPDATE SET
         signature = excluded.signature,
         schedule_date = excluded.schedule_date,
         ranges_json = excluded.ranges_json,
         image_url = excluded.image_url`,
      Number(address.id),
      part,
      signature,
      chart.label,
      JSON.stringify(ranges),
      chart.image || "",
    );
  }

  remember(addressId, schedule) {
    const address = this.getAddress(addressId);
    if (!address || Number(address.queue) <= 0) return;
    this.storePart(address, "today", "Сьогодні", schedule.today, false);
    this.storePart(address, "tomorrow", "На завтра", schedule.tomorrow, false);
  }

  schedule() {
    return {
      today: this.chart("today"),
      tomorrow: this.chart("tomorrow"),
    };
  }

  chart(part) {
    const raw = this.metaGet(`${part}_slots`);
    if (!raw) return null;
    const slots = JSON.parse(raw);
    return {
      iso: this.metaGet(`${part}_iso`),
      label: this.metaGet(`${part}_label`),
      image: this.metaGet(`${part}_image`),
      ranges(queue, subqueue) {
        return rangesFor(slots, queue, subqueue);
      },
    };
  }

  health() {
    let sample = null;
    try {
      const today = this.chart("today");
      sample = today ? today.ranges(2, 2) : null;
    } catch {
      sample = null;
    }
    return {
      ok: true,
      addresses: this.listAddresses().length,
      parsing: Boolean(this.job),
      todayImage: this.metaGet("today_image"),
      tomorrowImage: this.metaGet("tomorrow_image"),
      sample22: sample,
      lastError: this.metaGet("last_error"),
      lastCheck: this.metaGet("last_check"),
    };
  }

  async importState(body) {
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
    return { ok: true, addresses: (body.addresses || []).length, states: (body.states || []).length };
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

  getAddress(id) {
    return this.sql.exec("SELECT * FROM addresses WHERE id = ?", Number(id)).toArray()[0] ?? null;
  }

  savePlace(city, street, house, chatId) {
    const existing = this.sql.exec(
      "SELECT * FROM addresses WHERE lower(city) = lower(?) AND lower(street) = lower(?) AND lower(house) = lower(?) AND chat_id = ?",
      city,
      street,
      house,
      String(chatId),
    ).toArray()[0];
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

  getState(addressId, part) {
    return this.sql.exec("SELECT * FROM states WHERE address_id = ? AND part = ?", Number(addressId), part).toArray()[0] ?? null;
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
}

async function telegram(env, method, payload) {
  if (!env.TELEGRAM_TOKEN) return { ok: false };
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function readOption(key) {
  const response = await fetch(`${API}/api/options?option_key=${key}`, {
    headers: { Accept: "application/json", "User-Agent": "SvitloMonitor/1.0" },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  if (Array.isArray(payload)) return payload[0] || null;
  const members = payload["hydra:member"];
  return members?.[0] || null;
}

function imageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("http") ? text : API + text;
}

function kyivDate(iso) {
  if (!iso) return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date(iso));
}

function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function labelFromIso(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function clip(value) {
  const text = String(value || "").trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}
