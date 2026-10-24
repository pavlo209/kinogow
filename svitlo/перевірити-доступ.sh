#!/bin/sh
# Перевіряє Telegram, Cloudflare і сторінку бота.
# Запускати з теки, де лежить ДОСТУПИ.env: bash перевірити-доступ.sh
set -eu
cd "$(dirname "$0")"
if [ ! -f ./ДОСТУПИ.env ]; then
  echo "Поруч немає файла ДОСТУПИ.env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./ДОСТУПИ.env
set +a

echo "Telegram"
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
echo
echo "Cloudflare"
curl -sS "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/tokens/verify" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
echo
echo "Сторінка бота"
curl -sS "${CLOUDFLARE_WORKER_URL}/health"
echo
echo "Вебхук"
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
echo
