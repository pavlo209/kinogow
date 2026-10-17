import payload from "../catalog.json" with { type: "json" };
import { nameKey } from "./match.js";

const byKey = new Map();
for (const city of payload.cities) byKey.set(nameKey(city.n), city);

const ranked = [...payload.cities].sort((left, right) => streetRows(right) - streetRows(left));

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
