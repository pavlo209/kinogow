// Вхід в адмін-панель: одноразове посилання з бота ставить cookie на 30 днів.
const TTL = 30 * 24 * 60 * 60 * 1000;

export function adminToken(store, now = Date.now()) {
  const current = store.metaGet("admin_token");
  const until = Number(store.metaGet("admin_token_until") || 0);
  if (current && until > now) return current;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  store.metaSet("admin_token", token);
  store.metaSet("admin_token_until", String(now + TTL));
  return token;
}

export function adminLink(store, publicUrl) {
  const base = String(publicUrl || "https://pavlo-telegram-bot.pmodsp.workers.dev").replace(/\/$/, "");
  return `${base}/admin/enter/${adminToken(store)}`;
}

// Повертає "fresh" (прийшли за посиланням: поставити cookie), "cookie" або "" (вхід заборонено).
export function adminAccess(store, request, url) {
  const expected = store.metaGet("admin_token");
  const valid = Boolean(expected) && Number(store.metaGet("admin_token_until") || 0) > Date.now();
  if (!valid) return "";
  const key = request.headers.get("X-Admin-Key") || url.searchParams.get("k") || "";
  if (key && key === expected) return "fresh";
  return readCookie(request, "svitlo_admin") === expected ? "cookie" : "";
}

export function adminCookie(store) {
  return `svitlo_admin=${encodeURIComponent(store.metaGet("admin_token"))}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=2592000`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}
