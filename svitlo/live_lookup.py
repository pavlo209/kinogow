"""Перевірка нової адреси на сайті Волиньобленерго перед відповіддю «немає»."""

from __future__ import annotations

import subprocess
from pathlib import Path

from svitlo.catalog import parse_queue_tsv, rows_as_tuples

SEARCH_SCRIPT = Path(__file__).with_name("live_search.mjs")


def search_and_import(store, city: str, street: str) -> bool:
    import os

    if os.environ.get("SVITLO_LIVE_SEARCH") != "1":
        return False
    text = _search(city, street)
    if text is None:
        return False
    rows = [row for row in parse_queue_tsv(text) if _same(row.city, city)]
    if street.strip():
        rows = [row for row in rows if _same(row.street, street)]
    if rows:
        store.import_queue_rows(rows_as_tuples(rows))
    return True


def _search(city: str, street: str) -> str | None:
    if not SEARCH_SCRIPT.exists():
        return None
    try:
        completed = subprocess.run(
            ["node", str(SEARCH_SCRIPT), city, street],
            check=False,
            capture_output=True,
            text=True,
            timeout=25,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if completed.returncode != 0:
        return None
    return completed.stdout


def _same(left: str, right: str) -> bool:
    return left.casefold() == right.casefold()
