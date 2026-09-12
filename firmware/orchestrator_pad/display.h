#pragma once
#include <Arduino.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include "config.h"
#include "net.h"

// ─────────────────────────────────────────────────────────────────────────────
// The display pod: a 1.54" ST7789 (240x240, SPI) in cad/part_display.py.
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
  bool begin() {
    if (TFT_BLK >= 0) { pinMode(TFT_BLK, OUTPUT); digitalWrite(TFT_BLK, LOW); }
    _spi = new SPIClass(FSPI);
    _spi->begin(TFT_SCK, -1, TFT_MOSI, TFT_CS);
    _tft = new Adafruit_ST7789(_spi, TFT_CS, TFT_DC, TFT_RST);
    _tft->init(240, 240, SPI_MODE3);          // mode 3 also drives modules with no CS pin
    _tft->setRotation(TFT_ROTATION);
    _tft->fillScreen(ST77XX_BLACK);
    _canvas = new GFXcanvas16(240, 240);      // 115 KB — lands in PSRAM
    _ok = _canvas && _canvas->getBuffer();
    if (TFT_BLK >= 0) digitalWrite(TFT_BLK, HIGH);
    return _ok;
  }

  void draw(const PadState &pad, const ChartState &ch) {
    if (!_ok) return;
    GFXcanvas16 &c = *_canvas;
    char buf[32];
    c.fillScreen(BG);
    c.setTextWrap(false);

    // header — the market in hand, and the most dangerous true state
    c.setTextSize(2); c.setTextColor(INK); c.setCursor(10, 10);
    c.print(pad.market.length() ? pad.market : String("--"));
    if (!pad.ok)          pill(c, "OFFLINE", MUTE);
    else if (!pad.armed)  pill(c, "STOPPED", DOWN);
    else if (pad.pending) pill(c, "CONFIRM?", WARN);
    else                  pill(c, "ARMED", UP);

    // price — the chart's close when it is for this market, else /pad's
    const bool fresh = ch.ok && ch.symbol == pad.market;
    const float price = (fresh && ch.price > 0) ? ch.price : pad.price;
    fmtPrice(buf, sizeof buf, price);
    c.setTextSize(price >= 100000 ? 3 : 4); c.setTextColor(INK);
    c.setCursor(10, 42); c.print(buf);

    if (fresh && ch.hasChange) {
      c.setTextSize(2); c.setTextColor(ch.change24h >= 0 ? UP : DOWN);
      c.setCursor(10, 86);
      snprintf(buf, sizeof buf, "%+.2f%%", ch.change24h); c.print(buf);
      c.setTextSize(1); c.setTextColor(MUTE); c.print("  24h");
    }

    // chart — a line with the area under it, green if it ends above where it began
    const int X0 = 10, X1 = 230, Y0 = 122, Y1 = 206;
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
      fmtPrice(buf, sizeof buf, ch.hi); c.setCursor(X0, Y0 - 11); c.print(buf);
      fmtPrice(buf, sizeof buf, ch.lo); c.setCursor(X0, Y1 + 5);  c.print(buf);
      snprintf(buf, sizeof buf, "%uh", (unsigned)(ch.n - 1));
      c.setCursor(X1 - 6 * (int)strlen(buf), Y1 + 5); c.print(buf);
    } else {
      c.setTextSize(1); c.setTextColor(MUTE); c.setCursor(X0, (Y0 + Y1) / 2);
      if (ch.error.length())  c.print(ch.error);
      else if (!pad.ok)       c.print("backend not reachable");
      else                    c.print("waiting for the chart");
    }

    // footer — who holds the baton
    c.setTextSize(1); c.setTextColor(MUTE); c.setCursor(10, 228);
    c.print(pad.agent);
    _tft->drawRGBBitmap(0, 0, c.getBuffer(), 240, 240);
  }

private:
  // The desk app's palette (DESIGN.md), in RGB565
  static constexpr uint16_t BG = 0x0000, INK = 0xFFFF, MUTE = 0x8C71, GRID = 0x2124;
  static constexpr uint16_t UP = 0x2ECF, DOWN = 0xFA27, WARN = 0xEE29;   // #2BD87A #FF453A #E8C64A
  static constexpr uint16_t UP_DIM = 0x09E4, DOWN_DIM = 0x3882;          // ~22% of up / down

  SPIClass *_spi = nullptr;
  Adafruit_ST7789 *_tft = nullptr;
  GFXcanvas16 *_canvas = nullptr;
  bool _ok = false;

  static void pill(GFXcanvas16 &c, const char *t, uint16_t col) {
    int w = (int)strlen(t) * 6 + 12, x = 240 - 10 - w;
    c.drawRoundRect(x, 10, w, 16, 8, col);
    c.setTextSize(1); c.setTextColor(col); c.setCursor(x + 6, 14); c.print(t);
  }

  static void fmtPrice(char *b, size_t n, float p) {
    if (p <= 0)          snprintf(b, n, "$--");
    else if (p >= 10000) snprintf(b, n, "$%.0f", p);
    else if (p >= 100)   snprintf(b, n, "$%.2f", p);
    else if (p >= 1)     snprintf(b, n, "$%.3f", p);
    else                 snprintf(b, n, "$%.4f", p);
  }
};
