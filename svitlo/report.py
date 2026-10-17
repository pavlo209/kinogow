"""Повний текст графіка для однієї адреси: сьогодні і завтра."""

from __future__ import annotations

from svitlo.schedule import format_address
from svitlo.source import PublishedChart


def build_report(
    *,
    city: str,
    street: str,
    house: str,
    groups: list[tuple[int, int]],
    today: PublishedChart | None,
    tomorrow: PublishedChart | None,
) -> str:
    if not groups:
        place = format_address(city, street, 0, 0, house)
        return (
            f"{place}\n\n"
            "За цією адресою ще не визначено чергу, тому години відключення не зібрані. "
            "Перевірю пошук Волиньобленерго ще раз автоматично."
        )
    if len(groups) == 1:
        queue, subqueue = groups[0]
        place = format_address(city, street, queue, subqueue, house)
        return "\n".join(
            [
                place,
                "",
                _day_line("Сьогодні", today, queue, subqueue),
                _day_line("На завтра", tomorrow, queue, subqueue),
            ]
        )
    place = format_address(city, street, 0, 0, house)
    lines = [place, ""]
    for when, chart in (("Сьогодні", today), ("На завтра", tomorrow)):
        lines.append(when if chart is None else f"{when}, {chart.schedule_date.strftime('%d.%m.%Y')}")
        if chart is None:
            lines.append("Графік ще не опубліковано.")
            lines.append("")
            continue
        for queue, subqueue in groups:
            ranges = chart.schedule.ranges_for(queue, subqueue)
            hours = "відключень немає" if not ranges else _hours(ranges)
            lines.append(f"Черга {queue}.{subqueue}: {hours}.")
        lines.append("")
    return "\n".join(lines).strip()


def _day_line(when: str, chart: PublishedChart | None, queue: int, subqueue: int) -> str:
    if chart is None:
        return f"{when}: графік ще не опубліковано."
    schedule_date = chart.schedule_date.strftime("%d.%m.%Y")
    ranges = chart.schedule.ranges_for(queue, subqueue)
    if not ranges:
        return f"{when}, {schedule_date}: відключень немає."
    return f"{when}, {schedule_date}: відключення {_hours(ranges)}."


def _hours(ranges: list[tuple[str, str]]) -> str:
    parts = [f"з {start} до {end}" for start, end in ranges]
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " та " + parts[-1]
