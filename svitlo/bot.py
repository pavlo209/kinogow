"""Телеграм-бот: адреса з трьох рядків і повний графік у відповідь."""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from svitlo.address_input import (
    clean_place_line,
    looks_like_house,
    parse_address_message,
    parse_loose_address,
)
from svitlo.db import Store
from svitlo.lookup import groups_for_address
from svitlo.cards import render_coverage, render_guide, render_schedule
from svitlo.monitor import address_button, main_keyboard, send_telegram, send_telegram_photo
from svitlo.report import build_report
from svitlo.schedule import format_address
from svitlo.source import ChartBundle, HttpChartClient

SITE_URL = (
    "https://energy.volyn.ua/spozhyvacham/perervy-u-elektropostachanni/"
    "hrafik-vidkliuchen/page.php#move"
)
BUTTONS = {
    "додати адресу": "add",
    "мої адреси": "list",
    "де працює": "where",
    "як користуватись": "help",
    "сайт стеження": "site",
}


class BotReply:
    def __init__(
        self,
        text: str,
        image: bytes | None = None,
        buttons: dict | None = None,
    ) -> None:
        self.text = text
        self.image = image
        self.buttons = buttons

    def __contains__(self, item: object) -> bool:
        return item in self.text

    def __eq__(self, other: object) -> bool:
        if isinstance(other, str):
            return self.text == other
        return NotImplemented


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


def handle_text(store: Store, chat_id: str, text: str, bundle: ChartBundle) -> BotReply:
    cleaned = text.strip()
    action = BUTTONS.get(cleaned.casefold())
    command = cleaned.split()[0].lower() if cleaned.startswith("/") else ""
    command = command.split("@", 1)[0]
    if action == "help" or command in {"/start", "/help"}:
        store.clear_dialog(chat_id)
        store.set_dialog(chat_id, "city")
        return BotReply(HELP, render_guide())
    if action == "add":
        store.set_dialog(chat_id, "city")
        return BotReply("Крок 1. Надішліть населений пункт, без слова «місто» чи «село».", render_guide())
    if action == "where":
        return BotReply(_coverage_text(store), render_coverage(_cities(store)))
    if action == "site":
        return BotReply(
            "Офіційний графік Волиньобленерго:\n" + SITE_URL + "\n\n"
            "Цей бот перевіряє збережені адреси кожні 5 хвилин і пише, коли години змінились."
        )
    if command == "/cancel":
        store.clear_dialog(chat_id)
        return BotReply("Гаразд, адресу не записую. Натисніть «Додати адресу», коли будете готові.")
    if action == "list" or command == "/list":
        return _address_list(store, chat_id, bundle)
    if command == "/remove":
        removed = store.delete_last_for_chat(chat_id)
        if removed is None:
            return BotReply("Збережених адрес ще немає.")
        place = format_address(removed["city"], removed["street"], 0, 0, removed["house"])
        return BotReply(f"Прибрав адресу {place}.")

    parsed = parse_address_message(text) or parse_loose_address(text, _cities(store))
    if parsed:
        editing = store.get_dialog(chat_id)
        target_id = int(editing["target_id"]) if editing and editing["step"] == "edit" else 0
        store.clear_dialog(chat_id)
        city, street, house = parsed
        return _save_and_report(
            store,
            chat_id,
            city,
            _without_house_suffix(street, house),
            house,
            bundle,
            target_id,
        )

    dialog = store.get_dialog(chat_id)
    step = dialog["step"] if dialog else "city"
    line = clean_place_line(text)
    if not line or line.startswith("/"):
        return BotReply(HELP, render_guide())
    if step == "street" and dialog is not None:
        store.set_dialog(chat_id, "house", dialog["city"], line)
        return BotReply(f"Крок 3. Вулиця: {line}. Надішліть номер будинку, наприклад 15 або 44а.")
    if step == "house" and dialog is not None:
        if not looks_like_house(line):
            return BotReply(
                f"«{line}» не схоже на номер будинку. "
                "Напишіть лише номер, за потреби з літерою разом: 15 або 44а. "
                "Без слова «буд.» і без зайвих пробілів."
            )
        store.clear_dialog(chat_id)
        street = _without_house_suffix(dialog["street"], line)
        return _save_and_report(store, chat_id, dialog["city"], street, line, bundle)
    store.set_dialog(chat_id, "street", line, "")
    return BotReply(f"Крок 2. Населений пункт: {line}. Надішліть вулицю без «вул.».")


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
    payload: dict = {"timeout": 0, "allowed_updates": ["message", "callback_query"]}
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
        bundle = _dispatch(store, client, token, item, bundle)


def run_bot(store: Store, client: HttpChartClient, stop) -> None:
    token = store.get_setting("telegram_token")
    if not token:
        return
    while not stop.is_set():
        offset = store.get_setting("telegram_offset")
        payload: dict = {"timeout": 25, "allowed_updates": ["message", "callback_query"]}
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
            try:
                bundle = _dispatch(store, client, token, item, bundle)
            except Exception:
                import traceback
                traceback.print_exc()
                callback = item.get("callback_query") or {}
                message = callback.get("message") or item.get("message") or {}
                chat = (message.get("chat") or {}).get("id")
                if chat is not None:
                    _deliver(
                        token,
                        str(chat),
                        BotReply("Не вдалося зібрати графік. Надішліть адресу ще раз трохи згодом."),
                    )


def _deliver(token: str, chat_id: str, reply: BotReply) -> str:
    markup = reply.buttons or main_keyboard()
    if reply.image:
        status = send_telegram_photo(token, chat_id, reply.image, reply.text, markup)
        if status and not status.startswith("не"):
            return status
    return send_telegram(token, chat_id, reply.text, markup)


def _cities(store: Store) -> list[str]:
    if not hasattr(store, "catalog_cities"):
        return []
    return store.catalog_cities()


def _coverage_text(store: Store) -> str:
    cities = _cities(store)
    listed = ", ".join(cities[:12]) if cities else "Луцьк, Ковель, Володимир"
    extra = ""
    if len(cities) > 12:
        extra = f" і ще {len(cities) - 12}"
    return (
        "Бот працює у Волинській області.\n"
        "Інші області України поки не підключені.\n\n"
        f"У довіднику зараз: {listed}{extra}.\n"
        "Збережені адреси перевіряються кожні 5 хвилин."
    )


def _dispatch(store: Store, client: HttpChartClient, token: str, item: dict, bundle: ChartBundle | None):
    callback = item.get("callback_query") or {}
    if callback:
        try:
            _api(token, "answerCallbackQuery", {"callback_query_id": callback["id"]}, 10)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            pass
        message = callback.get("message") or {}
        chat_id = (message.get("chat") or {}).get("id")
        if chat_id is None:
            return bundle
        data = callback.get("data") or ""
        if data.startswith("open:") or bundle is None:
            bundle = client.load()
        reply = handle_callback(store, str(chat_id), data, bundle)
        _deliver(token, str(chat_id), reply)
        return bundle
    message = item.get("message") or {}
    chat = message.get("chat") or {}
    text = message.get("text") or ""
    if chat.get("id") is None or not text:
        return bundle
    if bundle is None:
        bundle = client.load()
    reply = handle_text(store, str(chat["id"]), text, bundle)
    _deliver(token, str(chat["id"]), reply)
    return bundle


def _search_site(store: Store, city: str, street: str) -> bool:
    """Шукає адресу на сайті. True, якщо перевірка відбулася, навіть коли рядків немає."""
    try:
        from svitlo.live_lookup import search_and_import
    except Exception:
        return False
    return search_and_import(store, city, street)


def _without_house_suffix(street: str, house: str) -> str:
    suffix = f" {house}".casefold()
    if street.casefold().endswith(suffix):
        return street[: -len(suffix)].strip()
    return street


def handle_callback(store: Store, chat_id: str, data: str, bundle: ChartBundle) -> BotReply:
    if data.startswith("open:"):
        address = store.get_address(int(data.split(":", 1)[1]))
        if address is None or str(address["chat_id"]) != chat_id:
            return BotReply("Цієї адреси вже немає.")
        return _one_address(store, address, bundle)
    if data.startswith("edit:"):
        address = store.get_address(int(data.split(":", 1)[1]))
        if address is None or str(address["chat_id"]) != chat_id:
            return BotReply("Цієї адреси вже немає.")
        store.set_dialog(chat_id, "edit", target_id=int(address["id"]))
        place = _place_with_district(store, address)
        return BotReply(
            f"Надішліть нову адресу замість {place}.\n"
            "Трьома рядками: населений пункт, вулиця, будинок. Або через кому."
        )
    if data.startswith("del:"):
        address = store.get_address(int(data.split(":", 1)[1]))
        if address is None or str(address["chat_id"]) != chat_id:
            return BotReply("Цієї адреси вже немає.")
        place = _place_with_district(store, address)
        return BotReply(
            f"Видалити {place}?",
            buttons={
                "inline_keyboard": [[
                    {"text": "Так, видалити", "callback_data": f"delyes:{address['id']}"},
                    {"text": "Ні", "callback_data": "delno"},
                ]]
            },
        )
    if data.startswith("delyes:"):
        address_id = int(data.split(":", 1)[1])
        address = store.get_address(address_id)
        if address is None or str(address["chat_id"]) != chat_id:
            return BotReply("Цієї адреси вже немає.")
        place = _place_with_district(store, address)
        store.delete_address(address_id)
        return BotReply(f"Видалив {place}.")
    if data == "delno":
        return _address_list(store, chat_id, bundle)
    return BotReply("Не зрозумів цю кнопку. Відкрийте «Мої адреси» ще раз.")


def _save_and_report(
    store: Store,
    chat_id: str,
    city: str,
    street: str,
    house: str,
    bundle: ChartBundle,
    target_id: int = 0,
) -> BotReply:
    from svitlo.hints import correct_place

    city, street, note, blocked = correct_place(store, city, street)
    if blocked:
        text = note
        if "немає" in note:
            text = "Вашої адреси немає в графіках відключень.\n\n" + note
        return BotReply(text, render_schedule(text))
    if target_id:
        store.update_address(target_id, city, street, house)
        address_id = target_id
    else:
        address_id = store.save_place(city, street, house, chat_id)
    hit = groups_for_address(store, city, street, house)
    checked = hit.street_known
    if not hit.queues and not hit.street_known:
        checked = _search_site(store, city, street)
        if checked:
            hit = groups_for_address(store, city, street, house)
    if len(hit.queues) == 1:
        store.set_queue(address_id, hit.queues[0][0], hit.queues[0][1])
    groups = list(hit.queues)
    if not groups:
        address = store.get_address(address_id)
        if address and int(address["queue"]) > 0 and not checked:
            groups = [(int(address["queue"]), int(address["subqueue"]))]
    if groups:
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
    elif checked:
        district = store.district_for_city(city)
        from svitlo.hints import place_label

        report = (
            "Вашої адреси немає в графіках відключень.\n\n"
            f"Перевірив {place_label(city, district)}, вулицю «{street}», будинок {house}."
        )
        return BotReply(report, render_schedule(report))
    else:
        report = build_report(
            city=city,
            street=street,
            house=house,
            groups=[],
            today=None,
            tomorrow=None,
        )
    if note:
        report = note + "\n\n" + report
    remember_state(store, address_id, bundle)
    address = store.get_address(address_id)
    label = _address_label(store, address) if address else report.split("\n", 1)[0]
    return BotReply(report, render_schedule(report), address_button(address_id, label))


def _address_list(store: Store, chat_id: str, bundle: ChartBundle) -> BotReply:
    rows = store.list_for_chat(chat_id)
    if not rows:
        return BotReply("Збережених адрес ще немає. Натисніть «Додати адресу».", render_guide())
    keyboard = [
        [{"text": _address_label(store, row), "callback_data": f"open:{row['id']}"}]
        for row in rows
    ]
    return BotReply(
        "Натисніть адресу, щоб отримати свіжий графік:",
        None,
        {"inline_keyboard": keyboard},
    )


def _one_address(store: Store, address, bundle: ChartBundle) -> BotReply:
    hit = groups_for_address(store, address["city"], address["street"], address["house"])
    groups = hit.queues or (
        [(int(address["queue"]), int(address["subqueue"]))] if int(address["queue"]) > 0 else []
    )
    report = build_report(
        city=address["city"],
        street=address["street"],
        house=address["house"],
        groups=groups,
        today=None if bundle.error else bundle.today,
        tomorrow=None if bundle.error else bundle.tomorrow,
    )
    label = _place_with_district(store, address)
    buttons = {
        "inline_keyboard": [
            [
                {"text": "Змінити", "callback_data": f"edit:{address['id']}"},
                {"text": "Видалити", "callback_data": f"del:{address['id']}"},
            ],
        ]
    }
    if groups and not bundle.error:
        remember_state(store, int(address["id"]), bundle)
    text = "Оновлення\n\n" + label + "\n\n" + report
    return BotReply(text, render_schedule(report), buttons)


def _address_label(store: Store, address) -> str:
    label = format_address(address["city"], address["street"], 0, 0, address["house"])
    if len(label) > 60:
        label = label[:57] + "…"
    return label


def _place_with_district(store: Store, address) -> str:
    from svitlo.hints import place_label

    place = format_address(address["city"], address["street"], 0, 0, address["house"])
    district = store.district_for_city(address["city"])
    label = place_label(address["city"], district)
    if district and address["city"] in place:
        place = place.replace(address["city"], label, 1)
    return place


def _list_text(store: Store, chat_id: str, bundle: ChartBundle) -> str:
    rows = store.list_for_chat(chat_id)
    if not rows:
        return "Збережених адрес ще немає. " + HELP
    parts = []
    for index, row in enumerate(rows, start=1):
        hit = groups_for_address(store, row["city"], row["street"], row["house"])
        groups = hit.queues or (
            [(int(row["queue"]), int(row["subqueue"]))] if int(row["queue"]) > 0 else []
        )
        parts.append(
            f"{index}. "
            + _place_with_district(store, row)
            + "\n"
            + build_report(
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
