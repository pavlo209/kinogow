import assert from "node:assert/strict";
import test from "node:test";
import { noticeKind, partState } from "../src/sync.js";

const chart = (ranges, iso = "2026-10-18", label = "18.10.2026") => ({
  iso,
  label,
  image: "https://example/img.png",
  ranges: (queue) => {
    if (queue > 6) throw new Error("no queue");
    return ranges;
  },
});

test("partState builds a signature from the date and hours", () => {
  const state = partState(chart([["10:00", "12:30"], ["18:00", "20:00"]]), 2, 2);
  assert.deepEqual(state, {
    signature: "2026-10-18|10:00-12:30;18:00-20:00",
    schedule_date: "18.10.2026",
    ranges: [["10:00", "12:30"], ["18:00", "20:00"]],
    image_url: "https://example/img.png",
  });
  assert.equal(partState(null, 2, 2), null);
  assert.equal(partState(chart([]), 9, 1), null, "unknown queue is skipped, not crashed");
});

test("noticeKind tells first, changed and repeated schedules apart", () => {
  const today = partState(chart([["10:00", "12:00"]]), 1, 1);
  const changed = partState(chart([["14:00", "16:00"]]), 1, 1);
  const nextDay = partState(chart([["10:00", "12:00"]], "2026-10-19", "19.10.2026"), 1, 1);
  assert.equal(noticeKind(null, today), "fresh");
  assert.equal(noticeKind({ ...today, ranges_json: "[]" }, today), null);
  assert.equal(noticeKind(today, changed), "changed");
  assert.equal(noticeKind(today, nextDay), "fresh");
});
