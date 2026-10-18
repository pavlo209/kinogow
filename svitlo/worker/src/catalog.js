import payload from "../catalog.json" with { type: "json" };
import { closeNames, matchStreet, nameKey } from "./match.js";

const byKey = new Map();
const indexByKey = new Map();
payload.cities.forEach((city, index) => {
  byKey.set(nameKey(city.n), city);
  indexByKey.set(nameKey(city.n), index);
});

const ranked = [...payload.cities].sort((left, right) => streetRows(right) - streetRows(left));
const rankedNames = ranked.map((city) => city.n);

// Індекси в довіднику йдуть у callback_data кнопок: Telegram дозволяє лише 64 байти.
export function cityIndex(cityName) {
  return indexByKey.get(nameKey(cityName)) ?? -1;
}

export function cityAt(index) {
  return payload.cities[Number(index)]?.n ?? null;
}

export function streetIndex(cityName, streetName) {
  const key = nameKey(streetName);
  return cityRecord(cityName)?.s.findIndex((street) => nameKey(street.n) === key) ?? -1;
}

export function streetAt(cityName, index) {
  return cityRecord(cityName)?.s[Number(index)]?.n ?? null;
}

export function suggestCities(typed, limit = 6) {
  return suggest(typed, rankedNames, limit);
}

export function suggestStreets(cityName, typed, limit = 8) {
  return suggest(typed, streets(cityName), limit);
}

export function places() {
  return payload.cities.map((city) => [city.n, city.d || ""]);
}

export function topCities(limit = 12) {
  return ranked.slice(0, limit).map((city) => city.n);
}

export function cityCount() {
  return payload.cities.length;
}

export function streets(cityName) {
  return (cityRecord(cityName)?.s ?? []).map((street) => street.n);
}

export function rowsFor(cityName, streetName) {
  const city = cityRecord(cityName);
  if (!city) return [];
  const key = nameKey(streetName);
  const street = city.s.find((item) => nameKey(item.n) === key);
  if (!street) return [];
  return street.r.map(([houses, queue, subqueue, enrolled]) => ({ houses, queue, subqueue, enrolled }));
}

export function districtFor(cityName) {
  return cityRecord(cityName)?.d || "";
}

function cityRecord(cityName) {
  return byKey.get(nameKey(cityName)) ?? null;
}

function streetRows(city) {
  return city.s.reduce((sum, street) => sum + street.r.length, 0);
}

// Спершу назви, що починаються з набраного (або мають таке слово), далі ті, що його містять, далі схожі.
function suggest(typed, names, limit) {
  const key = nameKey(typed).replace(/^(?:вул|вулиця|м|с|смт)\.?\s+/, "");
  if (key.length < 2) return [];
  const found = new Set();
  const keys = names.map((name) => [name, nameKey(name)]);
  for (const [name, nameKeyed] of keys) {
    if (nameKeyed.startsWith(key) || nameKeyed.split(/[\s-]+/).some((word) => word.startsWith(key))) found.add(name);
  }
  for (const [name, nameKeyed] of keys) {
    if (found.size >= limit) break;
    if (nameKeyed.includes(key)) found.add(name);
  }
  if (found.size < limit) {
    for (const name of closeNames(typed, names, 0.72, limit)) found.add(name);
  }
  return [...found].slice(0, limit);
}

export function groupsFor(city, street, house) {
  return matchStreet(rowsFor(city, street), house);
}
