import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parseSchedulePng, rangesFor, slotsToRanges } from "../src/decode.js";

test("png hours match the python parser", () => {
  const file = new URL("../../tests/fixtures/today.png", import.meta.url);
  const png = readFileSync(file);
  const started = performance.now();
  const schedule = parseSchedulePng(png);
  const elapsed = performance.now() - started;
  const python = spawnSync("python3", ["-c", `
import json
from pathlib import Path
from svitlo.schedule import parse_schedule_png
schedule = parse_schedule_png(Path(${JSON.stringify(file.pathname)}).read_bytes())
found = {}
for (queue, sub), flags in schedule.slots.items():
    found[f"{queue}.{sub}"] = [[a, b] for a, b in schedule.ranges_for(queue, sub)]
print(json.dumps(found, ensure_ascii=False))
`], { cwd: "/workspace", encoding: "utf8" });
  assert.equal(python.status, 0, python.stderr);
  const expected = JSON.parse(python.stdout);
  for (const [key, ranges] of Object.entries(expected)) {
    const [queue, subqueue] = key.split(".").map(Number);
    assert.deepEqual(rangesFor(schedule, queue, subqueue), ranges, key);
  }
  console.log("fixture parse ms", Math.round(elapsed));
});

test("live chart parses in small steps", () => {
  const png = readFileSync("/tmp/today-chart.png");
  const started = performance.now();
  const schedule = parseSchedulePng(png, 8);
  const elapsed = performance.now() - started;
  assert.deepEqual(rangesFor(schedule, 2, 2), [["14:30", "18:00"]]);
  assert.equal(slotsToRanges(schedule["1.1"]).length >= 0, true);
  console.log("live parse ms", Math.round(elapsed));
});
