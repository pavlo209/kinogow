import { placeLabel } from "./match.js";

export function summarize(rows) {
  const list = rows.map(normalize);
  const users = new Set(list.map((row) => row.chatId).filter(Boolean));
  const cities = new Map();
  for (const row of list) {
    const key = row.city || "Без населеного пункту";
    if (!cities.has(key)) cities.set(key, []);
    cities.get(key).push(row);
  }
  const settlements = [...cities.entries()]
    .map(([city, items]) => ({
      city,
      users: new Set(items.map((item) => item.chatId).filter(Boolean)).size,
      addresses: items.length,
      items: items.sort(byPlace),
    }))
    .sort((left, right) => right.addresses - left.addresses || left.city.localeCompare(right.city, "uk"));
  const people = [...users]
    .map((chatId) => {
      const items = list.filter((row) => row.chatId === chatId).sort(byPlace);
      return { chatId, addresses: items.length, items };
    })
    .sort((left, right) => right.addresses - left.addresses || left.chatId.localeCompare(right.chatId));
  return {
    users: users.size,
    addresses: list.length,
    settlements: settlements.length,
    cities: settlements,
    people,
  };
}

export function renderAdmin({ rows, districtOf = () => "", lastCheck = "" }) {
  const report = summarize(rows);
  const cityBlocks = report.cities.map((city) => cityBlock(city, districtOf)).join("");
  const peopleBlocks = report.people.map(personBlock).join("") || '<p class="empty">Користувачів ще немає.</p>';
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Адмін-панель</title>
<style>
:root { color-scheme: light; --ink:#172033; --muted:#5c6b80; --line:#d7e0ea; --bg:#eef3f8; --card:#fff; --accent:#1d4e89; }
* { box-sizing: border-box; }
body { margin:0; font:16px/1.45 "Segoe UI", system-ui, sans-serif; color:var(--ink); background:var(--bg); }
main { max-width:980px; margin:0 auto; padding:28px 16px 64px; }
h1 { font-size:32px; line-height:1.15; margin:0 0 8px; }
h2 { font-size:20px; margin:28px 0 12px; }
.lead, .meta, .empty { color:var(--muted); }
.stats { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin:18px 0; }
.stat, .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px; }
.stat b { display:block; font-size:32px; line-height:1.1; }
.stat span, .who { color:var(--muted); font-size:14px; }
.place { margin:0 0 8px; }
.row { padding:8px 0; border-top:1px solid var(--line); }
.card .row:first-of-type { border-top:0; }
a { color:var(--accent); }
@media (max-width:700px) { .stats { grid-template-columns:1fr; } h1 { font-size:28px; } }
</style>
</head>
<body>
<script>if (location.pathname.indexOf("/admin/enter/") === 0) history.replaceState({}, "", "/admin");</script>
<main>
  <h1>Адмін-панель</h1>
  <p class="lead">Ви увійшли як адміністратор бота <a href="https://t.me/volunsvitlo_bot">@volunsvitlo_bot</a>. Тут лише адреси, які люди зберегли.</p>
  <p class="meta">Остання перевірка графіка: ${esc(formatWhen(lastCheck) || "ще не було")}.</p>
  <section class="stats">
    <article class="stat"><b>${report.users}</b><span>${plural(report.users, "користувач", "користувачі", "користувачів")}</span></article>
    <article class="stat"><b>${report.addresses}</b><span>${plural(report.addresses, "адреса", "адреси", "адрес")}</span></article>
    <article class="stat"><b>${report.settlements}</b><span>${plural(report.settlements, "населений пункт", "населені пункти", "населених пунктів")}</span></article>
  </section>
  <h2>Міста, села і вулиці</h2>
  ${cityBlocks || '<p class="empty">Адрес ще немає.</p>'}
  <h2>Хто що додав</h2>
  ${peopleBlocks}
</main>
</body>
</html>`;
}

export function renderLocked() {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Адмін-панель</title>
<style>
body { margin:0; font:16px/1.45 "Segoe UI", system-ui, sans-serif; background:#eef3f8; color:#172033; }
main { max-width:640px; margin:15vh auto; padding:24px 16px; }
.card { background:#fff; border:1px solid #d7e0ea; border-radius:16px; padding:20px; }
a { color:#1d4e89; }
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>Адмін-панель</h1>
    <p>Цю сторінку відкриває власник бота. У <a href="https://t.me/volunsvitlo_bot">@volunsvitlo_bot</a> натисніть «Адмін-панель» або надішліть /admin, і бот дасть робоче посилання.</p>
  </div>
</main>
</body>
</html>`;
}

function cityBlock(city, districtOf) {
  const district = districtOf(city.city) || "";
  const title = district ? placeLabel(city.city, district) : city.city;
  const rows = city.items.map(addressLine).join("");
  return `<article class="card" style="margin-bottom:12px">
    <p class="place"><strong>${esc(title)}</strong></p>
    <p class="who">${city.addresses} ${plural(city.addresses, "адреса", "адреси", "адрес")}, ${city.users} ${plural(city.users, "користувач", "користувачі", "користувачів")}</p>
    ${rows}
  </article>`;
}

function personBlock(person) {
  const rows = person.items.map(addressLine).join("");
  return `<article class="card" style="margin-bottom:12px">
    <p class="place"><strong>Чат ${esc(person.chatId)}</strong></p>
    <p class="who">${person.addresses} ${plural(person.addresses, "адреса", "адреси", "адрес")}</p>
    ${rows}
  </article>`;
}

function addressLine(row) {
  const street = row.street || "вулицю не вказано";
  const house = row.house ? `, ${row.house}` : "";
  const queue = row.queue && row.subqueue ? `черга ${row.queue}.${row.subqueue}` : "чергу ще не визначено";
  const when = formatWhen(row.createdAt);
  return `<p class="row">${esc(street)}${esc(house)} · ${esc(queue)}${when ? ` · ${esc(when)}` : ""}</p>`;
}

function normalize(row) {
  return {
    city: String(row.city || "").trim(),
    street: String(row.street || "").trim(),
    house: String(row.house || "").trim(),
    queue: Number(row.queue) || 0,
    subqueue: Number(row.subqueue) || 0,
    chatId: String(row.chat_id || row.chatId || "").trim(),
    createdAt: String(row.created_at || row.createdAt || ""),
  };
}

function byPlace(left, right) {
  return left.city.localeCompare(right.city, "uk")
    || left.street.localeCompare(right.street, "uk")
    || left.house.localeCompare(right.house, "uk");
}

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function plural(count, one, few, many) {
  const n = Math.abs(Number(count)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
