---
name: xorr-pad
description: The readout of a measuring instrument, printed as a statistical results table.
colors:
  panel-00: "#0F100F"
  panel-01: "#151714"
  panel-02: "#1B1E1B"
  rule-hair: "#262A27"
  rule-strong: "#3A403C"
  ink-dim: "#868E88"
  ink-secondary: "#A4ACA6"
  ink-body: "#CBD1CD"
  ink-emphasis: "#EDEFEC"
  filament-buy: "#22C55E"
  filament-sell: "#EF4444"
  sell-text: "#F26A6A"
  in-hand: "#D8A03A"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.1em"
  headline:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.02em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tabular-nums"
  data:
    fontFamily: "Azeret Mono, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.13em"
rounded:
  none: "0px"
  key: "2px"
spacing:
  hair: "1px"
  row: "6px"
  gap: "9px"
  pane: "18px"
components:
  key:
    backgroundColor: "{colors.panel-02}"
    textColor: "{colors.ink-body}"
    typography: "{typography.label}"
    rounded: "{rounded.key}"
    padding: "9px 3px"
  key-buy:
    backgroundColor: "{colors.panel-02}"
    textColor: "{colors.filament-buy}"
    rounded: "{rounded.key}"
  key-sell:
    backgroundColor: "{colors.panel-02}"
    textColor: "{colors.sell-text}"
    rounded: "{rounded.key}"
  market-tab:
    backgroundColor: "{colors.panel-01}"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.none}"
    padding: "7px 9px 8px"
  market-tab-selected:
    backgroundColor: "{colors.panel-02}"
    textColor: "{colors.ink-emphasis}"
  pane:
    backgroundColor: "{colors.panel-01}"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.none}"
    padding: "13px 18px 18px"
---

# Design

The surface is the **readout of a measuring instrument, printed as a statistical
results table**. Seed key `4fed7f87`, candidate 4 of the grounded list.

It refuses the arrangement this category always ships — near-black ground, neon
accents, glassy cards, glowing candles — because the product's whole claim is
measurement, and a results table is how measurement gets published. Every number
here already arrives with a t-statistic, a sample count or a measured price
impact. The design's job is to set that material the way a journal would.

## Overview

**Mode: Operate.** The operator is completing a task at their own desk with the
physical pad in front of them and the lights on. Scanability, alignment and
honest precision outrank expression. The brand lives in the exactness.

The screen is the other half of a physical object. The pad's tray is `#AEB4BC`
grey and its keycaps are printed in real green and red filament, so the interface
is that object's darker, anodised sibling — not a themed website that happens to
sit near it.

Three rules govern everything below.

1. **Rules, never boxes.** Structure comes from hairlines and column alignment.
   There are no cards, no nested containers and no drop shadows anywhere.
2. **Every grey is a named step.** Nine enumerated steps of warm graphite are the
   only neutrals. Nothing is mixed by hand.
3. **Colour means one thing each.** Green and red are not decisions, they are the
   filament the keys are printed in. Amber marks the market in hand. Nothing else
   is coloured.

## Colors

A single warm-neutral ramp, `panel-00` through `ink-emphasis`. It runs slightly
green, the way anodised aluminium and painted instrument panels do; a blue-black
would read as the category default and as a different object from the pad.

| token | value | role |
|---|---|---|
| `panel-00` | `#0F100F` | page ground, the gap between panes |
| `panel-01` | `#151714` | pane ground |
| `panel-02` | `#1B1E1B` | raised: keys, selected tab |
| `rule-hair` | `#262A27` | the hairline between rows |
| `rule-strong` | `#3A403C` | a table's head rule |
| `ink-dim` | `#868E88` | footnote and caption text |
| `ink-secondary` | `#A4ACA6` | labels beside values |
| `ink-body` | `#CBD1CD` | body and data |
| `ink-emphasis` | `#EDEFEC` | headings, symbols, the wordmark |

**The accent law.** Three accents, one meaning each, and no others exist:

- `filament-buy` `#22C55E` — buy, yes, armed. The green filament.
- `filament-sell` `#EF4444` — sell, no, kill, disarmed. The red filament.
- `in-hand` `#D8A03A` — the market currently selected, the focus ring, selection.

`sell-text` `#F26A6A` is the same red lifted to clear 4.5:1 as text on a panel.
The filament value stays canonical for keys and borders; text uses the lifted
one. Never introduce a fourth hue: a new state earns a new *position* or a new
*label*, not a new colour.

Colour is never the only signal. Every green or red element also carries a word
(`ARMED`, `REFUSE`, `EXECUTE`) and a fixed position, because the palette is
inherited from physical keycaps and must survive colour-blind reading.

## Typography

Two faces, self-hosted from `/fonts/`. They ship with the repo rather than a CDN
because the pad has to work on venue wi-fi, and a readout whose type fails to
arrive is a readout nobody can trust.

- **Archivo** — legends, headings, the wordmark. Flat terminals and tight caps:
  the silkscreen voice printed on an instrument's face. Used at 11px with
  `0.13em` tracking for every micro-legend.
- **Azeret Mono** — every measured quantity, ticker and transaction hash. Square
  numerals that hold a column.

Monospace here is not a costume for "technical". It is used only where there is
genuinely data to align, which is most of this product.

**The scale is four sizes, each roughly a quarter larger than the last:**
`11px · 16px · 20px · 25px`. 11px is the floor and is reserved for tracked
micro-legends; prose never goes below 16px. The operator reads this at arm's
length across a desk while looking at hardware, so the floor is generous on
purpose.

**Always declare font properties longhand.** The `font:` shorthand resets
`font-variant-numeric`, which silently switches tabular figures back off. In an
interface whose entire job is aligned numbers that is a real defect, not a
nitpick.

`font-variant-numeric: tabular-nums` is set on `body` and re-asserted on every
data class.

## Layout

Six ruled panes on a two-column grid, separated by 1px of `panel-00` showing
through the grid gap. Each pane owns exactly one job: Decision, Holdings,
Markets and the deck, The book, Memory, Activity.

- `grid-auto-rows: minmax(0, 1fr)` with a fixed `height`, so panes scroll inside
  themselves instead of stretching the page. Declaring fewer rows than there are
  children collapses the rest to their headings — size rows automatically.
- **Below 900px tall, the grid releases**: rows go auto and the page scrolls.
  Six ruled panes at a legible 16px need vertical room, and clipping every pane
  to a sliver to preserve a fixed viewport is the wrong trade for this scene.
- Below 900px wide: one column. Below 520px: rows stack label over value and the
  deck goes to three columns.

**The measure column.** Every quantity in the interface is right-aligned to a
shared column (`--measure: 88px`). Labels sit left, values sit right, and the
eye reads a single vertical rule of numbers down each pane. In the book's table,
columns are sized in `ch` — a monospace table measures in characters, which is
its own natural unit.

**The deck is built once.** Re-rendering it on a poll throws away any click that
lands mid-swap and drops keyboard focus. Only the active highlight updates.

## Elevation & Depth

**There is none, and that is the system.** No shadows, no blur, no glass, no
elevation vocabulary at all. Depth is tonal: `panel-01` is a pane, `panel-02` is
something raised off it, and a 1px rule is an edge. A market tab is marked
selected by a 2px `in-hand` rule along its top edge — a cut, not a shadow.

If a future surface needs to separate two things, it gets a rule or a tonal step,
never a shadow.

## Shapes

Square. `rounded.none` (0px) everywhere except keys, which take 2px — the radius
of the moulded keycap they represent. Tabs, panes, rows and footnotes are all
hard-cornered, because this is a printed table on a machined panel.

Borders are 1px `rule-hair` for row rules and 1px `rule-strong` for a table's
head rule. A coloured left border never exceeds 1px.

## Components

**Key** — the 15 deck buttons, five to a row so all fifteen land in three rows.
Uppercase 11px Archivo at `0.09em`. The active agent is marked by an `in-hand`
border and an inset 2px underline, never a fill.

**Market tab** — a real `<button>` with `aria-pressed`, carrying symbol, asset
class and price stacked. Selected state is `panel-02` plus a 2px `in-hand` top
edge. Cut edges via `border-right`, no gaps, no card.

**Verdict** — the loudest thing on screen: `EXECUTE` or `REJECT` in 25px Azeret
Mono, coloured by the accent law, with the order right-aligned opposite it.

**Footnote** — a 2ch marker column and the text beside it. This is the signature
component: a verdict's reasons render as *numbered footnotes*, because that is
what they are — the remembered facts the decision rests on, cited. The same
component carries delisting reasons and the honest performance caveat.

**Table** — a ruled five-column grid with a tracked-caps head rule. Quantities
right-aligned, symbol left, regime dimmed.

**Caveat** — 16px `ink-dim` prose under a top rule, at the foot of a pane. Where
the bad number lives. It is content, not embarrassment.

## Do's and Don'ts

**Do**

- Put the working on screen. A verdict without its numbered reasons is not a
  verdict.
- Keep the bad number. Delisting reasons, blocked credentials and negative
  results are the product's voice.
- Theme the browser's own surfaces: selection, caret, scrollbars, focus rings.
  They ship with defaults that belong to no design system.
- Give every state a real empty, loading and error rendering. An Operate
  surface's empty state teaches the control that fills it.
- Write copy the way the README does: plain, lowercase, measured, unafraid.
  Prefer a comma, colon or period to an em-dash.

**Don't**

- No cards, nested containers, drop shadows, gradients, glass or blur.
- No fourth accent colour, and never colour as the only signal.
- No `font:` shorthand — it resets tabular figures.
- No kicker or eyebrow above a heading, and no numbered section labels.
- No emoji or Unicode glyph standing in for an icon.
- No pulsing dot for "live": a chase light implies an autonomous loop, and every
  trade here is gated on a human confirmation.
- No prose below 16px, no functional label below 11px.

## Motion

One authored moment. After a scan, rows resolve down the column on a 26ms
stagger with a 340ms exponential ease-out — the way a plotter lays a table down.
Nothing else animates except 100–120ms state changes on hover and press.

`prefers-reduced-motion` removes the stagger and collapses transitions to 0.01ms.
