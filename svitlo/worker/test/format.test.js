import assert from "node:assert/strict";
import test from "node:test";
import { addressCard, duration, kyivNow, noticeText, nowStatus, timeline, unpublishedNotice } from "../src/format.js";

const chart = (ranges, iso = "2026-10-18", label = "18.10.2026") => ({ iso, label, image: "", ranges: () => ranges });
// 15:00 за Києвом.
const NOW = new Date("2026-10-18T12:00:00Z");

test("duration reads naturally in Ukrainian", () => {
  assert.equal(duration(210), "3 год 30 хв");
  assert.equal(duration(45), "45 хв");
  assert.equal(duration(120), "2 год");
  assert.equal(duration(0), "0 хв");
});

test("unpublished notice names the day and promises a follow-up", () => {
  const text = unpublishedNotice("24.10.2026");
  assert.match(text, /24\.10\.2026/);
  assert.match(text, /ще не опублікувало/);
  assert.match(text, /щойно він з’явиться/);
});

test("kyivNow returns the Kyiv date and minute of day", () => {
  assert.deepEqual(kyivNow(NOW), { iso: "2026-10-18", minutes: 900 });
  assert.deepEqual(kyivNow(new Date("2026-10-18T21:30:00Z")), { iso: "2026-10-19", minutes: 30 });
});

test("timeline shows each hour as light, partial or outage", () => {
  const [night, day] = timeline([["14:30", "18:00"]]).split("\n");
  assert.equal(night, "🌙 00–12 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩");
  assert.equal(day, "☀️ 12–24 🟩🟩🟨🟥🟥🟥🟩🟩🟩🟩🟩🟩");
  assert.equal(timeline([["00:00", "24:00"]]), "🌙 00–12 🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥\n☀️ 12–24 🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥");
});

test("nowStatus tells whether the light is on and what is next", () => {
  const ranges = [["14:30", "18:00"], ["20:00", "22:00"]];
  const off = nowStatus(ranges, 15 * 60);
  assert.match(off, /Зараз світла немає/);
  assert.match(off, /18:00/);
  assert.match(off, /через 3 год/);
  const on = nowStatus(ranges, 12 * 60 + 15);
  assert.match(on, /Зараз світло є/);
  assert.match(on, /14:30/);
  assert.match(on, /через 2 год 15 хв/);
  assert.match(nowStatus(ranges, 23 * 60), /більше не буде/);
  assert.match(nowStatus([], 600), /відключень немає/);
});

test("address card shows place, queue, today with hours and missing tomorrow", () => {
  const text = addressCard({
    address: { city: "Луцьк", street: "Волі <script>", house: "44а", label: "🏠 Дім", muted: 0 },
    district: "Луцький",
    groups: [[2, 2]],
    today: chart([["14:30", "18:00"]]),
    tomorrow: null,
    now: NOW,
  });
  assert.equal(text.includes("<script>"), false, "user text is escaped");
  assert.match(text, /🏠 <b>Дім<\/b>/);
  assert.match(text, /Луцьк, Волі &lt;script&gt;, 44а/);
  assert.match(text, /Черга <b>2\.2<\/b> · Луцький район/);
  assert.match(text, /Сьогодні, 18\.10 · неділя/);
  assert.match(text, /14:30 – 18:00/);
  assert.match(text, /Зараз світла немає/);
  assert.match(text, /Завтра[\s\S]*ще не опубліковано/);
  assert.match(text, /🔔/);
});

test("address card without a queue explains it instead of showing hours", () => {
  const text = addressCard({
    address: { city: "Луцьк", street: "Волі", house: "1000", label: "", muted: 1 },
    groups: [],
    today: chart([]),
    tomorrow: null,
    now: NOW,
  });
  assert.match(text, /чергу ще не визначено/i);
  assert.match(text, /🔕/);
});

test("address card with several queues lists hours per queue", () => {
  const text = addressCard({
    address: { city: "Луцьк", street: "Волі", house: "1", label: "", muted: 0 },
    groups: [[1, 1], [2, 2]],
    today: chart([["10:00", "12:00"]]),
    tomorrow: chart([], "2026-10-19", "19.10.2026"),
    now: NOW,
  });
  assert.match(text, /Черги <b>1\.1<\/b>, <b>2\.2<\/b>/);
  assert.match(text, /1\.1: 10:00 – 12:00/);
  assert.match(text, /Завтра, 19\.10 · понеділок/);
});

test("notices name what happened", () => {
  const address = { city: "Луцьк", street: "Волі", house: "44а", queue: 2, subqueue: 2, label: "" };
  const changed = noticeText({ address, part: "today", chart: chart([["16:00", "18:00"]]), kind: "changed", now: NOW });
  assert.match(changed, /⚠️ <b>Графік змінився<\/b>/);
  assert.match(changed, /16:00 – 18:00/);
  const tomorrow = noticeText({ address, part: "tomorrow", chart: chart([], "2026-10-19", "19.10.2026"), kind: "fresh", now: NOW });
  assert.match(tomorrow, /Графік на завтра/);
  assert.match(tomorrow, /Відключень немає/);
});
