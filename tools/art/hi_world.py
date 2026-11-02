"""World art — Tung Tau Wan Road, Stanley, at 640x360 (the one-street game, v0.11).

North side, left to right: Stanley Plaza, Stanley Restaurant (shut), the news stand, the library,
St Stephen's College, Stanley Prison.

Four times the pixels of the v1 sheet: 16px tiles, three-tone materials, cast shadows,
wet road with neon pooling, a real beach, and the shops that actually exist on the road.
Chrome-less: the game draws its own HUD.

    python3 tools/art/hi_world.py
"""
from __future__ import annotations

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mockup"))
from pixelart import Canvas, P, cjk_text  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "img")

W, H = 640, 360

HILL_Y = 0
BLD_Y = 36
NPAV_Y = 156
ROAD_Y = 182
SPAV_Y = 238
SW_Y = 262          # south-west building line
SEA_Y = 306

INK = (11, 12, 20, 255)
HILL = (48, 66, 56, 255)
HILL2 = (38, 54, 46, 255)
HAZE = (86, 106, 100, 255)
ROAD = (40, 42, 54, 255)
ROAD2 = (34, 36, 46, 255)
ROAD3 = (48, 50, 64, 255)
LANE = (208, 200, 152, 255)
KERB = (156, 154, 164, 255)
KERB2 = (108, 106, 116, 255)
WALK = (116, 114, 128, 255)
WALK2 = (104, 102, 116, 255)
WALK3 = (92, 90, 104, 255)
TACTILE = (154, 142, 112, 255)
BRICK = (150, 76, 64, 255)
BRICK2 = (124, 60, 52, 255)
BRICK3 = (172, 96, 82, 255)
STONE = (180, 176, 166, 255)
STONE2 = (154, 150, 140, 255)
STONE3 = (200, 196, 186, 255)
PLASTER = (210, 200, 180, 255)
PLASTER2 = (190, 178, 158, 255)
GLASS = (92, 144, 164, 255)
GLASS2 = (52, 92, 114, 255)
LIT = (255, 220, 166, 255)
PRISON = (152, 150, 154, 255)
PRISON2 = (124, 122, 128, 255)
PRISON3 = (176, 174, 178, 255)
TEAL = (62, 142, 142, 255)
TEAL2 = (42, 106, 110, 255)
RED = (170, 60, 60, 255)
RED2 = (138, 46, 48, 255)
GOLD = (216, 172, 86, 255)
SAND = (226, 210, 168, 255)
SAND2 = (206, 188, 148, 255)
SAND3 = (238, 226, 194, 255)
SEA = (46, 118, 136, 255)
SEA2 = (32, 90, 110, 255)
SEA3 = (66, 148, 160, 255)
FOAM = (204, 232, 238, 255)
NEON_P = P["neon_pink"]
NEON_C = P["neon_cyan"]
NEON_A = P["neon_amber"]
NEON_G = P["neon_green"]


# ---------------------------------------------------------------- helpers ---
def lift(col, k):
    return tuple(max(0, min(255, ch + k)) for ch in col[:3]) + (255,)


def shade(c, x, y, w, h, col, amount=18):
    """Cast shadow: a darker band offset down-right from a building."""
    for i in range(h):
        a = max(0, amount - i // 2)
        if a:
            c.alpha_rect(x + 3, y + i, w, 1, (6, 8, 14), a * 3)


def tone(c, x, y, w, h, base, step=6):
    """Vertical light falloff so flat walls read as surfaces."""
    for i in range(h):
        k = max(0, step - i // 3)
        c.rect(x, y + i, w, 1, (min(255, base[0] + k), min(255, base[1] + k), min(255, base[2] + k), 255))


CURTAINS = ((214, 120, 128, 255), (120, 168, 120, 255), (226, 206, 140, 255), (140, 150, 210, 255))
TV = (122, 200, 240, 255)
CLOTHES = ((236, 236, 240, 255), (214, 92, 108, 255), (92, 126, 172, 255), (226, 196, 92, 255),
           (120, 168, 120, 255), (58, 62, 80, 255))


def window(c, wx, y, r, frame):
    """One 10x10 window: what is behind the glass says someone lives here."""
    c.rect(wx - 1, y - 1, 12, 12, frame)
    k = r.random()
    if k < 0.34:                                      # lamp on, curtain half drawn
        c.rect(wx, y, 10, 10, LIT)
        c.rect(wx, y, 3 + r.randrange(0, 3), 10, r.choice(CURTAINS))
        c.alpha_rect(wx + 5, y + 6, 4, 4, (120, 80, 50), 90)      # someone's shelf
    elif k < 0.46:                                    # a television in the dark
        c.rect(wx, y, 10, 10, GLASS2)
        c.alpha_rect(wx, y, 10, 10, TV, 110)
        c.rect(wx + 3, y + 5, 4, 3, lift(TV, 30))
    elif k < 0.74:
        c.rect(wx, y, 10, 10, GLASS)
        c.set(wx + 1, y + 1, lift(GLASS, 50))         # sky in the glass
        c.set(wx + 2, y + 1, lift(GLASS, 30))
    else:
        c.rect(wx, y, 10, 10, GLASS2)
    c.hline(wx, y + 5, 10, frame)
    c.vline(wx + 5, y, 10, frame)
    if r.random() < 0.3:                              # iron grille, a Hong Kong default
        for gx in range(wx, wx + 10, 2):
            c.vline(gx, y - 1, 12, (52, 54, 62, 255))
        c.hline(wx - 1, y - 1, 12, (52, 54, 62, 255))
        c.hline(wx - 1, y + 10, 12, (52, 54, 62, 255))
    if r.random() < 0.18:                             # pot plant on the sill
        c.rect(wx + 1, y + 9, 3, 2, (150, 84, 60, 255))
        c.rect(wx, y + 7, 5, 2, (70, 132, 76, 255))


def window_row(c, x, y, w, rng, frame=None):
    frame = frame or (70, 74, 88, 255)
    for wx in range(x + 5, x + w - 6, 14):
        window(c, wx, y, rng, frame)


def laundry(c, x, y, w, r):
    """A pole out of a window with the week's washing on it."""
    c.hline(x, y, w, (150, 150, 160, 255))
    c.set(x, y + 1, (110, 110, 120, 255))
    cx = x + 2
    while cx < x + w - 3:
        col = r.choice(CLOTHES)
        if r.random() < 0.5:                          # shirt
            c.rect(cx, y + 1, 5, 2, col)
            c.rect(cx + 1, y + 3, 3, 4, col)
            cx += 7
        else:                                         # towel / trousers
            hgt = r.randrange(4, 8)
            c.rect(cx, y + 1, 3, hgt, col)
            c.vline(cx + 2, y + 1, hgt, lift(col, -30))
            cx += 5


def ac_unit(c, x, y):
    c.rect(x, y, 9, 7, (168, 168, 176, 255))
    c.hline(x, y, 9, (196, 196, 204, 255))
    c.rect(x + 1, y + 2, 7, 3, (120, 122, 132, 255))
    for i in range(3):
        c.hline(x + 1, y + 2 + i, 7, (120, 122, 132, 255) if i % 2 else (104, 106, 116, 255))
    c.vline(x + 4, y + 7, 4, (96, 98, 108, 255))
    for i in range(10):                               # the drip stain every unit leaves
        c.alpha_rect(x + 4, y + 11 + i, 1, 1, (24, 22, 28), max(8, 70 - i * 6))


def streaks(c, x, y, w, h, r):
    """Rain stains running down from the ledges."""
    for _ in range(max(1, w // 16)):
        sx = x + r.randrange(2, max(3, w - 2))
        sy = y + r.randrange(0, max(1, h // 2))
        for i in range(r.randrange(8, 22)):
            c.alpha_rect(sx, sy + i, 1, 1, (20, 18, 26), max(6, 46 - i * 2))


def roof_kit(c, x, y, w, r):
    """Water tank and an aerial: every walk-up roof has both."""
    tx = x + r.randrange(4, max(5, w // 2))
    c.rect(tx, y - 20, 12, 14, (120, 124, 136, 255))
    c.vline(tx, y - 20, 14, (150, 154, 166, 255))
    c.vline(tx + 11, y - 20, 14, (92, 96, 108, 255))
    c.hline(tx, y - 16, 12, (98, 102, 114, 255))
    c.hline(tx, y - 11, 12, (98, 102, 114, 255))
    ax = x + w - 8
    c.vline(ax, y - 28, 22, (120, 120, 130, 255))
    for i, span in enumerate((10, 7, 4)):
        c.hline(ax - span // 2, y - 26 + i * 4, span, (120, 120, 130, 255))


def lightbox(c, x, y, h, colour, r):
    """Projecting signbox. Lines, not letters: no invented shop names on a real road."""
    c.rect(x - 1, y - 1, 10, h + 2, INK)
    c.rect(x, y, 8, h, lift(colour, -150))
    c.frame(x, y, 8, h, colour)
    for ly in range(y + 3, y + h - 3, 4):
        c.hline(x + 2, ly, 4 if r.random() < 0.5 else 3, colour)
    c.hline(x - 4, y + 2, 4, (110, 110, 120, 255))    # bracket back to the wall
    c.hline(x - 4, y + h - 3, 4, (110, 110, 120, 255))


def awning(c, x, y, w, col, col2, h=12):
    c.rect(x, y, w, h, col)
    for i in range(0, w, 10):
        c.rect(x + i, y, 5, h, col2)
    c.hline(x, y, w, lift(col, 30))
    c.hline(x, y + 1, w, lift(col, 14))
    c.alpha_rect(x, y + h - 3, w, 3, (0, 0, 0), 50)   # canvas curves away from the light
    for i in range(0, w, 5):                          # scalloped edge
        c.vline(x + i, y + h, 3, col2)
        c.vline(x + i + 1, y + h, 2, col2)
        c.set(x + i + 2, y + h, col2)
    c.alpha_rect(x, y + h + 3, w, 4, (0, 0, 0), 60)


def sign_plate(c, x, y, text, colour, w=None, h=16, size=8):
    w = w or len(text) * 6 + 10
    c.rect(x, y, w, h, (26, 24, 30, 255))
    c.frame(x, y, w, h, colour)
    c.text(x + 5, y + (h - 7) // 2, text, colour)
    return w


def sign_cjk(c, x, y, chars, colour, size=14, vertical=False):
    if vertical:
        h = len(chars) * (size - 1) + 6
        c.rect(x - 2, y - 2, size + 8, h + 4, (20, 18, 22, 255))
        c.frame(x - 2, y - 2, size + 8, h + 4, colour)
        for i, ch in enumerate(chars):
            c.cjk(x + 2, y + 2 + i * (size - 1), ch, size=size, color=colour)
        return size + 8, h + 4
    w = len(chars) * size + 8
    box_h = size + 6
    c.rect(x - 2, y - 2, w, box_h, (20, 18, 22, 255))
    c.frame(x - 2, y - 2, w, box_h, colour)
    # Noto CJK carries a tall ascent above the ink: centre on the inked rows, not the em box
    glyphs = [cjk_text(ch, size, colour) for ch in chars]
    boxes = [g.getbbox() for g in glyphs if g.getbbox()]
    top = min(b[1] for b in boxes)
    ink_h = max(b[3] for b in boxes) - top
    gy = y - 2 + (box_h - ink_h) // 2 - top
    for i, g in enumerate(glyphs):
        c.paste(g, x + 2 + i * size, gy)
    return w, box_h


GOODS = ((214, 92, 108, 255), (92, 160, 210, 255), (226, 196, 92, 255), (120, 180, 120, 255),
         (236, 236, 240, 255))
BREAD = ((214, 160, 84, 255), (190, 126, 64, 255), (236, 196, 120, 255))


def shop_unit(c, ux, y, uw, uh, r, glow, goods):
    """One bay of a shopfront: lit inside with shelves, a counter, a lamp, maybe a person."""
    c.rect(ux, y, uw, uh, (34, 30, 34, 255))
    c.alpha_rect(ux, y, uw, uh, glow, 120)
    c.alpha_rect(ux, y, uw, 3, (255, 240, 210), 90)               # strip light
    for sy in (y + 6, y + 13):                                    # shelves of stock
        c.hline(ux + 1, sy, uw - 2, (110, 84, 64, 255))
        for gx in range(ux + 2, ux + uw - 2, 3):
            if r.random() < 0.8:
                c.rect(gx, sy - 2, 2, 2, r.choice(goods))
    if r.random() < 0.45:                                         # someone minding the shop
        px = ux + r.randrange(3, max(4, uw - 7))
        c.rect(px + 1, y + uh - 13, 3, 3, (60, 46, 40, 255))
        c.rect(px, y + uh - 10, 5, 6, lift(r.choice(GOODS), -70))
    c.rect(ux, y + uh - 5, uw, 5, (126, 96, 70, 255))             # counter
    c.hline(ux, y + uh - 5, uw, (170, 134, 98, 255))
    c.vline(ux, y, uh, (20, 18, 22, 255))                         # mullion


def shopfront(c, x, y, w, h, rng, glow=(255, 214, 150), goods=GOODS, shut=0.28, unit=26):
    c.rect(x, y, w, h, (44, 40, 44, 255))
    for ux in range(x + 3, x + w - unit, unit):
        c.rect(ux, y + 2, unit - 4, h - 6, (26, 24, 30, 255))
        if rng.random() >= shut:
            shop_unit(c, ux + 1, y + 3, unit - 6, h - 8, rng, glow, goods)
        else:
            # roller shutter, sometimes left half up with the light spilling under it
            drop = h - 8 if (shut >= 1 or rng.random() < 0.5) else (h - 8) // 2
            if drop < h - 8:
                shop_unit(c, ux + 1, y + 3, unit - 6, h - 8, rng, glow, goods)
            c.rect(ux + 1, y + 3, unit - 6, drop, (70, 70, 80, 255))
            for i in range(drop // 3):
                c.hline(ux + 1, y + 4 + i * 3, unit - 6, (54, 54, 64, 255))
            c.hline(ux + 1, y + 3 + drop - 1, unit - 6, (110, 110, 120, 255))


def tree(c, x, y, r=9, rng=None):
    c.vline(x, y + r - 3, 8, (74, 58, 44, 255))
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            d = dx * dx + dy * dy
            if d <= r * r:
                c.set(x + dx, y + dy, HILL2 if d > (r - 3) ** 2 else (60, 104, 70, 255))
    c.alpha_rect(x - r, y - r, r * 2, r * 2, (255, 230, 160), 12)


# ---------------------------------------------------------------- ground ---
def hill_span(c, cx, span, y, col):
    """One row of a mound, clipped to the frame: the hills run off both edges."""
    x0, x1 = max(0, cx - span), min(W, cx + span)
    if 0 <= y < H and x1 > x0:
        c.hline(x0, y, x1 - x0, col)


def ground(c, rng):
    # distant hills: overlapping mounds with a lit rim, so the top reads as a ridge
    c.rect(0, 0, W, BLD_Y + 4, HAZE)
    for i in range(9):
        cx = -20 + i * 78
        r = 34 + (i % 3) * 10
        for dy in range(-r, 6):
            span = int((r * r - dy * dy) ** 0.5) if dy < r else 0
            hill_span(c, cx, span, BLD_Y - r + dy + 8, HILL2)
        for dy in range(-r + 8, 4):
            span = int((r * r - dy * dy) ** 0.5)
            hill_span(c, cx, span, BLD_Y - r + dy + 8, HILL)
    c.dither(0, 0, W, BLD_Y, HAZE, 3)


def pavement(c, y, h, tactile=True):
    c.rect(0, y, W, h, WALK)
    for ty in range(y, y + h, 8):
        c.hline(0, ty, W, WALK2)
    for tx in range(0, W, 16):
        c.vline(tx, y, h, WALK3)
    c.hline(0, y, W, KERB)
    if tactile:
        c.rect(0, y + h - 6, W, 4, TACTILE)
        for tx in range(0, W, 8):
            c.vline(tx, y + h - 6, 4, (132, 120, 94, 255))


def road(c, rng):
    c.rect(0, ROAD_Y, W, SPAV_Y - ROAD_Y, ROAD)
    for _ in range(1400):
        x = rng.randrange(0, W)
        y = rng.randrange(ROAD_Y, SPAV_Y)
        c.set(x, y, ROAD2 if rng.random() < 0.6 else ROAD3)
    # double yellow along the college frontage, dashes elsewhere
    for tx in range(0, W, 22):
        c.rect(tx, ROAD_Y + 20, min(12, W - tx), 2, LANE)
        c.rect(tx, ROAD_Y + 30, min(12, W - tx), 2, LANE)
    c.hline(0, ROAD_Y, W, KERB2)
    c.hline(0, SPAV_Y - 1, W, KERB2)
    # drain grates and patches
    for gx in (60, 250, 470, 590):
        c.rect(gx, SPAV_Y - 6, 14, 5, (54, 56, 68, 255))
        for i in range(4):
            c.vline(gx + 2 + i * 3, SPAV_Y - 5, 3, (30, 32, 40, 255))
    for _ in range(7):
        px, py = rng.randrange(10, W - 40), rng.randrange(ROAD_Y + 6, SPAV_Y - 12)
        c.alpha_rect(px, py, rng.randrange(18, 34), rng.randrange(4, 8), (24, 26, 34), 90)


def wet(c, rng, lights):
    """Neon pooling on wet asphalt: vertical smears under each light source."""
    for (x, colour, wdt) in lights:
        for i, y in enumerate(range(ROAD_Y + 6, SPAV_Y - 4, 3)):
            if i % 2 == 0:
                c.dither(x - wdt, y, wdt * 2, 1, colour, 3)
    for _ in range(90):
        x, y = rng.randrange(0, W), rng.randrange(ROAD_Y, SPAV_Y)
        c.set(x, y, (150, 190, 210, 255))


# ------------------------------------------------------------ buildings ---
def tenement(c, rng, x, y, w, h, base, roof, sign=None, sign_colour=None,
             cjk=None, awning_cols=None, shop_h=44, box=None, goods=GOODS, shut=0.28, unit=26, glow=(255, 214, 150)):
    """Walk-up: roof kit, lived-in windows, AC, washing, stains, a lit shop and its sign."""
    d = random.Random(x * 131 + y)        # own seed: detail here never reshuffles the street
    shade(c, x + w - 4, y + 6, w - 8, h - 6, base)
    tone(c, x, y, w, h - shop_h, base)
    # light from the left: lit edge, shadowed right side
    c.vline(x, y, h - shop_h, lift(base, 22))
    c.alpha_rect(x + w - 5, y, 5, h - shop_h, (10, 10, 20), 70)
    c.alpha_rect(x + w - 2, y, 2, h - shop_h, (10, 10, 20), 70)
    # roof line + kit
    roof_kit(c, x, y, w, d)
    c.rect(x - 3, y - 6, w + 6, 8, roof)
    c.hline(x - 3, y - 6, w + 6, lift(roof, 26))
    c.alpha_rect(x - 3, y + 2, w + 6, 2, (0, 0, 0), 70)
    rows = max(1, (h - shop_h - 18) // 22)
    for r in range(rows):
        window_row(c, x, y + 6 + r * 22, w, d)
    for r in range(1, rows):                                   # floor ledges catch the light
        c.hline(x, y + 3 + r * 22, w, lift(base, -16))
        c.hline(x, y + 2 + r * 22, w, lift(base, 14))
    streaks(c, x, y + 4, w, h - shop_h - 4, d)
    for r in range(rows):
        for _ in range(1 + (w > 70)):
            if d.random() < 0.8:
                ac_unit(c, x + d.randrange(4, max(5, w - 14)), y + 15 + r * 22)
        if d.random() < 0.6:
            lx = x + d.randrange(2, max(3, w - 34))
            laundry(c, lx, y + 17 + r * 22, min(30, w - 6), d)
    # shopfront, awning, sign
    sy = y + h - shop_h
    shopfront(c, x + 2, sy + 10, w - 4, shop_h - 12, d, glow=glow, goods=goods, shut=shut, unit=unit)
    c.alpha_rect(x + 2, sy + shop_h - 4, w - 4, 2, (255, 214, 150), 60)   # light on the step
    if awning_cols:
        awning(c, x + 1, sy, w - 2, awning_cols[0], awning_cols[1])
    if box:
        lightbox(c, x + w - 12, y + 10, min(40, h - shop_h - 14), box, d)
    if sign:
        sign_plate(c, x + 6, sy - 20, sign, sign_colour or NEON_C, h=15)
    return sy



# ------------------------------------------------------- the six places ---
def plaza(c, rng):
    """Stanley Plaza: the mall, all work goes through it. Glass, timber louvres, a lit sign."""
    x, y, w, h = 6, 46, 132, 122
    shade(c, x + w - 4, y + 6, w - 8, h - 6, (86, 92, 106, 255))
    c.rect(x, y, w, h, (70, 74, 86, 255))
    tone(c, x, y, w, h, (70, 74, 86, 255), 10)
    # roof terrace with planters
    c.rect(x - 2, y - 6, w + 4, 7, (54, 56, 66, 255))
    c.hline(x - 2, y - 6, w + 4, (110, 114, 128, 255))
    for px in range(x + 4, x + w - 8, 18):
        c.rect(px, y - 12, 12, 6, (96, 70, 52, 255))
        c.rect(px + 1, y - 16, 10, 4, (62, 120, 74, 255))
    # three floors of glass behind dark steel frames and timber louvres
    for fl in range(3):
        fy = y + 6 + fl * 30
        c.rect(x + 4, fy, w - 8, 24, GLASS2)
        for gx in range(x + 4, x + w - 8, 12):
            lit = rng.random() < 0.55
            c.rect(gx + 1, fy + 1, 10, 22, LIT if lit else GLASS)
            if lit:
                c.alpha_rect(gx + 1, fy + 14, 10, 9, (150, 110, 70), 80)   # shoppers' shelves
            c.vline(gx, fy, 24, (30, 32, 40, 255))
        for lx in range(x + 6, x + w - 8, 4):                                # louvres
            c.vline(lx, fy + 1, 7, (176, 124, 76, 255))
        c.hline(x + 4, fy + 24, w - 8, (40, 42, 52, 255))
        c.hline(x + 4, fy + 25, w - 8, (120, 124, 138, 255))
    # the lit sign across the top
    c.rect(x + 16, y - 2, w - 32, 11, (20, 22, 30, 255))
    c.frame(x + 16, y - 2, w - 32, 11, NEON_C)
    c.text_c(x + w // 2, y, "stanley plaza", NEON_C)
    # entrance: glass doors, canopy, a poster box each side
    ey = y + h - 26
    c.rect(x + 38, ey, 56, 26, (34, 36, 46, 255))
    c.alpha_rect(x + 38, ey, 56, 26, (255, 224, 170), 120)
    for dx in (x + 40, x + 54, x + 68, x + 80):
        c.rect(dx, ey + 3, 12, 23, (210, 220, 210, 255))
        c.alpha_rect(dx, ey + 3, 12, 23, (92, 144, 164), 150)
    c.rect(x + 30, ey - 6, 72, 5, (210, 206, 198, 255))
    c.alpha_rect(x + 30, ey - 1, 72, 3, (0, 0, 0), 70)
    for px in (x + 10, x + 108):
        c.rect(px, ey + 2, 16, 22, (24, 26, 34, 255))
        c.rect(px + 2, ey + 4, 12, 18, (226, 196, 120, 255) if px < x + 50 else (120, 196, 210, 255))
        for ly in range(ey + 7, ey + 20, 4):
            c.hline(px + 4, ly, 8, (40, 40, 48, 255))


def restaurant(c, rng):
    """Stanley Restaurant: shut for now. Shutters down, the neon off."""
    tenement(c, rng, 146, 54, 88, 114, (196, 176, 156, 255), (104, 84, 74, 255),
             awning_cols=((92, 96, 104, 255), (122, 126, 134, 255)), shut=1)
    sign_cjk(c, 158, 102, "赤柱餐廳", (120, 128, 140, 255), size=16)
    # a paper notice taped to the middle shutter
    c.rect(180, 140, 18, 14, (232, 226, 206, 255))
    c.hline(182, 144, 12, (120, 110, 100, 255))
    c.hline(182, 147, 14, (120, 110, 100, 255))
    c.hline(182, 150, 9, (120, 110, 100, 255))
    sign_plate(c, 160, 84, "closed", (200, 90, 90, 255), h=13)


def news_stand(c, rng):
    """A walk-up with a green newspaper kiosk on the pavement in front of it."""
    tenement(c, rng, 240, 70, 58, 98, (184, 170, 150, 255), (112, 90, 78, 255), shop_h=34, shut=0.5)
    kx, ky = 246, 120
    c.alpha_rect(kx + 3, ky + 40, 46, 4, (0, 0, 0), 80)
    c.rect(kx, ky, 46, 40, (46, 108, 74, 255))
    c.rect(kx - 3, ky - 6, 52, 7, (36, 88, 60, 255))
    c.hline(kx - 3, ky - 6, 52, (88, 160, 112, 255))
    c.rect(kx + 3, ky + 3, 40, 20, (24, 30, 26, 255))
    c.alpha_rect(kx + 3, ky + 3, 40, 20, (255, 220, 160), 90)
    papers = ((236, 236, 230, 255), (226, 196, 92, 255), (214, 92, 108, 255), (120, 168, 210, 255), (236, 236, 230, 255))
    for i in range(10):                                   # papers and magazines on the rack
        px = kx + 4 + (i % 5) * 8
        py = ky + 4 + (i // 5) * 10
        c.rect(px, py, 6, 8, papers[(i * 3) % len(papers)])
        c.hline(px + 1, py + 2, 4, (60, 60, 70, 255))
    c.rect(kx + 2, ky + 26, 42, 12, (36, 88, 60, 255))
    for i in range(5):                                    # the day's papers stacked on the ledge
        c.rect(kx + 4 + i * 8, ky + 24, 7, 3, (230, 228, 220, 255))
    sign_cjk(c, kx + 10, ky - 26, "報攤", NEON_G, size=13)
    c.rect(kx + 8, ky + 28, 30, 9, (20, 40, 28, 255))
    c.text_c(kx + 23, ky + 29, "news", NEON_G)


def library(c, rng):
    """Stanley Public Library: pale civic stone, tall windows full of shelves."""
    x, y, w, h = 306, 62, 106, 106
    shade(c, x + w - 4, y + 6, w - 8, h - 6, STONE)
    c.rect(x, y, w, h, STONE)
    tone(c, x, y, w, h, STONE)
    c.vline(x, y, h, STONE3)
    c.alpha_rect(x + w - 4, y, 4, h, (10, 10, 20), 60)
    c.rect(x - 3, y - 7, w + 6, 8, (128, 120, 108, 255))
    c.hline(x - 3, y - 7, w + 6, (160, 152, 140, 255))
    c.alpha_rect(x - 3, y + 1, w + 6, 2, (0, 0, 0), 60)
    book = ((150, 60, 60, 255), (60, 96, 150, 255), (200, 170, 90, 255), (70, 120, 80, 255), (120, 80, 130, 255))
    for wx in range(x + 8, x + w - 14, 20):                # tall windows with shelves behind
        c.rect(wx - 1, y + 10, 14, 52, STONE2)
        c.rect(wx, y + 11, 12, 50, (40, 34, 30, 255))
        c.alpha_rect(wx, y + 11, 12, 50, (255, 214, 150), 110)
        for sy in range(y + 16, y + 58, 8):
            c.hline(wx, sy + 5, 12, (110, 84, 64, 255))
            for bx in range(wx + 1, wx + 11, 2):
                if rng.random() < 0.85:
                    c.rect(bx, sy + 1, 1, 4, rng.choice(book))
        c.vline(wx + 6, y + 11, 50, STONE2)
    c.rect(x + 8, y + 68, w - 16, 12, (34, 32, 36, 255))
    c.frame(x + 8, y + 68, w - 16, 12, (226, 214, 180, 255))
    c.text_c(x + w // 2, y + 71, "public library", (226, 214, 180, 255))
    # steps and doors
    c.rect(x + 36, y + 84, 34, 22, (44, 40, 40, 255))
    c.alpha_rect(x + 36, y + 84, 34, 22, (255, 214, 150), 130)
    c.vline(x + 53, y + 84, 22, (90, 70, 56, 255))
    c.rect(x + 30, y + 82, 4, 24, STONE3)
    c.rect(x + 72, y + 82, 4, 24, STONE3)
    for i in range(3):
        c.rect(x + 26 - i * 3, y + h - 6 + i * 2, 54 + i * 6, 2, lift(STONE2, -i * 10))


def college(c, rng):
    """St Stephen's College: brick behind a stone wall, the gate at no. 22, the field."""
    shade(c, 474, 64, 6, 48, BRICK)
    c.rect(426, 54, 52, 58, BRICK)
    for ty in range(54, 112, 5):
        c.hline(426, ty, 52, BRICK2)
        for bx in range(426 + (ty // 5 % 2) * 4, 478, 8):
            c.set(bx, ty + 2, BRICK2)
    c.vline(426, 54, 58, BRICK3)
    c.alpha_rect(474, 54, 4, 58, (10, 10, 20), 60)
    for wx in range(431, 470, 12):
        c.rect(wx, 62, 8, 10, LIT if rng.random() < 0.4 else GLASS2)
        c.rect(wx, 80, 8, 10, LIT if rng.random() < 0.6 else GLASS2)
        c.hline(wx, 72, 8, STONE3)
        c.hline(wx, 90, 8, STONE3)
    c.rect(420, 46, 64, 10, (86, 58, 54, 255))
    c.hline(420, 46, 64, (112, 76, 70, 255))
    c.rect(486, 70, 40, 42, PLASTER2)                     # the hall
    c.rect(484, 64, 44, 7, (86, 58, 54, 255))
    for wx in range(490, 522, 10):
        c.rect(wx, 76, 6, 14, LIT if rng.random() < 0.5 else GLASS2)
    x0 = 420
    c.rect(x0, 118, 120, 30, STONE)
    tone(c, x0, 118, 120, 30, STONE)
    for px in range(x0, x0 + 120, 20):
        c.rect(px, 114, 5, 34, STONE2)
        c.hline(px, 114, 5, STONE3)
        c.vline(px + 4, 115, 33, lift(STONE2, -20))
    streaks(c, x0, 118, 120, 30, random.Random(5))
    c.rect(452, 112, 40, 36, (52, 54, 48, 255))
    c.alpha_rect(452, 112, 40, 36, (255, 220, 160), 40)
    c.rect(450, 108, 6, 40, STONE2)
    c.rect(488, 108, 6, 40, STONE2)
    c.rect(452, 98, 40, 12, (232, 230, 218, 255))
    c.text_c(472, 100, "ssc 22", (58, 62, 50, 255))
    c.rect(498, 120, 40, 28, (66, 106, 74, 255))
    c.dither(498, 120, 40, 28, (58, 96, 66, 255), 2)
    c.frame(501, 123, 34, 22, (208, 212, 202, 255))
    tree(c, 500, 100, 8, rng)


def prison(c, rng):
    """Stanley Prison at no. 99: high wall, wire, a tower. The game shows the count above it."""
    x0 = 548
    c.rect(x0 + 8, 60, 70, 32, PRISON2)                   # cell block behind the wall
    for wx in range(x0 + 12, x0 + 74, 7):
        c.rect(wx, 66, 3, 6, (36, 38, 46, 255))
        c.rect(wx, 78, 3, 6, (36, 38, 46, 255))
        if rng.random() < 0.3:
            c.rect(wx, 66, 3, 6, (190, 170, 120, 255))
    c.rect(x0, 92, 86, 56, PRISON)
    tone(c, x0, 92, 86, 56, PRISON)
    c.hline(x0, 92, 86, PRISON3)
    c.hline(x0, 88, 86, (76, 76, 82, 255))
    for i in range(x0, x0 + 86, 5):
        c.set(i, 87, (104, 104, 110, 255))
        c.set(i + 2, 85, (104, 104, 110, 255))
    for px in range(x0, x0 + 86, 22):
        c.rect(px, 90, 4, 58, PRISON2)
    c.rect(x0 + 66, 50, 16, 42, PRISON2)                  # tower
    c.rect(x0 + 64, 46, 20, 7, (92, 92, 98, 255))
    c.rect(x0 + 69, 56, 10, 8, (44, 46, 54, 255))
    c.alpha_rect(x0 + 69, 56, 10, 8, (255, 220, 150), 50)
    c.rect(x0 + 24, 116, 34, 32, (58, 58, 64, 255))      # the gate
    for gx in range(x0 + 26, x0 + 58, 4):
        c.vline(gx, 118, 30, (44, 44, 50, 255))
    c.rect(x0 + 22, 104, 38, 11, (32, 34, 40, 255))
    c.frame(x0 + 22, 104, 38, 11, (200, 200, 196, 255))
    c.text_c(x0 + 41, 106, "99", (206, 206, 200, 255))


def waterfront(c, rng):
    murray_house(c, rng, 10, SW_Y, 110, 46)
    # the promenade garden: benches and planters
    for bx in (140, 186):
        c.rect(bx, SW_Y + 26, 30, 4, (140, 100, 70, 255))
        c.rect(bx, SW_Y + 18, 30, 3, (120, 86, 60, 255))
        c.vline(bx + 2, SW_Y + 30, 6, (60, 60, 66, 255))
        c.vline(bx + 27, SW_Y + 30, 6, (60, 60, 66, 255))
    for px in (130, 176, 222):
        c.rect(px, SW_Y + 20, 8, 16, (120, 116, 110, 255))
        tree(c, px + 4, SW_Y + 12, 7, rng)
    bus_terminus(c, rng)

def fort(c):
    c.rect(628, 92, 12, 66, (86, 88, 96, 255))
    c.rect(626, 150, 14, 4, (226, 218, 194, 255))
    c.rect(626, 150, 3, 24, (226, 218, 194, 255))
    # stop sign, shape carries the meaning
    c.rect(620, 104, 14, 14, (198, 56, 60, 255))
    c.rect(621, 102, 12, 18, (198, 56, 60, 255))
    c.rect(618, 106, 18, 10, (198, 56, 60, 255))
    c.frame(621, 105, 12, 12, (238, 238, 232, 255))


def murray_house(c, rng, x, y, w, h):
    """Colonial arcade: arches, columns, a stone balustrade."""
    c.rect(x, y, w, h, PLASTER)
    tone(c, x, y, w, h, PLASTER)
    c.rect(x - 3, y - 8, w + 6, 10, (150, 128, 104, 255))
    c.hline(x - 3, y - 8, w + 6, (176, 152, 124, 255))
    for i in range(4):
        ax = x + 8 + i * 28
        c.rect(ax, y + 12, 20, h - 14, (44, 42, 50, 255))
        for k in range(6):
            c.hline(ax, y + 12 + k, 20, (44, 42, 50, 255))
        # arch top
        c.rect(ax + 2, y + 8, 16, 5, PLASTER2)
        c.alpha_rect(ax + 2, y + 14, 16, h - 18, (255, 214, 150), 90)
        c.rect(ax - 2, y + 12, 3, h - 14, PLASTER2)
    c.rect(x, y + h - 6, w, 6, (168, 158, 142, 255))
    for i in range(0, w, 8):
        c.vline(x + i, y + h - 6, 6, (140, 130, 118, 255))


def bus_terminus(c, rng):
    x, y = 240, SW_Y + 4
    c.rect(x, y, 60, 34, (58, 60, 72, 255))
    c.rect(x, y, 60, 4, (96, 100, 116, 255))
    for i in range(3):
        c.rect(x + 6 + i * 18, y + 6, 14, 20, (34, 36, 44, 255))
        c.alpha_rect(x + 6 + i * 18, y + 6, 14, 20, (255, 214, 150), 70)
    c.rect(x + 4, y + 28, 52, 3, (150, 150, 160, 255))
    c.text(x + 22, y - 9, "6  40  n40", (196, 200, 212, 255))


def beach(c, rng):
    # sand
    c.rect(306, SPAV_Y, W - 306, SEA_Y - SPAV_Y, SAND)
    for ty in range(SPAV_Y, SEA_Y, 4):
        c.hline(306, ty, W - 306, SAND2 if ty % 8 else SAND3)
    # railing + steps down from the promenade
    for rx in range(306, W, 12):
        c.vline(rx, SPAV_Y - 10, 10, (150, 150, 160, 255))
    c.hline(306, SPAV_Y - 10, W - 306, (170, 170, 180, 255))
    for i in range(4):
        c.rect(360, SPAV_Y + 2 + i * 5, 34, 4, STONE2)
    # umbrellas and a lifeguard tower
    for (ux, uy, col) in ((430, SPAV_Y + 22, RED), (486, SPAV_Y + 34, TEAL), (540, SPAV_Y + 20, GOLD)):
        c.vline(ux, uy, 14, (120, 110, 96, 255))
        for i, wdt in enumerate((18, 22, 26)):
            c.rect(ux - wdt // 2, uy - 6 + i, wdt, 3, col)
    c.rect(596, SPAV_Y + 10, 26, 22, (226, 220, 206, 255))
    c.rect(592, SPAV_Y + 4, 34, 7, (198, 70, 70, 255))
    c.rect(600, SPAV_Y + 16, 8, 8, GLASS2)


def sea(c, rng):
    # harbour wall and water in front of the waterfront buildings
    c.rect(0, SEA_Y, 300, H - SEA_Y, (30, 84, 102, 255))
    c.rect(0, SEA_Y, 300, 8, (128, 126, 132, 255))
    for tx in range(0, 300, 24):
        c.vline(tx, SEA_Y, 8, (104, 102, 110, 255))
    for _ in range(40):
        c.set(rng.randrange(0, 300), rng.randrange(SEA_Y + 12, H), (86, 150, 166, 255))
    c.rect(300, SEA_Y, W - 300, H - SEA_Y, SEA)
    for i, y in enumerate(range(SEA_Y, H, 3)):
        col = SEA3 if i < 3 else (SEA if i < 10 else SEA2)
        c.hline(0, y, W, col)
    # foam at the shoreline
    for x in range(306, W, 3):
        if rng.random() < 0.6:
            c.set(x, SEA_Y + 1 + rng.randrange(0, 3), FOAM)
    for _ in range(30):
        x = rng.randrange(0, W)
        y = rng.randrange(SEA_Y + 6, H)
        c.hline(x, y, rng.randrange(4, 14), FOAM if rng.random() < 0.4 else SEA3)
    # a junk boat on the horizon
    c.rect(470, SEA_Y + 18, 22, 4, (120, 60, 50, 255))
    c.vline(478, SEA_Y + 6, 12, (90, 76, 64, 255))
    for i in range(3):
        c.rect(474 + i * 5, SEA_Y + 8, 4, 8, (220, 214, 196, 255))


# --------------------------------------------------------------- traffic ---
def minibus(c, x, y):
    c.rect(x, y, 56, 26, (238, 236, 226, 255))
    c.rect(x, y, 56, 9, (62, 138, 100, 255))
    c.rect(x + 3, y + 10, 14, 10, (156, 186, 200, 255))
    c.rect(x + 20, y + 10, 14, 10, (156, 186, 200, 255))
    c.rect(x + 37, y + 10, 14, 10, (156, 186, 200, 255))
    c.rect(x, y + 22, 56, 4, (60, 62, 74, 255))
    c.rect(x + 8, y + 26, 10, 4, (24, 24, 30, 255))
    c.rect(x + 38, y + 26, 10, 4, (24, 24, 30, 255))
    c.text(x + 4, y + 1, "6", (18, 40, 28, 255))


def taxi(c, x, y):
    c.rect(x, y, 44, 20, (198, 62, 62, 255))
    c.rect(x + 6, y + 3, 32, 9, (150, 190, 210, 255))
    c.rect(x, y + 16, 44, 4, (150, 44, 46, 255))
    c.rect(x + 16, y - 4, 12, 5, (232, 226, 206, 255))
    c.rect(x + 8, y + 20, 8, 4, (24, 24, 30, 255))
    c.rect(x + 28, y + 20, 8, 4, (24, 24, 30, 255))


def bus(c, x, y):
    c.rect(x, y, 92, 40, (200, 64, 68, 255))
    c.rect(x, y, 92, 12, (152, 42, 46, 255))
    c.text(x + 6, y + 2, "40 stanley", (240, 226, 190, 255))
    for i in range(6):
        c.rect(x + 5 + i * 14, y + 14, 11, 9, (168, 202, 216, 255))
        c.rect(x + 5 + i * 14, y + 26, 11, 8, (168, 202, 216, 255))
    c.rect(x, y + 36, 92, 4, (60, 62, 74, 255))
    c.rect(x + 12, y + 40, 12, 4, (24, 24, 30, 255))
    c.rect(x + 66, y + 40, 12, 4, (24, 24, 30, 255))


# ----------------------------------------------------------------- people ---
def person(c, x, y, frame=0, shirt=(79, 163, 255, 255), hair=(27, 26, 36, 255),
           skin=(240, 185, 138, 255), apron=None):
    """16x22 with a 4-frame walk; frame 0 is standing."""
    c.alpha_rect(x - 2, y + 20, 20, 4, (0, 0, 0), 70)
    c.rect(x + 5, y, 6, 5, hair)
    c.rect(x + 4, y + 4, 8, 3, skin)
    c.set(x + 5, y + 5, INK)
    c.set(x + 9, y + 5, INK)
    c.rect(x + 3, y + 7, 10, 8, shirt)
    if apron:
        c.rect(x + 5, y + 9, 6, 5, apron)
    c.rect(x + 7, y + 8, 2, 6, tuple(max(0, ch - 30) for ch in shirt[:3]) + (255,))
    swing = (0, 1, 0, -1)[frame % 4]
    c.rect(x + 4, y + 15, 3, 5 - max(0, swing), (52, 58, 84, 255))
    c.rect(x + 9, y + 15, 3, 5 + max(0, swing), (52, 58, 84, 255))
    c.rect(x + 4 + (1 if swing > 0 else 0), y + 20, 4, 2, INK)
    c.rect(x + 9 - (1 if swing > 0 else 0), y + 20, 4, 2, INK)


# ------------------------------------------------------------------ scene ---
def render(with_people=True) -> Canvas:
    rng = random.Random(77)
    c = Canvas(W, H, ROAD)
    ground(c, rng)
    pavement(c, NPAV_Y, ROAD_Y - NPAV_Y)
    road(c, rng)
    pavement(c, SPAV_Y - 14, 14, tactile=False)
    beach(c, rng)
    sea(c, rng)
    waterfront(c, rng)

    # ---- north, left to right: plaza, restaurant, news stand, library, college, prison
    plaza(c, rng)
    restaurant(c, rng)
    news_stand(c, rng)
    library(c, rng)
    college(c, rng)
    prison(c, rng)


    # trees and lamps along the north pavement
    for tx in (142, 300, 416, 542):
        tree(c, tx, NPAV_Y - 18, 7, rng)
    for lx in (140, 246, 348, 452, 556):
        c.alpha_rect(lx - 16, NPAV_Y + 2, 34, 22, (255, 210, 150), 18)
        c.rect(lx, NPAV_Y + 6, 2, 14, (150, 148, 156, 255))
        c.rect(lx - 3, NPAV_Y + 4, 8, 3, (236, 230, 212, 255))

    # ---- traffic
    minibus(c, 96, ROAD_Y + 6)
    taxi(c, 300, ROAD_Y + 30)
    bus(c, 470, ROAD_Y + 2)

    # ---- people
    if with_people:
        person(c, 44, NPAV_Y + 12, 0, shirt=(236, 236, 240, 255), apron=(214, 92, 108, 255))
        person(c, 214, NPAV_Y + 10, 1, shirt=(92, 126, 172, 255))
        person(c, 330, NPAV_Y + 12, 3, shirt=(158, 138, 96, 255))
        person(c, 430, SPAV_Y + 4, 2, shirt=(132, 96, 148, 255))

    wet(c, rng, [(72, NEON_C, 10), (268, NEON_G, 6), (358, GOLD, 7), (590, (200, 70, 70), 6)])

    # rain
    for _ in range(220):
        x, y = rng.randrange(0, W), rng.randrange(0, H - 20)
        c.set(x, y, (150, 178, 200, 255))
        if rng.random() < 0.35:
            c.set(x - 1, y + 2, (120, 148, 176, 255))
    return c


def main():
    img = render()
    img.img.save(os.path.join(OUT, "map.png"))
    print(f"map.png: {W}x{H}")
    # a 2x copy for the design page
    docs = os.path.join(ROOT, "docs", "mockups")
    big = Canvas(W, H)
    big.paste(img.img, 0, 0)
    big.img.resize((W * 2, H * 2), 0).save(os.path.join(docs, "01-v2-street.png"))
    print("docs/mockups/01-v2-street.png: 1280x720")


if __name__ == "__main__":
    main()
