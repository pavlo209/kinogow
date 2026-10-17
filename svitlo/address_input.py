"""Розбір адреси, яку людина надсилає боту."""

from __future__ import annotations

import re

_CITY_PREFIX = re.compile(
    r"^(?:місто|м|село|с|смт|селище)\.?\s+",
    re.IGNORECASE,
)
_STREET_PREFIX = re.compile(
    r"^(?:вулиця|вул|провулок|пров|проспект|просп|пр|площа|пл)\.?\s+",
    re.IGNORECASE,
)
_HOUSE_PREFIX = re.compile(r"^(?:будинок|буд)\.?\s+", re.IGNORECASE)
_HOUSE = re.compile(r"^\d+[a-zа-яіїєґ]?(?:[/-]\d+[a-zа-яіїєґ]?)?$", re.IGNORECASE)


def parse_loose_address(text: str, cities: list[str] | None = None) -> tuple[str, str, str] | None:
    """Розбирає «Луцьк Волі 44 а» і «Новий Загорів, Шевченка 10»."""
    raw = clean_place_line(text.strip(" ,"))
    if not raw or raw.startswith("/"):
        return None
    match = re.search(r"(\d+)\s*([a-zа-яіїєґ]?)\s*$", raw, re.IGNORECASE)
    if not match:
        return None
    house = match.group(1) + (match.group(2) or "")
    if not looks_like_house(house):
        return None
    head = raw[: match.start()].strip(" ,")
    if not head:
        return None
    city = ""
    street = ""
    if cities:
        for candidate in sorted(cities, key=len, reverse=True):
            if head.casefold().startswith(candidate.casefold()):
                city = candidate
                street = head[len(candidate) :].strip(" ,")
                break
    if not city:
        parts = head.split()
        if len(parts) < 2:
            return None
        city, street = parts[0], " ".join(parts[1:])
    street = _clean_street(street)
    city = _clean_city(city)
    if len(city) < 2 or len(street) < 2:
        return None
    return city, street, house


def parse_address_message(text: str) -> tuple[str, str, str] | None:
    raw = text.strip()
    if not raw or raw.startswith("/"):
        return None
    lines = _split_lines(raw)
    if len(lines) < 3:
        return None
    city = _clean_city(lines[0])
    house = _clean_house(lines[-1])
    street = _clean_street(" ".join(lines[1:-1]))
    if len(city) < 2 or len(street) < 2 or not looks_like_house(house):
        return None
    return city, street, house


def looks_like_house(value: str) -> bool:
    return bool(_HOUSE.fullmatch(value.strip()))


def clean_place_line(value: str) -> str:
    return " ".join(value.strip().split())


def _split_lines(raw: str) -> list[str]:
    chunks = [part.strip() for part in re.split(r"[\n;]", raw) if part.strip()]
    if len(chunks) == 1 and "," in chunks[0]:
        chunks = [part.strip() for part in chunks[0].split(",") if part.strip()]
    return chunks


def _clean_city(value: str) -> str:
    return _CITY_PREFIX.sub("", clean_place_line(value)).strip()


def _clean_street(value: str) -> str:
    return _STREET_PREFIX.sub("", clean_place_line(value)).strip()


def _clean_house(value: str) -> str:
    return _HOUSE_PREFIX.sub("", clean_place_line(value)).strip()
