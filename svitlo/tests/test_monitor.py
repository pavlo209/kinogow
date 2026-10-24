import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

from svitlo.db import Store
from svitlo.monitor import sync
from svitlo.schedule import DaySchedule
from svitlo.source import ChartBundle, PublishedChart


def _slots(ranges: list[tuple[str, str]]) -> tuple[bool, ...]:
    flags = [False] * 48

    def index(label: str) -> int:
        if label == "24:00":
            return 48
        hour, minute = (int(part) for part in label.split(":"))
        return (hour * 60 + minute) // 30

    for start, end in ranges:
        for slot in range(index(start), index(end)):
            flags[slot] = True
    return tuple(flags)


def _chart(schedule_date: date, group: tuple[int, int], ranges: list[tuple[str, str]], url: str) -> PublishedChart:
    slots = {(queue, sub): _slots([]) for queue in range(1, 7) for sub in (1, 2)}
    slots[group] = _slots(ranges)
    return PublishedChart(
        schedule_date=schedule_date,
        updated_at=datetime(2026, 10, 17, 10, 10, tzinfo=timezone.utc),
        image_url=url,
        schedule=DaySchedule(slots=slots),
    )


class MonitorTest(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.store = Store(Path(self._dir.name) / "svitlo.db")
        self.store.add_address("Луцьк", "Лесі Українки", 1, 1)

    def tearDown(self) -> None:
        self._dir.cleanup()

    def test_first_status_then_no_duplicate_then_change_and_clear_day(self) -> None:
        today = _chart(date(2026, 10, 17), (1, 1), [("10:00", "14:00")], "today-a")
        first = sync(self.store, ChartBundle(today=today, tomorrow=None, error=""))
        self.assertEqual(
            first,
            [
                "Сьогодні, 17.10.2026, за адресою Луцьк, Лесі Українки (черга 1.1) відключення з 10:00 до 14:00."
            ],
        )
        self.assertEqual(sync(self.store, ChartBundle(today=today, tomorrow=None, error="")), [])

        changed = _chart(date(2026, 10, 17), (1, 1), [("18:00", "22:00")], "today-b")
        second = sync(self.store, ChartBundle(today=changed, tomorrow=None, error=""))
        self.assertEqual(
            second,
            [
                "Графік змінився. Сьогодні, 17.10.2026, за адресою Луцьк, Лесі Українки (черга 1.1) "
                "відключення з 18:00 до 22:00."
            ],
        )

        clear = _chart(date(2026, 10, 17), (1, 1), [], "today-c")
        third = sync(self.store, ChartBundle(today=clear, tomorrow=None, error=""))
        self.assertEqual(
            third,
            ["Графік змінився. Сьогодні, 17.10.2026, за адресою Луцьк, Лесі Українки (черга 1.1) відключень немає."],
        )

    def test_tomorrow_appears_without_claiming_a_change(self) -> None:
        today = _chart(date(2026, 10, 17), (1, 1), [("10:00", "14:00")], "today-a")
        sync(self.store, ChartBundle(today=today, tomorrow=None, error=""))
        tomorrow = _chart(date(2026, 10, 18), (1, 1), [], "tomorrow-a")
        messages = sync(self.store, ChartBundle(today=today, tomorrow=tomorrow, error=""))
        self.assertEqual(
            messages,
            ["На завтра, 18.10.2026, за адресою Луцьк, Лесі Українки (черга 1.1) відключень немає."],
        )

    def test_source_error_does_not_invent_a_clear_day(self) -> None:
        today = _chart(date(2026, 10, 17), (1, 1), [("10:00", "14:00")], "today-a")
        sync(self.store, ChartBundle(today=today, tomorrow=None, error=""))
        again = sync(self.store, ChartBundle(today=None, tomorrow=None, error="Сайт недоступний"))
        self.assertEqual(again, [])
        self.assertEqual(self.store.get_setting("last_error"), "Сайт недоступний")
        state = self.store.get_state(1, "today")
        self.assertIsNotNone(state)
        self.assertIn("10:00", state["ranges_json"])


if __name__ == "__main__":
    unittest.main()
