"""Пошук черги за населеним пунктом і вулицею на сайті Волиньобленерго."""

from __future__ import annotations

import re
import urllib.parse
import urllib.request

CHERGA_URL = "https://energy.volyn.ua/spozhyvacham/perervy-u-elektropostachanni/cherga/"
_UA = "SvitloMonitor/1.0 (personal outage schedule checker)"


class LookupBlocked(Exception):
    """Сайт віддав перевірку замість результату пошуку."""


def assign_queue(store, address_id: int, city: str, street: str, house: str) -> None:
    address = store.get_address(address_id)
    if address is None or int(address["queue"]) > 0:
        return
    try:
        matches = lookup_queues(city, street, house)
    except (LookupBlocked, urllib.error.URLError, TimeoutError, OSError):
        return
    if len(matches) == 1:
        store.set_queue(address_id, matches[0][0], matches[0][1])


def lookup_queues(city: str, street: str, house: str) -> list[tuple[int, int]]:
    html = _post_form(city, street)
    return select_queues(parse_queue_html(html), house)


def parse_queue_html(html: str) -> list[tuple[int, int, str]]:
    """Повертає чергу, підчергу і текст будинків, якщо він є в рядку."""
    if _is_challenge(html):
        raise LookupBlocked()
    rows = _table_matches(html)
    if rows:
        return rows
    text = _visible_text(html)
    lowered = text.lower()
    if "не знайден" in lowered or "нічого не знайдено" in lowered:
        return []
    found: list[tuple[int, int, str]] = []
    for match in re.finditer(r"(?:черг[аи]|гпв)[^\d]{0,24}([1-6])\s*[./]\s*([12])", text, re.I):
        found.append((int(match.group(1)), int(match.group(2)), ""))
    if found:
        return _unique(found)
    queue = re.search(r"черг[аи]\s*[:№]?\s*([1-6])\b", text, re.I)
    sub = re.search(r"підчерг[аи]\s*[:№]?\s*([12])\b", text, re.I)
    if queue and sub:
        return [(int(queue.group(1)), int(sub.group(1)), "")]
    return []


def select_queues(matches: list[tuple[int, int, str]], house: str) -> list[tuple[int, int]]:
    if not matches:
        return []
    specific = [(queue, sub) for queue, sub, spec in matches if spec and house_in_spec(house, spec)]
    if specific:
        return _unique_pairs(specific)
    general = [(queue, sub) for queue, sub, spec in matches if not spec.strip()]
    if general:
        return _unique_pairs(general)
    return []


def house_in_spec(house: str, spec: str) -> bool:
    number, letter = _house_key(house)
    if number == 0:
        return False
    for token in re.split(r"[,;]| та ", spec):
        token = token.strip()
        if not token:
            continue
        span = re.match(r"(\d+)\s*[-–—]\s*(\d+)$", token)
        if span:
            if letter:
                continue
            start, end = int(span.group(1)), int(span.group(2))
            if start <= number <= end:
                return True
            continue
        token_number, token_letter = _house_key(token)
        if token_number == number and token_letter == letter:
            return True
    return False


def _house_key(value: str) -> tuple[int, str]:
    match = re.match(r"(\d+)\s*([a-zа-яіїєґ]?)", value.lower().replace(" ", ""))
    if not match:
        return 0, ""
    return int(match.group(1)), match.group(2)


def _post_form(city: str, street: str) -> str:
    payload = urllib.parse.urlencode(
        {"formCity": city, "formStreet": street}
    ).encode()
    request = urllib.request.Request(
        CHERGA_URL,
        data=payload,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": _UA,
            "Origin": "https://energy.volyn.ua",
            "Referer": CHERGA_URL,
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", "replace")


def _is_challenge(html: str) -> bool:
    sample = html[:4000].lower()
    return "just a moment" in sample or "cf-challenge" in sample or "challenge-platform" in sample


def _visible_text(html: str) -> str:
    without_scripts = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    without_tags = re.sub(r"<[^>]+>", " ", without_scripts)
    return re.sub(r"\s+", " ", without_tags)


def _table_matches(html: str) -> list[tuple[int, int, str]]:
    found: list[tuple[int, int, str]] = []
    for row in re.findall(r"<tr[\s\S]*?</tr>", html, flags=re.I):
        cells = [
            re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", cell)).strip()
            for cell in re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", row, flags=re.I)
        ]
        queue_cell = next((cell for cell in cells if re.fullmatch(r"[1-6]\s*[./]\s*[12]", cell)), "")
        if not queue_cell:
            continue
        match = re.fullmatch(r"([1-6])\s*[./]\s*([12])", queue_cell)
        if not match:
            continue
        house_cell = next((cell for cell in cells if re.search(r"\d", cell) and cell != queue_cell), "")
        found.append((int(match.group(1)), int(match.group(2)), house_cell))
    return found


def _unique(items: list[tuple[int, int, str]]) -> list[tuple[int, int, str]]:
    seen: set[tuple[int, int, str]] = set()
    result = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _unique_pairs(items: list[tuple[int, int]]) -> list[tuple[int, int]]:
    seen: set[tuple[int, int]] = set()
    result = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
