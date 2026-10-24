// Тексти й клавіатури бота. HTML для parse_mode=HTML.

export const BOT_LINK = "https://t.me/volunsvitlo_bot";
export const SITE_URL = "https://energy.volyn.ua/spozhyvacham/perervy-u-elektropostachanni/hrafik-vidkliuchen/page.php#move";

export const MENU = {
  add: "➕ Додати адресу",
  list: "📋 Мої адреси",
  where: "🗺 Де працює",
  help: "❓ Допомога",
  site: "🌐 Офіційний графік",
  admin: "📊 Адмін-панель",
};

// Підписи старих версій клавіатури теж працюють: вона в людей закріплена.
export const BUTTON_ALIASES = new Map([
  ["додати адресу", "add"],
  ["мої адреси", "list"],
  ["де працює", "where"],
  ["допомога", "help"],
  ["як користуватись", "help"],
  ["офіційний графік", "site"],
  ["сайт стеження", "site"],
  ["адмін-панель", "admin"],
]);

export const COMMANDS = [
  { command: "start", description: "Почати й відкрити меню" },
  { command: "add", description: "Додати адресу" },
  { command: "list", description: "Мої адреси й графік" },
  { command: "help", description: "Як користуватись" },
  { command: "cancel", description: "Скасувати введення" },
];

export function mainKeyboard(admin = false) {
  const keyboard = [
    [{ text: MENU.add }, { text: MENU.list }],
    [{ text: MENU.where }, { text: MENU.help }],
    [{ text: MENU.site }],
  ];
  if (admin) keyboard.push([{ text: MENU.admin }]);
  return { keyboard, resize_keyboard: true, is_persistent: true, input_field_placeholder: "Луцьк, Волі, 44а" };
}

export function welcomeNew(name) {
  return [
    `👋 <b>Вітаю${name}!</b>`,
    "",
    "Я покажу, коли за вашою адресою не буде світла, і напишу, щойно графік зміниться.",
    "",
    "⚡ <b>Що вмію</b>",
    "• години відключень на сьогодні й завтра",
    "• «що зараз»: є світло чи ні і скільки чекати",
    "• шкалу доби 🟩🟨🟥 для кожної адреси",
    "• стежити за кількома адресами: дім, робота, батьки",
    "",
    "Почнімо 👇",
  ].join("\n");
}

export function welcomeBack(name) {
  return `👋 <b>З поверненням${name}!</b>\nОсь ваші адреси. Натисніть будь-яку, щоб побачити свіжий графік.`;
}

export const HELP = [
  "❓ <b>Як користуватись</b>",
  "",
  `1️⃣ Натисніть «${MENU.add}»`,
  "2️⃣ Напишіть населений пункт, вулицю та будинок. Або все одним рядком:",
  "      <i>Луцьк, Волі, 44а</i>",
  "3️⃣ Отримаєте графік на сьогодні й завтра, а далі сповіщення, коли він зміниться.",
  "",
  `${MENU.list}: графік, перейменування, зміна й видалення адрес.`,
  "🔕 Сповіщення можна вимкнути для кожної адреси окремо.",
  "",
  "🟩 світло є · 🟨 частина години · 🟥 світла немає",
  "",
  "Команди: /add · /list · /help · /cancel",
].join("\n");

export function coverage(cities, total) {
  const extra = total > cities.length ? ` і ще ${total - cities.length}` : "";
  return [
    "🗺 <b>Де працює бот</b>",
    "",
    `📍 Волинська область: <b>${total}</b> населених пунктів у довіднику.`,
    `🏙 ${cities.join(", ")}${extra}.`,
    "",
    "🔄 Графік Волиньобленерго перевіряю кожні 5 хвилин.",
    "Інші області поки не підключені.",
  ].join("\n");
}

export const SITE = [
  "🌐 <b>Офіційний графік Волиньобленерго</b>",
  "",
  `<a href="${SITE_URL}">energy.volyn.ua · графік відключень</a>`,
  "",
  "Бот бере години звідти й перевіряє збережені адреси кожні 5 хвилин.",
].join("\n");

const BARS = ["▰▱▱", "▰▰▱", "▰▰▰"];

export function stepHeader(step, editing) {
  const title = editing ? "✏️ <b>Зміна адреси</b>" : "➕ <b>Нова адреса</b>";
  return `${title} · крок ${step} з 3\n${BARS[step - 1]}`;
}

export function stepCity(editing) {
  return [
    stepHeader(1, editing),
    "",
    "🏙 Напишіть <b>населений пункт</b>: лише назву, без «м.» чи «с.»",
    "Наприклад: <i>Луцьк</i>, <i>Ковель</i>, <i>Баїв</i>. Або оберіть нижче 👇",
    "",
    "💡 Можна одразу всю адресу: <i>Луцьк, Волі, 44а</i>",
  ].join("\n");
}

export function stepStreet(place, editing) {
  return [
    stepHeader(2, editing),
    "",
    `✅ Населений пункт: <b>${place}</b>`,
    "🛣 Напишіть <b>вулицю</b> без «вул.»: <i>Волі</i>, <i>Лесі Українки</i>.",
    "💡 Можна разом із будинком: <i>Волі 44а</i>",
  ].join("\n");
}

export function stepHouse(place, editing) {
  return [
    stepHeader(3, editing),
    "",
    `✅ ${place}`,
    "🏠 Напишіть <b>номер будинку</b>: <i>15</i>, <i>44а</i> або <i>12/2</i>.",
  ].join("\n");
}

export const CANCELLED = "👌 Скасовано. Нічого не змінював.";
export const GONE = "🤷 Цієї адреси вже немає. Відкрийте «📋 Мої адреси».";
export const STALE_BUTTON = "🤔 Ця кнопка вже застаріла. Почніть ще раз: «➕ Додати адресу».";
export const EMPTY_LIST = "📭 <b>У вас ще немає адрес</b>\nДодайте першу, і я покажу графік та писатиму про зміни.";

export function capReached(max) {
  return `📦 Можна зберегти до ${max} адрес. Видаліть зайву в «📋 Мої адреси», щоб додати нову.`;
}

export function notHouse(line) {
  return `🤔 «${line}» не схоже на номер будинку.\nНапишіть лише номер, з літерою разом: <i>15</i> або <i>44а</i>.`;
}

export function notInSchedule(place, house, notEnrolled) {
  const reason = notEnrolled
    ? "Будинок є в довіднику, але черги графіка за ним не закріплено."
    : `Перевірив ${place}, будинок ${house}: такого номера в довіднику немає.`;
  return `😕 <b>Вашої адреси немає в графіках відключень</b>\n${reason}\n\nПеревірте номер і напишіть ще раз 👇`;
}

export function labelPrompt(title) {
  return `🏷 <b>Як назвати адресу?</b>\n${title}\n\nОберіть нижче або напишіть свою назву (до 24 символів).`;
}

export function deletePrompt(title) {
  return `🗑 <b>Видалити адресу?</b>\n\n${title}\n\nСповіщення за нею більше не приходитимуть.`;
}

export const ADMIN_ONLY = "🔒 Панель адміністратора відкривається лише власнику бота.";
export const TEXT_ONLY = "📝 Я розумію лише текст. Напишіть адресу текстом, наприклад: <i>Луцьк, Волі, 44а</i>";
export const OPEN_ADMIN = "📊 Відкрити адмін-панель";
export const OPEN_CARD = "📍 Відкрити картку адреси";

// Опис бота в Telegram: setMyDescription до 512 символів, setMyShortDescription до 120.
export const BOT_DESCRIPTION = [
  "⚡ Графік відключень світла у Волинській області за вашою адресою.",
  "",
  "• години на сьогодні й завтра",
  "• «що зараз»: є світло чи ні і скільки чекати",
  "• сповіщення, щойно графік зміниться",
  "• кілька адрес: дім, робота, батьки",
  "",
  "Натисніть «Почати» і напишіть адресу: Луцьк, Волі, 44а",
].join("\n");
export const BOT_SHORT = "⚡ Графік відключень світла на Волині за вашою адресою. Пишу, щойно він зміниться.";
