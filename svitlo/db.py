"""Локальне сховище адрес, станів графіка і повідомлень."""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Store:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.sync_lock = threading.Lock()
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS addresses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    city TEXT NOT NULL,
                    street TEXT NOT NULL DEFAULT '',
                    queue INTEGER NOT NULL,
                    subqueue INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS states (
                    address_id INTEGER NOT NULL,
                    part TEXT NOT NULL,
                    signature TEXT NOT NULL,
                    schedule_date TEXT NOT NULL,
                    ranges_json TEXT NOT NULL,
                    image_url TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (address_id, part)
                );
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    address_id INTEGER,
                    body TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    telegram_status TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    def add_address(self, city: str, street: str, queue: int, subqueue: int) -> int:
        with self._lock, self._connect() as conn:
            existing = conn.execute(
                """
                SELECT id FROM addresses
                WHERE lower(city) = lower(?) AND lower(street) = lower(?)
                  AND queue = ? AND subqueue = ?
                """,
                (city, street, queue, subqueue),
            ).fetchone()
            if existing:
                return int(existing["id"])
            cursor = conn.execute(
                """
                INSERT INTO addresses (city, street, queue, subqueue, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (city, street, queue, subqueue, utc_now()),
            )
            return int(cursor.lastrowid)

    def delete_address(self, address_id: int) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM states WHERE address_id = ?", (address_id,))
            conn.execute("DELETE FROM addresses WHERE id = ?", (address_id,))

    def list_addresses(self) -> list[sqlite3.Row]:
        with self._lock, self._connect() as conn:
            return conn.execute(
                "SELECT * FROM addresses ORDER BY id"
            ).fetchall()

    def get_state(self, address_id: int, part: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as conn:
            return conn.execute(
                "SELECT * FROM states WHERE address_id = ? AND part = ?",
                (address_id, part),
            ).fetchone()

    def save_state(
        self,
        address_id: int,
        part: str,
        signature: str,
        schedule_date: str,
        ranges_json: str,
        image_url: str,
        updated_at: str,
    ) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO states (
                    address_id, part, signature, schedule_date, ranges_json, image_url, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(address_id, part) DO UPDATE SET
                    signature = excluded.signature,
                    schedule_date = excluded.schedule_date,
                    ranges_json = excluded.ranges_json,
                    image_url = excluded.image_url,
                    updated_at = excluded.updated_at
                """,
                (address_id, part, signature, schedule_date, ranges_json, image_url, updated_at),
            )

    def clear_state(self, address_id: int, part: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "DELETE FROM states WHERE address_id = ? AND part = ?",
                (address_id, part),
            )

    def add_notification(self, address_id: int | None, body: str, telegram_status: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO notifications (address_id, body, created_at, telegram_status)
                VALUES (?, ?, ?, ?)
                """,
                (address_id, body, utc_now(), telegram_status),
            )

    def list_notifications(self, limit: int = 40) -> list[sqlite3.Row]:
        with self._lock, self._connect() as conn:
            return conn.execute(
                "SELECT * FROM notifications ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()

    def get_setting(self, key: str, default: str = "") -> str:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
            return default if row is None else str(row["value"])

    def set_setting(self, key: str, value: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, value),
            )
