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
                    created_at TEXT NOT NULL,
                    house TEXT NOT NULL DEFAULT '',
                    chat_id TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS dialogs (
                    chat_id TEXT PRIMARY KEY,
                    step TEXT NOT NULL,
                    city TEXT NOT NULL DEFAULT '',
                    street TEXT NOT NULL DEFAULT ''
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
            self._migrate(conn)

    def _migrate(self, conn: sqlite3.Connection) -> None:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(addresses)")}
        if "house" not in columns:
            conn.execute("ALTER TABLE addresses ADD COLUMN house TEXT NOT NULL DEFAULT ''")
        if "chat_id" not in columns:
            conn.execute("ALTER TABLE addresses ADD COLUMN chat_id TEXT NOT NULL DEFAULT ''")

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        return conn

    def add_address(
        self,
        city: str,
        street: str,
        queue: int,
        subqueue: int,
        house: str = "",
        chat_id: str = "",
    ) -> int:
        with self._lock, self._connect() as conn:
            existing = conn.execute(
                """
                SELECT id FROM addresses
                WHERE lower(city) = lower(?) AND lower(street) = lower(?)
                  AND lower(house) = lower(?) AND queue = ? AND subqueue = ?
                  AND chat_id = ?
                """,
                (city, street, house, queue, subqueue, chat_id),
            ).fetchone()
            if existing:
                return int(existing["id"])
            cursor = conn.execute(
                """
                INSERT INTO addresses (city, street, queue, subqueue, house, chat_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (city, street, queue, subqueue, house, chat_id, utc_now()),
            )
            return int(cursor.lastrowid)

    def save_place(self, city: str, street: str, house: str, chat_id: str) -> int:
        """Зберігає адресу. Якщо для цієї вулиці черга вже відома, підставляє її."""
        with self._lock, self._connect() as conn:
            existing = conn.execute(
                """
                SELECT * FROM addresses
                WHERE lower(city) = lower(?) AND lower(street) = lower(?)
                  AND lower(house) = lower(?) AND chat_id = ?
                """,
                (city, street, house, chat_id),
            ).fetchone()
            known = self._known_queue(conn, city, street)
            if existing:
                if known and int(existing["queue"]) == 0:
                    conn.execute(
                        "UPDATE addresses SET queue = ?, subqueue = ? WHERE id = ?",
                        (known[0], known[1], existing["id"]),
                    )
                return int(existing["id"])
            queue, subqueue = known or (0, 0)
            cursor = conn.execute(
                """
                INSERT INTO addresses (city, street, queue, subqueue, house, chat_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (city, street, queue, subqueue, house, chat_id, utc_now()),
            )
            return int(cursor.lastrowid)

    def set_queue(self, address_id: int, queue: int, subqueue: int) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE addresses SET queue = ?, subqueue = ? WHERE id = ?",
                (queue, subqueue, address_id),
            )

    def known_queue(self, city: str, street: str) -> tuple[int, int] | None:
        with self._lock, self._connect() as conn:
            return self._known_queue(conn, city, street)

    def _known_queue(self, conn: sqlite3.Connection, city: str, street: str) -> tuple[int, int] | None:
        rows = conn.execute(
            """
            SELECT DISTINCT queue, subqueue FROM addresses
            WHERE lower(city) = lower(?) AND lower(street) = lower(?) AND queue > 0
            """,
            (city, street),
        ).fetchall()
        if len(rows) != 1:
            return None
        return int(rows[0]["queue"]), int(rows[0]["subqueue"])

    def get_address(self, address_id: int) -> sqlite3.Row | None:
        with self._lock, self._connect() as conn:
            return conn.execute("SELECT * FROM addresses WHERE id = ?", (address_id,)).fetchone()

    def list_for_chat(self, chat_id: str) -> list[sqlite3.Row]:
        with self._lock, self._connect() as conn:
            return conn.execute(
                "SELECT * FROM addresses WHERE chat_id = ? ORDER BY id",
                (chat_id,),
            ).fetchall()

    def delete_last_for_chat(self, chat_id: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM addresses WHERE chat_id = ? ORDER BY id DESC LIMIT 1",
                (chat_id,),
            ).fetchone()
            if row is None:
                return None
            conn.execute("DELETE FROM states WHERE address_id = ?", (row["id"],))
            conn.execute("DELETE FROM addresses WHERE id = ?", (row["id"],))
            return row

    def get_dialog(self, chat_id: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as conn:
            return conn.execute("SELECT * FROM dialogs WHERE chat_id = ?", (chat_id,)).fetchone()

    def set_dialog(self, chat_id: str, step: str, city: str = "", street: str = "") -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO dialogs (chat_id, step, city, street) VALUES (?, ?, ?, ?)
                ON CONFLICT(chat_id) DO UPDATE SET step = excluded.step, city = excluded.city, street = excluded.street
                """,
                (chat_id, step, city, street),
            )

    def clear_dialog(self, chat_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM dialogs WHERE chat_id = ?", (chat_id,))

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
