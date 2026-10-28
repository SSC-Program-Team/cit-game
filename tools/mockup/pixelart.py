"""Tiny pixel-art toolkit for CIT-game design mockups.

Native resolution art (384x216) drawn with a hand-made 5x7 bitmap font and a
strict palette, then upscaled with nearest-neighbour so every pixel stays square.
Only used for design documents; not part of the shipped game.

    python3 tools/mockup/build.py
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "docs", "mockups")
CJK_FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# ---------------------------------------------------------------- palette ---
P = {
    "ink":       (10, 11, 18, 255),
    "night0":    (13, 15, 32, 255),
    "night1":    (20, 23, 46, 255),
    "night2":    (28, 32, 60, 255),
    "far":       (34, 38, 68, 255),
    "far_win":   (86, 96, 140, 255),
    "facade0":   (48, 50, 74, 255),
    "facade1":   (62, 62, 88, 255),
    "facade2":   (78, 74, 98, 255),
    "facade3":   (40, 42, 62, 255),
    "win_lit":   (255, 214, 148, 255),
    "win_warm":  (255, 236, 196, 255),
    "win_tv":    (122, 200, 240, 255),
    "win_dark":  (26, 29, 48, 255),
    "neon_pink": (255, 77, 157, 255),
    "neon_cyan": (70, 224, 230, 255),
    "neon_amber":(255, 176, 46, 255),
    "neon_red":  (255, 59, 92, 255),
    "neon_green":(92, 224, 138, 255),
    "concrete0": (58, 61, 82, 255),
    "concrete1": (74, 78, 100, 255),
    "concrete2": (44, 46, 64, 255),
    "road":      (32, 34, 46, 255),
    "road_line": (196, 190, 150, 255),
    "rail":      (150, 154, 170, 255),
    "wet":       (46, 52, 78, 255),
    "skin":      (240, 185, 138, 255),
    "skin_dk":   (196, 138, 100, 255),
    "hair":      (27, 26, 36, 255),
    "shirt":     (79, 163, 255, 255),
    "shirt_dk":  (48, 112, 190, 255),
    "trouser":   (52, 58, 84, 255),
    "white":     (240, 240, 246, 255),
    "grey":      (140, 146, 166, 255),
    "grey_dk":   (86, 90, 108, 255),
    "gold":      (255, 200, 74, 255),
    "panel":     (12, 14, 26, 240),
    "panel_2":   (22, 25, 44, 245),
}

# ---------------------------------------------------------------- 5x7 font --
_F = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01110", "10001", "10000", "10000", "10000", "10001", "01110"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01110"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "J": ("00111", "00010", "00010", "00010", "10010", "10010", "01100"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Q": ("01110", "10001", "10001", "10001", "10101", "10010", "01101"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "W": ("10001", "10001", "10001", "10101", "10101", "11011", "10001"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
    "Y": ("10001", "10001", "01010", "00100", "00100", "00100", "00100"),
    "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11111", "00010", "00100", "00010", "00001", "10001", "01110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
    "6": ("00110", "01000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00010", "01100"),
    " ": ("00000",) * 7,
    ".": ("00000", "00000", "00000", "00000", "00000", "00100", "00100"),
    ",": ("00000", "00000", "00000", "00000", "00100", "00100", "01000"),
    ":": ("00000", "00100", "00100", "00000", "00100", "00100", "00000"),
    "-": ("00000", "00000", "00000", "01110", "00000", "00000", "00000"),
    "/": ("00001", "00010", "00010", "00100", "01000", "01000", "10000"),
    "$": ("00100", "01111", "10100", "01110", "00101", "11110", "00100"),
    "(": ("00010", "00100", "01000", "01000", "01000", "00100", "00010"),
    ")": ("01000", "00100", "00010", "00010", "00010", "00100", "01000"),
    "%": ("11001", "11010", "00100", "00100", "01000", "01011", "10011"),
    "+": ("00000", "00100", "00100", "11111", "00100", "00100", "00000"),
    "?": ("01110", "10001", "00001", "00010", "00100", "00000", "00100"),
    "!": ("00100", "00100", "00100", "00100", "00100", "00000", "00100"),
    "#": ("01010", "01010", "11111", "01010", "11111", "01010", "01010"),
    "'": ("00100", "00100", "00000", "00000", "00000", "00000", "00000"),
    "*": ("00000", "10101", "01110", "11111", "01110", "10101", "00000"),
    "=": ("00000", "00000", "11111", "00000", "11111", "00000", "00000"),
    ">": ("01000", "00100", "00010", "00001", "00010", "00100", "01000"),
    "<": ("00010", "00100", "01000", "10000", "01000", "00100", "00010"),
    "|": ("00100", "00100", "00100", "00100", "00100", "00100", "00100"),
    "[": ("00110", "00100", "00100", "00100", "00100", "00100", "00110"),
    "]": ("01100", "00100", "00100", "00100", "00100", "00100", "01100"),
    "&": ("01100", "10010", "10100", "01000", "10101", "10010", "01101"),
    "_": ("00000", "00000", "00000", "00000", "00000", "00000", "11111"),
    "x": ("00000", "10001", "01010", "00100", "01010", "10001", "00000"),
}
FONT_W, FONT_H, FONT_SP = 5, 7, 1


def text_width(s: str, scale: int = 1) -> int:
    return max(0, len(s) * (FONT_W + FONT_SP) * scale - FONT_SP * scale)


def cjk_text(text: str, size: int = 12, color=None, threshold: int = 96) -> Image.Image:
    """Real 繁體 characters thresholded to 1-bit so they read as pixel glyphs."""
    color = color or P["white"]
    font = ImageFont.truetype(CJK_FONT, size)
    tmp = Image.new("L", (size * len(text) + 6, size + 6), 0)
    ImageDraw.Draw(tmp).text((1, 1), text, font=font, fill=255)
    out = Image.new("RGBA", tmp.size, (0, 0, 0, 0))
    src = tmp.load()
    dst = out.load()
    for y in range(tmp.height):
        for x in range(tmp.width):
            if src[x, y] > threshold:
                dst[x, y] = color
    return out


class Canvas:
    def __init__(self, w: int = 384, h: int = 216, bg=None):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w, h), bg or P["night0"])
        self.px = self.img.load()

    # -- primitives ---------------------------------------------------------
    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[int(x), int(y)] = c

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.set(xx, yy, c)

    def frame(self, x, y, w, h, c, inner=None):
        self.hline(x, y, w, c)
        self.hline(x, y + h - 1, w, c)
        self.vline(x, y, h, c)
        self.vline(x + w - 1, y, h, c)
        if inner:
            self.hline(x + 1, y + 1, w - 2, inner)
            self.hline(x + 1, y + h - 2, w - 2, inner)
            self.vline(x + 1, y + 1, h - 2, inner)
            self.vline(x + w - 2, y + 1, h - 2, inner)

    def hline(self, x, y, w, c):
        for xx in range(int(x), int(x + w)):
            self.set(xx, y, c)

    def vline(self, x, y, h, c):
        for yy in range(int(y), int(y + h)):
            self.set(x, yy, c)

    def dashed_h(self, x, y, w, c, on=3, off=3):
        for i, xx in enumerate(range(int(x), int(x + w))):
            if i % (on + off) < on:
                self.set(xx, y, c)

    def alpha_rect(self, x, y, w, h, c, alpha=140):
        """Blend a colour over existing pixels (fake transparency, no AA)."""
        if len(c) == 3:
            c = (*c, 255)
        a = alpha / 255
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if 0 <= xx < self.w and 0 <= yy < self.h:
                    b = self.px[xx, yy]
                    self.px[xx, yy] = (
                        int(b[0] * (1 - a) + c[0] * a),
                        int(b[1] * (1 - a) + c[1] * a),
                        int(b[2] * (1 - a) + c[2] * a),
                        255,
                    )

    def dither(self, x, y, w, h, c, kind=1):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if kind == 1 and (xx + yy) % 2 == 0:
                    self.set(xx, yy, c)
                elif kind == 2 and (xx % 2 == 0 and yy % 2 == 0):
                    self.set(xx, yy, c)
                elif kind == 3 and (xx + yy) % 3 == 0:
                    self.set(xx, yy, c)

    def text(self, x, y, s, c, scale=1, shadow=None, spacing=1):
        s = s.upper()
        cursor = x
        if shadow:
            self.text(x + scale, y + scale, s, shadow, scale, None, spacing)
        for ch in s:
            g = _F.get(ch) or _F.get(ch.lower()) or _F["?"]
            for ry, row in enumerate(g):
                for rx, bit in enumerate(row):
                    if bit == "1":
                        for sy in range(scale):
                            for sx in range(scale):
                                self.set(cursor + rx * scale + sx, y + ry * scale + sy, c)
            cursor += (FONT_W + spacing) * scale
        return cursor

    def text_c(self, cx, y, s, c, scale=1, shadow=None):
        self.text(cx - text_width(s, scale) // 2, y, s, c, scale, shadow)

    def text_r(self, right, y, s, c, scale=1, shadow=None):
        self.text(right - text_width(s, scale), y, s, c, scale, shadow)

    def cjk(self, x, y, s, size=12, color=None, vertical=False):
        color = color or P["white"]
        if vertical:
            for i, ch in enumerate(s):
                g = cjk_text(ch, size, color)
                self.paste(g, x, y + i * (g.height - 2))
        else:
            self.paste(cjk_text(s, size, color), x, y)

    def paste(self, im, x, y):
        im = getattr(im, "img", im)   # accept a Canvas or a PIL image
        for yy in range(im.height):
            for xx in range(im.width):
                p = im.getpixel((xx, yy))
                if p[3] > 0:
                    self.set(x + xx, y + yy, p)

    def sprite(self, x, y, rows, colors, flip=False):
        """rows: list of strings, one char per pixel; colors: char -> rgba."""
        for ry, row in enumerate(rows):
            seq = row[::-1] if flip else row
            for rx, ch in enumerate(seq):
                if ch != "." and ch in colors:
                    self.set(x + rx, y + ry, colors[ch])

    # -- widgets ------------------------------------------------------------
    def panel(self, x, y, w, h, border=None, fill=None, title=None, title_c=None):
        border = border or P["neon_cyan"]
        fill = fill or P["panel"]
        self.alpha_rect(x, y, w, h, fill[:3], 225)
        self.frame(x, y, w, h, border)
        # corner notches for a chunky 16-bit feel
        for (cx, cy) in ((x, y), (x + w - 1, y), (x, y + h - 1), (x + w - 1, y + h - 1)):
            self.set(cx, cy, P["ink"])
        if title:
            tw = text_width(title, 1) + 8
            self.alpha_rect(x + 6, y - 3, tw, 7, P["ink"][:3], 255)
            self.text(x + 10, y - 6, title, title_c or border)

    def meter(self, x, y, w, h, pct, fg, bg=None, label=None, label_c=None):
        bg = bg or P["grey_dk"]
        self.rect(x, y, w, h, bg)
        fill_w = max(0, min(w - 2, int((w - 2) * pct)))
        self.rect(x + 1, y + 1, fill_w, h - 2, fg)
        self.frame(x, y, w, h, P["ink"])
        if label:
            self.text(x + 3, y + (h - 7) // 2 if h >= 9 else y, label, label_c or P["ink"])

    def save(self, name: str, scale: int = 4):
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, name)
        big = self.img.resize((self.w * scale, self.h * scale), Image.NEAREST)
        big.save(path)
        print("wrote", path, big.size)
        return path
