"""Сторінка, де зберігається адреса і показуються сповіщення про відключення."""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.parse
from datetime import datetime
from html import escape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from svitlo.db import Store
from svitlo.monitor import send_telegram, sync
from svitlo.schedule import format_address
from svitlo.source import KYIV, HttpChartClient

PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = PACKAGE_DIR / "data" / "svitlo.db"
OFFICIAL_SEARCH = (
    "https://energy.volyn.ua/spozhyvacham/perervy-u-elektropostachanni/"
    "hrafik-vidkliuchen/page.php#move"
)


class App:
    def __init__(self, store: Store, client: HttpChartClient, interval_seconds: int = 1200) -> None:
        self.store = store
        self.client = client
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()

    def refresh(self) -> list[str]:
        return sync(self.store, self.client.load())

    def start_background(self) -> None:
        thread = threading.Thread(target=self._loop, name="svitlo-monitor", daemon=True)
        thread.start()

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.refresh()
            except Exception:
                self.store.set_setting("last_error", "Перевірка графіка перервалась. Наступна спроба буде автоматично.")
            self._stop.wait(self.interval_seconds)


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            path = urllib.parse.urlsplit(self.path).path
            if path == "/health":
                self._json({"ok": True, "addresses": len(app.store.list_addresses())})
                return
            if path != "/":
                self._text(404, "Сторінку не знайдено")
                return
            self._html(render_page(app, self.path))

        def do_POST(self) -> None:  # noqa: N802
            path = urllib.parse.urlsplit(self.path).path
            form = self._form()
            if path == "/addresses":
                error = add_address(app, form)
                self._redirect("/" if not error else "/?error=" + urllib.parse.quote(error))
                return
            if path == "/addresses/delete":
                raw = form.get("id", "")
                if raw.isdigit():
                    app.store.delete_address(int(raw))
                self._redirect("/")
                return
            if path == "/check":
                app.refresh()
                self._redirect("/")
                return
            if path == "/settings":
                save_settings(app, form)
                self._redirect("/?settings=1")
                return
            self._text(404, "Сторінку не знайдено")

        def log_message(self, fmt: str, *args) -> None:
            print("[svitlo]", self.address_string(), fmt % args)

        def _form(self) -> dict[str, str]:
            length = int(self.headers.get("Content-Length") or "0")
            if length > 20_000:
                return {}
            raw = self.rfile.read(length).decode("utf-8", "replace")
            parsed = urllib.parse.parse_qs(raw, keep_blank_values=True)
            return {key: values[0] for key, values in parsed.items()}

        def _redirect(self, location: str) -> None:
            self.send_response(303)
            self.send_header("Location", location)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def _html(self, body: str) -> None:
            payload = body.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _text(self, status: int, body: str) -> None:
            payload = body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def _json(self, data: dict) -> None:
            payload = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    return Handler


def add_address(app: App, form: dict[str, str]) -> str:
    city = " ".join(form.get("city", "").split())
    street = " ".join(form.get("street", "").split())
    if len(city) < 2 or len(city) > 80:
        return "Вкажіть назву населеного пункту, без слів «місто» чи «село»."
    if len(street) > 80:
        return "Назва вулиці задовга."
    if not form.get("queue", "").isdigit() or not form.get("subqueue", "").isdigit():
        return "Оберіть чергу і підчергу."
    queue = int(form["queue"])
    subqueue = int(form["subqueue"])
    if queue not in range(1, 7) or subqueue not in (1, 2):
        return "Черга має бути від 1 до 6, підчерга — 1 або 2."
    app.store.add_address(city, street, queue, subqueue)
    app.refresh()
    return ""


def save_settings(app: App, form: dict[str, str]) -> None:
    chat_id = form.get("telegram_chat_id", "").strip()
    token = form.get("telegram_token", "").strip()
    if form.get("clear_telegram") == "1":
        app.store.set_setting("telegram_token", "")
        app.store.set_setting("telegram_chat_id", "")
        return
    if chat_id:
        app.store.set_setting("telegram_chat_id", chat_id)
    if token:
        app.store.set_setting("telegram_token", token)
    if form.get("send_test") == "1":
        status = send_telegram(
            app.store.get_setting("telegram_token"),
            app.store.get_setting("telegram_chat_id"),
            "Перевірка сповіщень. Якщо ви це бачите, повідомлення про відключення приходитимуть сюди.",
        )
        app.store.set_setting("telegram_test", status or "спочатку вкажіть токен і chat id")


def render_page(app: App, request_path: str = "/") -> str:
    addresses = app.store.list_addresses()
    notices = app.store.list_notifications()
    parts = urllib.parse.urlsplit(request_path)
    query = urllib.parse.parse_qs(parts.query)
    error = query.get("error", [""])[0]
    settings_saved = "settings" in query
    last_error = app.store.get_setting("last_error")
    last_check = _local_time(app.store.get_setting("last_check"))
    today_label = _date_label(app.store.get_setting("today_date"))
    tomorrow_label = _date_label(app.store.get_setting("tomorrow_date"))
    today_updated = _local_time(app.store.get_setting("today_updated"))
    token_saved = bool(app.store.get_setting("telegram_token"))
    chat_saved = app.store.get_setting("telegram_chat_id")
    test_status = app.store.get_setting("telegram_test")
    cards = "\n".join(_address_card(app.store, row) for row in addresses) or (
        '<p class="empty">Адрес ще немає. Додайте населений пункт, і перевірка піде сама.</p>'
    )
    feed = "\n".join(_notice(row) for row in notices) or '<p class="empty">Повідомлень ще немає.</p>'
    banner = ""
    if error:
        banner = f'<p class="banner bad">{escape(error)}</p>'
    elif last_error:
        banner = f'<p class="banner bad">{escape(last_error)}</p>'
    elif settings_saved:
        banner = '<p class="banner">Налаштування Telegram збережено.</p>'
    chart_line = _chart_line(today_label, today_updated, tomorrow_label)
    return f"""<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Графік світла</title>
<style>
:root {{ color-scheme: light; --ink:#172033; --muted:#5c6b80; --line:#d7e0ea; --bg:#eef3f8; --card:#fff; --accent:#1d4e89; --accent-2:#163e6b; --bad:#9f1239; --ok:#0f766e; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; font:16px/1.45 "Segoe UI", system-ui, sans-serif; color:var(--ink); background:var(--bg); }}
main {{ max-width:980px; margin:0 auto; padding:28px 16px 64px; }}
h1 {{ font-size:32px; line-height:1.15; margin:0 0 8px; }}
h2 {{ font-size:20px; margin:28px 0 12px; }}
.lead {{ margin:0; color:var(--muted); max-width:68ch; }}
.grid {{ display:grid; gap:16px; grid-template-columns:1.2fr .8fr; }}
.card, form.panel {{ background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px; }}
label {{ display:block; font-size:14px; margin:10px 0 4px; }}
input, select {{ width:100%; border:1px solid var(--line); border-radius:10px; padding:10px 12px; font:inherit; background:#fff; }}
.row {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }}
button, .button {{ border:0; border-radius:999px; padding:10px 16px; background:var(--accent); color:#fff; font:inherit; cursor:pointer; }}
button.secondary, .button.secondary {{ background:#e8eef5; color:var(--ink); }}
button.danger {{ background:#fff; color:var(--bad); border:1px solid #f3c3cf; }}
.actions {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }}
.banner {{ border-radius:12px; padding:12px 14px; background:#e7f5ef; color:var(--ok); }}
.banner.bad {{ background:#fff1f2; color:var(--bad); }}
.meta {{ color:var(--muted); font-size:14px; }}
.address {{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }}
.hours {{ margin:8px 0 0; }}
.hours strong {{ font-weight:650; }}
.ok {{ color:var(--ok); }}
.out {{ color:#9a3412; }}
.empty {{ color:var(--muted); margin:0; }}
.notice {{ padding:10px 0; border-top:1px solid var(--line); }}
.notice:first-child {{ border-top:0; padding-top:0; }}
.hint {{ color:var(--muted); font-size:14px; }}
a {{ color:var(--accent); }}
@media (max-width:800px) {{ .grid, .row {{ grid-template-columns:1fr; }} h1 {{ font-size:28px; }} }}
</style>
</head>
<body>
<main>
  <h1>Графік світла за вашою адресою</h1>
  <p class="lead">Вкажіть населений пункт і чергу. Сервіс сам перевіряє графік Волиньобленерго і пише, якщо години змінились, відключень сьогодні немає, або з’явились дані на завтра.</p>
  <p class="meta">{chart_line} Остання перевірка: {escape(last_check or "ще не було")}.</p>
  {banner}
  <div class="grid">
    <section>
      <h2>Адреси</h2>
      {cards}
    </section>
    <section>
      <h2>Додати адресу</h2>
      <form class="panel" method="post" action="/addresses">
        <label for="city">Населений пункт</label>
        <input id="city" name="city" required maxlength="80" placeholder="Наприклад, Луцьк" autocomplete="address-level2">
        <label for="street">Вулиця, якщо потрібна в тексті</label>
        <input id="street" name="street" maxlength="80" placeholder="Лесі Українки" autocomplete="address-line1">
        <div class="row">
          <div>
            <label for="queue">Черга</label>
            <select id="queue" name="queue" required>
              <option value="1">1</option><option value="2">2</option><option value="3">3</option>
              <option value="4">4</option><option value="5">5</option><option value="6">6</option>
            </select>
          </div>
          <div>
            <label for="subqueue">Підчерга</label>
            <select id="subqueue" name="subqueue" required>
              <option value="1">1</option><option value="2">2</option>
            </select>
          </div>
        </div>
        <p class="hint">Назву пункту пишіть без «місто» і «село», вулицю — без «вул.». Чергу один раз показує <a href="{OFFICIAL_SEARCH}">пошук адреси на сайті Волиньобленерго</a>. Далі години беруться з графіка черг самі.</p>
        <div class="actions"><button type="submit">Стежити за адресою</button></div>
      </form>
      <form method="post" action="/check" class="actions"><button class="secondary" type="submit">Перевірити зараз</button></form>
    </section>
  </div>
  <h2>Повідомлення</h2>
  <section class="card">{feed}</section>
  <h2>Telegram</h2>
  <form class="panel" method="post" action="/settings">
    <p class="hint">Необов’язково. Якщо вказати бота, ті самі повідомлення приходитимуть у чат. Токен створюється в BotFather.</p>
    <label for="telegram_chat_id">Chat id</label>
    <input id="telegram_chat_id" name="telegram_chat_id" value="{escape(chat_saved)}" placeholder="123456789" autocomplete="off">
    <label for="telegram_token">Токен бота</label>
    <input id="telegram_token" name="telegram_token" type="password" placeholder="{"токен уже збережено" if token_saved else "123456:ABC"}" autocomplete="off">
    <div class="actions">
      <button type="submit" name="send_test" value="1">Зберегти і надіслати перевірку</button>
      <button class="secondary" type="submit">Лише зберегти</button>
      <button class="danger" type="submit" name="clear_telegram" value="1">Прибрати Telegram</button>
    </div>
    {f'<p class="meta">Остання перевірка Telegram: {escape(test_status)}</p>' if test_status else ''}
  </form>
  <p class="hint">Графік на сайті оновлюють щогодини. Увімкнення може відрізнятися від таблиці на 20–30 хвилин. Перевірка тут іде автоматично приблизно кожні {app.interval_seconds // 60} хв, поки сторінка сервісу запущена.</p>
</main>
</body>
</html>"""


def _address_card(store: Store, row) -> str:
    place = format_address(row["city"], row["street"], row["queue"], row["subqueue"])
    today = _hours_line(store, int(row["id"]), "today", "Сьогодні")
    tomorrow = _hours_line(store, int(row["id"]), "tomorrow", "На завтра")
    return f"""<article class="card">
      <div class="address">
        <div>
          <strong>{escape(place)}</strong>
          <p class="hours">{today}</p>
          <p class="hours">{tomorrow}</p>
        </div>
        <form method="post" action="/addresses/delete" onsubmit="return confirm('Прибрати цю адресу зі стеження?')">
          <input type="hidden" name="id" value="{int(row["id"])}">
          <button class="danger" type="submit">Прибрати</button>
        </form>
      </div>
    </article>"""


def _hours_line(store: Store, address_id: int, part: str, title: str) -> str:
    state = store.get_state(address_id, part)
    if state is None:
        if part == "tomorrow":
            return f'<span class="meta">{escape(title)}: графік ще не опубліковано.</span>'
        return f'<span class="meta">{escape(title)}: даних ще немає.</span>'
    ranges = json.loads(state["ranges_json"])
    if not ranges:
        return f'<span class="ok">{escape(title)}, {escape(state["schedule_date"])}: відключень немає.</span>'
    text = ", ".join(f"{start}–{end}" for start, end in ranges)
    return f'<span class="out">{escape(title)}, {escape(state["schedule_date"])}: {escape(text)}.</span>'


def _notice(row) -> str:
    status = f' <span class="meta">({escape(row["telegram_status"])})</span>' if row["telegram_status"] else ""
    when = _local_time(row["created_at"])
    return f'<p class="notice">{escape(row["body"])}{status}<br><span class="meta">{escape(when)}</span></p>'


def _chart_line(today_label: str, today_updated: str, tomorrow_label: str) -> str:
    if not today_label and not tomorrow_label:
        return "Графік ще не зчитано."
    today = f"Сьогоднішній графік: {today_label}" + (f", оновлено {today_updated}" if today_updated else "")
    if tomorrow_label:
        return f"{today}. На завтра вже є графік {tomorrow_label}."
    return f"{today}. На завтра графіка ще немає."


def _date_label(iso_date: str) -> str:
    if not iso_date:
        return ""
    year, month, day = iso_date.split("-")
    return f"{day}.{month}.{year}"


def _local_time(iso_value: str) -> str:
    if not iso_value:
        return ""
    try:
        parsed = datetime.fromisoformat(iso_value)
    except ValueError:
        return iso_value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=KYIV)
    return parsed.astimezone(KYIV).strftime("%d.%m.%Y %H:%M")


def serve(app: App, host: str, port: int) -> None:
    server = ThreadingHTTPServer((host, port), make_handler(app))
    print(f"Графік світла: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Зупинено")
    finally:
        app._stop.set()
        server.server_close()


def main() -> None:
    host = os.environ.get("SVITLO_HOST", "127.0.0.1")
    port = int(os.environ.get("SVITLO_PORT", "8765"))
    interval = int(os.environ.get("SVITLO_INTERVAL_SECONDS", "1200"))
    db_path = os.environ.get("SVITLO_DB", str(DEFAULT_DB))
    app = App(Store(db_path), HttpChartClient(), interval_seconds=interval)
    app.start_background()
    # Дати першій перевірці секунду, щоб не блокувати запуск, якщо мережа мовчить.
    threading.Thread(target=app.refresh, name="svitlo-first-check", daemon=True).start()
    time.sleep(0.05)
    serve(app, host, port)


if __name__ == "__main__":
    main()
