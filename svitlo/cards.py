"""Картки для бота: як користуватись, де працює, графік адреси."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

_FONT = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"
_FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"

INK = (232, 238, 246)
MUTED = (168, 186, 206)
AMBER = (245, 185, 66)
MINT = (125, 206, 160)
NAVY = (14, 28, 47)
PANEL = (22, 48, 78)
LINE = (48, 78, 112)


def render_guide() -> bytes:
    image = _canvas(1080, 1280)
    draw = ImageDraw.Draw(image)
    _header(draw, "Як користуватись", "Три рядки — і графік у цьому чаті")
    steps = [
        ("1", "Населений пункт", "Лише назва. Луцьк, не «місто Луцьк»."),
        ("2", "Вулиця", "Лише назва. Волі, не «вул. Волі»."),
        ("3", "Будинок", "Разом із літерою, якщо вона є: 44а."),
    ]
    y = 280
    for number, title, detail in steps:
        _step(draw, 70, y, number, title, detail)
        y += 210
    _example(draw, 70, y + 10)
    return _png(image)


def render_coverage(cities: list[str]) -> bytes:
    image = _canvas(1080, 1480)
    draw = ImageDraw.Draw(image)
    _header(draw, "Де працює", "Зараз це Волинська область")
    draw.text((70, 250), "Інші області України ще не підключені.", font=_font(28), fill=MUTED)
    shown = cities[:18]
    y = 340
    x = 70
    for city in shown:
        width = _font(28, bold=True).getlength(city) + 48
        if x + width > 1010:
            x = 70
            y += 78
        _pill(draw, x, y, city)
        x += int(width) + 16
    note_y = y + 120
    draw.rounded_rectangle((70, note_y, 1010, note_y + 220), 28, fill=PANEL)
    draw.text((100, note_y + 36), "Що перевіряється", font=_font(28, bold=True), fill=AMBER)
    draw.text(
        (100, note_y + 90),
        "Усі збережені адреси звіряються\nз графіком кожні 5 хвилин.",
        font=_font(32),
        fill=INK,
        spacing=10,
    )
    return _png(image)


def render_schedule(report: str) -> bytes:
    lines = [line.strip() for line in report.splitlines() if line.strip()]
    title = lines[0] if lines else "Графік"
    body = lines[1:]
    body_font = _font(32)
    wrapped: list[tuple[str, tuple[int, int, int]]] = []
    for line in body[:12]:
        color = MINT if "немає" in line.casefold() and "відключ" in line.casefold() else INK
        if "немає в графіках" in line.casefold():
            color = AMBER
        for part in _split(line, 900, body_font):
            wrapped.append((part, color))
    title_lines = _split(title, 900, _font(40, bold=True))
    height = 220 + len(title_lines) * 56 + max(1, len(wrapped)) * 58 + 80
    image = _canvas(1080, min(max(height, 520), 1600))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((48, 48, 1032, image.height - 48), 36, fill=PANEL)
    draw.text((88, 80), "ГРАФІК СВІТЛА", font=_font(24, bold=True), fill=AMBER)
    y = 130
    for part in title_lines:
        draw.text((88, y), part, font=_font(40, bold=True), fill=INK)
        y += 52
    y += 24
    for part, color in wrapped:
        draw.text((88, y), part, font=body_font, fill=color)
        y += 52
    return _png(image)


def _canvas(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), NAVY)
    return image


def _header(draw: ImageDraw.ImageDraw, title: str, subtitle: str) -> None:
    draw.rounded_rectangle((48, 48, 1032, 220), 36, fill=PANEL)
    draw.text((80, 78), title, font=_font(54, bold=True), fill=INK)
    draw.text((80, 150), subtitle, font=_font(28), fill=MUTED)


def _step(draw: ImageDraw.ImageDraw, x: int, y: int, number: str, title: str, detail: str) -> None:
    draw.rounded_rectangle((x, y, 1010, y + 180), 28, fill=PANEL)
    draw.ellipse((x + 28, y + 46, x + 112, y + 130), fill=AMBER)
    draw.text((x + 52, y + 62), number, font=_font(36, bold=True), fill=NAVY)
    draw.text((x + 140, y + 42), title, font=_font(36, bold=True), fill=INK)
    draw.text((x + 140, y + 100), detail, font=_font(28), fill=MUTED)


def _example(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    draw.text((x, y), "Приклад одним повідомленням", font=_font(24), fill=MUTED)
    draw.rounded_rectangle((x, y + 46, 620, y + 210), 24, fill=(245, 185, 66))
    draw.text((x + 28, y + 70), "Луцьк, Волі, 44а", font=_font(36, bold=True), fill=NAVY)


def _pill(draw: ImageDraw.ImageDraw, x: int, y: int, label: str) -> None:
    font = _font(28, bold=True)
    width = int(font.getlength(label)) + 48
    draw.rounded_rectangle((x, y, x + width, y + 62), 31, fill=PANEL, outline=LINE, width=2)
    draw.text((x + 24, y + 12), label, font=font, fill=INK)


def _split(text: str, width: int, font: ImageFont.FreeTypeFont) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        if font.getlength(trial) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _wrap(draw, text, x, y, width, font, fill) -> None:
    words = text.split()
    line = ""
    cursor = y
    for word in words:
        trial = word if not line else f"{line} {word}"
        if font.getlength(trial) <= width:
            line = trial
            continue
        draw.text((x, cursor), line, font=font, fill=fill)
        cursor += 52
        line = word
    if line:
        draw.text((x, cursor), line, font=font, fill=fill)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = _FONT_BOLD if bold else _FONT
    if not Path(path).exists():
        path = _FONT
    return ImageFont.truetype(path, size)


def _png(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
