"""Пояснення, якщо назву населеного пункту або вулиці введено неточно."""

from __future__ import annotations

import difflib
import re

from svitlo.db import _name_key


def district_label(district: str) -> str:
    name = " ".join(district.split())
    name = re.sub(r"(?<=[А-Яа-яІіЇїЄєҐґ])c(?=[А-Яа-яІіЇїЄєҐґ])", "с", name)
    if not name:
        return ""
    if "район" in name.casefold():
        return name
    return f"{name} район"


def place_label(city: str, district: str) -> str:
    label = district_label(district)
    if not label:
        return city
    return f"{city} ({label})"


def correct_place(store, city: str, street: str) -> tuple[str, str, str, bool]:
    """Повертає місто, вулицю, пояснення і чи треба зупинитись без пошуку графіка."""
    places = store.places()
    if not places:
        return city, street, "", False
    city_match = _pick(city, [(name, district) for name, district in places])
    if city_match is None:
        return city, street, _unknown_city(city, places), True
    corrected_city, city_note = city_match
    district = store.district_for_city(corrected_city)
    streets = _streets(store, corrected_city)
    if not streets or not street:
        return corrected_city, street, city_note, False
    street_match = _pick(street, [(name, "") for name in streets])
    if street_match is None:
        close = difflib.get_close_matches(street, streets, n=3, cutoff=0.72)
        hint = f"У {place_label(corrected_city, district)} немає вулиці «{street}»."
        if close:
            hint += " Схожі: " + ", ".join(close) + "."
        return corrected_city, street, _join(city_note, hint), True
    corrected_street, street_note = street_match
    return corrected_city, corrected_street, _join(city_note, street_note), False


def _pick(typed: str, options: list[tuple[str, str]]) -> tuple[str, str] | None:
    if not options:
        return None
    typed_key = _name_key(typed)
    compact = typed_key.replace(" ", "")
    exact = [item for item in options if _name_key(item[0]) == typed_key]
    if exact:
        return exact[0][0], ""
    compact_hits = [item for item in options if _name_key(item[0]).replace(" ", "") == compact]
    if len(compact_hits) == 1:
        name, extra = compact_hits[0]
        return name, f"У «{typed}» зайві пробіли. Правильно: {place_label(name, extra)}."
    names = [item[0] for item in options]
    close = difflib.get_close_matches(typed, names, n=1, cutoff=0.84)
    if len(close) == 1:
        chosen = next(item for item in options if item[0] == close[0])
        return chosen[0], f"«{typed}» не збігається з довідником. Прийнято: {place_label(chosen[0], chosen[1])}."
    return None


def _unknown_city(typed: str, places: list[tuple[str, str]]) -> str:
    names = [name for name, _district in places]
    close = difflib.get_close_matches(typed, names, n=3, cutoff=0.72)
    if not close:
        return f"Населеного пункту «{typed}» немає в довіднику Волинської області."
    lines = [f"«{typed}» не знайдено. Можливо, ви мали на увазі:"]
    for name in close:
        district = next(item[1] for item in places if item[0] == name)
        lines.append(place_label(name, district))
    return "\n".join(lines)


def _streets(store, city: str) -> list[str]:
    seen: dict[str, str] = {}
    for row in store.catalog_for_city(city):
        seen.setdefault(str(row["street"]), str(row["street"]))
    return list(seen)


def _join(left: str, right: str) -> str:
    parts = [part for part in (left.strip(), right.strip()) if part]
    return "\n".join(parts)
