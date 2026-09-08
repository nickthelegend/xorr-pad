---
name: xorr-pad
description: The blue case, on screen. Neo-brutalist trading deck for an agent that remembers.
colors:
  case: "#2438C8"
  case-deep: "#18268F"
  live: "#2B7FFF"
  paper: "#FFFFFF"
  paper-2: "#F1F3F8"
  ink: "#0B0D12"
  ink-2: "#5A6274"
  buy: "#00C853"
  sell: "#FF3B30"
  grape: "#7C3AED"
  punch: "#FB6A45"
  warn: "#FFE600"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
    fontFeature: "tabular-nums"
  data:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.12em"
rounded:
  none: "0px"
spacing:
  edge: "3px"
  gap: "8px"
  pane: "14px"
components:
  key:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "11px 4px"
  key-buy:
    backgroundColor: "{colors.buy}"
    textColor: "{colors.ink}"
  key-sell:
    backgroundColor: "{colors.sell}"
    textColor: "{colors.ink}"
  key-active:
    backgroundColor: "{colors.live}"
    textColor: "{colors.ink}"
  pane:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 14px 14px"
  pane-header:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    padding: "9px 14px"
---

# Design

**The blue case, on screen.** Neo-brutalism in the colours the pad was actually
printed in, pinned by the operator.

## Overview

**Mode: Operate.** The operator is completing a task at their own desk with the
physical pad in front of them. Scanability and alignment still outrank
expression — but the object on the desk is a vivid glitter-blue box with white,
charcoal, purple, pink and orange keycaps, and the screen is that object's other
half, not a quiet instrument panel.

An earlier version of this system described a warm-graphite panel derived from a
grey tray. **The tray is not grey.** A photograph of the built hardware corrected
it, and the palette below is taken from that photograph.

Three rules govern everything.

1. **Everything has a hard edge.** 3px `ink` borders and offset shadows with
   **zero blur**. No soft shadows, no glass, no gradients. Neo-brutalism earns
   the block shadow the rest of this repo's guidance forbids, because the world
   actually chose it.
2. **Black on bright, white on deep.** Every coloured fill carries `ink` text;
   only the case blue and the grape take white. This is a contrast rule before
   it is a style rule — see Colors.
3. **A key must feel like a key.** Press collapses the shadow and moves the
   element into it. That is the one interaction this product is named after.

## Colors

Taken off the printed object.

| token | value | role |
|---|---|---|
| `case` | `#2438C8` | the case. The app's ground, and the header |
| `case-deep` | `#18268F` | the case in shadow |
| `live` | `#2B7FFF` | the blue cap: the market in hand, the active agent |
| `paper` | `#FFFFFF` | every panel |
| `paper-2` | `#F1F3F8` | a panel's quieter half |
| `ink` | `#0B0D12` | **every border, every rule, most text.** Never grey |
| `ink-2` | `#5A6274` | secondary text only |
| `buy` | `#00C853` | buy · yes · armed |
| `sell` | `#FF3B30` | sell · no · kill · disarmed |
| `grape` | `#7C3AED` | the purple cap: BASE and SCAN |
| `warn` | `#FFE600` | the one yellow, for the wipe notice |

**The contrast rule, measured.** White on `buy` is 2.24:1 and white on `sell` is
3.55:1 — both fail AA, and both were shipped before this was checked. Black
`ink` on the same fills is **8.69:1** and **5.48:1**. So:

- **`ink` text** on `buy`, `sell`, `live` and `warn`.
- **White text** on `case` (8.49:1) and `grape` (5.70:1) only.

Colour is never the only signal: every green or red element also carries a word
(`ARMED`, `REFUSE`, `EXECUTE`) and a fixed position, because the palette comes
from physical keycaps and must survive colour-blind reading.

## Typography

Two faces, self-hosted from `/fonts/` so the pad works on venue wi-fi.

- **Archivo** — the voice. Heavy weights, flat terminals, set in caps for every
  label and header. Neo-brutalism wants type that shouts; this is the face doing
  it.
- **Azeret Mono** — every measured quantity, ticker and transaction hash. Square
  numerals that hold a column.

Scale: `11 · 16 · 20 · 28`. 11px is the floor and only for tracked caps; prose
never goes below 16px. The wordmark is 28px with a 3px offset ink shadow.

**Always declare font properties longhand.** The `font:` shorthand resets
`font-variant-numeric`, silently switching tabular figures off in an interface
whose job is aligned numbers.

## Layout

Six panes on a two-column grid over the blue ground, each a white block with a
3px ink border and a 5px offset shadow. Rows size to content and the page
scrolls; a fixed-viewport grid clipped the store, which is the judged content.

- **Memory spans both columns** (`section.wide`). It is the 40% of the judging,
  so it gets the width, and its contents lay out in two text columns.
- Pane headers are **black bars** that stick to the top of their pane while it
  scrolls.
- Below 900px wide: one column, deck to four columns. Below 520px: three.

**The measure column.** Quantities right-align to a shared column; the book's
table sizes its columns in `ch`, which is a monospace table's natural unit.

**The deck is built once.** Re-rendering on a poll threw away clicks and dropped
focus.

## Elevation & Depth

One shadow, and it does not blur: `5px 5px 0 ink` for panes and the verdict,
`3px 3px 0 ink` for keys and tabs. Hover lifts by 2px and grows the shadow;
press moves 3px *into* the shadow and closes it to zero.

There is no other depth vocabulary. No blur, no glass, no elevation scale.

## Shapes

Square. `0px` radius everywhere including the keys — the caps are square in
profile and the screen matches. Borders are 3px `ink`; row rules are 2px.

## Components

**Key** — 15 deck buttons, five per row. Uppercase 11px Archivo. Coloured by
role, `ink` text on every colour. The active agent takes `live`.

**Market tab** — a real `<button>` with `aria-pressed`, carrying symbol, asset
class and price. Selected fills with `live` and takes the full pane shadow.

**Verdict** — the loudest block: `EXECUTE`/`REJECT` at 28px Azeret Mono in a
tinted block that slams in from the top-left with its shadow collapsing.

**Footnote** — a black numbered square and the text beside it. The signature
component: a verdict's reasons render as *numbered footnotes*, because that is
what they are — the remembered facts the decision rests on, cited.

**Store browser** — the Memory pane renders the whole Sibyl store: every entity
by category, every reference and state key, the journal itself with a
show/hide toggle, and the engine's own file size and tier. Not a summary.

## Motion

Motion is felt, not decorative, and there are exactly three moments.

1. **The key press.** `translate(3px,3px)` with the shadow closing to zero, over
   90ms. The whole product is a keypad; this is the interaction it owes you.
2. **The verdict slam.** A new decision enters from `translate(-6px,-6px)` with
   an 11px shadow collapsing to 5px, 260ms on an exponential ease-out.
3. **The scan resolve.** Table rows enter left on a 35ms stagger, 300ms each.

`prefers-reduced-motion` removes the stagger and the slam and collapses every
transition to 0.01ms.

## Do's and Don'ts

**Do**

- Put the working on screen. A verdict without its numbered reasons is not a
  verdict.
- Keep the bad number. Delisting reasons, blocked credentials and negative
  results are the product's voice.
- Give every coloured fill `ink` text unless it is `case` or `grape`.
- Theme the browser's own surfaces: selection, scrollbars, focus rings.
- Write copy the way the README does: plain, measured, unafraid.

**Don't**

- No gradients, glass, blur, or soft shadows. The block shadow is the only one.
- No rounded corners.
- No white text on `buy`, `sell` or `live` — it fails AA and it was shipped
  once already.
- No `font:` shorthand — it resets tabular figures.
- No kicker above a heading, no numbered section labels.
- No emoji standing in for an icon.
- No pulsing dot for "live": every trade here is gated on a human confirmation,
  so nothing is autonomously ticking.
