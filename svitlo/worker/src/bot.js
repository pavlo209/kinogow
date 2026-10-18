import { adminAccess, adminCookie, adminLink } from "./access.js";
import { adminDigest, renderAdmin, renderLocked, summarize } from "./admin.js";
import { districtFor, groupsFor } from "./catalog.js";
import { ChartDecoder, rangesFor, readPng } from "./decode.js";
import { noticeText } from "./format.js";
import { addDays, imageUrl, kyivDate, labelFromIso, readOption } from "./source.js";
import { Store } from "./store.js";
import { noticeKind, partState } from "./sync.js";
import { handleCallback, handleText, isAdminRequest } from "./talk.js";
import { createTelegram, deliver } from "./telegram.js";
import * as T from "./texts.js";

const CHUNK = 1536;
// Скільки адрес перевіряти за один виклик alarm: вкладаємось у ліміт процесора й 30 повідомлень/с Telegram.
export const SYNC_BATCH = 20;

export class SvitloBot {
  constructor(ctx, env, deps = {}) {
    this.ctx = ctx;
    this.env = env;
    this.store = new Store(ctx.storage.sql);
    this.telegram = deps.telegram ?? createTelegram(env);
    this.decoder = null;
    this.idat = null;
    this.offset = 0;
    this.job = null;
    this.phase = "";
    this.syncCursor = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.store.migrate();
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return Response.json(this.health());
      if (url.pathname === "/import") return Response.json(this.store.importState(await request.json()));
      if (url.pathname === "/tick") {
        await this.tick();
        return Response.json(this.health());
      }
      if (url.pathname === "/telegram") {
        await this.onUpdate(await request.json());
        return new Response("ok");
      }
      if (url.pathname === "/setup") return Response.json(await this.setup());
      if (url.pathname === "/admin") return this.adminHttp(request, url);
      if (url.pathname === "/admin/link") return Response.json({ url: adminLink(this.store, this.env.PUBLIC_URL) });
      return new Response("not found", { status: 404 });
    } catch (error) {
      this.store.metaSet("last_error", String(error?.message || error));
      return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
    }
  }

  async alarm() {
    try {
      if (this.phase === "sync") return await this.syncStep();
      if (this.phase === "next") return await this.startNextJob();
      await this.parseStep();
    } catch (error) {
      if (this.phase === "sync") {
        this.store.metaSet("last_error", `Розсилка зупинилась: ${String(error?.message || error).slice(0, 200)}`);
        this.phase = "";
        return;
      }
      this.failParse(error);
    }
  }

  async onUpdate(update, now = new Date()) {
    if (update.my_chat_member) return this.onMembership(update.my_chat_member, now);
    const callback = update.callback_query;
    if (callback) {
      const message = callback.message || {};
      const chatId = message.chat?.id;
      if (chatId == null) {
        await this.telegram("answerCallbackQuery", { callback_query_id: callback.id });
        return;
      }
      this.store.touchUser(chatId, callback.from || {}, now);
      const result = handleCallback(this.store, this.schedule(), String(chatId), callback.data || "", { admin: this.isAdmin(chatId), now });
      const toast = [].concat(result).find((item) => item.toast)?.toast;
      await this.telegram("answerCallbackQuery", { callback_query_id: callback.id, ...(toast ? { text: toast } : {}) });
      await this.reply(chatId, result, message.message_id);
      return;
    }
    const message = update.message || {};
    if (message.chat?.id == null) return;
    const chatId = String(message.chat.id);
    this.store.touchUser(chatId, message.from || {}, now);
    const text = message.text || "";
    if (!text) return this.reply(chatId, { text: T.TEXT_ONLY, markup: T.mainKeyboard(this.isAdmin(chatId)) });
    if (isAdminRequest(text)) return this.reply(chatId, this.adminReply(chatId, now));
    const result = handleText(this.store, this.schedule(), chatId, text, { admin: this.isAdmin(chatId), now, user: message.from });
    await this.reply(chatId, result);
  }

  onMembership(member, now) {
    const chatId = member.chat?.id;
    if (chatId == null) return;
    const status = member.new_chat_member?.status;
    if (status === "kicked" || status === "left") {
      this.store.touchUser(chatId, member.from || {}, now);
      this.store.markBlocked(chatId);
    } else if (status === "member") {
      this.store.touchUser(chatId, member.from || {}, now);
    }
  }

  async reply(chatId, result, messageId) {
    const outcome = await deliver(this.telegram, chatId, result, { messageId });
    if (outcome.blocked) this.store.markBlocked(chatId);
    // Не кидаємо помилку: інакше Telegram повторюватиме те саме оновлення.
    else if (!outcome.ok) this.store.metaSet("last_error", `Telegram: ${outcome.description || "повідомлення не пішло"}`);
    return outcome;
  }

  isAdmin(chatId) {
    return String(chatId) === String(this.env.ADMIN_CHAT_ID || "").trim();
  }

  adminReply(chatId, now = new Date()) {
    if (!this.isAdmin(chatId)) return { text: T.ADMIN_ONLY, markup: T.mainKeyboard(false) };
    const report = summarize({ users: this.store.listUsers(), addresses: this.store.listAddresses(), now });
    return {
      text: adminDigest(report, this.store.metaGet("last_check")),
      markup: { inline_keyboard: [[{ text: T.OPEN_ADMIN, url: adminLink(this.store, this.env.PUBLIC_URL) }]] },
    };
  }

  adminHttp(request, url) {
    const access = adminAccess(this.store, request, url);
    const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
    if (!access) return new Response(renderLocked(), { status: 401, headers });
    if (access === "fresh") headers["Set-Cookie"] = adminCookie(this.store);
    const html = renderAdmin({
      users: this.store.listUsers(),
      addresses: this.store.listAddresses(),
      districtOf: districtFor,
      lastCheck: this.store.metaGet("last_check"),
      lastError: this.store.metaGet("last_error"),
    });
    return new Response(html, { headers });
  }

  // Одноразово після деплою: меню команд, опис бота і вебхук з подіями блокування.
  async setup() {
    const result = {
      commands: await this.telegram("setMyCommands", { commands: T.COMMANDS }),
      description: await this.telegram("setMyDescription", { description: T.BOT_DESCRIPTION }),
      shortDescription: await this.telegram("setMyShortDescription", { short_description: T.BOT_SHORT }),
    };
    if (this.env.WEBHOOK_SECRET && this.env.PUBLIC_URL) {
      result.webhook = await this.telegram("setWebhook", {
        url: `${String(this.env.PUBLIC_URL).replace(/\/$/, "")}/telegram`,
        secret_token: String(this.env.WEBHOOK_SECRET).trim(),
        allowed_updates: ["message", "callback_query", "my_chat_member"],
      });
    }
    return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, { ok: Boolean(value.ok), description: value.description || "" }]));
  }

  async tick() {
    if (this.job || this.phase) return;
    const today = await readOption("pw_gpv_image_today");
    const tomorrow = await readOption("pw_gpv_image_tomorrow");
    if (!today) {
      this.store.metaSet("last_error", "Не вдалося отримати графік з сайту Волиньобленерго. Спробуйте ще раз трохи згодом.");
      return;
    }
    const todayImage = imageUrl(today.value);
    const tomorrowImage = imageUrl(tomorrow?.value || "");
    const same = todayImage === this.store.metaGet("today_image")
      && tomorrowImage === this.store.metaGet("tomorrow_image")
      && this.store.metaGet("today_slots");
    if (same) {
      this.store.metaSet("last_error", "");
      await this.startSync(false);
      return;
    }
    if (!todayImage) {
      this.store.metaSet("last_error", "Графік на сьогодні ще не опубліковано.");
      return;
    }
    this.queue = [["today", todayImage, kyivDate(today.date), today.date || ""]];
    if (tomorrowImage) {
      this.queue.push(["tomorrow", tomorrowImage, addDays(kyivDate(today.date), 1), tomorrow.date || ""]);
    } else {
      this.store.metaSet("tomorrow_image", "");
      this.store.metaSet("tomorrow_slots", "");
    }
    this.store.metaSet("last_error", "");
    await this.startNextJob();
  }

  async startNextJob() {
    const next = this.queue?.shift();
    if (!next) {
      await this.startSync(true);
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
    const { part, iso, image, updated } = this.job;
    this.store.metaSet(`${part}_slots`, JSON.stringify(this.decoder.schedule));
    this.store.metaSet(`${part}_iso`, iso);
    this.store.metaSet(`${part}_label`, labelFromIso(iso));
    this.store.metaSet(`${part}_image`, image);
    this.store.metaSet(`${part}_updated`, updated);
    this.decoder = null;
    this.idat = null;
    this.job = null;
    this.phase = "next";
    await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  failParse(error) {
    this.store.metaSet("last_error", "Графік опубліковано, але його таблицю не вдалося прочитати. Розмітка зображення змінилась.");
    this.store.metaSet("last_error_detail", String(error?.message || error).slice(0, 300));
    this.decoder = null;
    this.idat = null;
    this.job = null;
    this.queue = [];
    this.phase = "";
  }

  async startSync(clearTomorrow) {
    this.syncCursor = 0;
    this.syncClearTomorrow = Boolean(clearTomorrow);
    this.phase = "sync";
    await this.ctx.storage.setAlarm(Date.now() + 50);
  }

  async syncStep(now = new Date()) {
    const batch = this.store.addressesAfter(this.syncCursor, SYNC_BATCH);
    const schedule = this.schedule();
    for (const address of batch) {
      const retryAfter = await this.syncOne(address, schedule, now);
      if (retryAfter) {
        await this.ctx.storage.setAlarm(now.getTime() + retryAfter * 1000);
        return;
      }
      this.syncCursor = Number(address.id);
    }
    if (batch.length === SYNC_BATCH) {
      await this.ctx.storage.setAlarm(Date.now() + 200);
      return;
    }
    this.phase = "";
    this.syncClearTomorrow = false;
    this.store.metaSet("last_check", now.toISOString());
  }

  // Повертає кількість секунд очікування, якщо Telegram просить пригальмувати.
  async syncOne(address, schedule, now) {
    if (!schedule.today) return 0;
    const hit = groupsFor(address.city, address.street, address.house);
    if (hit.queues.length === 1) this.store.setQueue(Number(address.id), hit.queues[0][0], hit.queues[0][1]);
    const fresh = this.store.getAddress(Number(address.id)) || address;
    if (Number(fresh.queue) <= 0 || Number(fresh.subqueue) <= 0) return 0;
    const user = fresh.chat_id ? this.store.getUser(fresh.chat_id) : null;
    const silent = Boolean(Number(fresh.muted) || Number(user?.blocked));
    for (const part of ["today", "tomorrow"]) {
      if (part === "tomorrow" && !schedule.tomorrow && !this.syncClearTomorrow) continue;
      const retryAfter = await this.syncPart(fresh, part, schedule[part], silent, now);
      if (retryAfter) return retryAfter;
    }
    return 0;
  }

  async syncPart(address, part, chart, silent, now) {
    if (!chart) {
      this.store.clearState(Number(address.id), part);
      return 0;
    }
    const state = partState(chart, address.queue, address.subqueue);
    if (!state) return 0;
    const kind = noticeKind(this.store.getState(Number(address.id), part), state);
    if (!kind) return 0;
    if (!silent && address.chat_id) {
      const outcome = await deliver(this.telegram, address.chat_id, {
        text: noticeText({ address, part, chart, kind, now }),
        markup: { inline_keyboard: [[{ text: T.OPEN_CARD, callback_data: `show:${address.id}` }]] },
      });
      if (outcome.retryAfter) return outcome.retryAfter;
      if (outcome.blocked) this.store.markBlocked(address.chat_id);
      else if (!outcome.ok) return 0;
    }
    this.store.saveState(Number(address.id), part, state);
    return 0;
  }

  schedule() {
    return { today: this.chart("today"), tomorrow: this.chart("tomorrow") };
  }

  chart(part) {
    const raw = this.store.metaGet(`${part}_slots`);
    if (!raw) return null;
    const slots = JSON.parse(raw);
    return {
      iso: this.store.metaGet(`${part}_iso`),
      label: this.store.metaGet(`${part}_label`),
      image: this.store.metaGet(`${part}_image`),
      ranges(queue, subqueue) {
        return rangesFor(slots, queue, subqueue);
      },
    };
  }

  health() {
    let sample = null;
    try {
      sample = this.chart("today")?.ranges(2, 2) ?? null;
    } catch {
      sample = null;
    }
    return {
      ok: true,
      users: this.store.countUsers(),
      addresses: this.store.countAddresses(),
      parsing: Boolean(this.job),
      syncing: this.phase === "sync",
      todayImage: this.store.metaGet("today_image"),
      tomorrowImage: this.store.metaGet("tomorrow_image"),
      sample22: sample,
      lastError: this.store.metaGet("last_error"),
      lastCheck: this.store.metaGet("last_check"),
    };
  }
}
