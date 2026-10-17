"""Публічний графік черг Волиньобленерго."""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from svitlo.schedule import DaySchedule, ScheduleParseError, parse_schedule_png

KYIV = ZoneInfo("Europe/Kyiv")
API_ROOT = "https://api-voe-poweron.inneti.net"
TODAY_KEY = "pw_gpv_image_today"
TOMORROW_KEY = "pw_gpv_image_tomorrow"


@dataclass(frozen=True)
class PublishedChart:
    schedule_date: date
    updated_at: datetime
    image_url: str
    schedule: DaySchedule


@dataclass(frozen=True)
class ChartBundle:
    today: PublishedChart | None
    tomorrow: PublishedChart | None
    error: str


class HttpChartClient:
    def __init__(self, api_root: str = API_ROOT) -> None:
        self.api_root = api_root.rstrip("/")
        self._lock = threading.Lock()
        self._parsed: dict[str, DaySchedule] = {}

    def load(self) -> ChartBundle:
        try:
            today_option = self._option(TODAY_KEY)
            tomorrow_option = self._option(TOMORROW_KEY)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            return ChartBundle(
                today=None,
                tomorrow=None,
                error="Не вдалося отримати графік з сайту Волиньобленерго. Спробуйте ще раз трохи згодом.",
            )
        try:
            today = self._chart(today_option, fallback_date=None)
            tomorrow_date = today.schedule_date + timedelta(days=1) if today else None
            tomorrow = self._chart(tomorrow_option, fallback_date=tomorrow_date)
        except ScheduleParseError:
            return ChartBundle(
                today=None,
                tomorrow=None,
                error="Графік опубліковано, але його таблицю не вдалося прочитати. Розмітка зображення змінилась.",
            )
        except (urllib.error.URLError, TimeoutError, OSError):
            return ChartBundle(
                today=None,
                tomorrow=None,
                error="Зображення графіка не завантажилось. Спробуйте ще раз трохи згодом.",
            )
        return ChartBundle(today=today, tomorrow=tomorrow, error="")

    def _chart(self, option: dict | None, fallback_date: date | None) -> PublishedChart | None:
        if not option:
            return None
        value = (option.get("value") or "").strip()
        if not value:
            return None
        updated = _parse_dt(option.get("date"))
        schedule_date = fallback_date or updated.astimezone(KYIV).date()
        image_url = value if value.startswith("http") else self.api_root + value
        schedule = self._schedule(image_url)
        return PublishedChart(
            schedule_date=schedule_date,
            updated_at=updated,
            image_url=image_url,
            schedule=schedule,
        )

    def _schedule(self, image_url: str) -> DaySchedule:
        with self._lock:
            cached = self._parsed.get(image_url)
        if cached is not None:
            return cached
        request = urllib.request.Request(image_url, headers={"User-Agent": _UA})
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = response.read()
        parsed = parse_schedule_png(payload)
        with self._lock:
            self._parsed[image_url] = parsed
        return parsed

    def _option(self, key: str) -> dict | None:
        url = f"{self.api_root}/api/options?option_key={key}"
        request = urllib.request.Request(
            url,
            headers={"Accept": "application/json", "User-Agent": _UA},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if isinstance(payload, list):
            return payload[0] if payload else None
        members = payload.get("hydra:member") if isinstance(payload, dict) else None
        if members:
            return members[0]
        return None


_UA = "SvitloMonitor/1.0 (personal outage schedule checker)"


def _parse_dt(value: str | None) -> datetime:
    if not value:
        return datetime.now(KYIV)
    text = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=KYIV)
    return parsed
