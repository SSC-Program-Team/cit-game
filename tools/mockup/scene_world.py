"""Mockup 01 (v3) — the overworld: a top-down district you walk around.

Open-world RPG means the world is the menu. Districts are tile maps you can walk,
interiors are entered through doors, and jobs live at addresses rather than in a
list. The work itself still zooms to the desk (mockup 02).
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
T = 12                      # tile size

ROAD_Y = 96                 # horizontal street, 3 tiles
ROAD_X = 168                # vertical street, 3 tiles
ASPH = (34, 36, 48, 255)
ASPH_2 = (30, 32, 42, 255)
WALK = (100, 98, 112, 255)
WALK_2 = (90, 88, 102, 255)
CURB = (120, 118, 128, 255)
ROOF = (46, 48, 62, 255)
ROOF_2 = (38, 40, 52, 255)
FACE = (92, 84, 104, 255)


def sidewalk(c: Canvas, x, y, w, h):
    c.rect(x, y, w, h, WALK)
    for tx in range(x, x + w, 6):
        c.vline(tx, y, h, WALK_2)
    for ty in range(y, y + h, 6):
        c.hline(x, ty, w, WALK_2)


def road(c: Canvas, x, y, w, h, vertical=False):
    c.rect(x, y, w, h, ASPH)
    c.dither(x, y, w, h, ASPH_2, 3)
    if vertical:
        for ty in range(y, y + h, 16):
            c.rect(x + w // 2 - 1, ty, 2, 8, (200, 194, 150, 255))
        c.vline(x, y, h, CURB)
        c.vline(x + w - 1, y, h, CURB)
    else:
        for tx in range(x, x + w, 16):
            c.rect(tx, y + h // 2 - 1, 8, 2, (200, 194, 150, 255))
        c.hline(x, y, w, CURB)
        c.hline(x, y + h - 1, w, CURB)


def building(c: Canvas, x, y, w, h, rng, sign=None, sign_colour=None, awning=None,
             shop=True):
    """Top-down block: roof you could walk past, front face along the bottom edge."""
    c.rect(x, y, w, h, ROOF)
    # roof texture: vents, tanks, stairwell, water pipes
    for _ in range(w * h // 90):
        vx = rng.randrange(x + 4, x + w - 10)
        vy = rng.randrange(y + 4, y + h - 16)
        c.rect(vx, vy, rng.choice((5, 7, 9)), rng.choice((4, 6)), ROOF_2)
    c.rect(x + w - 22, y + 6, 12, 10, (70, 72, 88, 255))     # stairwell hut
    c.rect(x + 6, y + h - 22, 10, 8, (44, 46, 58, 255))      # tank
    for i in range(3):
        c.hline(x + 4 + i * 3, y + 4, w - 8, (66, 68, 84, 255))
    # front face: the part you actually see from the street
    c.rect(x, y + h - 14, w, 14, FACE)
    c.hline(x, y + h - 15, w, (96, 90, 110, 255))
    if shop:
        # shuttered or open units along the face
        for ux in range(x + 4, x + w - 12, 26):
            open_shop = rng.random() < 0.6
            c.rect(ux, y + h - 12, 20, 11, (28, 26, 32, 255))
            if open_shop:
                c.alpha_rect(ux + 1, y + h - 11, 18, 9, (255, 214, 150), 120)
                for i in range(4):
                    c.vline(ux + 3 + i * 4, y + h - 11, 9, (120, 100, 80, 255))
            else:
                for i in range(5):
                    c.hline(ux + 1, y + h - 10 + i * 2, 18, (58, 56, 66, 255))
    if awning:
        c.rect(x, y + h - 17, w, 4, awning)
        for sx in range(x, x + w, 6):
            c.vline(sx, y + h - 17, 4, tuple(max(0, ch - 24) for ch in awning[:3]) + (255,))
    if sign:
        sw = len(sign) * 11 + 6
        sx = x + min(4, max(2, w - sw - 2))
        c.rect(sx, y + h - 30, sw, 13, (26, 22, 26, 255))
        c.frame(sx, y + h - 30, sw, 13, tuple(min(255, ch + 30) for ch in (sign_colour or P["neon_pink"])[:3]) + (255,))
        for i, ch in enumerate(sign):
            c.cjk(sx + 3 + i * 11, y + h - 29, ch, size=10, color=sign_colour or P["neon_pink"])


def lamp(c: Canvas, x, y):
    c.alpha_rect(x - 9, y - 6, 18, 12, (255, 210, 150), 26)
    c.alpha_rect(x - 5, y - 4, 10, 8, (255, 214, 158), 26)
    c.rect(x - 1, y - 2, 3, 3, (236, 230, 212, 255))


def stall(c: Canvas, x, y, colour):
    c.rect(x, y, 22, 12, colour)
    c.hline(x, y, 22, tuple(min(255, ch + 30) for ch in colour[:3]) + (255,))
    for i in range(4):
        c.vline(x + 2 + i * 5, y + 2, 9, (40, 36, 40, 255))


def player(c: Canvas, x, y, step=0):
    c.alpha_rect(x - 1, y + 12, 12, 3, P["ink"], 120)
    c.rect(x + 2, y, 7, 5, P["hair"])
    c.rect(x + 3, y + 4, 5, 3, P["skin"])
    c.rect(x + 1, y + 7, 9, 5, P["shirt"])
    c.rect(x + 2, y + 12, 3, 2 + (step % 2), P["trouser"])
    c.rect(x + 6, y + 12, 3, 2 + ((step + 1) % 2), P["trouser"])


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
    """Encounter marker: the open-world replacement for a quest log entry."""
    colour = colour or P["neon_amber"]
    c.rect(x, y, 9, 11, P["ink"])
    c.frame(x, y, 9, 11, colour)
    c.text_c(x + 4, y + 2, glyph, colour)


def wet(c, rng):
    for _ in range(70):
        x, y = rng.randrange(0, W), rng.randrange(84, H)
        c.set(x, y, (120, 150, 180, 255))


def render(with_wire=True) -> Canvas:
    rng = random.Random(21)
    c = Canvas(W, H, ASPH)

    # streets first, so buildings sit on top of them
    sidewalk(c, 0, ROAD_Y - 12, W, 12)                 # north walk
    sidewalk(c, 0, ROAD_Y + 36, W, 12)                 # south walk
    road(c, 0, ROAD_Y, W, 36)
    c.rect(ROAD_X, 0, 36, H, ASPH)                      # cross street
    road(c, ROAD_X, ROAD_Y - 12, 36, ROAD_Y + 48, vertical=True)
    sidewalk(c, ROAD_X - 12, 0, 12, H)
    sidewalk(c, ROAD_X + 36, 0, 12, H)

    # north blocks
    building(c, 4, 12, 68, ROAD_Y - 26, rng, sign="茶餐廳", sign_colour=P["neon_pink"],
             awning=(150, 60, 70, 255))
    building(c, 78, 20, 44, ROAD_Y - 34, rng, sign="五金", sign_colour=P["neon_amber"])
    building(c, 214, 16, 62, ROAD_Y - 30, rng, sign="電腦", sign_colour=P["neon_cyan"],
             awning=(60, 120, 130, 255))
    building(c, 282, 24, 96, ROAD_Y - 38, rng, sign="網吧", sign_colour=P["neon_amber"])
    # south blocks
    building(c, 8, ROAD_Y + 52, 74, H - ROAD_Y - 68, rng, sign="士多", sign_colour=P["neon_green"])
    building(c, 88, ROAD_Y + 60, 66, H - ROAD_Y - 76, rng)
    building(c, 216, ROAD_Y + 56, 60, H - ROAD_Y - 72, rng, sign="電器", sign_colour=P["neon_cyan"])
    building(c, 284, ROAD_Y + 48, 94, H - ROAD_Y - 62, rng, sign="找換", sign_colour=P["neon_pink"])

    # street furniture
    for lx in (60, 250, 330):
        lamp(c, lx, ROAD_Y - 8)
    stall(c, 132, ROAD_Y - 11, (168, 60, 62, 255))
    stall(c, 296, ROAD_Y + 48, (60, 110, 130, 255))
    # MTR entrance on the south walk, clear of the prompt line
    c.rect(114, ROAD_Y + 28, 34, 20, (40, 44, 58, 255))
    c.frame(114, ROAD_Y + 28, 34, 20, P["neon_red"])
    c.text_c(131, ROAD_Y + 34, "mtr", P["white"])
    c.text_c(131, ROAD_Y + 42, "mong kok", P["grey"])
    # a van and a taxi parked
    c.rect(74, ROAD_Y + 8, 34, 18, (198, 200, 208, 255))
    c.rect(78, ROAD_Y + 12, 26, 10, (140, 170, 190, 255))
    c.rect(240, ROAD_Y + 4, 30, 18, (200, 60, 62, 255))
    c.rect(244, ROAD_Y + 8, 22, 8, (150, 190, 210, 255))

    # people: player, 陳太 outside her shop, a kid, a man with a cart
    npc(c, 62, ROAD_Y - 26, P["white"], apron=True)
    marker(c, 56, ROAD_Y - 44)
    player(c, 132, ROAD_Y - 24, step=1)
    npc(c, 232, ROAD_Y + 44, (90, 120, 170, 255))
    npc(c, 320, ROAD_Y - 22, (150, 130, 90, 255))

    wet(c, rng)

    # zebra crossings both sides of the junction
    for i in range(6):
        c.rect(ROAD_X - 12, ROAD_Y + 2 + i * 6, 12, 3, (208, 204, 190, 255))
        c.rect(ROAD_X + 36, ROAD_Y + 2 + i * 6, 12, 3, (208, 204, 190, 255))
        c.rect(ROAD_X + 2 + i * 6, ROAD_Y - 12, 3, 12, (208, 204, 190, 255))
        c.rect(ROAD_X + 2 + i * 6, ROAD_Y + 36, 3, 12, (208, 204, 190, 255))

    if with_wire:
        wire.bar(c, "distress", "POS OFFLINE IN SHAM SHUI PO - 45 MIN LEFT",
                 w=W, queue=(4, 1), dwell=0.4)
        y = 16 + wire.H
        ui.scrim(c, 0, y - 4, W, 14, 150)
        c.text(300, y, "18:40", P["white"])
        c.text(342, y, "$1,280", P["gold"])
        ui.energy(c, 388, y, 3)
        ui.prompt(c, 196, ["[e] talk to chan tai", "[m] map", "[tab] jobs"], active=0)
        c.text_r(376, 187, "sham shui po", P["grey"])
    return c


def main():
    render().save("01-city-night.png", scale=3)


if __name__ == "__main__":
    main()
