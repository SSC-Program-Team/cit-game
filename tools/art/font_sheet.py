"""Build the in-game bitmap font strip from the 5x7 pixel font.

Glyphs are drawn at 2x into a fixed 12x16 cell grid so Phaser's RetroFont can slice it.
Output: public/img/font.png  (+ the charset is mirrored in src/font.ts)

    python3 tools/art/font_sheet.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mockup"))
from pixelart import Canvas, P, _F  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "img")

CHARSET = ("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;-/$%+!?[]()*#'<>=\\")
CELL_W, CELL_H, COLS = 6, 8, 24
SCALE = 1

rows = (len(CHARSET) + COLS - 1) // COLS
c = Canvas(COLS * CELL_W, rows * CELL_H, (0, 0, 0, 0))

for i, ch in enumerate(CHARSET):
    gx = (i % COLS) * CELL_W
    gy = (i // COLS) * CELL_H
    glyph = _F.get(ch) or _F.get(ch.upper()) or _F["?"]
    for ry, row in enumerate(glyph):
        for rx, bit in enumerate(row):
            if bit == "1":
                for sy in range(SCALE):
                    for sx in range(SCALE):
                        c.set(gx + rx * SCALE, gy + ry * SCALE, P["white"])

c.img.save(os.path.join(OUT, "font.png"))
print(f"font.png: {c.w}x{c.h}, {len(CHARSET)} glyphs, cell {CELL_W}x{CELL_H}, cols {COLS}")
