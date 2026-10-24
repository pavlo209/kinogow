"""Збирає компактний довідник черг для Worker із локальної бази."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "svitlo.db"
OUT = Path(__file__).resolve().parent / "catalog.json"


def main() -> None:
    connection = sqlite3.connect(DB)
    connection.row_factory = sqlite3.Row
    cities: dict[str, dict] = {}
    order: list[str] = []
    for row in connection.execute(
        """
        SELECT city, street, houses, queue, subqueue, enrolled, district
        FROM queue_catalog
        ORDER BY city, street, houses
        """
    ):
        city = str(row["city"])
        if city not in cities:
            cities[city] = {"n": city, "d": str(row["district"] or ""), "s": {}}
            order.append(city)
        streets = cities[city]["s"]
        street = str(row["street"])
        streets.setdefault(street, []).append(
            [str(row["houses"]), int(row["queue"]), int(row["subqueue"]), int(row["enrolled"])]
        )
    payload = {
        "cities": [
            {
                "n": city,
                "d": cities[city]["d"],
                "s": [{"n": street, "r": rows} for street, rows in cities[city]["s"].items()],
            }
            for city in order
        ]
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT} {OUT.stat().st_size} bytes, {len(order)} cities")


if __name__ == "__main__":
    main()
