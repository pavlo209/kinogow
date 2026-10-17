"""Читання графіка черг із зображення Волиньобленерго і тексти сповіщень."""

from __future__ import annotations

from dataclasses import dataclass

from svitlo.pngutil import decode_png

SLOTS = 48
GROUPS = [(queue, sub) for queue in range(1, 7) for sub in (1, 2)]


class ScheduleParseError(ValueError):
    pass


@dataclass(frozen=True)
class DaySchedule:
    """48 півгодинних слотів для кожної черги та підчерги. True — світла немає."""

    slots: dict[tuple[int, int], tuple[bool, ...]]

    def ranges_for(self, queue: int, subqueue: int) -> list[tuple[str, str]]:
        flags = self.slots.get((queue, subqueue))
        if flags is None:
            raise ScheduleParseError(f"Немає черги {queue}.{subqueue}")
        return slots_to_ranges(flags)


def parse_schedule_png(data: bytes) -> DaySchedule:
    width, height, rows = decode_png(data)
    bands = _data_rows(width, height, rows)
    clusters = _cluster_rows(bands)
    tables = [cluster for cluster in clusters if len(cluster) == 12]
    if len(tables) < 2:
        raise ScheduleParseError(
            "Не вдалося прочитати таблицю графіка: розмітка зображення змінилась"
        )
    morning, afternoon = tables[0], tables[1]
    columns = _time_columns(rows, morning[0][0])
    if len(columns) != 24:
        raise ScheduleParseError("У графіку не 24 півгодинні колонки")

    slots: dict[tuple[int, int], tuple[bool, ...]] = {}
    for index, (queue, subqueue) in enumerate(GROUPS):
        flags = []
        for y in (morning[index][0], afternoon[index][0]):
            for x in columns:
                flags.append(_is_outage(rows, x, y))
        if len(flags) != SLOTS:
            raise ScheduleParseError("Неповна доба у графіку")
        slots[(queue, subqueue)] = tuple(flags)
    return DaySchedule(slots=slots)


def slots_to_ranges(flags: tuple[bool, ...] | list[bool]) -> list[tuple[str, str]]:
    ranges: list[tuple[str, str]] = []
    index = 0
    while index < len(flags):
        if not flags[index]:
            index += 1
            continue
        end = index + 1
        while end < len(flags) and flags[end]:
            end += 1
        ranges.append((_slot_label(index), _slot_label(end)))
        index = end
    return ranges


def format_address(city: str, street: str, queue: int, subqueue: int) -> str:
    place = city.strip()
    if street.strip():
        place = f"{place}, {street.strip()}"
    return f"{place} (черга {queue}.{subqueue})"


def format_notice(
    *,
    when: str,
    schedule_date: str,
    address: str,
    ranges: list[tuple[str, str]],
    changed: bool,
) -> str:
    prefix = "Графік змінився. " if changed else ""
    if not ranges:
        return (
            f"{prefix}{when}, {schedule_date}, за адресою {address} відключень немає."
        )
    parts = [f"з {start} до {end}" for start, end in ranges]
    if len(parts) == 1:
        hours = parts[0]
    else:
        hours = ", ".join(parts[:-1]) + " та " + parts[-1]
    return f"{prefix}{when}, {schedule_date}, за адресою {address} відключення {hours}."


def _slot_label(slot_index: int) -> str:
    minutes = slot_index * 30
    if minutes >= 24 * 60:
        return "24:00"
    hour, minute = divmod(minutes, 60)
    return f"{hour:02d}:{minute:02d}"


def _is_cell(r: int, g: int, b: int) -> bool:
    return _is_outage_color(r, g, b) or _is_supply_color(r, g, b)


def _is_outage_color(r: int, g: int, b: int) -> bool:
    return r < 110 and b > 120 and b > r + 30 and g < 160


def _is_supply_color(r: int, g: int, b: int) -> bool:
    return 150 < r < 220 and 165 < g < 230 and 180 < b < 245


def _data_rows(width: int, height: int, rows: list[bytes]) -> list[tuple[int, int]]:
    in_band = False
    start = 0
    bands: list[tuple[int, int]] = []
    step = 4
    threshold = max(20, (width // step) // 5)
    for y in range(height):
        row = rows[y]
        cells = 0
        for x in range(0, width, step):
            offset = x * 3
            if _is_cell(row[offset], row[offset + 1], row[offset + 2]):
                cells += 1
        if cells >= threshold:
            if not in_band:
                start = y
                in_band = True
        elif in_band:
            if y - start >= 36:
                bands.append(((start + y - 1) // 2, y - start))
            in_band = False
    if in_band and height - start >= 36:
        bands.append(((start + height - 1) // 2, height - start))
    data: list[tuple[int, int]] = []
    for y, _height in bands:
        # Рядок даних має підписи черги і 24 години. Шапка таблиці має лише 24 клітинки.
        if len(_cell_runs(rows[y], width, min_width=30)) >= 26:
            data.append((y, _height))
    return data


def _cluster_rows(rows: list[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    if not rows:
        return []
    clusters: list[list[tuple[int, int]]] = [[rows[0]]]
    for row in rows[1:]:
        if row[0] - clusters[-1][-1][0] > 80:
            clusters.append([row])
        else:
            clusters[-1].append(row)
    return clusters


def _cell_runs(row: bytes, width: int, min_width: int) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    run_start = None
    for x in range(width):
        offset = x * 3
        cell = _is_cell(row[offset], row[offset + 1], row[offset + 2])
        if cell and run_start is None:
            run_start = x
        elif not cell and run_start is not None:
            if x - run_start >= min_width:
                runs.append((run_start, x - 1))
            run_start = None
    if run_start is not None and width - run_start >= min_width:
        runs.append((run_start, width - 1))
    return runs


def _time_columns(rows: list[bytes], y: int) -> list[int]:
    width = len(rows[y]) // 3
    runs = _cell_runs(rows[y], width, min_width=30)
    if len(runs) < 24:
        raise ScheduleParseError("Не знайдено колонки годин")
    time_runs = runs[-24:]
    return [(start + end) // 2 for start, end in time_runs]


def _is_outage(rows: list[bytes], x: int, y: int) -> bool:
    row = rows[y]
    dark = 0
    seen = 0
    for dx in (-3, 0, 3):
        px = x + dx
        if px < 0 or px * 3 + 2 >= len(row):
            continue
        offset = px * 3
        seen += 1
        if _is_outage_color(row[offset], row[offset + 1], row[offset + 2]):
            dark += 1
    return seen > 0 and dark * 2 >= seen
