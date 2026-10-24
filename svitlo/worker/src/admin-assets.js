// Стилі й скрипт адмін-панелі: палітра «бурштинове світло», світла й темна теми.

export const STYLES = `
:root {
  color-scheme: light;
  --bg:#f6f3ec; --surface:#ffffff; --surface-2:#fbf8f2; --ink:#16181d; --muted:#5f6876; --line:#e7e1d5;
  --accent:#f2a900; --accent-ink:#7a4e00; --accent-soft:#fff1c7; --on-accent:#1a1300;
  --on:#1f8a50; --on-soft:#e2f3e9; --off:#c23b3b; --off-soft:#fbe5e3; --idle:#6f7886; --idle-soft:#eef0f3;
  --shadow:0 1px 2px rgba(22,24,29,.05),0 10px 30px rgba(22,24,29,.06);
  --radius:20px; --font:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif; --display:"Unbounded","Manrope",system-ui,sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg:#0e1014; --surface:#161a21; --surface-2:#1b2029; --ink:#edeff3; --muted:#9aa4b2; --line:#272d38;
    --accent:#ffc233; --accent-ink:#ffd566; --accent-soft:rgba(255,194,51,.14);
    --on:#4cc38a; --on-soft:rgba(76,195,138,.15); --off:#ff7a70; --off-soft:rgba(255,122,112,.15); --idle:#8f99a8; --idle-soft:rgba(143,153,168,.14);
    --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px rgba(0,0,0,.35);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg:#0e1014; --surface:#161a21; --surface-2:#1b2029; --ink:#edeff3; --muted:#9aa4b2; --line:#272d38;
  --accent:#ffc233; --accent-ink:#ffd566; --accent-soft:rgba(255,194,51,.14);
  --on:#4cc38a; --on-soft:rgba(76,195,138,.15); --off:#ff7a70; --off-soft:rgba(255,122,112,.15); --idle:#8f99a8; --idle-soft:rgba(143,153,168,.14);
  --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px rgba(0,0,0,.35);
}
* { box-sizing:border-box; }
html { -webkit-text-size-adjust:100%; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 var(--font); }
a { color:var(--accent-ink); text-underline-offset:3px; }
.sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
.top { position:sticky; top:0; z-index:5; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px;
  background:color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter:blur(12px); border-bottom:1px solid var(--line); }
.brand { display:flex; align-items:center; gap:10px; min-width:0; }
.brand b { display:block; font:700 15px/1.2 var(--display); letter-spacing:-.01em; }
.brand small { color:var(--muted); font-size:12px; }
.bolt { display:grid; place-items:center; width:38px; height:38px; border-radius:12px; background:var(--accent); color:var(--on-accent); font-size:20px; flex:none;
  box-shadow:0 0 0 4px var(--accent-soft); }
.bolt.big { width:56px; height:56px; font-size:28px; border-radius:16px; margin-bottom:12px; }
.top-actions { display:flex; align-items:center; gap:8px; min-width:0; }
.pill { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:999px; font-size:12px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:52vw; }
.pill.ok { background:var(--on-soft); color:var(--on); }
.pill.warn { background:var(--off-soft); color:var(--off); }
.icon, .ghost { font:inherit; color:var(--ink); background:var(--surface); border:1px solid var(--line); border-radius:12px; cursor:pointer; }
.icon { display:grid; place-items:center; width:38px; height:38px; flex:none; }
.ghost { padding:9px 14px; font-weight:700; white-space:nowrap; }
.icon:hover, .ghost:hover { border-color:var(--accent); }
:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
main { max-width:1180px; margin:0 auto; padding:20px 16px 72px; }
.hero h1 { font:700 clamp(24px,5vw,40px)/1.1 var(--display); letter-spacing:-.02em; margin:12px 0 6px; }
.hero p { color:var(--muted); margin:0 0 20px; }
.kpis { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.kpi { position:relative; display:flex; flex-direction:column; gap:4px; padding:16px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); min-width:0; animation:rise .5s ease both; }
.kpi:nth-child(2) { animation-delay:.05s } .kpi:nth-child(3) { animation-delay:.1s } .kpi:nth-child(4) { animation-delay:.15s } .kpi:nth-child(5) { animation-delay:.2s }
.kpi .label { color:var(--muted); font-size:13px; font-weight:600; }
.kpi b { font:700 clamp(32px,8vw,48px)/1 var(--display); letter-spacing:-.03em; font-variant-numeric:tabular-nums; }
.kpi .note { color:var(--muted); font-size:12px; }
.kpi.main { grid-column:1 / -1; background:var(--accent); border-color:transparent; color:var(--on-accent); }
.kpi.main .label, .kpi.main .note { color:color-mix(in srgb, var(--on-accent) 72%, transparent); }
.kpi.main b { font-size:clamp(44px,12vw,72px); }
.meter { display:block; height:6px; border-radius:6px; background:var(--surface-2); overflow:hidden; margin-top:6px; border:1px solid var(--line); }
.meter i { display:block; height:100%; width:var(--w); background:var(--on); border-radius:6px; animation:grow-x .8s .2s ease both; transform-origin:left; }
.charts { display:grid; gap:12px; margin:12px 0; }
.panel { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); padding:16px; min-width:0; }
.panel h2 { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font:700 15px/1.3 var(--display); margin:0 0 14px; }
.panel h2 span { font:600 12px var(--font); color:var(--muted); }
.charts .panel { display:flex; flex-direction:column; }
.bars { flex:1; display:grid; grid-template-columns:repeat(14,minmax(0,1fr)); gap:6px; align-items:stretch; min-height:180px; }
.day { display:grid; grid-template-rows:18px 1fr 18px; height:100%; min-width:0; text-align:center; }
.day .count { font-size:11px; font-weight:700; color:var(--muted); }
.day .col { position:relative; display:flex; align-items:flex-end; background:var(--surface-2); border-radius:8px; overflow:hidden; }
.day .col i { display:block; width:100%; height:var(--h); background:linear-gradient(180deg,var(--accent),color-mix(in srgb, var(--accent) 70%, #e07a00)); border-radius:8px; animation:grow-y .7s var(--d) ease both; transform-origin:bottom; }
.day .date { font-size:10px; color:var(--muted); visibility:hidden; white-space:nowrap; }
.day.edge .date { visibility:visible; }
.queues { display:grid; gap:7px; }
.qrow { display:grid; grid-template-columns:34px 1fr 28px; align-items:center; gap:10px; }
.qname { font:700 12px var(--display); color:var(--muted); }
.qrow b { text-align:right; font-variant-numeric:tabular-nums; }
.track { height:12px; border-radius:6px; background:var(--surface-2); overflow:hidden; }
.track i { display:block; height:100%; width:var(--w); background:var(--accent); border-radius:6px; animation:grow-x .7s var(--d) ease both; transform-origin:left; }
.toolbar { display:flex; flex-direction:column; gap:12px; margin-bottom:12px; }
.tabs { display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }
.tabs button { font:inherit; font-weight:700; padding:9px 14px; border-radius:12px; border:1px solid var(--line); background:var(--surface-2); color:var(--muted); cursor:pointer; white-space:nowrap; }
.tabs button span { display:inline-block; margin-left:4px; padding:0 7px; border-radius:999px; background:var(--line); color:var(--ink); font-size:12px; }
.tabs button[aria-selected="true"] { background:var(--ink); color:var(--bg); border-color:var(--ink); }
.tabs button[aria-selected="true"] span { background:var(--accent); color:var(--on-accent); }
.tools { display:flex; gap:8px; }
.search { flex:1; }
.search input { width:100%; font:inherit; padding:10px 14px; border-radius:12px; border:1px solid var(--line); background:var(--surface-2); color:var(--ink); }
.search input:focus { border-color:var(--accent); outline:none; box-shadow:0 0 0 3px var(--accent-soft); }
.table-wrap { overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th { text-align:left; font-size:12px; color:var(--muted); font-weight:700; padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
td { padding:12px; border-bottom:1px solid var(--line); vertical-align:top; }
tbody tr:hover { background:var(--surface-2); }
td small { display:block; color:var(--muted); font-size:12px; }
.num { text-align:right; font-variant-numeric:tabular-nums; }
.who { display:flex; gap:10px; align-items:center; min-width:180px; }
.avatar { display:grid; place-items:center; width:36px; height:36px; border-radius:50%; flex:none; color:#fff; font-weight:800; background:hsl(var(--hue) 55% 46%); }
.addr { display:block; }
.q { font-style:normal; font:700 11px var(--display); padding:2px 7px; border-radius:7px; background:var(--accent-soft); color:var(--accent-ink); white-space:nowrap; }
.chip { display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; white-space:nowrap; }
.chip.on { background:var(--on-soft); color:var(--on); }
.chip.off { background:var(--off-soft); color:var(--off); }
.chip.idle { background:var(--idle-soft); color:var(--idle); }
.muted, .empty, .nothing { color:var(--muted); }
.cities { display:grid; gap:12px; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); }
.city { border:1px solid var(--line); border-radius:16px; padding:14px; background:var(--surface-2); }
.city header { display:flex; flex-direction:column; gap:2px; margin-bottom:8px; }
.city header span { color:var(--muted); font-size:12px; }
.city ul { margin:0; padding:0; list-style:none; display:grid; gap:6px; }
.city li { display:flex; justify-content:space-between; gap:8px; border-top:1px dashed var(--line); padding-top:6px; }
.locked { min-height:100vh; display:grid; place-items:center; }
.locked .panel { max-width:520px; }
.locked h1 { font:700 28px/1.1 var(--display); margin:0 0 8px; }
@media (max-width:719px) {
  thead { display:none; }
  table, tbody, tr, td { display:block; width:100%; }
  tr { border:1px solid var(--line); border-radius:16px; padding:6px 12px; margin-bottom:10px; background:var(--surface-2); }
  td { border:0; padding:7px 0; display:grid; grid-template-columns:104px minmax(0,1fr); gap:10px; align-items:baseline; }
  td::before { content:attr(data-label); color:var(--muted); font-size:12px; font-weight:700; }
  td.lead { grid-template-columns:1fr; padding:8px 0 10px; border-bottom:1px dashed var(--line); margin-bottom:4px; }
  td.lead::before { display:none; }
  td.num { text-align:left; }
  .who { min-width:0; }
  .brand small, .pill .long { display:none; }
  .brand b { font-size:14px; }
}
@media (min-width:720px) {
  .kpis { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .kpi.main { grid-column:span 2; grid-row:span 2; justify-content:center; }
  .charts { grid-template-columns:1.4fr 1fr; }
  .toolbar { flex-direction:row; justify-content:space-between; align-items:center; }
  .tools { min-width:340px; }
  .day .date { visibility:visible; font-size:10px; }
  .top { padding:14px 24px; }
  main { padding:24px 24px 80px; }
}
@media (min-width:1100px) { .kpis { grid-template-columns:repeat(6,minmax(0,1fr)); } .kpi.main { grid-column:span 2; grid-row:span 2; } }
@keyframes rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
@keyframes grow-y { from { transform:scaleY(0); } to { transform:scaleY(1); } }
@keyframes grow-x { from { transform:scaleX(0); } to { transform:scaleX(1); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation:none !important; transition:none !important; } }
`;

export const SCRIPT = `
(function () {
  var root = document.documentElement;
  try { var saved = localStorage.getItem("svitlo-theme"); if (saved) root.setAttribute("data-theme", saved); } catch (e) {}
  document.getElementById("theme").addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") ? root.getAttribute("data-theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("svitlo-theme", next); } catch (e) {}
  });
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[role=tab]"));
  var search = document.getElementById("search");
  var nothing = document.getElementById("nothing");
  var active = "users";
  function panel(name) { return document.getElementById("tab-" + name); }
  function filter() {
    var query = search.value.trim().toLowerCase();
    var items = panel(active).querySelectorAll("tbody tr, .city");
    var shown = 0;
    items.forEach(function (item) {
      var hit = !query || item.textContent.toLowerCase().indexOf(query) !== -1;
      item.hidden = !hit;
      if (hit) shown += 1;
    });
    nothing.hidden = !(items.length && shown === 0);
  }
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      active = tab.getAttribute("data-tab");
      tabs.forEach(function (other) {
        var on = other === tab;
        other.setAttribute("aria-selected", on ? "true" : "false");
        panel(other.getAttribute("data-tab")).hidden = !on;
      });
      document.getElementById("export").hidden = active === "cities";
      filter();
    });
  });
  search.addEventListener("input", filter);
  var data = JSON.parse(document.getElementById("data").textContent);
  var headers = {
    users: [["name","Ім’я"],["username","Username"],["chat_id","Chat ID"],["status","Статус"],["addresses","Адрес"],["first_seen","Перший візит"],["last_seen","Остання активність"],["actions","Дій"]],
    addresses: [["city","Населений пункт"],["street","Вулиця"],["house","Будинок"],["queue","Черга"],["label","Назва"],["user","Користувач"],["chat_id","Chat ID"],["notifications","Сповіщення"],["created_at","Додано"]]
  };
  function cell(value) { var text = String(value == null ? "" : value); return /[";\\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }
  document.getElementById("export").addEventListener("click", function () {
    var columns = headers[active];
    if (!columns) return;
    var lines = [columns.map(function (column) { return cell(column[1]); }).join(";")];
    data[active].forEach(function (row) { lines.push(columns.map(function (column) { return cell(row[column[0]]); }).join(";")); });
    var blob = new Blob(["\\ufeff" + lines.join("\\n")], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "svitlo-" + active + ".csv";
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); link.remove(); }, 0);
  });
})();
`;
