import { Unzlib } from "fflate";

const GROUPS = [];
for (let queue = 1; queue <= 6; queue += 1) {
  GROUPS.push([queue, 1], [queue, 2]);
}

export function readPng(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    throw new Error("Файл не є PNG");
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let bitDepth = 0;
  let interlace = 0;
  const idatParts = [];
  while (pos + 8 <= bytes.length) {
    const length = readUint32(bytes, pos);
    const kind = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const start = pos + 8;
    const end = start + length;
    if (kind === "IHDR") {
      width = readUint32(bytes, start);
      height = readUint32(bytes, start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (kind === "IDAT") {
      idatParts.push(bytes.subarray(start, end));
    } else if (kind === "IEND") {
      break;
    }
    pos = end + 4;
  }
  if (!width || bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error("Цей PNG має непідтримуваний формат");
  }
  let size = 0;
  for (const part of idatParts) size += part.length;
  const idat = new Uint8Array(size);
  let offset = 0;
  for (const part of idatParts) {
    idat.set(part, offset);
    offset += part.length;
  }
  return { width, height, colorType, idat };
}

export class ChartDecoder {
  constructor(width, height, colorType) {
    this.width = width;
    this.height = height;
    this.channels = colorType === 6 ? 4 : 3;
    this.stride = width * this.channels;
    this.rowSize = 1 + this.stride;
    this.prev = new Uint8Array(this.stride);
    this.pending = new Uint8Array(0);
    this.y = 0;
    this.inflate = new Unzlib();
    this.inflate.ondata = (data) => this.append(data);
    this.bandStart = -1;
    this.bandRows = [];
    this.dataRows = [];
    this.inputDone = false;
    this.finished = false;
    this.schedule = null;
    this.error = null;
  }

  write(chunk, final = false) {
    if (!chunk.length && !final) return;
    this.inflate.push(chunk, final);
    if (final) this.inputDone = true;
  }

  drain(budgetMs) {
    const started = performance.now();
    while (this.y < this.height && this.pending.length >= this.rowSize && performance.now() - started < budgetMs) {
      this.consumeRow();
    }
    if (this.y >= this.height) this.finish();
    return this.finished;
  }

  append(chunk) {
    const extra = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    if (!this.pending.length) {
      this.pending = extra;
      return;
    }
    const merged = new Uint8Array(this.pending.length + extra.length);
    merged.set(this.pending, 0);
    merged.set(extra, this.pending.length);
    this.pending = merged;
  }

  consumeRow() {
    const filter = this.pending[0];
    const row = this.pending.subarray(1, this.rowSize);
    const current = new Uint8Array(row);
    unfilter(filter, current, this.prev, this.channels);
    this.prev = current;
    this.pending = this.pending.subarray(this.rowSize);
    this.noteRow(rgbRow(current, this.width, this.channels));
    this.y += 1;
  }

  noteRow(rgb) {
    const step = 4;
    const threshold = Math.max(20, Math.floor(this.width / step / 5));
    let cells = 0;
    for (let x = 0; x < this.width; x += step) {
      const offset = x * 3;
      if (isCell(rgb[offset], rgb[offset + 1], rgb[offset + 2])) cells += 1;
    }
    if (cells >= threshold) {
      if (this.bandStart < 0) {
        this.bandStart = this.y;
        this.bandRows = [];
      }
      this.bandRows.push(rgb);
      return;
    }
    this.closeBand(this.y);
  }

  closeBand(y) {
    if (this.bandStart < 0) return;
    if (y - this.bandStart >= 36) {
      const center = Math.floor((this.bandStart + y - 1) / 2);
      const rgb = this.bandRows[center - this.bandStart];
      if (rgb && cellRuns(rgb, this.width, 30).length >= 26) {
        this.dataRows.push({ y: center, rgb });
      }
    }
    this.bandStart = -1;
    this.bandRows = [];
  }

  finish() {
    if (this.finished) return;
    this.closeBand(this.height);
    this.schedule = scheduleFromRows(this.dataRows, this.width);
    this.finished = true;
    this.bandRows = [];
  }
}

export function parseSchedulePng(data, budgetMs = 8) {
  const png = readPng(data);
  const decoder = new ChartDecoder(png.width, png.height, png.colorType);
  let offset = 0;
  let steps = 0;
  while (!decoder.finished && steps < 20000) {
    steps += 1;
    const before = decoder.y;
    if (offset < png.idat.length && decoder.pending.length < decoder.rowSize) {
      const next = Math.min(offset + 2048, png.idat.length);
      decoder.write(png.idat.subarray(offset, next), next === png.idat.length);
      offset = next;
    }
    const done = decoder.drain(budgetMs);
    if (done) break;
    if (decoder.y === before && offset >= png.idat.length && decoder.pending.length < decoder.rowSize) {
      throw new Error("Не вдалося прочитати таблицю графіка: розмітка зображення змінилась");
    }
  }
  if (decoder.error) throw decoder.error;
  if (!decoder.finished || !decoder.schedule) {
    throw new Error("Не вдалося прочитати таблицю графіка: розмітка зображення змінилась");
  }
  decoder.steps = steps;
  return decoder.schedule;
}

export function slotsToRanges(flags) {
  const ranges = [];
  let index = 0;
  while (index < flags.length) {
    if (!flags[index]) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < flags.length && flags[end]) end += 1;
    ranges.push([slotLabel(index), slotLabel(end)]);
    index = end;
  }
  return ranges;
}

export function rangesFor(schedule, queue, subqueue) {
  const flags = schedule[`${queue}.${subqueue}`];
  if (!flags) throw new Error(`Немає черги ${queue}.${subqueue}`);
  return slotsToRanges(flags);
}

function scheduleFromRows(dataRows, width) {
  const clusters = clusterRows(dataRows);
  const tables = clusters.filter((cluster) => cluster.length === 12);
  if (tables.length < 2) {
    throw new Error("Не вдалося прочитати таблицю графіка: розмітка зображення змінилась");
  }
  const columns = timeColumns(tables[0][0].rgb, width);
  if (columns.length !== 24) throw new Error("У графіку не 24 півгодинні колонки");
  const schedule = {};
  GROUPS.forEach(([queue, subqueue], index) => {
    const flags = [];
    for (const table of [tables[0], tables[1]]) {
      const rgb = table[index].rgb;
      for (const x of columns) flags.push(isOutage(rgb, x) ? 1 : 0);
    }
    if (flags.length !== 48) throw new Error("Неповна доба у графіку");
    schedule[`${queue}.${subqueue}`] = flags;
  });
  return schedule;
}

function clusterRows(rows) {
  if (!rows.length) return [];
  const clusters = [[rows[0]]];
  for (const row of rows.slice(1)) {
    const last = clusters[clusters.length - 1];
    if (row.y - last[last.length - 1].y > 80) clusters.push([row]);
    else last.push(row);
  }
  return clusters;
}

function timeColumns(rgb, width) {
  const runs = cellRuns(rgb, width, 30);
  if (runs.length < 24) throw new Error("Не знайдено колонки годин");
  return runs.slice(-24).map(([start, end]) => Math.floor((start + end) / 2));
}

function cellRuns(rgb, width, minWidth) {
  const runs = [];
  let runStart = -1;
  for (let x = 0; x < width; x += 1) {
    const offset = x * 3;
    const cell = isCell(rgb[offset], rgb[offset + 1], rgb[offset + 2]);
    if (cell && runStart < 0) runStart = x;
    else if (!cell && runStart >= 0) {
      if (x - runStart >= minWidth) runs.push([runStart, x - 1]);
      runStart = -1;
    }
  }
  if (runStart >= 0 && width - runStart >= minWidth) runs.push([runStart, width - 1]);
  return runs;
}

function isOutage(rgb, x) {
  let dark = 0;
  let seen = 0;
  for (const dx of [-3, 0, 3]) {
    const px = x + dx;
    if (px < 0 || px * 3 + 2 >= rgb.length) continue;
    const offset = px * 3;
    seen += 1;
    if (isOutageColor(rgb[offset], rgb[offset + 1], rgb[offset + 2])) dark += 1;
  }
  return seen > 0 && dark * 2 >= seen;
}

function isCell(r, g, b) {
  return isOutageColor(r, g, b) || isSupplyColor(r, g, b);
}

function isOutageColor(r, g, b) {
  return r < 110 && b > 120 && b > r + 30 && g < 160;
}

function isSupplyColor(r, g, b) {
  return r > 150 && r < 220 && g > 165 && g < 230 && b > 180 && b < 245;
}

function rgbRow(row, width, channels) {
  if (channels === 3) return row;
  const rgb = new Uint8Array(width * 3);
  for (let x = 0; x < width; x += 1) rgb.set(row.subarray(x * 4, x * 4 + 3), x * 3);
  return rgb;
}

function unfilter(filter, row, prev, bpp) {
  if (filter === 0) return;
  if (filter === 1) {
    for (let i = 0; i < row.length; i += 1) row[i] = (row[i] + (i >= bpp ? row[i - bpp] : 0)) & 255;
    return;
  }
  if (filter === 2) {
    for (let i = 0; i < row.length; i += 1) row[i] = (row[i] + prev[i]) & 255;
    return;
  }
  if (filter === 3) {
    for (let i = 0; i < row.length; i += 1) {
      const left = i >= bpp ? row[i - bpp] : 0;
      row[i] = (row[i] + ((left + prev[i]) >> 1)) & 255;
    }
    return;
  }
  if (filter === 4) {
    for (let i = 0; i < row.length; i += 1) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      row[i] = (row[i] + paeth(left, up, upLeft)) & 255;
    }
    return;
  }
  throw new Error(`Невідомий фільтр PNG: ${filter}`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const pa = Math.abs(estimate - left);
  const pb = Math.abs(estimate - up);
  const pc = Math.abs(estimate - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function slotLabel(slotIndex) {
  const minutes = slotIndex * 30;
  if (minutes >= 24 * 60) return "24:00";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function readUint32(bytes, offset) {
  return (bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}
