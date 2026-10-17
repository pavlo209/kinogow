"""Порівняння графіка з тим, що вже бачили, і текст сповіщення."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime

from svitlo.db import Store
from svitlo.lookup import assign_queue
from svitlo.schedule import format_address, format_notice
from svitlo.source import KYIV, ChartBundle, PublishedChart

TODAY = "today"
TOMORROW = "tomorrow"


def sync(store: Store, bundle: ChartBundle) -> list[str]:
    with store.sync_lock:
        return _sync_locked(store, bundle)


def _sync_locked(store: Store, bundle: ChartBundle) -> list[str]:
    if bundle.error:
        store.set_setting("last_error", bundle.error)
        store.set_setting("last_check", _stamp(bundle))
        return []

    store.set_setting("last_error", "")
    _remember_chart(store, TODAY, bundle.today)
    _remember_chart(store, TOMORROW, bundle.tomorrow)
    created: list[str] = []
    for address in store.list_addresses():
        created.extend(_sync_address(store, address, bundle))
    store.set_setting("last_check", _stamp(bundle))
    return created


def main_keyboard() -> dict:
    return {
        "keyboard": [
            [{"text": "Додати адресу"}, {"text": "Мої адреси"}],
            [{"text": "Де працює"}, {"text": "Як користуватись"}],
            [{"text": "Сайт стеження"}],
        ],
        "resize_keyboard": True,
        "is_persistent": True,
    }


def send_telegram(token: str, chat_id: str, text: str, reply_markup: dict | None = None) -> str:
    if not token.strip() or not chat_id.strip():
        return ""
    url = f"https://api.telegram.org/bot{token.strip()}/sendMessage"
    payload = {"chat_id": chat_id.strip(), "text": text}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    request = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    return _telegram_result(request)


def send_telegram_photo(
    token: str,
    chat_id: str,
    image: bytes,
    caption: str,
    reply_markup: dict | None = None,
) -> str:
    if not token.strip() or not chat_id.strip() or not image:
        return ""
    url = f"https://api.telegram.org/bot{token.strip()}/sendPhoto"
    boundary = "----svitloBoundary"
    caption = caption[:1000]
    fields = {"chat_id": chat_id.strip(), "caption": caption}
    if reply_markup:
        fields["reply_markup"] = json.dumps(reply_markup, ensure_ascii=False)
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(value.encode("utf-8"))
        body.extend(b"\r\n")
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(b'Content-Disposition: form-data; name="photo"; filename="card.png"\r\n')
    body.extend(b"Content-Type: image/png\r\n\r\n")
    body.extend(image)
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    return _telegram_result(request)


def _telegram_result(request: urllib.request.Request) -> str:
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return f"не надіслано (HTTP {exc.code})"
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return "не надіслано (немає зв'язку з Telegram)"
    if not body.get("ok"):
        return "не надіслано"
    return "надіслано в Telegram"


def _sync_address(store: Store, address, bundle: ChartBundle) -> list[str]:
    assign_queue(store, int(address["id"]), address["city"], address["street"], address["house"])
    fresh = store.get_address(int(address["id"])) or address
    queue = int(fresh["queue"])
    subqueue = int(fresh["subqueue"])
    if queue <= 0 or subqueue <= 0:
        return []
    place = format_address(fresh["city"], fresh["street"], queue, subqueue, fresh["house"])
    chat_id = fresh["chat_id"]
    messages: list[str] = []
    messages.extend(
        _sync_part(
            store,
            address_id=int(fresh["id"]),
            part=TODAY,
            when="Сьогодні",
            chart=bundle.today,
            queue=queue,
            subqueue=subqueue,
            place=place,
            chat_id=chat_id,
        )
    )
    messages.extend(
        _sync_part(
            store,
            address_id=int(fresh["id"]),
            part=TOMORROW,
            when="На завтра",
            chart=bundle.tomorrow,
            queue=queue,
            subqueue=subqueue,
            place=place,
            chat_id=chat_id,
        )
    )
    return messages


def _sync_part(
    store: Store,
    *,
    address_id: int,
    part: str,
    when: str,
    chart: PublishedChart | None,
    queue: int,
    subqueue: int,
    place: str,
    chat_id: str = "",
    notify: bool = True,
) -> list[str]:
    if chart is None:
        store.clear_state(address_id, part)
        return []
    ranges = chart.schedule.ranges_for(queue, subqueue)
    schedule_date = chart.schedule_date.strftime("%d.%m.%Y")
    signature = chart.schedule_date.isoformat() + "|" + ";".join(f"{start}-{end}" for start, end in ranges)
    previous = store.get_state(address_id, part)
    if previous is not None and previous["signature"] == signature:
        return []
    changed = previous is not None and previous["schedule_date"] == schedule_date
    text = format_notice(
        when=when,
        schedule_date=schedule_date,
        address=place,
        ranges=ranges,
        changed=changed,
    )
    if not notify:
        store.save_state(
            address_id,
            part,
            signature,
            schedule_date,
            json.dumps(ranges, ensure_ascii=False),
            chart.image_url,
            chart.updated_at.isoformat(),
        )
        return []
    target = chat_id or store.get_setting("telegram_chat_id")
    token = store.get_setting("telegram_token")
    status = _send_notice(token, target, text, place, when, schedule_date, ranges, changed)
    store.add_notification(address_id, text, status)
    store.save_state(
        address_id,
        part,
        signature,
        schedule_date,
        json.dumps(ranges, ensure_ascii=False),
        chart.image_url,
        chart.updated_at.isoformat(),
    )
    return [text]


def _send_notice(token: str, chat_id: str, text: str, place: str, when: str, schedule_date: str, ranges, changed: bool) -> str:
    from svitlo.cards import render_schedule

    card_text = f"{place}\n{when}, {schedule_date}"
    if changed:
        card_text = "Графік змінився\n" + card_text
    if ranges:
        card_text += "\n" + ", ".join(f"{start}–{end}" for start, end in ranges)
    else:
        card_text += "\nВідключень немає"
    photo = send_telegram_photo(token, chat_id, render_schedule(card_text), text, main_keyboard())
    if photo.startswith("не") or not photo:
        return send_telegram(token, chat_id, text, main_keyboard())
    return photo


def _remember_chart(store: Store, part: str, chart: PublishedChart | None) -> None:
    if chart is None:
        store.set_setting(f"{part}_date", "")
        store.set_setting(f"{part}_updated", "")
        store.set_setting(f"{part}_image", "")
        return
    store.set_setting(f"{part}_date", chart.schedule_date.isoformat())
    store.set_setting(f"{part}_updated", chart.updated_at.isoformat())
    store.set_setting(f"{part}_image", chart.image_url)


def _stamp(_bundle: ChartBundle) -> str:
    return datetime.now(KYIV).replace(microsecond=0).isoformat()
