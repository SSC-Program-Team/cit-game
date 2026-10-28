"""Mockup 01 (v4) — Tung Tau Wan Road, Stanley.

Real geography, compressed into one screen: Stanley Village shops at the west end
(the tea shop, a PP restaurant, the minibus stop), the Old Police Station, the college
wall and gate at 22, the path down to the beach, the prison wall with its mosque at
53 and gate at 99, and the fort gate closing the east end. Sea to the south.
"""
from __future__ import annotations

import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P  # noqa: E402
import ui  # noqa: E402
import wire  # noqa: E402

W, H = 384, 216

ROAD_Y, ROAD_H = 114, 36
WALK_N = 98
WALK_S = 150

ASP = (36, 38, 50, 255)
ASP_2 = (31, 33, 43, 255)
WALK = (104, 102, 116, 255)
WALK_2 = (94, 92, 106, 255)
CURB = (128, 126, 136, 255)
GRASS = (58, 84, 62, 255)
GRASS_2 = (48, 72, 54, 255)
BRICK = (138, 66, 58, 255)
BRICK_2 = (112, 50, 46, 255)
STONE = (150, 146, 138, 255)
STONE_2 = (122, 118, 112, 255)
PRISON = (130, 128, 132, 255)
PRISON_2 = (100, 98, 104, 255)
SAND = (214, 198, 152, 255)
SAND_2 = (196, 180, 136, 255)
SEA = (32, 92, 112, 255)
SEA_2 = (26, 76, 96, 255)


def pavement(c: Canvas, y, h):
    c.rect(0, y, W, h, WALK)
    for tx in range(0, W, 8):
        c.vline(tx, y, h, WALK_2)
    c.hline(0, y, W, CURB)


def land(c: Canvas):
    c.rect(0, 0, W, WALK_N, GRASS)
    c.dither(0, 0, W, WALK_N, GRASS_2, 3)


def sea(c: Canvas):
    c.rect(0, 176, W, 40, SEA)
    c.dither(0, 176, W, 14, SEA_2, 3)
    for i in range(0, W, 12):
        c.hline(i + 2, 184 + (i // 12) % 3, 6, (150, 200, 214, 255))
        c.hline(i + 6, 204 + (i // 12) % 4, 5, (96, 160, 178, 255))


def beach(c: Canvas):
    c.rect(0, 160, W, 18, SAND)
    c.dither(0, 160, W, 18, SAND_2, 2)
    for i in range(3):
        c.rect(206, 150 + i * 4, 18, 3, STONE)
        c.hline(206, 150 + i * 4, 18, STONE_2)


def wall(c: Canvas, x, y, w, h, face, face2, pillars=24, wire_top=False):
    c.rect(x, y, w, h, face)
    c.hline(x, y, w, tuple(min(255, ch + 18) for ch in face[:3]) + (255,))
    for px in range(x, x + w, pillars):
        c.rect(px, y - 2, 3, h + 2, face2)
    if wire_top:
        c.hline(x, y - 3, w, (70, 70, 76, 255))
        for i in range(x, x + w, 4):
            c.set(i, y - 2, (96, 96, 102, 255))
            c.set(i + 2, y - 4, (96, 96, 102, 255))


def brick_block(c: Canvas, x, y, w, h, rng):
    c.rect(x, y, w, h, BRICK)
    for ty in range(y + 2, y + h, 4):
        c.hline(x, ty, w, BRICK_2)
    c.rect(x - 2, y - 6, w + 4, 7, (76, 52, 50, 255))
    c.hline(x - 2, y - 6, w + 4, (96, 68, 64, 255))
    for wx in range(x + 4, x + w - 6, 10):
        c.rect(wx, y + 3, 6, 7, (34, 40, 52, 255))
        c.rect(wx, y + 3, 6, 2, (255, 214, 150, 255) if rng.random() < 0.5 else (60, 70, 88, 255))


def sports_field(c: Canvas, x, y, w, h):
    c.rect(x, y, w, h, (64, 104, 72, 255))
    c.dither(x, y, w, h, (56, 92, 64, 255), 2)
    c.frame(x + 2, y + 3, w - 6, h - 6, (206, 210, 200, 255))
    c.hline(x + w // 2 - 6, y + h // 2, 12, (206, 210, 200, 255))


def tree(c: Canvas, x, y, r=5):
    c.rect(x - 1, y + r - 2, 3, 6, (72, 58, 44, 255))
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                c.set(x + dx, y + dy, (46, 82, 56, 255))
    for dy in range(-r + 2, r - 1):
        for dx in range(-r + 2, r - 1):
            if dx * dx + dy * dy <= (r - 2) ** 2:
                c.set(x + dx, y + dy, (58, 100, 68, 255))


def mosque(c: Canvas, x, y):
    c.rect(x, y + 6, 14, 10, (226, 226, 222, 255))
    for i, wdt in enumerate((8, 10, 12, 12, 10, 8, 6)):
        c.rect(x + (14 - wdt) // 2, y + 6 - i, wdt, 1, (238, 238, 232, 255))
    c.rect(x + 16, y - 6, 3, 22, (232, 232, 226, 255))
    c.rect(x + 15, y - 8, 5, 3, (110, 150, 120, 255))


def tower(c: Canvas, x, y):
    c.rect(x, y, 12, 22, PRISON)
    c.rect(x - 1, y - 4, 14, 5, (86, 84, 90, 255))
    c.rect(x + 2, y + 4, 8, 6, (40, 42, 50, 255))
    c.vline(x, y, 22, PRISON_2)


def shop(c: Canvas, x, y, w, h, label, colour, awning, cjk=None, size=10):
    c.rect(x, y, w, h, (74, 64, 62, 255))
    c.rect(x, y + h - 9, w, 9, (40, 36, 36, 255))
    c.alpha_rect(x + 2, y + h - 8, w - 4, 7, (255, 214, 150), 115)
    for i in range(3):
        c.vline(x + 4 + i * 6, y + h - 8, 7, (120, 96, 76, 255))
    c.rect(x, y + h - 12, w, 3, awning)
    sw = (len(cjk) * 10 + 6) if cjk else (len(label) * 6 + 6)
    c.rect(x + 2, y + 3, max(sw, 20), 11, (26, 22, 26, 255))
    c.frame(x + 2, y + 3, max(sw, 20), 11, colour)
    if cjk:
        step = min(10, (w - 6) // max(1, len(cjk)))
        for i, ch in enumerate(cjk):
            c.cjk(x + 3 + i * step, y + 3, ch, size=min(size, step), color=colour)
    else:
        c.text(x + 4, y + 5, label, colour)


def police_post(c: Canvas, x, y, w, h):
    c.rect(x, y, w, h, (222, 220, 214, 255))
    c.hline(x, y, w, (240, 238, 232, 255))
    c.rect(x, y + h - 8, w, 8, (60, 66, 86, 255))
    c.rect(x + 4, y + h - 7, 10, 6, (140, 170, 200, 255))
    c.rect(x + w - 10, y + 4, 5, 5, (90, 150, 230, 255))
    c.alpha_rect(x + w - 13, y + 1, 11, 11, (90, 150, 230), 40)
    c.text(x + 4, y + 22, "police", (40, 58, 96, 255))


def vehicles(c: Canvas):
    c.rect(40, ROAD_Y + 8, 46, 18, (232, 230, 220, 255))
    c.rect(40, ROAD_Y + 8, 46, 6, (60, 130, 96, 255))
    c.rect(44, ROAD_Y + 15, 12, 7, (150, 180, 196, 255))
    c.rect(60, ROAD_Y + 15, 12, 7, (150, 180, 196, 255))
    c.rect(74, ROAD_Y + 15, 8, 7, (150, 180, 196, 255))
    c.rect(292, ROAD_Y + 2, 62, 30, (198, 62, 66, 255))
    c.rect(292, ROAD_Y + 2, 62, 9, (150, 40, 44, 255))
    for i in range(5):
        c.rect(296 + i * 11, ROAD_Y + 12, 9, 7, (170, 200, 214, 255))
        c.rect(296 + i * 11, ROAD_Y + 22, 9, 6, (170, 200, 214, 255))


def player(c: Canvas, x, y):
    c.alpha_rect(x - 1, y + 12, 12, 3, P["ink"], 120)
    c.rect(x + 2, y, 7, 5, P["hair"])
    c.rect(x + 3, y + 4, 5, 3, P["skin"])
    c.rect(x + 1, y + 7, 9, 5, P["shirt"])
    c.rect(x + 2, y + 12, 3, 2, P["trouser"])
    c.rect(x + 6, y + 12, 3, 2, P["trouser"])


def npc(c: Canvas, x, y, shirt, apron=False):
    c.alpha_rect(x - 1, y + 12, 12, 3, P["ink"], 110)
    c.rect(x + 2, y, 7, 5, P["grey_dk"])
    c.rect(x + 3, y + 4, 5, 3, P["skin"])
    c.rect(x + 1, y + 7, 9, 5, shirt)
    if apron:
        c.rect(x + 2, y + 8, 7, 3, (214, 92, 108, 255))
    c.rect(x + 2, y + 12, 3, 2, P["trouser"])
    c.rect(x + 6, y + 12, 3, 2, P["trouser"])


def marker(c: Canvas, x, y, glyph="!", colour=None):
    colour = colour or P["neon_amber"]
    c.rect(x, y, 9, 11, P["ink"])
    c.frame(x, y, 9, 11, colour)
    c.text_c(x + 4, y + 2, glyph, colour)


def render(with_wire=True) -> Canvas:
    rng = random.Random(31)
    c = Canvas(W, H, GRASS)
    land(c)
    pavement(c, WALK_N, 16)
    c.rect(0, ROAD_Y, W, ROAD_H, ASP)
    c.dither(0, ROAD_Y, W, ROAD_H, ASP_2, 3)
    c.hline(0, ROAD_Y, W, CURB)
    c.hline(0, ROAD_Y + ROAD_H - 1, W, CURB)
    for tx in range(0, W - 9, 18):
        c.rect(tx, ROAD_Y + ROAD_H // 2 - 1, 9, 2, (204, 198, 156, 255))
    pavement(c, WALK_S, 10)
    beach(c)
    sea(c)

    # ---- west end: Stanley Village
    shop(c, 0, 58, 32, 40, "", P["neon_pink"], (146, 58, 66, 255), cjk="茶餐廳")
    shop(c, 34, 66, 30, 32, "pp", P["neon_cyan"], (58, 118, 128, 255))
    for i in range(5):
        c.rect(35 + i * 6, 84, 3, 12, (86, 160, 172, 255))
    shop(c, 66, 74, 24, 24, "shop", P["neon_green"], (60, 110, 90, 255))
    c.rect(92, 82, 12, 16, (92, 86, 96, 255))          # minibus shelter
    c.rect(92, 82, 12, 3, CURB)
    police_post(c, 106, 60, 44, 38)
    marker(c, 44, 82)

    # ---- the college, 22: wall, a real gate opening, brick block beside it
    wall(c, 138, 92, 34, 10, STONE, STONE_2, pillars=18)
    wall(c, 194, 92, 22, 10, STONE, STONE_2, pillars=18)
    c.rect(172, 88, 20, 14, (60, 62, 54, 255))          # driveway through the gate
    c.rect(170, 84, 4, 20, STONE)                       # gate pillars
    c.rect(190, 84, 4, 20, STONE)
    c.rect(174, 79, 16, 7, (226, 226, 214, 255))
    c.text_c(182, 79, "ssc", (60, 64, 52, 255))
    brick_block(c, 142, 48, 26, 32, rng)
    brick_block(c, 200, 54, 18, 26, rng)
    sports_field(c, 224, 62, 28, 26)
    for (tx, ty) in ((196, 44), (256, 52)):
        tree(c, tx, ty, 5)

    # ---- beach path and lamp
    c.rect(246, 110, 24, 4, STONE)
    c.alpha_rect(250, WALK_N - 2, 20, 12, (255, 210, 150), 22)
    c.rect(259, WALK_N + 2, 2, 10, P["grey_dk"])
    c.rect(257, WALK_N + 1, 6, 2, (236, 230, 212, 255))

    # ---- the prison, 99 (mosque at 53 inside the wall)
    wall(c, 276, 68, 92, 28, PRISON, PRISON_2, pillars=24, wire_top=True)
    tower(c, 286, 44)
    mosque(c, 336, 46)
    c.rect(322, 78, 20, 18, (58, 58, 64, 255))
    c.text_c(332, 84, "99", (196, 196, 190, 255))

    # ---- east end: the fort gate closes the map
    c.rect(366, 54, 18, 48, (78, 80, 88, 255))
    c.rect(368, 96, 14, 4, (222, 214, 190, 255))
    c.rect(368, 96, 3, 18, (222, 214, 190, 255))
    # stop sign: shape carries the meaning, no clipping text
    c.rect(368, 62, 12, 12, (196, 54, 58, 255))
    c.rect(369, 61, 10, 14, (196, 54, 58, 255))
    c.rect(367, 64, 14, 8, (196, 54, 58, 255))
    c.frame(369, 63, 10, 10, (236, 236, 232, 255))

    vehicles(c)
    player(c, 196, 102)
    npc(c, 38, 100, P["white"], apron=True)

    if with_wire:
        wire.bar(c, "distress", "POS OFFLINE AT THE VILLAGE TEA SHOP - 45 MIN LEFT",
                 w=W, queue=(4, 1), dwell=0.4)
        y = 16 + wire.H
        ui.scrim(c, 0, y - 4, W, 14, 150)
        ui.scrim(c, 0, y - 4, 130, 14, 176)
        c.text(8, y, "tung tau wan rd", P["grey"])
        c.text(274, y, "18:40", P["white"])
        c.text(312, y, "$1,280", P["gold"])
        ui.bolt(c, 352, y - 1)
        ui.energy(c, 358, y, 3)
        ui.prompt(c, 196, ["[e] talk to chan tai", "[m] map", "[tab] jobs"], active=0)
    return c


def main():
    render().save("01-city-night.png", scale=3)


if __name__ == "__main__":
    main()
