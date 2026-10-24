// HTML адмін-панелі. Дані вже пораховані в admin.js; тут лише розмітка.
import { formatWhen, plural, summarize } from "./admin.js";
import { SCRIPT, STYLES } from "./admin-assets.js";
import { placeLabel } from "./match.js";

const FONTS = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@500;700&display=swap";
const STATUS = {
  active: ["on", "Активний"],
  idle: ["idle", "Неактивний"],
  blocked: ["off", "Заблокував бота"],
};

export function renderAdmin({ users = [], addresses = [], rows, districtOf = () => "", lastCheck = "", lastError = "", now = new Date() }) {
  const report = summarize({ users, addresses: addresses.length ? addresses : rows ?? [], now });
  const where = (city) => placeLabel(city, districtOf(city) || "");
  const data = {
    users: report.people.map((person) => ({
      chat_id: person.chatId,
      name: person.name,
      username: person.username,
      status: STATUS[person.status][1],
      addresses: person.addresses.length,
      first_seen: formatWhen(person.firstSeen),
      last_seen: formatWhen(person.lastSeen),
      actions: person.actions,
    })),
    addresses: report.people.flatMap((person) => person.addresses.map((row) => ({
      city: where(row.city),
      street: row.street,
      house: row.house,
      queue: row.queue ? `${row.queue}.${row.subqueue}` : "",
      label: row.label,
      user: person.name || person.chatId,
      chat_id: person.chatId,
      notifications: row.muted ? "вимкнені" : "увімкнені",
      created_at: formatWhen(row.createdAt),
    }))),
  };
  const usingShare = report.users ? Math.round((report.using / report.users) * 100) : 0;
  const status = lastError
    ? `<span class="pill warn" title="${esc(lastError)}">● ${esc(clip(lastError, 60))}</span>`
    : `<span class="pill ok" title="Графік перевірено ${esc(formatWhen(lastCheck) || "ще не було")}">● <span class="long">Графік перевірено </span>${esc(shortWhen(lastCheck, now) || "ще не було")}</span>`;
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Світло Волині · Адмін</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>
<script>if (location.pathname.indexOf("/admin/enter/") === 0) history.replaceState({}, "", "/admin");</script>
<header class="top">
  <div class="brand"><span class="bolt" aria-hidden="true">⚡</span><div><b>Світло Волині</b><small>Адмін-панель · <a href="https://t.me/volunsvitlo_bot">@volunsvitlo_bot</a></small></div></div>
  <div class="top-actions">${status}<button class="icon" type="button" id="theme" aria-label="Змінити тему"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8A9 9 0 0 0 12 3z"/></svg></button></div>
</header>
<main>
  <section class="hero">
    <h1>Хто користується ботом</h1>
    <p>Станом на ${esc(formatWhen(now.toISOString()))}. Оновіть сторінку, щоб побачити свіжі дані.</p>
  </section>

  <section class="kpis" aria-label="Головні цифри">
    <article class="kpi main">
      <span class="label">Запустили бота</span>
      <b data-kpi="users">${report.users}</b>
      <span class="note">+${report.new7} за 7 днів · +${report.newToday} сьогодні</span>
    </article>
    <article class="kpi">
      <span class="label">Користуються</span>
      <b data-kpi="using">${report.using}</b>
      <span class="note">${usingShare}% мають адресу й не заблокували</span>
      <span class="meter" aria-hidden="true"><i style="--w:${usingShare}%"></i></span>
    </article>
    <article class="kpi">
      <span class="label">Активні за 7 днів</span>
      <b data-kpi="active">${report.active7}</b>
      <span class="note">писали боту або натискали кнопки</span>
    </article>
    <article class="kpi">
      <span class="label">Адрес задано</span>
      <b data-kpi="addresses">${report.addresses}</b>
      <span class="note">у ${report.settlements} ${plural(report.settlements, "населеному пункті", "населених пунктах", "населених пунктах")}</span>
    </article>
    <article class="kpi">
      <span class="label">Заблокували бота</span>
      <b data-kpi="blocked">${report.blocked}</b>
      <span class="note">сповіщення вимкнено для ${report.muted} ${plural(report.muted, "адреси", "адрес", "адрес")}</span>
    </article>
  </section>

  <section class="charts">
    <article class="panel">
      <h2>Нові користувачі <span>14 днів</span></h2>
      ${dailyChart(report.daily)}
    </article>
    <article class="panel">
      <h2>Адреси за чергами <span>${report.unknownQueue ? `без черги: ${report.unknownQueue}` : "усі з чергою"}</span></h2>
      ${queueChart(report.queues)}
    </article>
  </section>

  <section class="panel data">
    <div class="toolbar">
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected="true" aria-controls="tab-users" data-tab="users">Користувачі <span>${report.users}</span></button>
        <button role="tab" aria-selected="false" aria-controls="tab-addresses" data-tab="addresses">Адреси <span>${report.addresses}</span></button>
        <button role="tab" aria-selected="false" aria-controls="tab-cities" data-tab="cities">Населені пункти <span>${report.settlements}</span></button>
      </div>
      <div class="tools">
        <label class="search"><span class="sr">Пошук</span><input type="search" id="search" placeholder="Пошук: ім’я, вулиця, черга…" autocomplete="off"></label>
        <button class="ghost" type="button" id="export">⬇ CSV</button>
      </div>
    </div>
    <div role="tabpanel" id="tab-users">${usersTable(report.people, where)}</div>
    <div role="tabpanel" id="tab-addresses" hidden>${addressesTable(report.people, where)}</div>
    <div role="tabpanel" id="tab-cities" hidden>${citiesGrid(report.cities, where)}</div>
    <p class="nothing" id="nothing" hidden>Нічого не знайшлося. Спробуйте інше слово.</p>
  </section>
</main>
<script type="application/json" id="data">${json(data)}</script>
<script>${SCRIPT}</script>
</body>
</html>`;
}

export function renderLocked() {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Світло Волині · Вхід</title>
<link href="${FONTS}" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>
<main class="locked">
  <article class="panel">
    <span class="bolt big" aria-hidden="true">⚡</span>
    <h1>Адмін-панель</h1>
    <p>Цю сторінку відкриває лише власник бота. У <a href="https://t.me/volunsvitlo_bot">@volunsvitlo_bot</a> натисніть «📊 Адмін-панель» або надішліть /admin, і бот дасть робоче посилання.</p>
  </article>
</main>
</body>
</html>`;
}

function dailyChart(daily) {
  const max = Math.max(1, ...daily.map((day) => day.count));
  const bars = daily.map((day, index) => {
    const height = day.count ? Math.max(8, Math.round((day.count / max) * 100)) : 0;
    const edge = index === 0 || index === daily.length - 1 || index === Math.floor(daily.length / 2) ? " edge" : "";
    return `<div class="day${edge}" title="${esc(day.label)}: ${day.count}">
      <span class="count">${day.count || ""}</span>
      <span class="col"><i style="--h:${height}%;--d:${index * 30}ms"></i></span>
      <span class="date">${esc(day.label)}</span>
    </div>`;
  }).join("");
  return `<div class="bars" role="img" aria-label="Нові користувачі за 14 днів">${bars}</div>`;
}

function queueChart(queues) {
  const max = Math.max(1, ...queues.map((item) => item.count));
  const rows = queues.map((item, index) => `<div class="qrow">
      <span class="qname">${item.queue}</span>
      <span class="track"><i style="--w:${Math.round((item.count / max) * 100)}%;--d:${index * 25}ms"></i></span>
      <b>${item.count}</b>
    </div>`).join("");
  return `<div class="queues">${rows}</div>`;
}

function usersTable(people, where) {
  if (!people.length) return '<p class="empty">Ще ніхто не запускав бота.</p>';
  const rows = people.map((person) => {
    const [tone, label] = STATUS[person.status];
    const name = person.name || "Без імені";
    const handle = person.username ? `<a href="https://t.me/${encodeURIComponent(person.username)}">@${esc(person.username)}</a>` : "";
    const places = person.addresses.length
      ? person.addresses.map((row) => `<span class="addr">${esc(placeText(row, where))}${row.queue ? ` <em class="q">${row.queue}.${row.subqueue}</em>` : ""}</span>`).join("")
      : '<span class="muted">адрес ще немає</span>';
    return `<tr>
      <td data-label="Користувач" class="lead"><div class="v"><div class="who"><span class="avatar" style="--hue:${hue(person.chatId)}">${esc(initial(name))}</span><div><b>${esc(name)}</b><small>${handle}${handle ? " · " : ""}ID ${esc(person.chatId)}</small></div></div></div></td>
      <td data-label="Статус"><div class="v"><span class="chip ${tone}">${label}</span></div></td>
      <td data-label="Адреси"><div class="v">${places}</div></td>
      <td data-label="Перший візит"><div class="v">${esc(formatWhen(person.firstSeen) || "—")}</div></td>
      <td data-label="Остання активність"><div class="v">${esc(formatWhen(person.lastSeen) || "—")}</div></td>
      <td data-label="Дій" class="num"><div class="v">${person.actions}</div></td>
    </tr>`;
  }).join("");
  return `<div class="table-wrap"><table>
    <thead><tr><th>Користувач</th><th>Статус</th><th>Адреси</th><th>Перший візит</th><th>Остання активність</th><th class="num">Дій</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function addressesTable(people, where) {
  const rows = people.flatMap((person) => person.addresses.map((row) => `<tr>
      <td data-label="Адреса"><div class="v"><b>${esc(where(row.city))}</b><small>${esc([row.street, row.house].filter(Boolean).join(", ") || "вулицю не вказано")}</small></div></td>
      <td data-label="Черга"><div class="v">${row.queue ? `<em class="q">${row.queue}.${row.subqueue}</em>` : '<span class="muted">не визначено</span>'}</div></td>
      <td data-label="Назва"><div class="v">${row.label ? esc(row.label) : '<span class="muted">—</span>'}</div></td>
      <td data-label="Користувач"><div class="v">${esc(person.name || "Без імені")}<small>ID ${esc(person.chatId)}</small></div></td>
      <td data-label="Сповіщення"><div class="v">${row.muted ? '<span class="chip idle">🔕 вимкнені</span>' : '<span class="chip on">🔔 увімкнені</span>'}</div></td>
      <td data-label="Додано"><div class="v">${esc(formatWhen(row.createdAt) || "—")}</div></td>
    </tr>`)).join("");
  if (!rows) return '<p class="empty">Адрес ще немає.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Адреса</th><th>Черга</th><th>Назва</th><th>Користувач</th><th>Сповіщення</th><th>Додано</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function citiesGrid(cities, where) {
  if (!cities.length) return '<p class="empty">Адрес ще немає.</p>';
  return `<div class="cities">${cities.map((city) => `<article class="city">
      <header><b>${esc(where(city.city))}</b><span>${city.addresses} ${plural(city.addresses, "адреса", "адреси", "адрес")} · ${city.users} ${plural(city.users, "користувач", "користувачі", "користувачів")}</span></header>
      <ul>${city.items.map((row) => `<li>${esc([row.street || "вулицю не вказано", row.house].filter(Boolean).join(", "))}${row.queue ? ` <em class="q">${row.queue}.${row.subqueue}</em>` : ""}</li>`).join("")}</ul>
    </article>`).join("")}</div>`;
}

function shortWhen(iso, now) {
  const full = formatWhen(iso);
  if (!full) return "";
  return full.slice(0, 10) === formatWhen(now.toISOString()).slice(0, 10) ? `о ${full.slice(-5)}` : full;
}

function placeText(row, where) {
  return [where(row.city), row.street, row.house].filter(Boolean).join(", ");
}

function initial(name) {
  return [...String(name).trim()][0]?.toUpperCase() ?? "?";
}

function hue(value) {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) % 100003;
  // Золотий кут розводить сусідні ID по різних кольорах.
  return Math.round(hash * 137.508) % 360;
}

function clip(value, size) {
  const text = String(value ?? "");
  return text.length > size ? `${text.slice(0, size - 1)}…` : text;
}

function json(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
