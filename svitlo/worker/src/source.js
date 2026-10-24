// Звідки бот бере графік: публічний API Волиньобленерго з посиланнями на картинки.

export const API = "https://api-voe-poweron.inneti.net";

export async function readOption(key, fetcher = (url, init) => fetch(url, init)) {
  const response = await fetcher(`${API}/api/options?option_key=${key}`, {
    headers: { Accept: "application/json", "User-Agent": "SvitloMonitor/1.0" },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  if (Array.isArray(payload)) return payload[0] || null;
  const members = payload["hydra:member"];
  return members?.[0] || null;
}

export function imageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("http") ? text : API + text;
}

export function kyivDate(iso) {
  const date = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(date);
}

export function addDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function labelFromIso(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}
