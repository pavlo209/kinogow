import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ChartDecoder, parseSchedulePng, rangesFor, readPng } from "../src/decode.js";

const FIXTURE = fileURLToPath(new URL("../../tests/fixtures/today.png", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

test("png hours match the python parser", () => {
  const png = readFileSync(FIXTURE);
  const started = performance.now();
  const schedule = parseSchedulePng(png);
  const elapsed = performance.now() - started;
  const python = spawnSync("python3", ["-c", `
import json
from pathlib import Path
from svitlo.schedule import parse_schedule_png
schedule = parse_schedule_png(Path(${JSON.stringify(FIXTURE)}).read_bytes())
found = {}
for (queue, sub), flags in schedule.slots.items():
    found[f"{queue}.{sub}"] = [[a, b] for a, b in schedule.ranges_for(queue, sub)]
print(json.dumps(found, ensure_ascii=False))
`], { cwd: REPO, encoding: "utf8" });
  assert.equal(python.status, 0, python.stderr);
  const expected = JSON.parse(python.stdout);
  assert.equal(Object.keys(expected).length, 12);
  for (const [key, ranges] of Object.entries(expected)) {
    const [queue, subqueue] = key.split(".").map(Number);
    assert.deepEqual(rangesFor(schedule, queue, subqueue), ranges, key);
  }
  console.log("fixture parse ms", Math.round(elapsed));
});

test("chart decoded in small worker-sized steps equals one-shot parse", () => {
  const bytes = readFileSync(FIXTURE);
  const whole = parseSchedulePng(bytes);
  const png = readPng(bytes);
  const decoder = new ChartDecoder(png.width, png.height, png.colorType);
  let offset = 0;
  let steps = 0;
  while (!decoder.finished && steps < 50000) {
    steps += 1;
    if (decoder.pending.length < decoder.rowSize && offset < png.idat.length) {
      const next = Math.min(offset + 1536, png.idat.length);
      decoder.write(png.idat.subarray(offset, next), next === png.idat.length);
      offset = next;
    }
    decoder.drain(3);
    if (decoder.error) throw decoder.error;
  }
  assert.ok(decoder.finished, "decoder finished");
  assert.ok(steps > 1, "parsed in more than one step");
  assert.deepEqual(decoder.schedule, whole);
});
