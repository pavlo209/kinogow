import assert from "node:assert/strict";
import test from "node:test";
import { renderAdmin, summarize } from "../src/admin.js";

test("admin summary counts users, streets and settlements", () => {
  const report = summarize([
    { city: "Луцьк", street: "Волі", house: "44а", queue: 2, subqueue: 2, chat_id: "10", created_at: "2026-10-17T12:00:00Z" },
    { city: "Луцьк", street: "Соборності", house: "15", queue: 4, subqueue: 2, chat_id: "10", created_at: "2026-10-17T12:05:00Z" },
    { city: "Баїв", street: "Набережна", house: "21", queue: 1, subqueue: 2, chat_id: "20", created_at: "2026-10-17T13:00:00Z" },
    { city: "Луцьк", street: "Волі", house: "44а", queue: 2, subqueue: 2, chat_id: "", created_at: "" },
  ]);
  assert.equal(report.users, 2);
  assert.equal(report.addresses, 4);
  assert.equal(report.settlements, 2);
  assert.equal(report.cities[0].city, "Луцьк");
  assert.equal(report.cities[0].addresses, 3);
  assert.equal(report.people[0].chatId, "10");
  assert.equal(report.people[0].addresses, 2);
});

test("admin page escapes address text", () => {
  const html = renderAdmin({
    rows: [{ city: "<Луцьк>", street: "Волі", house: "1", queue: 1, subqueue: 1, chat_id: "5", created_at: "2026-10-17T12:00:00Z" }],
    districtOf: () => "Луцький",
    lastCheck: "2026-10-17T18:45:00Z",
  });
  assert.equal(html.includes("<Луцьк>"), false);
  assert.match(html, /&lt;Луцьк&gt;/);
  assert.match(html, /Луцький район/);
  assert.match(html, /Волі, 1/);
  assert.match(html, /1<\/b><span>користувач/);
});
