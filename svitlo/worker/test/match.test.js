import assert from "node:assert/strict";
import test from "node:test";
import { correctPlace, houseInSpec, parseLooseAddress, ratio } from "../src/match.js";

test("a short house span is one building", () => {
  assert.equal(houseInSpec("15", "10, 12, 14-16, 16"), false);
  assert.equal(houseInSpec("15", "13, 15, 17"), true);
  assert.equal(houseInSpec("8", "1-10, 12"), true);
  assert.equal(houseInSpec("44а", "44 а, 46"), true);
});

test("distant town names are not auto-accepted", () => {
  assert.ok(ratio("кропивницький", "кропивники") < 0.93);
  assert.ok(ratio("луцьк", "луцьк") === 1);
  const places = [["Луцьк", "Луцький"], ["Кропивники", "Ковельський"]];
  const result = correctPlace("Кропивницький", "Полинкіна", places, () => ["Полинкіна"]);
  assert.equal(result.blocked, true);
  assert.match(result.note, /немає в довіднику|не знайдено/);
});

test("loose address joins a split letter", () => {
  const parsed = parseLooseAddress("Луцьк Волі 44 а", ["Луцьк", "Новий Загорів"]);
  assert.deepEqual(parsed, { city: "Луцьк", street: "Волі", house: "44а" });
});
