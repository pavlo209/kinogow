import http from "http";

const city = process.argv[2] || "";
const street = process.argv[3] || "";
const pageUrl = "https://energy.volyn.ua/spozhyvacham/perervy-u-elektropostachanni/cherga/";

function put(url) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: "PUT" }, (response) => {
      let data = "";
      response.on("data", (chunk) => (data += chunk));
      response.on("end", () => resolve(JSON.parse(data)));
    });
    request.on("error", reject);
    request.end();
  });
}

const page = await put(`http://127.0.0.1:9222/json/new?${pageUrl}`);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
await new Promise((resolve) => ws.addEventListener("open", resolve));

function send(method, params = {}) {
  const messageId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(method)), 20000);
    pending.set(messageId, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error("cdp"));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true });
  return result.result && result.result.value;
}

await send("Page.enable");
let title = "";
for (let attempt = 0; attempt < 6; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  title = (await evaluate("document.title")) || "";
  if (!/just a moment/i.test(title)) break;
  const box = await evaluate(`(() => {
    const widget = document.querySelector('#XWAst9');
    if (!widget) return '';
    const rect = widget.getBoundingClientRect();
    if (!rect.width) return '';
    return JSON.stringify({ x: rect.x + 30, y: rect.y + rect.height / 2 });
  })()`);
  if (!box) continue;
  const point = JSON.parse(box);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
}
if (/just a moment/i.test(title)) {
  ws.close();
  process.exit(2);
}
await evaluate(`(() => {
  const cityField = document.querySelector('#formCity');
  if (!cityField) return;
  cityField.value = ${JSON.stringify(city)};
  document.querySelector('#formStreet').value = ${JSON.stringify(street)};
  cityField.form.submit();
})()`);
await new Promise((resolve) => setTimeout(resolve, 4000));
process.stdout.write((await evaluate("document.body.innerText")) || "");
ws.close();
