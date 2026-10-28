"""v2 world art — Tung Tau Wan Road, Stanley, at 640x360.

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
from pixelart import Canvas, P  # noqa: E402

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


def window_row(c, x, y, w, rng, lit=0.42, glass=GLASS, frame=None):
    frame = frame or (70, 74, 88, 255)
    for wx in range(x + 5, x + w - 6, 14):
        c.rect(wx - 1, y - 1, 12, 12, frame)
        r = rng.random()
        inner = LIT if r < lit else (glass if r < lit + 0.35 else GLASS2)
        c.rect(wx, y, 10, 10, inner)
        c.hline(wx, y + 5, 10, frame)
        c.vline(wx + 5, y, 10, frame)


def ac_unit(c, x, y):
    c.rect(x, y, 9, 7, (168, 168, 176, 255))
    c.rect(x + 1, y + 1, 7, 3, (120, 122, 132, 255))
    c.vline(x + 4, y + 4, 3, (120, 122, 132, 255))
    c.vline(x + 4, y + 7, 4, (96, 98, 108, 255))


def awning(c, x, y, w, col, col2, h=12):
    c.rect(x, y, w, h, col)
    for i in range(0, w, 10):
        c.rect(x + i, y, 5, h, col2)
    c.hline(x, y, w, tuple(min(255, ch + 30) for ch in col[:3]) + (255,))
    for i in range(0, w, 5):
        c.vline(x + i, y + h, 3, col2)
    c.alpha_rect(x, y + h, w, 4, (0, 0, 0), 60)


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
    c.rect(x - 2, y - 2, w, size + 6, (20, 18, 22, 255))
    c.frame(x - 2, y - 2, w, size + 6, colour)
    for i, ch in enumerate(chars):
        c.cjk(x + 2 + i * size, y + 1, ch, size=size, color=colour)
    return w, size + 6


def shopfront(c, x, y, w, h, rng, glow=(255, 214, 150)):
    c.rect(x, y, w, h, (44, 40, 44, 255))
    unit = 26
    for ux in range(x + 3, x + w - unit, unit):
        c.rect(ux, y + 2, unit - 4, h - 6, (26, 24, 30, 255))
        if rng.random() < 0.72:
            c.alpha_rect(ux + 1, y + 3, unit - 6, h - 8, glow, 120)
            for i in range(3):
                c.vline(ux + 4 + i * 6, y + 3, h - 8, (120, 96, 74, 255))
            c.rect(ux + 1, y + h - 5, unit - 6, 2, (150, 120, 92, 255))
        else:
            for i in range(h // 4):
                c.hline(ux + 1, y + 4 + i * 4, unit - 6, (62, 60, 72, 255))


def tree(c, x, y, r=9, rng=None):
    c.vline(x, y + r - 3, 8, (74, 58, 44, 255))
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            d = dx * dx + dy * dy
            if d <= r * r:
                c.set(x + dx, y + dy, HILL2 if d > (r - 3) ** 2 else (60, 104, 70, 255))
    c.alpha_rect(x - r, y - r, r * 2, r * 2, (255, 230, 160), 12)


# ---------------------------------------------------------------- ground ---
def ground(c, rng):
    # distant hills: overlapping mounds with a lit rim, so the top reads as a ridge
    c.rect(0, 0, W, BLD_Y + 4, HAZE)
    for i in range(9):
        cx = -20 + i * 78
        r = 34 + (i % 3) * 10
        for dy in range(-r, 6):
            span = int((r * r - dy * dy) ** 0.5) if dy < r else 0
            c.rect(cx - span, BLD_Y - r + dy + 8, span * 2, 1, HILL2)
        for dy in range(-r + 8, 4):
            span = int((r * r - dy * dy) ** 0.5)
            c.hline(cx - span, BLD_Y - r + dy + 8, span * 2, HILL)
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
        c.rect(tx, ROAD_Y + 20, 12, 2, LANE)
        c.rect(tx, ROAD_Y + 30, 12, 2, LANE)
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
             cjk=None, awning_cols=None, shop_h=44):
    """Block with roof, cast shadow, lit windows, shopfront and a sign."""
    shade(c, x + w - 4, y + 6, w - 8, h - 6, base)
    tone(c, x, y, w, h - shop_h, base)
    # roof line
    c.rect(x - 3, y - 6, w + 6, 8, roof)
    c.hline(x - 3, y - 6, w + 6, tuple(min(255, ch + 26) for ch in roof[:3]) + (255,))
    # roof clutter
    for _ in range(w // 26):
        c.rect(x + rng.randrange(6, max(7, w - 20)), y - 12, rng.randrange(8, 14), 7, (74, 76, 88, 255))
    c.rect(x + w - 26, y - 16, 14, 11, (86, 88, 100, 255))     # stair hut
    # windows + AC
    rows = max(1, (h - shop_h - 18) // 22)
    for r in range(rows):
        window_row(c, x, y + 6 + r * 22, w, rng)
        if rng.random() < 0.8:
            ac_unit(c, x + rng.randrange(4, max(5, w - 14)), y + 14 + r * 22)
    # floor ledges
    for r in range(1, rows):
        c.hline(x, y + 3 + r * 22, w, tuple(max(0, ch - 16) for ch in base[:3]) + (255,))
    # shopfront + awning
    sy = y + h - shop_h
    shopfront(c, x + 2, sy + 10, w - 4, shop_h - 12, rng)
    if awning_cols:
        awning(c, x + 1, sy, w - 2, awning_cols[0], awning_cols[1])
    if sign:
        sign_plate(c, x + 6, sy - 20, sign, sign_colour or NEON_C, h=15)
    return sy


# ---------------------------------------------------------------- street ---
def college(c, rng):
    x0 = 384
    # wall with pillars
    c.rect(x0, 118, 176, 30, STONE)
    tone(c, x0, 118, 176, 30, STONE)
    for px in range(x0, x0 + 176, 20):
        c.rect(px, 114, 5, 34, STONE2)
        c.hline(px, 114, 5, STONE3)
    # gate opening
    c.rect(464, 112, 40, 36, (52, 54, 48, 255))
    c.rect(462, 108, 6, 40, STONE2)
    c.rect(500, 108, 6, 40, STONE2)
    c.rect(470, 104, 28, 10, (232, 230, 218, 255))
    c.text_c(484, 105, "ssc 22", (58, 62, 50, 255))
    # brick block behind the wall
    c.rect(400, 58, 58, 54, BRICK)
    for ty in range(58, 112, 5):
        c.hline(400, ty, 58, BRICK2)
    for wx in range(406, 452, 12):
        c.rect(wx, 66, 8, 10, LIT if rng.random() < 0.4 else GLASS2)
        c.rect(wx, 84, 8, 10, LIT if rng.random() < 0.3 else GLASS2)
    c.rect(394, 50, 70, 10, (86, 58, 54, 255))
    c.hline(394, 50, 70, (112, 76, 70, 255))
    # sports field
    c.rect(506, 116, 50, 32, (66, 106, 74, 255))
    c.dither(506, 116, 50, 32, (58, 96, 66, 255), 2)
    c.frame(510, 119, 42, 26, (208, 212, 202, 255))
    tree(c, 508, 96, 9, rng)
    tree(c, 552, 90, 7, rng)


def prison(c, rng):
    x0 = 560
    c.rect(x0, 92, 74, 56, PRISON)
    tone(c, x0, 92, 74, 56, PRISON)
    c.hline(x0, 92, 74, PRISON3)
    # barbed wire
    c.hline(x0, 88, 74, (76, 76, 82, 255))
    for i in range(x0, x0 + 74, 5):
        c.set(i, 87, (104, 104, 110, 255))
        c.set(i + 2, 85, (104, 104, 110, 255))
    for px in range(x0, x0 + 74, 24):
        c.rect(px, 90, 4, 58, PRISON2)
    # tower
    c.rect(x0 + 4, 62, 16, 30, PRISON2)
    c.rect(x0 + 2, 58, 20, 7, (92, 92, 98, 255))
    c.rect(x0 + 7, 66, 10, 8, (44, 46, 54, 255))
    c.alpha_rect(x0 + 7, 66, 10, 8, (255, 220, 150), 40)
    # mosque dome at 53
    c.rect(612, 74, 16, 18, (232, 232, 226, 255))
    for i, wdt in enumerate((10, 12, 14, 14, 12, 10, 8)):
        c.rect(612 + (16 - wdt) // 2, 74 - i, wdt, 1, (244, 244, 238, 255))
    c.rect(630, 58, 4, 34, (236, 236, 230, 255))
    c.rect(629, 55, 6, 4, (112, 154, 124, 255))
    # vehicle gate at 99
    c.rect(596, 118, 26, 30, (58, 58, 64, 255))
    c.text_c(609, 126, "99", (206, 206, 200, 255))


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


def waterfront(c, rng):
    murray_house(c, rng, 10, SW_Y, 110, 46)
    # plaza: modern glass box
    c.rect(130, SW_Y - 4, 112, 50, (86, 92, 106, 255))
    tone(c, 130, SW_Y - 4, 112, 50, (86, 92, 106, 255))
    for i in range(5):
        c.rect(136 + i * 22, SW_Y + 4, 16, 34, GLASS)
        c.alpha_rect(136 + i * 22, SW_Y + 4, 16, 34, (255, 230, 180), 40)
        for k in range(4):
            c.hline(136 + i * 22, SW_Y + 8 + k * 8, 16, GLASS2)
    c.rect(126, SW_Y - 12, 120, 10, (64, 70, 84, 255))
    c.text(140, SW_Y - 10, "stanley plaza", (150, 210, 220, 255))
    bus_terminus(c, rng)


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

    # ---- north: the village shops
    tenement(c, rng, 8, 60, 88, 108, PLASTER, (120, 92, 78, 255),
             awning_cols=((150, 62, 70, 255), (196, 96, 100, 255)))
    sign_cjk(c, 22, 106, "茶餐廳", NEON_P, size=16)
    tenement(c, rng, 104, 52, 96, 116, (196, 176, 156, 255), (104, 84, 74, 255),
             awning_cols=((62, 130, 140, 255), (104, 186, 196, 255)))
    sign_cjk(c, 118, 100, "赤柱餐廳", NEON_C, size=16)
    tenement(c, rng, 208, 66, 60, 102, (188, 170, 154, 255), (110, 88, 78, 255),
             sign="store", sign_colour=NEON_G)
    tenement(c, rng, 276, 58, 96, 110, (176, 164, 148, 255), (98, 80, 70, 255),
             awning_cols=((176, 66, 62, 255), (222, 214, 190, 255)))
    sign_cjk(c, 288, 104, "赤柱市場", GOLD, size=15)
    # market stalls on the pavement
    for i, col in enumerate(((176, 66, 62, 255), (62, 130, 140, 255), (196, 160, 74, 255))):
        sx = 286 + i * 28
        c.rect(sx, NPAV_Y - 14, 24, 12, col)
        c.hline(sx, NPAV_Y - 14, 24, tuple(min(255, ch + 30) for ch in col[:3]) + (255,))
        c.vline(sx + 4, NPAV_Y - 2, 4, (86, 74, 60, 255))
        c.vline(sx + 19, NPAV_Y - 2, 4, (86, 74, 60, 255))

    college(c, rng)
    prison(c, rng)
    fort(c)

    # trees and lamps along the north pavement
    for tx in (100, 200, 268, 372, 550):
        tree(c, tx, NPAV_Y - 18, 8, rng)
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

    wet(c, rng, [(52, NEON_P, 8), (140, NEON_C, 10), (300, GOLD, 7), (620, (200, 70, 70), 6)])

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
