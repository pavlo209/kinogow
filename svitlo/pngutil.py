"""Мінімальний декодер PNG (RGB / RGBA, без інтерлейсу)."""

from __future__ import annotations

import struct
import zlib


def decode_png(data: bytes) -> tuple[int, int, list[bytes]]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Файл не є PNG")
    pos = 8
    width = height = None
    color_type = None
    bit_depth = None
    interlace = None
    idat = bytearray()
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, bit_depth, color_type, _comp, _filt, interlace = struct.unpack(
                ">IIBBBBB", chunk
            )
        elif kind == b"IDAT":
            idat.extend(chunk)
        elif kind == b"IEND":
            break
    if width is None or color_type not in (2, 6) or bit_depth != 8 or interlace != 0:
        raise ValueError("Цей PNG має непідтримуваний формат")
    channels = 3 if color_type == 2 else 4
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    rows: list[bytes] = []
    index = 0
    prev = bytearray(stride)
    for _y in range(height):
        filter_type = raw[index]
        index += 1
        row = bytearray(raw[index : index + stride])
        index += stride
        _unfilter(filter_type, row, prev, channels)
        if channels == 4:
            rgb = bytearray(width * 3)
            for x in range(width):
                rgb[x * 3 : x * 3 + 3] = row[x * 4 : x * 4 + 3]
            row_bytes = bytes(rgb)
        else:
            row_bytes = bytes(row)
        rows.append(row_bytes)
        prev = row
    return width, height, rows


def _unfilter(filter_type: int, row: bytearray, prev: bytearray, bpp: int) -> None:
    if filter_type == 0:
        return
    if filter_type == 1:
        for i in range(len(row)):
            left = row[i - bpp] if i >= bpp else 0
            row[i] = (row[i] + left) & 255
        return
    if filter_type == 2:
        for i in range(len(row)):
            row[i] = (row[i] + prev[i]) & 255
        return
    if filter_type == 3:
        for i in range(len(row)):
            left = row[i - bpp] if i >= bpp else 0
            row[i] = (row[i] + ((left + prev[i]) // 2)) & 255
        return
    if filter_type == 4:
        for i in range(len(row)):
            left = row[i - bpp] if i >= bpp else 0
            up = prev[i]
            up_left = prev[i - bpp] if i >= bpp else 0
            row[i] = (row[i] + _paeth(left, up, up_left)) & 255
        return
    raise ValueError(f"Невідомий фільтр PNG: {filter_type}")


def _paeth(left: int, up: int, up_left: int) -> int:
    estimate = left + up - up_left
    pa = abs(estimate - left)
    pb = abs(estimate - up)
    pc = abs(estimate - up_left)
    if pa <= pb and pa <= pc:
        return left
    if pb <= pc:
        return up
    return up_left


def encode_rgb_png(width: int, height: int, rows: list[bytes]) -> bytes:
    """Записує RGB PNG без фільтрів. Потрібен лише для тестів."""
    raw = bytearray()
    for row in rows:
        if len(row) != width * 3:
            raise ValueError("Невірна ширина рядка")
        raw.append(0)
        raw.extend(row)
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(kind: bytes, payload: bytes) -> bytes:
        crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
