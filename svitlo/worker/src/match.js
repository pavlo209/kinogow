const HOUSE = /^\d+[a-zа-яіїєґ]?(?:[/-]\d+[a-zа-яіїєґ]?)?$/i;
const CITY_PREFIX = /^(?:місто|м|село|с|смт|селище)\.?\s+/i;
const STREET_PREFIX = /^(?:вулиця|вул|провулок|пров|проспект|просп|пр|площа|пл)\.?\s+/i;
const HOUSE_PREFIX = /^(?:будинок|буд)\.?\s+/i;
const LOOKALIKES = { a: "а", e: "е", i: "і", o: "о", c: "с", p: "р", x: "х", A: "а", E: "е", I: "і", O: "о", C: "с", P: "р", X: "х" };

export function nameKey(value) {
  return String(value ?? "")
    .replaceAll("’", "'")
    .replaceAll("`", "'")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function houseInSpec(house, spec) {
  const [number, letter] = houseKey(house);
  if (!number) return false;
  for (const raw of String(spec).split(/[,;]| та /)) {
    const token = raw.trim();
    if (!token) continue;
    const span = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (span) {
      const start = Number(span[1]);
      const end = Number(span[2]);
      if (end - start < 5) {
        if (normHouse(token) === normHouse(house)) return true;
        continue;
      }
      if (letter) continue;
      if (number >= start && number <= end) return true;
      continue;
    }
    const [tokenNumber, tokenLetter] = houseKey(token);
    if (tokenNumber === number && tokenLetter === letter && !token.includes("-")) return true;
  }
  return false;
}

export function matchStreet(rows, house) {
  if (!rows.length) return { queues: [], streetKnown: false, houseKnown: false, notEnrolled: false };
  const matched = rows.filter((row) => houseInSpec(house, row.houses));
  if (!matched.length) return { queues: [], streetKnown: true, houseKnown: false, notEnrolled: false };
  const enrolled = matched.filter((row) => Number(row.enrolled) && Number(row.queue) > 0);
  const queues = uniquePairs(enrolled.map((row) => [Number(row.queue), Number(row.subqueue)]));
  return { queues, streetKnown: true, houseKnown: true, notEnrolled: queues.length === 0 };
}

export function districtLabel(district) {
  const name = String(district ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?<=[А-Яа-яІіЇїЄєҐґ])c(?=[А-Яа-яІіЇїЄєҐґ])/g, "с");
  if (!name) return "";
  if (name.toLowerCase().includes("район")) return name;
  return `${name} район`;
}

export function placeLabel(city, district) {
  const label = districtLabel(district);
  return label ? `${city} (${label})` : city;
}

export function correctPlace(city, street, places, streetsFor) {
  if (!places.length) return { city, street, note: "", blocked: false };
  const cityMatch = pick(city, places);
  if (!cityMatch) return { city, street, note: unknownCity(city, places), blocked: true };
  const district = places.find((item) => item[0] === cityMatch.name)?.[1] ?? "";
  const streets = streetsFor(cityMatch.name);
  if (!streets.length || !street) {
    return { city: cityMatch.name, street, note: cityMatch.note, blocked: false };
  }
  const streetMatch = pick(street, streets.map((name) => [name, ""]));
  if (!streetMatch) {
    const close = closeNames(street, streets, 0.72, 3);
    let hint = `У ${placeLabel(cityMatch.name, district)} немає вулиці «${street}».`;
    if (close.length) hint += ` Схожі: ${close.join(", ")}.`;
    return { city: cityMatch.name, street, note: joinNote(cityMatch.note, hint), blocked: true };
  }
  return {
    city: cityMatch.name,
    street: streetMatch.name,
    note: joinNote(cityMatch.note, streetMatch.note),
    blocked: false,
  };
}

export function ratio(left, right) {
  if (!left && !right) return 1;
  const matches = matchingBlocks(String(left), String(right));
  return (2 * matches) / (left.length + right.length);
}

export function parseAddressMessage(text) {
  const raw = String(text ?? "").trim();
  if (!raw || raw.startsWith("/")) return null;
  let lines = raw.split(/[\n;]/).map((part) => part.trim()).filter(Boolean);
  if (lines.length === 1 && lines[0].includes(",")) {
    lines = lines[0].split(",").map((part) => part.trim()).filter(Boolean);
  }
  if (lines.length < 3) return null;
  const city = cleanCity(lines[0]);
  const house = cleanHouse(lines.at(-1));
  const street = cleanStreet(lines.slice(1, -1).join(" "));
  if (city.length < 2 || street.length < 2 || !looksLikeHouse(house)) return null;
  return { city, street, house };
}

export function parseLooseAddress(text, cities) {
  const raw = cleanLine(String(text ?? "").replace(/^[, ]+|[, ]+$/g, ""));
  if (!raw || raw.startsWith("/")) return null;
  const match = raw.match(/(\d+)\s*([a-zа-яіїєґ]?)\s*$/i);
  if (!match) return null;
  const house = match[1] + (match[2] || "");
  if (!looksLikeHouse(house)) return null;
  const head = raw.slice(0, match.index).replace(/[, ]+$/g, "").trim();
  if (!head) return null;
  let city = "";
  let street = "";
  const ordered = [...cities].sort((a, b) => b.length - a.length);
  for (const candidate of ordered) {
    if (head.toLowerCase().startsWith(candidate.toLowerCase())) {
      city = candidate;
      street = head.slice(candidate.length).replace(/^[, ]+/, "");
      break;
    }
  }
  if (!city) {
    const parts = head.split(/\s+/);
    if (parts.length < 2) return null;
    city = parts[0];
    street = parts.slice(1).join(" ");
  }
  city = cleanCity(city);
  street = cleanStreet(street);
  if (city.length < 2 || street.length < 2) return null;
  return { city, street, house };
}

export function looksLikeHouse(value) {
  return HOUSE.test(String(value ?? "").trim());
}

export function cleanLine(value) {
  return String(value ?? "").trim().split(/\s+/).filter(Boolean).join(" ");
}

export function formatAddress(city, street, queue, subqueue, house = "") {
  const parts = [String(city ?? "").trim()];
  if (String(street ?? "").trim()) parts.push(String(street).trim());
  if (String(house ?? "").trim()) parts.push(String(house).trim());
  const place = parts.join(", ");
  if (queue && subqueue) return `${place} (черга ${queue}.${subqueue})`;
  return place;
}

export function formatNotice({ when, scheduleDate, address, ranges, changed }) {
  const prefix = changed ? "Графік змінився. " : "";
  if (!ranges.length) {
    return `${prefix}${when}, ${scheduleDate}, за адресою ${address} відключень немає.`;
  }
  const parts = ranges.map(([start, end]) => `з ${start} до ${end}`);
  const hours = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} та ${parts.at(-1)}`;
  return `${prefix}${when}, ${scheduleDate}, за адресою ${address} відключення ${hours}.`;
}

export function buildReport({ city, street, house, groups, today, tomorrow }) {
  if (!groups.length) {
    const place = formatAddress(city, street, 0, 0, house);
    return `${place}\n\nЗа цією адресою ще не визначено чергу, тому години відключення не зібрані. Перевірю пошук Волиньобленерго ще раз автоматично.`;
  }
  if (groups.length === 1) {
    const [queue, subqueue] = groups[0];
    const place = formatAddress(city, street, queue, subqueue, house);
    return [place, "", dayLine("Сьогодні", today, queue, subqueue), dayLine("На завтра", tomorrow, queue, subqueue)].join("\n");
  }
  const lines = [formatAddress(city, street, 0, 0, house), ""];
  for (const [when, chart] of [["Сьогодні", today], ["На завтра", tomorrow]]) {
    lines.push(chart ? `${when}, ${chart.label}` : when);
    if (!chart) {
      lines.push("Графік ще не опубліковано.", "");
      continue;
    }
    for (const [queue, subqueue] of groups) {
      const ranges = chart.ranges(queue, subqueue);
      const hours = ranges.length ? hoursText(ranges) : "відключень немає";
      lines.push(`Черга ${queue}.${subqueue}: ${hours}.`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function dayLine(when, chart, queue, subqueue) {
  if (!chart) return `${when}: графік ще не опубліковано.`;
  const ranges = chart.ranges(queue, subqueue);
  if (!ranges.length) return `${when}, ${chart.label}: відключень немає.`;
  return `${when}, ${chart.label}: відключення ${hoursText(ranges)}.`;
}

function hoursText(ranges) {
  const parts = ranges.map(([start, end]) => `з ${start} до ${end}`);
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} та ${parts.at(-1)}`;
}

function pick(typed, options) {
  const typedKey = nameKey(typed);
  const compact = typedKey.replaceAll(" ", "");
  const exact = options.find((item) => nameKey(item[0]) === typedKey);
  if (exact) return { name: exact[0], note: "" };
  const compactHits = options.filter((item) => nameKey(item[0]).replaceAll(" ", "") === compact);
  if (compactHits.length === 1) {
    return { name: compactHits[0][0], note: `У «${typed}» зайві пробіли. Правильно: ${placeLabel(compactHits[0][0], compactHits[0][1])}.` };
  }
  const names = options.map((item) => item[0]);
  const close = closeNames(typed, names, 0.93, 1);
  if (close.length === 1) {
    const chosen = options.find((item) => item[0] === close[0]);
    return { name: chosen[0], note: `«${typed}» не збігається з довідником. Прийнято: ${placeLabel(chosen[0], chosen[1])}.` };
  }
  return null;
}

function unknownCity(typed, places) {
  const close = closeNames(typed, places.map((item) => item[0]), 0.72, 3);
  if (!close.length) return `Населеного пункту «${typed}» немає в довіднику Волинської області.`;
  const lines = [`«${typed}» не знайдено. Можливо, ви мали на увазі:`];
  for (const name of close) {
    const district = places.find((item) => item[0] === name)?.[1] ?? "";
    lines.push(placeLabel(name, district));
  }
  return lines.join("\n");
}

function closeNames(typed, names, cutoff, limit) {
  const scored = [];
  const typedKey = nameKey(typed);
  for (const name of names) {
    const key = nameKey(name);
    const maxPossible = (2 * Math.min(typedKey.length, key.length)) / (typedKey.length + key.length);
    if (maxPossible < cutoff) continue;
    const score = ratio(typedKey, key);
    if (score >= cutoff) scored.push([score, name]);
  }
  scored.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
  return scored.slice(0, limit).map((item) => item[1]);
}

function joinNote(left, right) {
  return [left, right].map((part) => String(part ?? "").trim()).filter(Boolean).join("\n");
}

function matchingBlocks(a, b) {
  return matchCount(a, b, 0, a.length, 0, b.length);
}

function matchCount(a, b, aLo, aHi, bLo, bHi) {
  const found = longestMatch(a, b, aLo, aHi, bLo, bHi);
  if (!found.length) return 0;
  return found.length
    + matchCount(a, b, aLo, found.a, bLo, found.b)
    + matchCount(a, b, found.a + found.length, aHi, found.b + found.length, bHi);
}

function longestMatch(a, b, aLo, aHi, bLo, bHi) {
  let bestA = aLo;
  let bestB = bLo;
  let best = 0;
  const earlier = new Map();
  for (let i = aLo; i < aHi; i += 1) {
    const now = new Map();
    for (let j = bLo; j < bHi; j += 1) {
      if (a[i] !== b[j]) continue;
      const size = (earlier.get(j - 1) ?? 0) + 1;
      now.set(j, size);
      if (size > best) {
        best = size;
        bestA = i - size + 1;
        bestB = j - size + 1;
      }
    }
    earlier.clear();
    for (const [key, value] of now) earlier.set(key, value);
  }
  return { a: bestA, b: bestB, length: best };
}

function houseKey(value) {
  const folded = normHouse(value);
  const match = folded.match(/^(\d+)([а-яіїєґ]?)/);
  if (!match) return [0, ""];
  return [Number(match[1]), match[2]];
}

function normHouse(value) {
  let folded = String(value ?? "").toLowerCase().replaceAll(" ", "");
  folded = [...folded].map((char) => LOOKALIKES[char] ?? char).join("");
  return folded;
}

function uniquePairs(items) {
  const seen = new Set();
  const result = [];
  for (const [queue, subqueue] of items) {
    const key = `${queue}.${subqueue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push([queue, subqueue]);
  }
  return result;
}

function cleanCity(value) {
  return CITY_PREFIX.test(cleanLine(value)) ? cleanLine(value).replace(CITY_PREFIX, "").trim() : cleanLine(value);
}

function cleanStreet(value) {
  return cleanLine(value).replace(STREET_PREFIX, "").trim();
}

function cleanHouse(value) {
  return cleanLine(value).replace(HOUSE_PREFIX, "").trim();
}
