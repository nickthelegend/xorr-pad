#pragma once
#include <Arduino.h>
#include "config.h"

// ─────────────────────────────────────────────────────────────────────────────
// What each key does on the xorr-pad.
//
// IMPORTANT: this grid is indexed by the SCANNED MATRIX CELL, not by where the
// keycap sits. On this build the two do not agree — the columns are reversed
// and row 1's last key lands on matrix row 2. That was measured, not guessed,
// with firmware/keytest (MAP mode), which prints a paste-ready table.
//
// Measured on 2026-09-07 by pressing the caps in reading order:
//
//   physical (cap)        matrix cell     new duty
//   r0c1  1st after knob   (0,2)          DCA
//   r0c2                   (0,1)          GRID
//   r0c3                   (0,0)          MOMENTUM
//   r1c0                   (1,2)          REBALANCE
//   r1c1                   (1,1)          YIELD
//   r1c2                   (1,0)          RISK
//   r1c3                   (2,3)          BASE
//   r2c0                   (2,2)          BUY
//   r2c1                   DEAD           SELL   <-- cold joint, never fired
//   r2c2 .. r3c3           NOT YET SWEPT  YES/NO/PORTFOLIO/MIC/KILL
//
// Cells still marked UNVERIFIED are best-effort guesses that follow the
// observed pattern (columns reversed, rows advancing). Re-run keytest and
// paste its output over this block to make them real.
// ─────────────────────────────────────────────────────────────────────────────

enum KeyRole { ROLE_NONE, ROLE_AGENT, ROLE_ACTION, ROLE_MIC };

struct KeyBind {
  KeyRole     role;
  const char *id;         // sent verbatim to POST /key {"id": ...}
  uint8_t     r, g, b;    // status-LED colour
};

#define A(id, r, g, b) {ROLE_AGENT,  id, r, g, b}
#define X(id, r, g, b) {ROLE_ACTION, id, r, g, b}
#define M()            {ROLE_MIC,    "mic", 60, 0, 60}
#define _()            {ROLE_NONE,   nullptr, 0, 0, 0}

static const KeyBind KEYMAP[MATRIX_ROWS][MATRIX_COLS] = {
  // col 0                        col 1                     col 2                        col 3
  { A("momentum", 70,45,0),  A("grid",  40,40,40),  A("dca",       30,30,60),  _() },                    // row 0  (verified)
  { A("risk",     70,0,0),   A("yield", 0,60,30),   A("rebalance", 0,45,60),   _() },                    // row 1  (verified)
  { X("no",       60,0,0),   X("yes",   0,60,0),    X("buy",       0,60,0),    X("base", 60,60,60) },    // row 2  (c2,c3 verified; c0,c1 UNVERIFIED)
  { X("kill",     80,0,0),   M(),                   X("sell",      60,0,0),    X("portfolio", 30,30,30) },// row 3  UNVERIFIED — run keytest
};

#undef A
#undef X
#undef M
#undef _

inline const KeyBind &keyAt(uint8_t r, uint8_t c) { return KEYMAP[r][c]; }
