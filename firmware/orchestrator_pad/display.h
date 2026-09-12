#pragma once
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include "config.h"
#include "net.h"

// ─────────────────────────────────────────────────────────────────────────────
// The display pod: a 2.8" ILI9341 (320x240, SPI — LCDwiki MSP2807) laid
// landscape in cad/part_display.py, its header on the right. Touch is not wired.
//
// It shows the market in hand — price, the 24h move, and the last 48 hours as
// a line — plus the pad's state. It draws what the backend says and nothing
// else; with no answer it says so rather than holding a stale number.
//
// Every frame is composed on a PSRAM canvas and sent in one blit, so a redraw
// never flickers or shows half a frame.
// ─────────────────────────────────────────────────────────────────────────────
class Display {
public:
  static constexpr int W = 320, H = 240;

  bool begin() {
    if (TFT_BLK >= 0) { pinMode(TFT_BLK, OUTPUT); digitalWrite(TFT_BLK, LOW); }
    _spi = new SPIClass(FSPI);
    _spi->begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);   // no MISO: the module's SDO stays unconnected
    _tft = new Adafruit_ILI9341(_spi, TFT_DC, TFT_CS, TFT_RST);
    _tft->begin(TFT_SPI_HZ);
    _tft->setRotation(_rotation);
    _canvas = new GFXcanvas16(W, H);              // 154 KB — lands in PSRAM
    _ok = _canvas && _canvas->getBuffer();
    if (_ok) testCard(); else _tft->fillScreen(ILI9341_RED);
    if (TFT_BLK >= 0) digitalWrite(TFT_BLK, HIGH);
    Serial.printf("display: ILI9341 %dx%d over SPI at %u MHz, rotation %u, canvas %s\n",
                  W, H, (unsigned)(TFT_SPI_HZ / 1000000), _rotation, _ok ? "ok" : "FAILED");
    return _ok;
  }

  // One look checks the wiring, the colours and the way up: six palette bars,
  // a border on the panel's very edge, and an arrow that must point up the
  // slant. Wrong way round? `rot 3` (or `rot 1`) on the telnet console.
  void testCard() {
    if (!_ok) return;
    GFXcanvas16 &c = *_canvas;
    c.fillScreen(BG);
    const uint16_t bars[6] = {UP, DOWN, WARN, INK, MUTE, BLUE};
    for (int i = 0; i < 6; i++) c.fillRect(i * W / 6, 0, W / 6 + 1, 22, bars[i]);
    c.drawRect(0, 0, W, H, INK);
    c.setTextWrap(false);
    c.setTextSize(4); c.setTextColor(INK); c.setCursor(14, 40); c.print("xorr-pad");
    c.setTextSize(2); c.setTextColor(MUTE);
    c.setCursor(14, 84);  c.print("2.8\" ILI9341 320x240");
    c.setCursor(14, 108); c.printf("rotation %u", _rotation);
    c.setTextSize(1);
    c.setCursor(14, 176); c.print("The arrow points up the slant.");
    c.setCursor(14, 190); c.print("If not: telnet in, type  rot 1  or  rot 3");
    c.setTextColor(WARN); c.setCursor(14, 218); c.print("joining WiFi, then the backend...");
    c.fillTriangle(272, 34, 246, 78, 298, 78, UP);
    c.fillRect(264, 78, 17, 58, UP);
    c.setTextSize(2); c.setTextColor(UP); c.setCursor(260, 144); c.print("UP");
    blit();
  }

  void draw(const PadState &pad, const ChartState &ch) {
    if (!_ok) return;
    const uint32_t t0 = millis();
    GFXcanvas16 &c = *_canvas;
    char buf[32];
    c.fillScreen(BG);
    c.setTextWrap(false);

    // header — the market in hand, who holds the baton, and the most dangerous true state
    c.setTextSize(3); c.setTextColor(INK); c.setCursor(12, 10);
    c.print(pad.market.length() ? pad.market : String("--"));
    c.setTextSize(1); c.setTextColor(MUTE); c.setCursor(12, 38);
    c.print(pad.agent);
    if (!pad.ok)          pill(c, "OFFLINE", MUTE);
    else if (!pad.armed)  pill(c, "STOPPED", DOWN);
    else if (pad.pending) pill(c, "CONFIRM?", WARN);
    else                  pill(c, "ARMED", UP);

    // price — the chart's close when it is for this market, else /pad's
    const bool fresh = ch.ok && ch.symbol == pad.market;
    const float price = (fresh && ch.price > 0) ? ch.price : pad.price;
    fmtPrice(buf, sizeof buf, price);
    c.setTextSize(strlen(buf) <= 8 ? 5 : 4); c.setTextColor(INK);
    c.setCursor(12, 54); c.print(buf);

    if (fresh && ch.hasChange) {
      c.setTextSize(2); c.setTextColor(ch.change24h >= 0 ? UP : DOWN);
      c.setCursor(12, 102);
      snprintf(buf, sizeof buf, "%+.2f%%", ch.change24h); c.print(buf);
      c.setTextColor(MUTE); c.print(" 24h");
    }

    // chart — a line with the area under it, green if it ends above where it began
    const int X0 = 12, X1 = W - 12, Y0 = 138, Y1 = 220;
    c.drawFastHLine(X0, Y1, X1 - X0, GRID);
    if (fresh && ch.n >= 2 && ch.hi > ch.lo) {
      const bool rising = ch.closes[ch.n - 1] >= ch.closes[0];
      const uint16_t line = rising ? UP : DOWN, fill = rising ? UP_DIM : DOWN_DIM;
      int px = -1, py = -1;
      for (int i = 0; i < ch.n; i++) {
        int x = X0 + (int)((long)(X1 - X0) * i / (ch.n - 1));
        int y = Y1 - (int)((ch.closes[i] - ch.lo) / (ch.hi - ch.lo) * (Y1 - Y0));
        if (px >= 0) {
          for (int xx = px + 1; xx <= x; xx++) {
            int yy = py + (y - py) * (xx - px) / (x - px);
            c.drawFastVLine(xx, yy, Y1 - yy, fill);
          }
          c.drawLine(px, py, x, y, line);
          c.drawLine(px, py - 1, x, y - 1, line);
        }
        px = x; py = y;
      }
      c.fillCircle(px, py, 3, line);
      c.setTextSize(1); c.setTextColor(MUTE);
      fmtPrice(buf, sizeof buf, ch.hi); c.setCursor(X0, Y0 - 12); c.print(buf);
      fmtPrice(buf, sizeof buf, ch.lo); c.setCursor(X0, Y1 + 6);  c.print(buf);
      snprintf(buf, sizeof buf, "%uh", (unsigned)(ch.n - 1));
      c.setCursor(X1 - 6 * (int)strlen(buf), Y1 + 6); c.print(buf);
    } else {
      c.setTextSize(1); c.setTextColor(MUTE); c.setCursor(X0, (Y0 + Y1) / 2);
      if (ch.error.length())  c.print(ch.error);
      else if (!pad.ok)       c.print("backend not reachable");
      else                    c.print("waiting for the chart");
    }
    blit();
    _frameMs = millis() - t0;
    _frames++;
    _chartN = fresh ? ch.n : 0;
  }

  // Landscape only — the pod lays the panel on its side; 1 and 3 are its two ways round.
  bool rotate(uint8_t r) {
    if (!_ok || (r != 1 && r != 3)) return false;
    _rotation = r;
    _tft->setRotation(r);
    return true;
  }

  String info() const {
    char b[160];
    snprintf(b, sizeof b, "display %s: ILI9341 %dx%d, rotation %u, %u MHz, %lu frames (last %lu ms), chart %u closes",
             _ok ? "ok" : "FAILED", W, H, _rotation, (unsigned)(TFT_SPI_HZ / 1000000),
             (unsigned long)_frames, (unsigned long)_frameMs, (unsigned)_chartN);
    return String(b);
  }

private:
  // The desk app's palette (DESIGN.md), in RGB565
  static constexpr uint16_t BG = 0x0000, INK = 0xFFFF, MUTE = 0x8C71, GRID = 0x2124;
  static constexpr uint16_t UP = 0x2ECF, DOWN = 0xFA27, WARN = 0xEE29;   // #2BD87A #FF453A #E8C64A
  static constexpr uint16_t UP_DIM = 0x09E4, DOWN_DIM = 0x3882;          // ~22% of up / down
  static constexpr uint16_t BLUE = 0x0C3F;                               // #0A84FF, test card only

  SPIClass *_spi = nullptr;
  Adafruit_ILI9341 *_tft = nullptr;
  GFXcanvas16 *_canvas = nullptr;
  bool _ok = false;
  uint8_t _rotation = TFT_ROTATION;
  uint16_t _chartN = 0;
  uint32_t _frames = 0, _frameMs = 0;

  void blit() { _tft->drawRGBBitmap(0, 0, _canvas->getBuffer(), W, H); }

  static void pill(GFXcanvas16 &c, const char *t, uint16_t col) {
    int w = (int)strlen(t) * 12 + 20, x = W - 12 - w;
    c.drawRoundRect(x, 10, w, 24, 12, col);
    c.drawRoundRect(x + 1, 11, w - 2, 22, 11, col);
    c.setTextSize(2); c.setTextColor(col); c.setCursor(x + 10, 14); c.print(t);
  }

  static void fmtPrice(char *b, size_t n, float p) {
    if (p <= 0)          snprintf(b, n, "$--");
    else if (p >= 10000) snprintf(b, n, "$%.0f", p);
    else if (p >= 100)   snprintf(b, n, "$%.2f", p);
    else if (p >= 1)     snprintf(b, n, "$%.3f", p);
    else                 snprintf(b, n, "$%.4f", p);
  }
};
