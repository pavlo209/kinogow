"""Телеграм-бот: адреса з трьох рядків і повний графік у відповідь."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from svitlo.address_input import clean_place_line, looks_like_house, parse_address_message
from svitlo.db import Store
from svitlo.lookup import assign_queue
from svitlo.monitor import send_telegram
from svitlo.report import build_report
from svitlo.schedule import format_address
from svitlo.source import ChartBundle, HttpChartClient

HELP = (
    "Надішліть адресу, і я пришлю графік на сьогодні й на завтра.\n\n"
    "Можна трьома рядками:\n"
    "Луцьк\n"
    "Лесі Українки\n"
    "15\n\n"
    "Або одним рядком: Луцьк, Лесі Українки, 15\n\n"
    "Назву пункту пишіть без «місто» і «село», вулицю без «вул.». "
    "Далі писатиму сюди, якщо години зміняться, відключень не буде або з’явиться графік на завтра.\n\n"
    "Команди: /list — збережені адреси, /remove — прибрати останню."
)


def handle_text(store: Store, chat_id: str, text: str, bundle: ChartBundle) -> str:
    command = text.strip().split()[0].lower() if text.strip().startswith("/") else ""
    command = command.split("@", 1)[0]
    if command in {"/start", "/help"}:
        store.clear_dialog(chat_id)
        store.set_dialog(chat_id, "city")
        return HELP
    if command == "/cancel":
        store.clear_dialog(chat_id)
        return "Гаразд, адресу не записую. Надішліть нову, коли будете готові."
    if command == "/list":
        return _list_text(store, chat_id, bundle)
    if command == "/remove":
        removed = store.delete_last_for_chat(chat_id)
        if removed is None:
            return "Збережених адрес ще немає."
        place = format_address(removed["city"], removed["street"], 0, 0, removed["house"])
        return f"Прибрав адресу {place}."

    parsed = parse_address_message(text)
    if parsed:
        store.clear_dialog(chat_id)
        return _save_and_report(store, chat_id, parsed[0], parsed[1], parsed[2], bundle)

    dialog = store.get_dialog(chat_id)
    step = dialog["step"] if dialog else "city"
    line = clean_place_line(text)
    if not line or line.startswith("/"):
        return HELP
    if step == "street" and dialog is not None:
        store.set_dialog(chat_id, "house", dialog["city"], line)
        return f"Вулиця: {line}. Тепер надішліть номер будинку."
    if step == "house" and dialog is not None:
        if not looks_like_house(line):
            return "Потрібен номер будинку, наприклад 15 або 15а."
        store.clear_dialog(chat_id)
        return _save_and_report(store, chat_id, dialog["city"], dialog["street"], line, bundle)
    store.set_dialog(chat_id, "street", line, "")
    return f"Населений пункт: {line}. Тепер надішліть вулицю без «вул.»."


def remember_state(store: Store, address_id: int, bundle: ChartBundle) -> None:
    """Фіксує поточний графік, щоб наступна перевірка писала лише про зміну."""
    from svitlo.monitor import _sync_part

    address = store.get_address(address_id)
    if address is None or int(address["queue"]) == 0 or bundle.error:
        return
    place = format_address(
        address["city"], address["street"], address["queue"], address["subqueue"], address["house"]
    )
    for part, when, chart in (
        ("today", "Сьогодні", bundle.today),
        ("tomorrow", "На завтра", bundle.tomorrow),
    ):
        _sync_part(
            store,
            address_id=address_id,
            part=part,
            when=when,
            chart=chart,
            queue=int(address["queue"]),
            subqueue=int(address["subqueue"]),
            place=place,
            chat_id=str(address["chat_id"]),
            notify=False,
        )


def poll_once(store: Store, client: HttpChartClient) -> None:
    token = store.get_setting("telegram_token")
    if not token:
        return
    offset = store.get_setting("telegram_offset")
    payload: dict = {"timeout": 0, "allowed_updates": ["message"]}
    if offset:
        payload["offset"] = int(offset)
    try:
        updates = _api(token, "getUpdates", payload, timeout=20)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return
    if not updates.get("ok"):
        return
    bundle = None
    for item in updates.get("result") or []:
        store.set_setting("telegram_offset", str(int(item["update_id"]) + 1))
        message = item.get("message") or {}
        chat = message.get("chat") or {}
        text = message.get("text") or ""
        if chat.get("id") is None or not text:
            continue
        if bundle is None:
            bundle = client.load()
        reply = handle_text(store, str(chat["id"]), text, bundle)
        send_telegram(token, str(chat["id"]), reply)


def run_bot(store: Store, client: HttpChartClient, stop) -> None:
    token = store.get_setting("telegram_token")
    if not token:
        return
    while not stop.is_set():
        offset = store.get_setting("telegram_offset")
        payload: dict = {"timeout": 25, "allowed_updates": ["message"]}
        if offset:
            payload["offset"] = int(offset)
        try:
            updates = _api(token, "getUpdates", payload, timeout=40)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            stop.wait(5)
            continue
        if not updates.get("ok"):
            stop.wait(5)
            continue
        batch = updates.get("result") or []
        bundle = client.load() if batch else None
        for item in batch:
            store.set_setting("telegram_offset", str(int(item["update_id"]) + 1))
            message = item.get("message") or {}
            chat = message.get("chat") or {}
            text = message.get("text") or ""
            if chat.get("id") is None or not text or bundle is None:
                continue
            try:
                reply = handle_text(store, str(chat["id"]), text, bundle)
            except Exception:
                reply = "Не вдалося зібрати графік. Надішліть адресу ще раз трохи згодом."
            send_telegram(token, str(chat["id"]), reply)


def _save_and_report(
    store: Store,
    chat_id: str,
    city: str,
    street: str,
    house: str,
    bundle: ChartBundle,
) -> str:
    address_id = store.save_place(city, street, house, chat_id)
    assign_queue(store, address_id, city, street, house)
    address = store.get_address(address_id)
    groups = []
    if address and int(address["queue"]) > 0:
        groups = [(int(address["queue"]), int(address["subqueue"]))]
    report = build_report(
        city=city,
        street=street,
        house=house,
        groups=groups,
        today=None if bundle.error else bundle.today,
        tomorrow=None if bundle.error else bundle.tomorrow,
    )
    if bundle.error:
        report = f"{report}\n\n{bundle.error}"
    remember_state(store, address_id, bundle)
    return report


def _list_text(store: Store, chat_id: str, bundle: ChartBundle) -> str:
    rows = store.list_for_chat(chat_id)
    if not rows:
        return "Збережених адрес ще немає. " + HELP
    parts = []
    for row in rows:
        groups = [(int(row["queue"]), int(row["subqueue"]))] if int(row["queue"]) > 0 else []
        parts.append(
            build_report(
                city=row["city"],
                street=row["street"],
                house=row["house"],
                groups=groups,
                today=None if bundle.error else bundle.today,
                tomorrow=None if bundle.error else bundle.tomorrow,
            )
        )
    return "\n\n".join(parts)


def _api(token: str, method: str, payload: dict, timeout: int) -> dict:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode())
