"""Довідник черг: населений пункт, вулиця, будинки."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from svitlo.lookup import house_in_spec

CATALOG_PATH = Path(__file__).with_name("queue_catalog.json")


@dataclass(frozen=True)
class QueueRow:
    city: str
    street: str
    houses: str
    queue: int
    subqueue: int
    enrolled: bool
    gav: str


@dataclass(frozen=True)
class CatalogMatch:
    queues: list[tuple[int, int]]
    street_known: bool
    house_known: bool
    not_enrolled: bool


def parse_queue_tsv(text: str) -> list[QueueRow]:
    found: list[QueueRow] = []
    seen: set[tuple] = set()
    for line in text.splitlines():
        if "\t" not in line:
            continue
        cells = [part.strip() for part in line.split("\t")]
        if len(cells) < 6:
            continue
        _district, city, street, houses, gpv, gav = cells[:6]
        if city in {"", "Нас. пункт"} or street in {"", "Вулиця"}:
            continue
        queue, subqueue, enrolled = _parse_gpv(gpv)
        row = QueueRow(city, street, houses, queue, subqueue, enrolled, gav)
        key = (city.casefold(), street.casefold(), houses, queue, subqueue, gav)
        if key in seen:
            continue
        seen.add(key)
        found.append(row)
    return found


def parse_queue_table(html: str) -> list[QueueRow]:
    found: list[QueueRow] = []
    seen: set[tuple] = set()
    for raw in re.findall(r"<tr[\s\S]*?</tr>", html, flags=re.I):
        cells = [
            re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", cell)).strip()
            for cell in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", raw, flags=re.I)
        ]
        if len(cells) < 6:
            continue
        _district, city, street, houses, gpv, gav = cells[:6]
        if city in {"", "Нас. пункт"} or street in {"", "Вулиця"}:
            continue
        queue, subqueue, enrolled = _parse_gpv(gpv)
        row = QueueRow(city, street, houses, queue, subqueue, enrolled, gav)
        key = (city.casefold(), street.casefold(), houses, queue, subqueue, gav)
        if key in seen:
            continue
        seen.add(key)
        found.append(row)
    return found


def match_catalog(rows: list, city: str, street: str, house: str) -> CatalogMatch:
    street_rows = [
        row
        for row in rows
        if _same(row["city"], city) and _same(row["street"], street)
    ]
    if not street_rows:
        return CatalogMatch([], False, False, False)
    matched = [row for row in street_rows if house_in_spec(house, row["houses"])]
    if not matched:
        return CatalogMatch([], True, False, False)
    enrolled = [row for row in matched if int(row["enrolled"]) and int(row["queue"]) > 0]
    queues = _unique((int(row["queue"]), int(row["subqueue"])) for row in enrolled)
    return CatalogMatch(queues, True, True, not queues)


def rows_as_tuples(rows: list[QueueRow]) -> list[tuple]:
    return [
        (row.city, row.street, row.houses, row.queue, row.subqueue, row.enrolled, row.gav)
        for row in rows
    ]


def load_bundled_catalog(store) -> int:
    if not CATALOG_PATH.exists():
        return 0
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    tuples = [
        (
            item["city"],
            item["street"],
            item["houses"],
            int(item["queue"]),
            int(item["subqueue"]),
            bool(item["enrolled"]),
            item.get("gav", ""),
        )
        for item in payload
    ]
    return store.import_queue_rows(tuples)


def dump_catalog(path: Path, rows: list[QueueRow]) -> None:
    payload = [
        {
            "city": row.city,
            "street": row.street,
            "houses": row.houses,
            "queue": row.queue,
            "subqueue": row.subqueue,
            "enrolled": row.enrolled,
            "gav": row.gav,
        }
        for row in rows
    ]
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _parse_gpv(value: str) -> tuple[int, int, bool]:
    match = re.fullmatch(r"([1-6])\s*\.\s*([12])", value.strip())
    if not match:
        return 0, 0, False
    return int(match.group(1)), int(match.group(2)), True


def _same(left: str, right: str) -> bool:
    return left.casefold() == right.casefold()


def _unique(items) -> list[tuple[int, int]]:
    seen: set[tuple[int, int]] = set()
    result = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
