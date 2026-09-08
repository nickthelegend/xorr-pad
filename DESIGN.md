---
name: xorr-pad
description: A desk for supervising agents that trade. Dark, quiet, and it shows its working.
colors:
  bg: "#000000"
  surface: "#0C0C0D"
  surface-alt: "#141516"
  control: "#1B1C1E"
  ink: "#FFFFFF"
  ink70: "rgba(255,255,255,0.7)"
  ink65: "rgba(255,255,255,0.65)"
  ink56: "rgba(255,255,255,0.56)"
  ink52: "rgba(255,255,255,0.52)"
  card-border: "rgba(255,255,255,0.06)"
  hairline: "rgba(255,255,255,0.05)"
  up: "#2BD87A"
  down: "#FF453A"
  warn: "#E8C64A"
  danger: "#D32B26"
typography:
  hero:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-1.4px"
    fontFeature: "tabular-nums"
  verdict:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.17
    letterSpacing: "-1px"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.21
  section:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.19
  rowPrimary:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.33
    fontFeature: "tabular-nums"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.48
  secondary:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.44
  eyebrow:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "1.32px"
rounded:
  square: "12px"
  tile: "16px"
  note: "18px"
  card: "20px"
  panel: "22px"
  sheet: "30px"
  full: "9999px"
spacing:
  gutter: "28px"
  gap: "16px"
  card: "16px"
components:
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.card-border}"
    rounded: "{rounded.panel}"
    padding: "16px"
  row:
    borderBottomColor: "{colors.hairline}"
    padding: "8px 0"
  note:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.note}"
    padding: "13px"
  primaryButton:
    backgroundColor: "{colors.ink}"
    textColor: "#000000"
    rounded: "{rounded.sheet}"
  destructiveButton:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sheet}"
---

# Design

**A desk for supervising agents that trade.** True black, Inter, and one loud
thing per screen. Adapted from the xorr.finance design system, which was drawn
for a phone; the adaptations to a desk are noted where they depart from it.

## Overview

**Mode: Operate.** The operator sits at a machine with the physical pad beside
it. The screen is where the agent shows its working — not a dashboard to admire.

An earlier version of this system was neo-brutalist: vivid case-blue, 3px ink
borders, zero-blur block shadows. It matched the printed object and it shouted.
This one is quiet, and the quiet is the point: a surface you watch for hours,
where the only things that raise their voice are a verdict and a kill switch.

Three rules govern everything.

1. **True black, and depth by hairline.** `#000` ground, `#0C0C0D` cards, a 1px
   `card-border` instead of an elevation. There are no drop shadows on cards.
2. **Green and red are P&L only.** They mean profit and loss and nothing else —
   never selection, never focus, never branding. Selection is white on dark.
   Reaching for `up` to show that something is chosen is a bug.
3. **Every number says where it came from.** A verdict carries numbered
   footnotes; a total carries what it is priced against; a stale book carries
   the time it was run.

## Layout

A **navigation rail** beside a content region. The rail is 236px and always
visible, because supervising agents means being one click from the kill switch
wherever you are. It carries the five destinations, then chain, block and
wallet, then the kill switch itself at the foot.

The content region is a 62px top bar — screen name, subtitle, and the day's
budget against the remembered daily limit — over a scrolling area with a
1180px measure.

**Panes lay out in columns and top-align.** `.cols side` is 1.25fr / 1fr and is
the default: the thing you act on beside the thing it produced. A short card
next to a long one must not stretch to match it.

Below 900px the rail collapses to 64px icons and every column stacks. Below
760px the budget bar is dropped — it and the screen title cannot both fit, and
leaving it pushed the document wider than the window.

| Screen | Left | Right |
|---|---|---|
| Portfolio | total value, the day's risk checks, agents, recent activity | every coin held, priced |
| Markets | six markets and why others were delisted | the book, and what it found |
| Agents | six agents, voice, the kill switch | the activity feed |
| Trade | the ticket: market, size, propose | the verdict, and what it rests on |
| Memory | the briefing, time machine, wipe | the whole store, tier by tier |

## Colors

| token | value | role |
|---|---|---|
| `bg` | `#000000` | the ground. True black, never a dark grey |
| `surface` | `#0C0C0D` | every card and note strip |
| `surface-alt` | `#141516` | a card's quieter half, unselected pills |
| `control` | `#1B1C1E` | buttons, steppers, footnote markers |
| `ink` → `ink52` | white at 100–52% | the text ramp |
| `card-border` | `rgba(255,255,255,.06)` | card outlines |
| `up` / `down` | `#2BD87A` / `#FF453A` | **P&L only** |
| `warn` | `#E8C64A` | risk adjusted, and the wipe notice |
| `danger` | `#D32B26` | destructive fills |

**The ink ramp is lifted from its source.** xorr.finance runs down to 28% white,
which is right on a handset held close. Composited onto true black and measured,
38% reads **3.39:1** and 45% reads **4.41:1** — both under AA for text at these
sizes. Anything carrying words therefore stops at **52%**, which is 5.4:1. The
dimmer steps survive only for glyphs and dots.

**The destructive fill is darkened for the same reason.** White on `#EF3B36`
measures **3.93:1** and fails at button size; `#D32B26` is the same hue taken
down until it passes at 5.0:1. `down` keeps its original value because it is
text on black, where it reads 6.2:1.

Every text node on all five screens passes AA, measured in the live DOM with
alpha composited — not inferred from the stylesheet.

## Typography

**Inter**, self-hosted and subset to four weights (~23 KB each) so the desk
works on venue wi-fi. Weights are selected **by family**, never by `font-weight`
against one face: a synthesised bold thickens stems unevenly and throws off the
negative tracking the display sizes rely on.

Scale: `11 · 12.5 · 13.5 · 15 · 16 · 19 · 30 · 46`. Tabular figures everywhere a
number can change.

**Reading sizes are larger than the source.** The 11.5px body the phone system
specifies is too small at desk distance; prose sits at 13.5px and row detail at
12.5px. Labels — eyebrows, tags, orb status — keep their small sizes, because a
label is scanned, not read.

## Components

**Agent orb** — a radial gradient with an **off-centre origin at 32% 26%**: that
is the specular highlight and it must not move. Each agent owns two stops and
keeps them everywhere it appears. The active one carries a bloom of its own `c1`
at 40%. Under it: name at 12.5px/600, then status — `up` for Active, `ink50`
for Paused.

**Hairline row** — a 34px mark, a primary line over a secondary, then a value
right-aligned with its delta. The most-used element here.

**Note strip** — where an agent explains itself. A coloured dot encodes the
class: **green acted, amber adjusted risk, red blocked**. Used for the day's
risk checks, the delisting reasons and the briefing.

**Verdict** — the loudest block on the surface. `Execute`/`Reject` at 30px over
numbered footnotes, then Refuse and Confirm. The footnotes are the product: the
remembered facts the decision rests on, cited.

**Budget bar** — the day's spend against the remembered daily limit, in the top
bar on every screen. Drawn from the journal, so a wiped store has nothing to
measure and the bar disappears rather than showing a full one.

## Motion

Almost none, and none of it decorative. `150ms` for selection, `180ms` for
anything that fills, `250ms` for a re-sort. Nothing else.
`prefers-reduced-motion` collapses every transition to 0.01ms.

## Do's and Don'ts

**Do**

- Put the working on screen. A verdict without its numbered reasons is not a
  verdict.
- Keep the bad number. Delisting reasons, blocked credentials, an unrealised
  loss and "measured, not profitable" are the product's voice.
- Say what is unavailable, precisely. Holdings can be gone while prices are
  live; the banner has to know the difference.
- Give an empty state something true to say. An empty card is furniture.

**Don't**

- No green or red for anything but profit and loss.
- No drop shadows on cards — they get a hairline border.
- No text below 11px, and nothing carrying words below 52% white.
- No phone-sized reading type on a desk.
- No control that reports success for something it did not do.
