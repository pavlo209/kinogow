import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

from svitlo.address_input import parse_address_message, parse_loose_address
from svitlo.bot import handle_callback, handle_text
from svitlo.db import Store
from svitlo.lookup import house_in_spec, parse_queue_html, select_queues
from svitlo.report import build_report
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


def _bundle() -> ChartBundle:
    slots = {(queue, sub): _slots([]) for queue in range(1, 7) for sub in (1, 2)}
    slots[(1, 1)] = _slots([("10:00", "14:00")])
    schedule = DaySchedule(slots=slots)
    today = PublishedChart(
        schedule_date=date(2026, 10, 17),
        updated_at=datetime(2026, 10, 17, 10, 0, tzinfo=timezone.utc),
        image_url="today",
        schedule=schedule,
    )
    return ChartBundle(today=today, tomorrow=None, error="")


class AddressParseTest(unittest.TestCase):
    def test_house_14_16_is_one_building(self) -> None:
        from svitlo.lookup import house_in_spec

        self.assertFalse(house_in_spec("15", "10, 12, 14-16, 16"))
        self.assertTrue(house_in_spec("15", "13, 15, 17"))
        self.assertTrue(house_in_spec("8", "1-10, 12"))

    def test_loose_line_with_split_letter(self) -> None:
        self.assertEqual(
            parse_loose_address("Луцьк Волі 44 а", ["Луцьк"]),
            ("Луцьк", "Волі", "44а"),
        )

    def test_three_lines_and_one_line(self) -> None:
        self.assertEqual(
            parse_address_message("Луцьк\nвул. Лесі Українки\nбуд. 15а"),
            ("Луцьк", "Лесі Українки", "15а"),
        )
        self.assertEqual(
            parse_address_message("місто Луцьк, Лесі Українки, 12/1"),
            ("Луцьк", "Лесі Українки", "12/1"),
        )
        self.assertIsNone(parse_address_message("Луцьк, Лесі Українки"))


class QueueParseTest(unittest.TestCase):
    def test_table_filters_house(self) -> None:
        html = """
        <table>
          <tr><td>Луцьк</td><td>Лесі Українки</td><td>1-20</td><td>1.1</td></tr>
          <tr><td>Луцьк</td><td>Лесі Українки</td><td>21-40</td><td>1.2</td></tr>
        </table>
        """
        matches = parse_queue_html(html)
        self.assertEqual(select_queues(matches, "15"), [(1, 1)])
        self.assertEqual(select_queues(matches, "25"), [(1, 2)])
        self.assertEqual(select_queues(matches, "15а"), [])

    def test_plain_sentence_and_challenge(self) -> None:
        self.assertEqual(
            parse_queue_html("<p>Ваша черга ГПВ: 3.2</p>"),
            [(3, 2, "")],
        )
        with self.assertRaises(Exception):
            parse_queue_html("<title>Just a moment...</title>")
        self.assertTrue(house_in_spec("8", "1-10, 12"))
        self.assertFalse(house_in_spec("11", "1-10"))


class BotFlowTest(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.store = Store(Path(self._dir.name) / "svitlo.db")
        self.store.add_address("Луцьк", "Лесі Українки", 1, 1)

    def tearDown(self) -> None:
        self._dir.cleanup()

    def test_one_message_returns_today_and_tomorrow(self) -> None:
        reply = handle_text(self.store, "505", "Луцьк\nЛесі Українки\n15", _bundle())
        self.assertIn("Луцьк, Лесі Українки, 15 (черга 1.1)", reply)
        self.assertIn("Сьогодні, 17.10.2026: відключення з 10:00 до 14:00.", reply)
        self.assertIn("На завтра: графік ще не опубліковано.", reply)

    def test_step_by_step(self) -> None:
        bundle = _bundle()
        self.assertIn("Надішліть вулицю", handle_text(self.store, "9", "Луцьк", bundle))
        self.assertIn("номер будинку", handle_text(self.store, "9", "Лесі Українки", bundle))
        reply = handle_text(self.store, "9", "7", bundle)
        self.assertIn("черга 1.1", reply)
        self.assertIn("10:00 до 14:00", reply)

    def test_extra_spaces_point_to_strumivka_in_lutsk_district(self) -> None:
        self.store.import_queue_rows([
            ("Струмівка", "Рівненська", "126, 128", 6, 2, True, "", "Луцький"),
        ])
        reply = handle_text(self.store, "9", "Струм  івка\nРівненська\n126", _bundle())
        self.assertIn("Луцький район", reply)
        self.assertIn("черга 6.2", reply)
        self.assertIn("зайві пробіли", reply)

    def test_edit_replaces_the_chosen_address(self) -> None:
        self.store.import_queue_rows([
            ("Луцьк", "Волі", "44а", 2, 2, True, "", "Луцький"),
            ("Баїв", "Набережна", "21", 1, 2, True, "", "Луцький"),
        ])
        address_id = self.store.save_place("Луцьк", "Волі", "44а", "9")
        handle_callback(self.store, "9", f"edit:{address_id}", _bundle())
        reply = handle_text(self.store, "9", "Баїв, Набережна, 21", _bundle())
        self.assertIn("Баїв", reply)
        updated = self.store.get_address(address_id)
        self.assertEqual(updated["city"], "Баїв")
        self.assertEqual(updated["house"], "21")

    def test_missing_house_is_reported_only_after_the_street_is_known(self) -> None:
        self.store.import_queue_rows([("Луцьк", "Волі", "10, 12", 2, 2, True, "")])
        reply = handle_text(self.store, "9", "Луцьк\nВолі\n99", _bundle())
        self.assertIn("Вашої адреси немає в графіках відключень.", reply)
        self.assertIn("Волі", reply)

    def test_list_and_remove(self) -> None:
        bundle = _bundle()
        handle_text(self.store, "9", "Луцьк, Лесі Українки, 4", bundle)
        listing = handle_text(self.store, "9", "/list", bundle)
        self.assertIn("4", listing)
        self.assertIn("10:00", listing)
        removed = handle_text(self.store, "9", "/remove", bundle)
        self.assertIn("Прибрав адресу", removed)
        self.assertEqual(self.store.list_for_chat("9"), [])


class CatalogHouseTest(unittest.TestCase):
    def test_voli_44a_and_spaced_letter(self) -> None:
        from svitlo.catalog import match_catalog, parse_queue_table

        html = """
        <table>
          <tr><td>Луцький</td><td>Луцьк</td><td>Волі</td><td>-, 30, 44 а, 44а</td><td>2.2</td><td>Не залучено</td></tr>
          <tr><td>Луцький</td><td>Баїв</td><td>Набережна</td><td>10, 21, 21А</td><td>1.2</td><td>7</td></tr>
        </table>
        """
        rows = [
            {
                "city": row.city,
                "street": row.street,
                "houses": row.houses,
                "queue": row.queue,
                "subqueue": row.subqueue,
                "enrolled": 1 if row.enrolled else 0,
            }
            for row in parse_queue_table(html)
        ]
        voli = match_catalog(rows, "Луцьк", "Волі", "44а")
        self.assertEqual(voli.queues, [(2, 2)])
        baiv = match_catalog(rows, "Баїв", "Набережна", "21")
        self.assertEqual(baiv.queues, [(1, 2)])
        self.assertEqual(match_catalog(rows, "Баїв", "Набережна", "21А").queues, [(1, 2)])


class ReportTest(unittest.TestCase):
    def test_unknown_queue_does_not_invent_hours(self) -> None:
        text = build_report(
            city="Ковель",
            street="Незалежності",
            house="3",
            groups=[],
            today=None,
            tomorrow=None,
        )
        self.assertIn("Ковель, Незалежності, 3", text)
        self.assertIn("ще не визначено чергу", text)
        self.assertNotIn("відключення з", text)


if __name__ == "__main__":
    unittest.main()
