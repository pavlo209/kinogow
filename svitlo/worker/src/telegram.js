// Адаптер Telegram Bot API. У тестах і локально TELEGRAM_API вказує на заглушку.

// Повноекранні ефекти повідомлень Telegram (лише приватні чати). Якщо Telegram відхилить ефект, повідомлення піде без нього.
export const EFFECTS = { celebrate: "5046509860389126442" };

export function createTelegram(env, fetcher = (url, init) => fetch(url, init)) {
  const base = String(env.TELEGRAM_API || "https://api.telegram.org").replace(/\/+$/, "");
  return async function call(method, payload = {}) {
    if (!env.TELEGRAM_TOKEN) return { ok: false, description: "TELEGRAM_TOKEN не задано" };
    try {
      const response = await fetcher(`${base}/bot${env.TELEGRAM_TOKEN}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      return body ?? { ok: false, error_code: response.status, description: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, description: String(error?.message || error) };
    }
  };
}

// Надсилає одну відповідь або кілька по черзі. edit: true редагує повідомлення з кнопкою, якщо це можливо.
export async function deliver(call, chatId, result, { messageId } = {}) {
  let outcome = { ok: true, blocked: false, retryAfter: 0, description: "" };
  for (const item of [].concat(result).filter(Boolean)) {
    outcome = await deliverOne(call, String(chatId), item, messageId);
    if (!outcome.ok) break;
  }
  return outcome;
}

async function deliverOne(call, chatId, item, messageId) {
  const base = {
    chat_id: chatId,
    text: String(item.text ?? "").slice(0, 4096),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  };
  const markup = item.markup ? { reply_markup: item.markup } : {};
  const editable = !item.markup || Array.isArray(item.markup.inline_keyboard);
  if (item.edit && messageId && editable) {
    const edited = await call("editMessageText", { ...base, message_id: messageId, ...markup });
    if (edited.ok || /not modified/i.test(edited.description || "")) return outcome({ ok: true });
    if (edited.error_code === 403 || edited.error_code === 429) return outcome(edited);
  }
  const effect = EFFECTS[item.effect];
  let sent = await call("sendMessage", { ...base, ...markup, ...(effect ? { message_effect_id: effect } : {}) });
  if (!sent.ok && effect && sent.error_code === 400) sent = await call("sendMessage", { ...base, ...markup });
  return outcome(sent);
}

function outcome(response) {
  return {
    ok: Boolean(response.ok),
    blocked: response.error_code === 403,
    retryAfter: response.error_code === 429 ? Number(response.parameters?.retry_after) || 1 : 0,
    description: String(response.description || ""),
  };
}
