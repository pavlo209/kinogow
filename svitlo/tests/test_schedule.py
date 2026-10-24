import unittest
from pathlib import Path

from svitlo.pngutil import decode_png, encode_rgb_png
from svitlo.schedule import format_address, format_notice, parse_schedule_png

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "today.png"


class PngRoundTripTest(unittest.TestCase):
    def test_tiny_rgb_png(self) -> None:
        rows = [b"\xff\x00\x00\x00\xff\x00", b"\x00\x00\xff\xff\xff\xff"]
        width, height, decoded = decode_png(encode_rgb_png(2, 2, rows))
        self.assertEqual((width, height), (2, 2))
        self.assertEqual(decoded, rows)


class RealChartTest(unittest.TestCase):
    def test_today_fixture_groups(self) -> None:
        schedule = parse_schedule_png(FIXTURE.read_bytes())
        self.assertEqual(schedule.ranges_for(1, 1), [("10:00", "14:00")])
        self.assertEqual(schedule.ranges_for(1, 2), [("14:00", "17:30")])
        self.assertEqual(schedule.ranges_for(2, 1), [("17:30", "21:00")])
        self.assertEqual(schedule.ranges_for(2, 2), [("21:00", "22:00")])
        self.assertEqual(schedule.ranges_for(3, 1), [("11:00", "14:00")])
        self.assertEqual(schedule.ranges_for(3, 2), [("11:00", "14:00")])
        self.assertEqual(schedule.ranges_for(6, 2), [("21:00", "22:00")])


class MessageTest(unittest.TestCase):
    def test_outage_and_clear_day(self) -> None:
        address = format_address("Луцьк", "Лесі Українки", 1, 1)
        self.assertEqual(address, "Луцьк, Лесі Українки (черга 1.1)")
        text = format_notice(
            when="Сьогодні",
            schedule_date="17.10.2026",
            address=address,
            ranges=[("10:00", "14:00")],
            changed=False,
        )
        self.assertEqual(
            text,
            "Сьогодні, 17.10.2026, за адресою Луцьк, Лесі Українки (черга 1.1) відключення з 10:00 до 14:00.",
        )
        changed = format_notice(
            when="На завтра",
            schedule_date="18.10.2026",
            address=format_address("Омеляник", "", 3, 2),
            ranges=[("08:00", "12:00"), ("16:00", "18:30")],
            changed=True,
        )
        self.assertEqual(
            changed,
            "Графік змінився. На завтра, 18.10.2026, за адресою Омеляник (черга 3.2) "
            "відключення з 08:00 до 12:00 та з 16:00 до 18:30.",
        )
        clear = format_notice(
            when="Сьогодні",
            schedule_date="17.10.2026",
            address=format_address("Луцьк", "", 2, 1),
            ranges=[],
            changed=False,
        )
        self.assertEqual(
            clear,
            "Сьогодні, 17.10.2026, за адресою Луцьк (черга 2.1) відключень немає.",
        )


if __name__ == "__main__":
    unittest.main()
