#!/usr/bin/env python3
"""
make-icon.py — the app icon, generated rather than drawn by hand.

The mark is the pad itself: a 4x4 deck on true black with one key lit in the
"up" green. At 32px in a dock a wordmark is mud, but a grid with one live cell
still reads as "the thing with the keys", which is what this app is.

Colours are the product's own tokens (renderer/index.html), not new ones:
    ground   #000000   --bg
    keys     #1B1C1E   --control
    lit key  #2BD87A   --up

    python3 build/make-icon.py     ->  build/icon.png + build/icon.icns
"""
from PIL import Image, ImageDraw
from pathlib import Path
import subprocess, shutil, sys

HERE = Path(__file__).resolve().parent
S = 1024                      # master size
BG, KEY, LIT = (0, 0, 0), (27, 28, 30), (43, 216, 122)

# macOS art sits inside a rounded square with real margin; filling the canvas
# edge to edge makes the icon look bigger and cruder than every neighbour.
INSET = int(S * 0.10)
BOX = S - 2 * INSET
RADIUS = int(BOX * 0.235)     # close to the macOS squircle at this size

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([INSET, INSET, INSET + BOX, INSET + BOX], RADIUS, fill=BG)

# 4x4 deck, centred, with the gap between keys proportional to the key.
PAD = int(BOX * 0.135)
GRID = BOX - 2 * PAD
GAP = int(GRID * 0.085)
K = (GRID - 3 * GAP) // 4
x0 = INSET + PAD + (GRID - (4 * K + 3 * GAP)) // 2
y0 = INSET + PAD + (GRID - (4 * K + 3 * GAP)) // 2

# Row 3, col 0 is the ✓ CONFIRM key — the only key on the pad that can move
# money, and the one worth lighting.
LIT_CELL = (3, 0)
for r in range(4):
    for c in range(4):
        x = x0 + c * (K + GAP)
        y = y0 + r * (K + GAP)
        on = (r, c) == LIT_CELL
        d.rounded_rectangle([x, y, x + K, y + K], int(K * 0.26), fill=LIT if on else KEY)

png = HERE / "icon.png"
img.save(png)
print(f"wrote {png} ({S}x{S})")

# .icns via macOS's own iconutil, so the bundle gets every size Finder wants.
if shutil.which("iconutil"):
    iconset = HERE / "icon.iconset"
    if iconset.exists():
        shutil.rmtree(iconset)
    iconset.mkdir()
    for size in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = size * scale
            name = f"icon_{size}x{size}{'@2x' if scale == 2 else ''}.png"
            img.resize((px, px), Image.LANCZOS).save(iconset / name)
    subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(HERE / "icon.icns")], check=True)
    shutil.rmtree(iconset)
    print(f"wrote {HERE / 'icon.icns'}")
else:
    print("iconutil not found — .icns not built (electron-builder can use the PNG)", file=sys.stderr)
