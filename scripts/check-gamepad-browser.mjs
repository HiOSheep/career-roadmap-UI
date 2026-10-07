// Drives an injected controller through the running terminal.
// Run against a dev/preview server: node scripts/check-gamepad-browser.mjs
// Playwright is resolved like the other browser checks (PLAYWRIGHT_MODULE or "playwright").
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
const url = process.env.REVIEW_URL || "http://127.0.0.1:5199/?scene=archive";
const output = resolve(process.env.GAMEPAD_REVIEW_OUTPUT || "verification/gamepad");
await mkdir(output, { recursive: true });

const XBOX = "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)";
const PS = "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)";

// One fake pad whose buttons and axes the test can set, plus logs of everything
// the terminal received: key events, clicks and haptics.
const fakePad = (id) => `(() => {
  const pad = {
    index: 0, id: ${JSON.stringify(id)}, mapping: "standard", connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0],
    vibrationActuator: { playEffect(type, params) { window.__pad.rumble.push({ type, ...params }); return Promise.resolve("complete"); } },
  };
  window.__pad = {
    pad, list: [pad], keys: [], clicks: [], rumble: [],
    set(i, pressed) { pad.buttons[i] = { pressed, value: pressed ? 1 : 0 }; },
    axis(i, value) { pad.axes[i] = value; },
    swap(id) { pad.id = id; },
    unplug() { window.__pad.list = []; },
  };
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__pad.list });
  document.addEventListener("keydown", (event) => window.__pad.keys.push(event.key), true);
  document.addEventListener("click", (event) => {
    const target = event.target;
    window.__pad.clicks.push(target?.closest?.("[data-action]")?.dataset.action ?? target?.getAttribute?.("aria-label") ?? target?.tagName ?? "?");
  }, true);
})();`;

const browser = await chromium.launch({ channel: process.env.REVIEW_CHANNEL || "msedge", headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: "block" });
await context.addInitScript({ content: fakePad(XBOX) });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

const checks = [];
const check = (name, condition, detail = "") => {
  checks.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const stats = () => page.evaluate(() => ({ ...window.rhine.stats(), gamepad: window.rhine.gamepad() }));
const press = async (button, hold = 140) => {
  await page.evaluate((index) => window.__pad.set(index, true), button);
  await page.waitForTimeout(hold);
  await page.evaluate((index) => window.__pad.set(index, false), button);
  await page.waitForTimeout(220);
};

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.rhine?.stats().ready && window.__pad, null, { timeout: 180000 });
  await page.waitForTimeout(2500);

  check("Xbox pad recognised on connect", (await stats()).gamepad.family === "xbox");
  const first = (await stats()).selected;
  await press(13);
  check("D-pad down steps to the next month", (await stats()).selected !== first);
  check("Arrow key reaches the terminal", (await page.evaluate(() => window.__pad.keys)).includes("ArrowDown"));

  await press(0);
  await page.waitForFunction(() => window.rhine.stats().mode === "detail", null, { timeout: 8000 });
  check("A opens the selected case", (await stats()).mode === "detail");
  await press(1);
  await page.waitForFunction(() => window.rhine.stats().mode === "archive", null, { timeout: 8000 });
  check("B returns to the shelf", (await stats()).mode === "archive");

  await press(9);
  await page.waitForSelector("#gamepad-settings", { timeout: 8000 });
  check("Menu opens the settings panel", true);
  check("Settings names the connected pad", /Xbox/.test(await page.textContent("#gamepad-settings")));
  check("Selection frame appears with the panel", await page.evaluate(() => window.rhine.gamepad().focusing && document.querySelector("#gamepad-focus").dataset.visible === "true"));
  await press(13);
  check("Frame walks the panel controls", await page.evaluate(() => document.activeElement?.closest(".terminal-modal") !== null));
  await press(1);
  await page.waitForFunction(() => !document.querySelector("#modal-root .terminal-modal"), null, { timeout: 8000 });
  check("B closes the panel and the frame with it", !(await page.evaluate(() => window.rhine.gamepad().focusing)));

  await press(3);
  await page.waitForTimeout(400);
  const ring = await page.evaluate(() => ({ visible: document.querySelector("#gamepad-focus").dataset.visible, width: parseFloat(getComputedStyle(document.querySelector("#gamepad-focus")).width) }));
  check("Y shows the selection frame", ring.visible === "true" && ring.width > 6, JSON.stringify(ring));
  await page.evaluate(() => { window.__pad.clicks.length = 0; });
  await press(0);
  check("A activates the framed control", (await page.evaluate(() => window.__pad.clicks)).length > 0);
  await press(1);
  check("B puts the frame away", !(await page.evaluate(() => window.rhine.gamepad().focusing)));

  check("Haptics fired", (await page.evaluate(() => window.__pad.rumble)).some((call) => call.type === "dual-rumble" && call.duration > 0));
  check("Pointer is hidden while the pad drives", (await page.evaluate(() => document.documentElement.dataset.input)) === "gamepad");

  // Enter must only ever read a file: closing a panel restores focus to the button
  // that opened it, and the browser would otherwise activate that button again.
  await page.focus('[data-action="settings"]');
  check("Focus is on the settings button", (await page.evaluate(() => document.activeElement?.dataset.action)) === "settings");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  check("Enter on the focused settings button reads the file instead",
    (await stats()).mode === "detail" && !(await page.$("#modal-root .settings-modal")), (await stats()).mode);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.rhine.stats().mode === "archive", null, { timeout: 8000 });

  // The selection frame is a controller affordance: a panel opened by mouse or
  // keyboard must not raise it, and either input takes it away again.
  await page.click('[data-action="settings"]');
  await page.waitForSelector("#gamepad-settings", { timeout: 8000 });
  check("Mouse-opened panel shows no selection frame",
    !(await page.evaluate(() => window.rhine.gamepad().focusing)) && (await page.evaluate(() => document.querySelector("#gamepad-focus").dataset.visible)) !== "true");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await press(3);
  check("Y raises the frame for the pad", await page.evaluate(() => window.rhine.gamepad().focusing));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("Typing puts the frame away", !(await page.evaluate(() => window.rhine.gamepad().focusing)));

  await page.mouse.move(700, 400);
  await page.waitForTimeout(300);
  check("Mouse movement restores the pointer", (await page.evaluate(() => document.documentElement.dataset.input)) !== "gamepad");

  await page.evaluate((id) => window.__pad.swap(id), PS);
  await press(0);
  check("Hot swap follows the pad in hand", (await stats()).gamepad.family === "playstation");
  await page.evaluate(() => window.__pad.unplug());
  await page.waitForTimeout(400);
  check("Unplugging clears the status", (await stats()).gamepad.connected === false);

  await page.screenshot({ path: resolve(output, "gamepad-focus.png") });
  await writeFile(resolve(output, "results.json"), JSON.stringify({ url, checks, errors }, null, 2));
  assert.deepEqual(errors, [], "No page errors while the pad drives the terminal");
  const failed = checks.filter((entry) => !entry.pass);
  assert.equal(failed.length, 0, `${failed.length} controller checks failed: ${failed.map((entry) => entry.name).join(", ")}`);
  console.log(`Gamepad browser checks passed: ${checks.length} assertions against the running terminal (mapping, focus frame, transport, haptics, hot swap and pointer hand-off).`);
} finally {
  await browser.close();
}
