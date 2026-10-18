// Картки й сповіщення для Telegram (parse_mode HTML). Лише чисті функції.
import { districtLabel, formatAddress } from "./match.js";

const WEEKDAYS = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п’ятниця", "субота"];
const LIGHT = "🟩";
const PARTIAL = "🟨";
const OUTAGE = "🟥";
export const LEGEND = `${LIGHT} світло · ${PARTIAL} частково · ${OUTAGE} без світла`;

export function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function toMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

export function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} хв`;
  return rest ? `${hours} год ${rest} хв` : `${hours} год`;
}

export function kyivNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Kyiv",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function timeline(ranges) {
  return `🌙 00–12 ${hourBar(ranges, 0)}\n☀️ 12–24 ${hourBar(ranges, 12)}`;
}

export function nowStatus(ranges, minute) {
  for (const [start, end] of ranges) {
    const from = toMinutes(start);
    const to = toMinutes(end);
    if (minute >= from && minute < to) {
      return `🔴 <b>Зараз світла немає</b>\n🔌 Увімкнуть о <b>${end}</b> (через ${duration(to - minute)})`;
    }
    if (from > minute) {
      return `🟢 <b>Зараз світло є</b>\n⏭ Наступне відключення о <b>${start}</b> (через ${duration(from - minute)})`;
    }
  }
  const tail = ranges.length ? "Сьогодні відключень більше не буде" : "Сьогодні відключень немає";
  return `🟢 <b>Зараз світло є</b>\n✨ ${tail}`;
}

export function placeLine(address) {
  return formatAddress(address.city, address.street, 0, 0, address.house);
}

// «🏠 Дім» → ["🏠", "Дім"]; назва без значка отримує 🏷.
export function splitLabel(label) {
  const text = String(label ?? "").trim();
  const match = text.match(/^(\P{L}+?)\s+(.+)$/u);
  return match ? [match[1], match[2]] : ["🏷", text];
}

export function addressTitle(address) {
  if (!String(address.label ?? "").trim()) return `📍 <b>${esc(placeLine(address))}</b>`;
  const [icon, name] = splitLabel(address.label);
  return `${icon} <b>${esc(name)}</b>\n📍 ${esc(placeLine(address))}`;
}

export function addressCard({ address, district = "", groups, today, tomorrow, now = new Date() }) {
  const clock = kyivNow(now);
  const lines = [addressTitle(address)];
  if (!groups.length) {
    lines.push(
      "",
      "❔ Для цієї адреси чергу ще не визначено, тому годин поки немає.",
      "Перевірю довідник ще раз під час наступного оновлення.",
    );
    return [...lines, "", footer(address, clock)].join("\n");
  }
  const area = districtLabel(district);
  const queues = groups.map(([queue, subqueue]) => `<b>${queue}.${subqueue}</b>`).join(", ");
  lines.push(`⚡ ${groups.length === 1 ? "Черга" : "Черги"} ${queues}${area ? ` · ${esc(area)}` : ""}`);
  const single = groups.length === 1;
  if (single && today && today.iso === clock.iso && safeRanges(today, groups[0]).length) {
    lines.push("", nowStatus(safeRanges(today, groups[0]), clock.minutes));
  }
  for (const [part, chart] of [["today", today], ["tomorrow", tomorrow]]) {
    lines.push("", single ? dayBlock(part, chart, groups[0], clock) : multiBlock(part, chart, groups, clock));
  }
  lines.push("");
  if (single && [today, tomorrow].some((chart) => chart && safeRanges(chart, groups[0]).length)) lines.push(LEGEND);
  lines.push(footer(address, clock));
  return lines.join("\n");
}

export function noticeText({ address, part, chart, kind, now = new Date() }) {
  const clock = kyivNow(now);
  const group = [Number(address.queue), Number(address.subqueue)];
  let header = part === "tomorrow" ? "🗓 <b>Графік на завтра</b>" : "💡 <b>Графік на сьогодні</b>";
  if (kind === "changed") header = "⚠️ <b>Графік змінився</b>";
  const [icon, name] = address.label ? splitLabel(address.label) : ["📍", ""];
  const place = `${name ? `${esc(name)} · ` : ""}${esc(placeLine(address))} · черга ${group[0]}.${group[1]}`;
  const lines = [header, `${icon} ${place}`, ""];
  if (part === "today" && chart && chart.iso === clock.iso) {
    lines.push(nowStatus(safeRanges(chart, group), clock.minutes), "");
  }
  lines.push(dayBlock(part, chart, group, clock));
  return lines.join("\n");
}

function dayBlock(part, chart, group, clock) {
  if (!chart) return missingDay(part);
  const ranges = safeRanges(chart, group);
  const lines = [`📅 <b>${dayTitle(part, chart, clock)}</b>`];
  if (!ranges.length) {
    lines.push("✅ Відключень немає, світло весь день");
    return lines.join("\n");
  }
  for (const [start, end] of ranges) {
    lines.push(`🔴 ${start} – ${end} · ${duration(toMinutes(end) - toMinutes(start))}`);
  }
  if (ranges.length > 1) lines.push(`⏱ Разом без світла: <b>${duration(totalOff(ranges))}</b>`);
  lines.push(timeline(ranges));
  return lines.join("\n");
}

function multiBlock(part, chart, groups, clock) {
  if (!chart) return missingDay(part);
  const lines = [`📅 <b>${dayTitle(part, chart, clock)}</b>`];
  for (const group of groups) {
    const ranges = safeRanges(chart, group);
    const hours = ranges.length ? ranges.map(([start, end]) => `${start} – ${end}`).join(", ") : "відключень немає";
    lines.push(`▫️ ${group[0]}.${group[1]}: ${hours}`);
  }
  return lines.join("\n");
}

function missingDay(part) {
  if (part === "tomorrow") return "📅 <b>Завтра</b>\n⏳ Графік ще не опубліковано. Напишу, щойно з’явиться.";
  return "📅 <b>Сьогодні</b>\n⏳ Графік ще не опубліковано.";
}

function dayTitle(part, chart, clock) {
  const iso = chart.iso || "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year) return part === "tomorrow" ? `Завтра, ${chart.label}` : `Сьогодні, ${chart.label}`;
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAYS[date.getUTCDay()];
  let word = weekday[0].toUpperCase() + weekday.slice(1);
  if (iso === clock.iso) word = "Сьогодні";
  else if (iso === shiftIso(clock.iso, 1)) word = "Завтра";
  const short = `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
  return word.toLowerCase() === weekday ? `${word}, ${short}` : `${word}, ${short} · ${weekday}`;
}

function footer(address, clock) {
  const notify = Number(address.muted) ? "🔕 Сповіщення вимкнені" : "🔔 Напишу, щойно графік зміниться";
  return `${notify}\n🕐 Оновлено о ${clockText(clock.minutes)}`;
}

function hourBar(ranges, fromHour) {
  let bar = "";
  for (let hour = fromHour; hour < fromHour + 12; hour += 1) {
    const off = overlap(ranges, hour * 60, hour * 60 + 60);
    bar += off === 0 ? LIGHT : off >= 60 ? OUTAGE : PARTIAL;
  }
  return bar;
}

function overlap(ranges, from, to) {
  let total = 0;
  for (const [start, end] of ranges) {
    total += Math.max(0, Math.min(to, toMinutes(end)) - Math.max(from, toMinutes(start)));
  }
  return total;
}

function totalOff(ranges) {
  return ranges.reduce((sum, [start, end]) => sum + toMinutes(end) - toMinutes(start), 0);
}

function safeRanges(chart, [queue, subqueue]) {
  try {
    return chart.ranges(queue, subqueue);
  } catch {
    return [];
  }
}

function shiftIso(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function clockText(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
