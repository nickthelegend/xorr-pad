/**
 * shots.mjs — capture the desk app, from the desk app.
 *
 *   node_modules/.bin/electron shots.mjs
 *
 * Runs the real Electron window against the real backend and the real Base
 * fork, drives it through the states that matter, and captures each one with
 * webContents.capturePage(). Nothing is staged: every number in these images
 * came off the chain or out of the Sibyl store a second earlier, and every
 * transaction hash is a real mined fill on the fork.
 *
 * Writes to docs/images/app/.
 */
import { app, BrowserWindow } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { start } from "./main/server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "docs", "images", "app");
const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.PAD_TOKEN || "xorrpad-dev";
const API = `http://127.0.0.1:${PORT}`;
const H = { "content-type": "application/json", authorization: `Bearer ${TOKEN}` };

const api = (p, o = {}) => fetch(API + p, { ...o, headers: H }).then((r) => r.json()).catch(() => null);
const key = (id) => api("/key", { method: "POST", body: JSON.stringify({ id }) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let win;

/** Let the UI's own 4s poll catch up, then capture what the operator sees. */
async function shot(name, caption, settle = 5200) {
  await wait(settle);
  const img = await win.webContents.capturePage();
  const file = path.join(OUT, `${name}.png`);
  await writeFile(file, img.toPNG());
  console.log(`  ${String(name).padEnd(22)} ${caption}`);
  return file;
}

async function run() {
  await mkdir(OUT, { recursive: true });
  await start();

  win = new BrowserWindow({
    width: 1600, height: 1000, show: true, backgroundColor: "#0F100F",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL(`${API}/?token=${encodeURIComponent(TOKEN)}`);

  // A known-good starting state: limits remembered, armed, ETH in hand.
  await api("/memory/seed", { method: "POST", body: "{}" });
  await api("/arm", { method: "POST" });
  await key("momentum");
  await key("ETH");

  console.log("\ncapturing the desk app\n");

  await shot("01-deck", "the deck at rest: six markets, fifteen keys, memory recalled");

  await key("scan");
  await shot("02-book", "the book run across all six markets, with the BTC trend gate", 6500);

  await key("buy");
  await shot("03-decision", "a verdict with its remembered reasons, numbered as footnotes");

  const fill = await key("yes");
  await shot("04-filled", `a real mined fill: ${fill?.fill?.hash?.slice(0, 18)}…`, 9000);

  // Teach it a habit, then show the habit vetoing a trade.
  for (let i = 0; i < 3; i++) { await key("sell"); await key("no"); }
  const rf = await api("/reflect");
  if (rf?.proposals?.length) {
    await api("/reflect/accept", { method: "POST", body: JSON.stringify({ proposal: rf.proposals[0] }) });
    await key("sell");
    await shot("05-learned-rule", "a rule mined from your own yes/no, now vetoing a trade");
  }

  // The demo the whole product is built around.
  await api("/memory/wipe", { method: "POST" });
  await shot("06-wiped", "memory deleted: limits, positions and learned rules gone");

  await key("buy");
  await shot("07-post-wipe", "the same keypress, decided differently, with memory gone");

  await api("/memory/seed", { method: "POST", body: "{}" });
  await key("buy");
  await shot("08-restored", "taught its limits again: the full-size decision returns");

  console.log(`\nwritten to ${path.relative(path.join(HERE, ".."), OUT)}\n`);
  app.quit();
}

app.whenReady().then(() => run().catch((e) => { console.error(e); app.quit(); }));
app.on("window-all-closed", () => app.quit());
