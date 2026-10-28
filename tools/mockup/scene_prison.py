"""Mockup 08 — getting caught: Stanley Prison, and the case sheet that teaches the law.

Deliberately the opposite of the city: concrete, fluorescence, no neon, no rain. The one
paper on the table is the whole screen — what you did, which ordinance, what it cost.
"""
from __future__ import annotations

import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P  # noqa: E402
import ui  # noqa: E402

W, H = 384, 216

WALL = (72, 74, 82, 255)
WALL_2 = (62, 64, 72, 255)
FLOOR = (58, 60, 68, 255)
FLOOR_2 = (50, 52, 60, 255)
STEEL = (108, 112, 122, 255)
STEEL_2 = (84, 88, 98, 255)
PAPER = (226, 222, 208, 255)
INK = (34, 36, 42, 255)
INK_2 = (86, 88, 96, 255)
RED_STAMP = (150, 52, 56, 255)


def room(c: Canvas, rng):
    c.rect(0, 0, W, 150, WALL)
    for ty in range(0, 150, 4):
        c.hline(0, ty, W, WALL_2)
    c.rect(0, 150, W, H - 150, FLOOR)
    for fx in range(0, W, 16):
        c.vline(fx, 150, H - 150, FLOOR_2)
    c.hline(0, 150, W, (40, 42, 48, 255))

    # barred window, high on the wall, daylight through the slats
    c.rect(268, 26, 96, 56, (34, 36, 44, 255))
    c.frame(268, 26, 96, 56, STEEL_2)
    for i in range(0, 96, 8):
        c.rect(268 + i + 3, 28, 2, 52, (120, 124, 134, 255))
    c.hline(268, 54, 96, (120, 124, 134, 255))
    c.alpha_rect(272, 28, 88, 50, (226, 226, 214), 54)
    # light falling on the floor
    for i in range(6):
        c.alpha_rect(150 + i * 4, 150 - i, 200, 2 + i, (232, 230, 216), 12)

    # strip light overhead
    c.rect(120, 6, 140, 4, (240, 240, 230, 255))
    c.alpha_rect(110, 10, 160, 26, (226, 226, 214), 22)

    # steel table, bolted down
    c.rect(52, 132, 252, 10, STEEL)
    c.hline(52, 132, 252, (150, 154, 164, 255))
    c.hline(52, 141, 252, (62, 66, 74, 255))
    c.rect(60, 140, 6, 40, STEEL_2)
    c.rect(290, 140, 6, 40, STEEL_2)

    # plastic stool, guard standing at the far side
    c.rect(52, 168, 26, 6, (86, 90, 100, 255))
    c.rect(56, 174, 4, 18, STEEL_2)
    c.rect(70, 174, 4, 18, STEEL_2)
    c.rect(330, 96, 16, 54, (44, 46, 54, 255))      # guard, back turned
    c.rect(332, 88, 12, 10, (48, 50, 58, 255))
    c.rect(332, 100, 12, 4, (96, 100, 112, 255))
    c.rect(334, 150, 4, 18, (36, 38, 44, 255))
    c.rect(342, 150, 4, 18, (36, 38, 44, 255))


def case_sheet(c: Canvas):
    x, y, w, h = 40, 62, 216, 74
    c.rect(x + 2, y + 2, w, h, (26, 28, 34, 255))    # shadow
    ui.paper(c, x, y, w, h, PAPER)
    c.text(x + 8, y + 6, "case a-2204", INK)
    c.text_r(x + w - 8, y + 6, "stanley", INK_2)
    c.hline(x + 8, y + 15, w - 16, (176, 172, 158, 255))
    rows = [
        ("offence", "unauthorised access"),
        ("law", "cap 200 s161"),
        ("evidence", "session left open"),
        ("result", "2 blocks, $1,500"),
    ]
    ry = y + 19
    for k, v in rows:
        c.text(x + 8, ry, k, INK_2)
        c.text(x + 62, ry, v, INK)
        ry += 9
    c.hline(x + 8, ry + 2, w - 16, (176, 172, 158, 255))
    c.text(x + 8, ry + 7, "should have: written permission", (52, 74, 56, 255))
    # stamp
    c.frame(x + w - 84, y + 3, 76, 11, RED_STAMP)
    c.text_c(x + w - 46, y + 5, "on record", RED_STAMP)


def side(c: Canvas):
    x, y = 8, 158
    ui.scrim(c, x, y, 128, 26, 215)
    c.text(x + 6, y + 4, "record 1 of 3", P["white"])
    c.text(x + 6, y + 14, "stanley rep -15", P["grey"])


def top(c: Canvas):
    y = 12
    ui.scrim(c, 0, y, W, 14, 190)
    c.text(8, y + 4, "stanley prison - room 4", P["white"])
    c.text_r(376, y + 4, "day 12  09:15", P["grey"])


def bottom(c: Canvas):
    ui.prompt(c, 196, ["[enter] sign", "[h] ask for a lawyer"], active=0)
    c.text(8, 208, "released after 2 blocks - the record stays 30 days", P["grey"])


def main():
    rng = random.Random(2)
    c = Canvas(W, H, WALL)
    room(c, rng)
    case_sheet(c)
    side(c)
    top(c)
    bottom(c)
    c.save("08-prison.png", scale=3)


if __name__ == "__main__":
    main()
