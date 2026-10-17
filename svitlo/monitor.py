"""Порівняння графіка з тим, що вже бачили, і текст сповіщення."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime

from svitlo.db import Store
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


def send_telegram(token: str, chat_id: str, text: str) -> str:
    if not token.strip() or not chat_id.strip():
        return ""
    url = f"https://api.telegram.org/bot{token.strip()}/sendMessage"
    payload = json.dumps({"chat_id": chat_id.strip(), "text": text}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
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
    messages: list[str] = []
    place = format_address(address["city"], address["street"], address["queue"], address["subqueue"])
    messages.extend(
        _sync_part(
            store,
            address_id=int(address["id"]),
            part=TODAY,
            when="Сьогодні",
            chart=bundle.today,
            queue=int(address["queue"]),
            subqueue=int(address["subqueue"]),
            place=place,
        )
    )
    messages.extend(
        _sync_part(
            store,
            address_id=int(address["id"]),
            part=TOMORROW,
            when="На завтра",
            chart=bundle.tomorrow,
            queue=int(address["queue"]),
            subqueue=int(address["subqueue"]),
            place=place,
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
    status = send_telegram(
        store.get_setting("telegram_token"),
        store.get_setting("telegram_chat_id"),
        text,
    )
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
