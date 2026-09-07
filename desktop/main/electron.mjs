/**
 * electron.mjs — the desk app.
 *
 * One process: it starts the trading backend (bound to 0.0.0.0 so the pad can
 * reach it over Wi-Fi), starts the Sibyl memory sidecar, and opens the window.
 * The LAN URL is printed and shown in the title so you know what to type into
 * the pad's captive portal.
 */
import { app, BrowserWindow, shell } from "electron";
import { networkInterfaces } from "node:os";
import { start } from "./server.mjs";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.PAD_TOKEN || "xorrpad-dev";
process.env.PAD_TOKEN = TOKEN;

function lanAddress() {
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal) return n.address;
  return "127.0.0.1";
}

let win, backend;

async function boot() {
  backend = await start();
  const lan = `http://${lanAddress()}:${PORT}`;
  console.log(`\n  point the pad's captive portal at:  ${lan}`);
  console.log(`  pad token:                          ${TOKEN}\n`);

  win = new BrowserWindow({
    width: 1280, height: 860, backgroundColor: "#0b0d10",
    title: `xorr-pad — pad connects to ${lan}`,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/?token=${encodeURIComponent(TOKEN)}`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

app.whenReady().then(boot);
app.on("window-all-closed", () => { backend?.srv?.close(); backend?.mem?.stop(); app.quit(); });
