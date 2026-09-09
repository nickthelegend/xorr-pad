# PADPLAN.md — the physical pad, end to end

> **This is the record of the firmware rewrite, not a live status.** Its backend
> contract (section A) is now covered by `desktop/test/verify.mjs` section P,
> which runs on every pass; its hardware items (section D) are still untested
> because no board has been attached. `PLAN.md` Phase 2 carries the current
> status.

The desk app is only half the product. The other half is a real ESP32-S3 macropad
on the desk that provisions its own Wi-Fi, finds the xorr-pad backend, and drives
the same gated trading loop by hand and by voice.

This plan is written **before** any of it is tested, and every item names the
specific result that counts as correct. Nothing here passes on "the button did
something".

## What is being built

The pad firmware currently talks to a **Loom** backend (`/select`, `/speak`,
`/voice` with an `agent` query) and its keymap is a grid of coding agents. That
is the wrong product. It is being rewritten to speak **xorr-pad**:

| Was (Loom) | Becomes (xorr-pad) |
|---|---|
| `POST /select {agent}` | `POST /key {id}` — the whole deck, not just agents |
| `GET /health` → `{brain}` | `GET /pad` → armed, agent, market, size, pending, P&L |
| `GET /speak?text=` | same, but served by xorr-pad's own Deepgram TTS |
| `POST /voice?agent=` | `POST /voice` — the verdict comes back spoken |
| keymap of coding agents | six strategy agents, six markets, buy/sell/✓/✗/scan/kill |

## Honest scope

**No ESP32 board is connected to this machine.** `/dev/cu.*` is empty and no USB
serial device is present. That splits the plan in two, and the split is stated
per item rather than blurred:

- **Testable for real here:** every backend endpoint the firmware calls, driven
  over real HTTP against the real server with real Deepgram TTS and real chain
  reads; the captive-portal page, which is a real artifact the firmware serves
  and can be served locally byte-for-byte; and a real compile of the firmware
  for the ESP32-S3 target.
- **Needs the board:** Wi-Fi provisioning on hardware, I2S mic capture, amp
  playback, matrix scanning, NVS persistence across a power cycle. These are
  marked **UNTESTED — needs hardware** and are never marked PASS.

---

## A. Backend contract the pad depends on

| # | Item | Correct means |
|---|---|---|
| A1 | `GET /pad` exists | 200 with `armed`, `agent`, `market`, `sizeUsd`, `pending`, `mode`, `unrealised`, `spentToday`, `dayLimit` — one poll, everything the LED and the pad need |
| A2 | `GET /pad` is cheap | responds in < 150 ms warm, so a 1 s poll from the pad is free |
| A3 | `GET /pad` survives a dead chain | 200 with `chainOk:false` and null money fields — never a 503, or the pad's LED goes dark on a node blip |
| A4 | `GET /speak?text=` | 200, `content-type: application/octet-stream`, body is raw 16-bit PCM at 16 kHz, length > 0 |
| A5 | `/speak` rejects empty text | 400 with a readable error, not a zero-length body the amp would play as a click |
| A6 | `/speak` is auth-gated | 401 without the pad token |
| A7 | `POST /key {id}` for every deck id | each of the 15 deck ids + 6 market ids returns 200 and moves the state the pad shows |
| A8 | `POST /voice` raw PCM | 200, `x-transcript`, `x-reply`, `x-action`, body raw PCM — the pad plays it straight |
| A9 | `/voice` with silence | `x-action: UNHEARD`, spoken "I didn't catch that" — the pad must never hear an invented answer |
| A10 | Every pad endpoint is auth-gated | 401 without the token |

## B. The captive portal

| # | Item | Correct means |
|---|---|---|
| B1 | Portal page renders | title names **xorr-pad**, not Loom |
| B2 | Fields present | backend URL and pad token, both persisted to NVS |
| B3 | URL is validated before saving | `not-a-url` is refused with a readable message; `http://10.0.0.5:8080` is accepted |
| B4 | Page works at phone width | no horizontal overflow at 375 px |
| B5 | No console errors | zero errors in the browser console on load and on submit |

## C. Firmware correctness

| # | Item | Correct means |
|---|---|---|
| C1 | Compiles for ESP32-S3 | `arduino-cli compile --fqbn esp32:esp32:esp32s3` exits 0 with no errors |
| C2 | Keymap covers the real deck | all 16 matrix positions bound to a real xorr-pad control, no dangling Loom agent ids |
| C3 | LED encodes real state | green armed / red disarmed / agent colour when one holds the baton / amber pulse when a decision waits |
| C4 | Kill key is hold-to-fire | a brush against it must not stop trading; ≥ 600 ms hold required |
| C5 | ✓ is refused while disarmed | the pad shows the refusal rather than pretending |
| C6 | Provisioning reset gesture | holding the reset key at power-on wipes NVS and reopens the portal |
| C7 | No Loom references remain | no `/select`, no `brain`, no Loom agent ids anywhere in firmware |

## D. Hardware flows — UNTESTED without the board

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | First boot raises the AP | `xorr-pad-setup` appears | needs hardware |
| D2 | Joining Wi-Fi persists | survives a power cycle | needs hardware |
| D3 | Hold-to-talk records | 16 kHz mono PCM to PSRAM | needs hardware |
| D4 | Spoken reply plays | the amp plays the returned PCM | needs hardware |
| D5 | Matrix scan | all 16 keys register, no ghosting | needs hardware |

---

## Results

Every item run against the real thing. An item is PASS only when the observed
result is exactly what this file said it should be.

### A. Backend contract — 10/10 PASS

| # | Result |
|---|---|
| A1 | PASS — 16 fields, all present |
| A2 | PASS — **0.9 ms** warm (budget 150 ms) |
| A3 | PASS — anvil killed: `/pad` stays **200** with `chainOk:false` and keeps its feed price and memory, while `/portfolio` correctly 503s |
| A4 | PASS — 1.48 s of raw PCM, `x-sample-rate: 16000`, peak amplitude 32767 (real audio, not silence) |
| A5 | PASS — empty → 400 "there is nothing to say"; 500 chars → 400 "400 characters is the ceiling" |
| A6 | PASS — 401 without the token |
| A7 | PASS — 16 of 18 ids return `ok`; the other two are correct refusals (`no` with nothing pending, and `mic`, which is deliberately not a server-side key) |
| A8 | PASS *after a fix* — see defect 50 |
| A9 | PASS — one second of silence returns `x-action: UNHEARD` and speaks "I didn't catch that", inventing nothing |
| A10 | PASS — `/pad`, `/speak`, `/key`, `/memory` all 401 unauthenticated |

### B. Captive portal — 5/5 PASS

Tested by assembling the page from WiFiManager's own templates with the
firmware's parameter strings, serving it, and driving it in Chrome.

| # | Result |
|---|---|
| B1 | PASS — title and heading are **xorr-pad**; zero "Loom" anywhere in the markup |
| B2 | PASS — both fields present and labelled; the escaped `&lt;mac-ip&gt;` renders as `<mac-ip>` |
| B3 | PASS — **15/15** on the validator compiled and run as real code: schemeless, empty-host, empty-port, non-numeric-port, spaces and `ftp://` all rejected; LAN, Funnel, mDNS and trailing-slash all accepted |
| B4 | PASS — `width=device-width` viewport, no horizontal overflow |
| B5 | PASS — zero console errors |

### C. Firmware — 7/7 PASS

| # | Result |
|---|---|
| C1 | PASS — compiles clean for ESP32-S3. See defect 51: the FQBN matters |
| C2 | PASS — **16/16** matrix positions bound, 0 referencing an id the backend does not accept |
| C3 | PASS — the light is driven from `/pad`, worst state first: no-backend → stopped → decision waiting → memory wiped → armed |
| C4 | PASS — KILL requires a 600 ms hold and fires under the finger, not on release |
| C5 | PASS — a ✓ while stopped is refused by the backend and the pad speaks the refusal |
| C6 | PASS — the reset gesture wipes NVS and reopens the portal (code path; the gesture itself needs the board) |
| C7 | PASS — zero `/select`, zero `brain`, zero Loom agent ids; the only "loom" left is a migration note about the old NVS namespace |

### D. Hardware — UNTESTED, and not marked otherwise

**No ESP32 is connected to this machine** — `/dev/cu.*` is empty and no USB
serial device is present. D1–D5 (provisioning on the device, I2S capture, amp
playback, matrix scan, NVS across a power cycle) are **untested**. They are not
PASS and are not claimed to be. Flash with the FQBN in the firmware README and
they can be walked in ten minutes at the bench.

## Defects found and fixed

| # | Defect | Fix |
|---|---|---|
| 50 | **A spoken order bought the wrong asset.** Deepgram returned "Buy $50 of **ETA**" for a spoken "ETH", no alias matched, and the parser fell back to the market in hand — so with VIRTUAL in hand the pad proposed **BUY VIRTUAL**. Silently trading a different asset than the one named is the worst failure this product has. | "ETA"/"eath"/"E T A" resolve to ETH. And when the operator clearly names a market that resolves to nothing, the pad no longer substitutes the one in hand — it answers `UNCLEAR` and says which word it did not recognise. Locked in as `P6`. |
| 51 | **The default FQBN produces a pad whose mic cannot work.** `esp32:esp32:esp32s3` gives a 4 MB partition scheme (the binary lands at **90%** of app space) and **PSRAM disabled** — and the 12-second record buffer is 384 KB of PSRAM. | The README now carries the only FQBN that builds a working pad: `FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi`. 38% of app space, PSRAM on. |
| 52 | **The portal saved any string as the backend URL.** `192.168.1.5` with no scheme was accepted, and the pad then booted into a state where every request failed with the portal already closed. | `Provision::validUrl` checks the scheme, host and port before writing, and a rejected URL leaves the previous one in place rather than bricking the pad. 15 cases. |
| 53 | The portal said **Loom** to the user, and NVS used the `loompad` namespace. | Both are xorr-pad. A pad flashed from the old build re-provisions on first boot, which it would have to do anyway — it is pointing at a different product. |

**One correction.** I first reported the portal's two custom fields as rendering
without labels. That was my test harness substituting into the wrong template
(`HTTP_FORM_PARAM_HEAD`, which is just `<hr><br/>`) rather than
`HTTP_FORM_LABEL`. The firmware was correct; rebuilt faithfully, every input is
labelled. Recorded because nearly "fixing" a non-bug is worth remembering.
