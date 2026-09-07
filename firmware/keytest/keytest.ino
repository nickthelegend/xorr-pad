// ─────────────────────────────────────────────────────────────────────────────
// keytest — key-matrix tester AND guided map builder for the xorr-pad.
//
// Flash this INSTEAD of the main firmware. No WiFi, no audio, no backend — it
// only scans the 4×4 matrix. Two modes, switched over the serial monitor:
//
//   MAP  (default)  It names a key, you press that key, it records which matrix
//                   cell actually fired. Dead key? Type 's' to skip it. At the
//                   end it prints a ready-to-paste KEYMAP — so a scrambled or
//                   half-broken wiring job gets re-mapped in software instead
//                   of re-soldered.
//
//   DIAG            Free-press. Every press prints its cell, and a grid shows
//                   which cells have EVER fired ( * ) versus never ( . ).
//                   This is how you find the dead switches.
//
// Serial commands (115200 baud, send as a line or single char):
//   m = restart MAP mode      d = DIAG mode        s = skip current key (dead)
//   p = print results         r = reset everything
//
// Board: "ESP32S3 Dev Module", USB CDC On Boot: "Enabled".
// ─────────────────────────────────────────────────────────────────────────────

#define ROWS 4
#define COLS 4
const uint8_t ROW_PINS[ROWS] = {10, 11, 12, 13};   // rows: INPUT_PULLUP
const uint8_t COL_PINS[COLS] = {14,  8, 17, 18};   // cols: driven LOW one at a time

// The xorr-pad deck, prompted in reading order. r0c0 is the knob, not a switch.
//   r0:  --knob--   DCA   GRID   MOMENTUM
//   r1:  REBALANCE  YIELD RISK   BASE
//   r2:  BUY        SELL  YES    NO
//   r3:  PORTFOLIO  MIC(centred)  KILL
const char *KEYS[] = {
  "DCA", "GRID", "MOMENTUM",
  "REBALANCE", "YIELD", "RISK", "BASE",
  "BUY", "SELL", "YES", "NO",
  "PORTFOLIO", "MIC", "KILL",
};
const uint8_t NKEYS = sizeof(KEYS) / sizeof(KEYS[0]);

int8_t  mapR[NKEYS], mapC[NKEYS];          // matrix cell per key, -1 = dead/skipped
bool    held[ROWS][COLS], lastRaw[ROWS][COLS], seen[ROWS][COLS];
uint32_t tEdge[ROWS][COLS];
const uint16_t DEBOUNCE_MS = 15;

uint8_t cursor = 0;                        // which key MAP is asking for
bool    mapping = true;                    // MAP vs DIAG

const char *nameOfCell(uint8_t r, uint8_t c) {
  for (uint8_t i = 0; i < NKEYS; i++)
    if (mapR[i] == (int8_t)r && mapC[i] == (int8_t)c) return KEYS[i];
  return nullptr;
}

void prompt() {
  if (!mapping) return;
  if (cursor >= NKEYS) return;
  Serial.printf("\n[%u/%u]  PRESS:  %-10s   (or 's' if it's dead)\n",
                cursor + 1, NKEYS, KEYS[cursor]);
}

void printGrid() {
  Serial.println(F("\n  ---- cells that have fired  ( * = works, . = never ) ----"));
  for (uint8_t r = 0; r < ROWS; r++) {
    Serial.print(F("   "));
    for (uint8_t c = 0; c < COLS; c++) {
      const char *nm = nameOfCell(r, c);
      char cell[20];
      snprintf(cell, sizeof(cell), "%c %-9s", seen[r][c] ? '*' : '.', nm ? nm : "-");
      Serial.print(cell);
    }
    Serial.println();
  }
}

void printResults() {
  Serial.println(F("\n================ xorr-pad key map ================"));
  uint8_t dead = 0;
  for (uint8_t i = 0; i < NKEYS; i++) {
    if (mapR[i] < 0) { Serial.printf("  %-10s  DEAD / skipped\n", KEYS[i]); dead++; }
    else Serial.printf("  %-10s  row %d  col %d   (GPIO r%u c%u)\n", KEYS[i],
                       mapR[i], mapC[i], ROW_PINS[mapR[i]], COL_PINS[mapC[i]]);
  }
  Serial.printf("\n  %u mapped, %u dead.\n", NKEYS - dead, dead);

  Serial.println(F("\n  Paste this into firmware/orchestrator_pad/agents.h:\n"));
  Serial.println(F("  static const char *KEYMAP[4][4] = {"));
  for (uint8_t r = 0; r < ROWS; r++) {
    Serial.print(F("    { "));
    for (uint8_t c = 0; c < COLS; c++) {
      const char *nm = nameOfCell(r, c);
      char cell[20];
      snprintf(cell, sizeof(cell), "%-12s", nm ? (String("\"") + nm + "\",").c_str() : "nullptr,");
      Serial.print(cell);
    }
    Serial.println(F("},"));
  }
  Serial.println(F("  };"));
  printGrid();
  Serial.println(F("\n  ('r' to start over, 'd' for free-press diagnostics)\n"));
}

void resetAll() {
  for (uint8_t i = 0; i < NKEYS; i++) { mapR[i] = -1; mapC[i] = -1; }
  for (uint8_t r = 0; r < ROWS; r++)
    for (uint8_t c = 0; c < COLS; c++) { held[r][c] = lastRaw[r][c] = seen[r][c] = false; tEdge[r][c] = 0; }
  cursor = 0; mapping = true;
  Serial.println(F("\n=== xorr-pad — key test & map builder ==="));
  Serial.println(F("Press the key it names. 's' skips a dead one, 'd' = free-press mode."));
  prompt();
}

void onPress(uint8_t r, uint8_t c) {
  seen[r][c] = true;
  const char *known = nameOfCell(r, c);

  if (!mapping) {                                   // DIAG
    Serial.printf(">>> row %u col %u  (GPIO r%u c%u)%s%s\n", r, c,
                  ROW_PINS[r], COL_PINS[c], known ? "  = " : "", known ? known : "");
    printGrid();
    return;
  }
  if (cursor >= NKEYS) { Serial.printf("  (extra press: row %u col %u)\n", r, c); return; }

  if (known) {                                      // already used by another key
    Serial.printf("  !! that cell is already '%s'. Press a DIFFERENT key, or 's' to skip.\n", known);
    return;
  }
  mapR[cursor] = r; mapC[cursor] = c;
  Serial.printf("  OK  %-10s -> row %u col %u\n", KEYS[cursor], r, c);
  cursor++;
  if (cursor >= NKEYS) { Serial.println(F("\n  All keys done!")); printResults(); }
  else prompt();
}

void handleSerial() {
  while (Serial.available()) {
    int ch = Serial.read();
    if (ch == '\n' || ch == '\r' || ch == ' ') continue;
    switch (ch) {
      case 's': case 'S':
        if (mapping && cursor < NKEYS) {
          Serial.printf("  -- %s marked DEAD (skipped)\n", KEYS[cursor]);
          mapR[cursor] = -1; mapC[cursor] = -1; cursor++;
          if (cursor >= NKEYS) { Serial.println(F("\n  All keys done!")); printResults(); }
          else prompt();
        }
        break;
      case 'd': case 'D':
        mapping = false;
        Serial.println(F("\n=== DIAG: free-press. Every press prints its cell. ==="));
        printGrid();
        break;
      case 'm': case 'M': mapping = true; cursor = 0; Serial.println(F("\n=== MAP mode ===")); prompt(); break;
      case 'p': case 'P': printResults(); break;
      case 'r': case 'R': resetAll(); break;
    }
  }
}

void setup() {
  Serial.begin(115200);
  uint32_t s = millis();
  while (!Serial && millis() - s < 1500) {}
  for (uint8_t c = 0; c < COLS; c++) { pinMode(COL_PINS[c], OUTPUT); digitalWrite(COL_PINS[c], HIGH); }
  for (uint8_t r = 0; r < ROWS; r++) pinMode(ROW_PINS[r], INPUT_PULLUP);
  resetAll();
}

void loop() {
  handleSerial();
  for (uint8_t c = 0; c < COLS; c++) {
    digitalWrite(COL_PINS[c], LOW);
    delayMicroseconds(5);
    for (uint8_t r = 0; r < ROWS; r++) {
      bool pressed = (digitalRead(ROW_PINS[r]) == LOW);
      if (pressed != lastRaw[r][c]) { tEdge[r][c] = millis(); lastRaw[r][c] = pressed; }
      if (millis() - tEdge[r][c] > DEBOUNCE_MS && pressed != held[r][c]) {
        held[r][c] = pressed;
        if (pressed) onPress(r, c);
      }
    }
    digitalWrite(COL_PINS[c], HIGH);
  }
}
