#pragma once
#include <Arduino.h>
#include "config.h"

// ─────────────────────────────────────────────────────────────────────────────
// What each key does on the xorr-pad deck.
//
// This is a TRADING surface, not a chat surface. Every key here maps to a real
// control on the backend: an agent takes the baton, a market comes in hand, and
// BUY/SELL raise a decision that only a ✓ can execute. Nothing on this pad can
// move money on its own — the gate lives on the backend and answers every key
// the same way whether it was pressed here or on screen.
//
// The ids are exactly the ones POST /key accepts. There is no translation layer
// and no local table of what a key "means": if it is not a real backend id, the
// backend says so and the pad shows the refusal.
// ─────────────────────────────────────────────────────────────────────────────

enum KeyRole {
  ROLE_NONE,     // unbound
  ROLE_MIC,      // hold to talk; POSTs the recording to /voice
  ROLE_AGENT,    // takes the baton
  ROLE_MARKET,   // brings a market in hand
  ROLE_ACTION,   // buy / sell / scan / portfolio
  ROLE_CONFIRM,  // ✓ — the only key that can cause a fill
  ROLE_REFUSE,   // ✗
  ROLE_KILL,     // stop all trading. Held, not tapped — see HOLD_TO_KILL_MS.
};

struct KeyBind {
  KeyRole     role;
  const char *id;         // the id POST /key accepts; nullptr for MIC/NONE
  const char *label;      // what the keycap says, for the telnet log
  uint8_t     r, g, b;    // status-LED colour while this key owns the light
};

// The 4×4 grid as the caps are laid out on the built board.
//
//   r0   MOMENTUM   RISK       YIELD      DCA
//   r1   ETH        cbBTC      AERO       VIRTUAL
//   r2   BUY        SELL       SCAN       PORTFOLIO
//   r3   ✓ YES      ✗ NO       MIC        KILL
//
// Agent colours match the orbs on screen, so the light on the desk and the face
// in the app are the same colour for the same agent. Green and red are reserved
// for confirm and refuse — the same law the interface follows.
static const KeyBind KEYMAP[MATRIX_ROWS][MATRIX_COLS] = {
  // C0                                              C1                                            C2                                              C3
  {{ROLE_AGENT,  "momentum","MOMENTUM", 30, 60,120}, {ROLE_AGENT, "risk",  "RISK",    70, 45,120}, {ROLE_AGENT,  "yield", "YIELD",   20,110, 70}, {ROLE_AGENT,  "dca",    "DCA",       110, 80, 20}},
  {{ROLE_MARKET, "ETH",     "ETH",      40, 70,120}, {ROLE_MARKET,"cbBTC", "cbBTC",  120, 70, 20}, {ROLE_MARKET, "AERO",  "AERO",    20, 90,110}, {ROLE_MARKET, "VIRTUAL","VIRTUAL",  110, 40, 90}},
  {{ROLE_ACTION, "buy",     "BUY",      20, 90, 40}, {ROLE_ACTION,"sell",  "SELL",    90, 30, 30}, {ROLE_ACTION, "scan",  "SCAN",    60, 60, 60}, {ROLE_ACTION, "portfolio","PORTFOLIO",50, 50, 50}},
  {{ROLE_CONFIRM,"yes",     "CONFIRM",   0,110, 30}, {ROLE_REFUSE,"no",    "REFUSE", 110, 20, 20}, {ROLE_MIC,    nullptr, "MIC",    110,  0,  0}, {ROLE_KILL,   "kill",   "KILL",     120,  0,  0}},
};

// This build is mounted the same way up as the map above. Set to 1 if you ever
// remount the tray rotated 180°, and the scan is point-reflected before lookup
// so the map stays readable as the caps are labelled.
#define KEYS_MIRRORED 0
inline const KeyBind &keyAt(uint8_t r, uint8_t c) {
#if KEYS_MIRRORED
  return KEYMAP[MATRIX_ROWS - 1 - r][MATRIX_COLS - 1 - c];
#else
  return KEYMAP[r][c];
#endif
}
