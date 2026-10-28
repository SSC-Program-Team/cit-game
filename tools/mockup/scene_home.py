"""Mockup 03 — the housing milestone: wiring your own flat, scored on coverage/cost/security."""
from __future__ import annotations

import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P  # noqa: E402

W, H = 384, 216

FLOOR = (74, 62, 56, 255)
FLOOR_2 = (66, 55, 51, 255)
WALL = (206, 198, 210, 255)
WALL_DK = (146, 140, 154, 255)
FURN = (52, 50, 68, 255)
DOOR = (168, 128, 82, 255)
LBL = (150, 138, 132, 255)


def room(c: Canvas, x, y, w, h, label=None):
    c.rect(x, y, w, h, FLOOR)
    for ty in range(y + 3, y + h, 8):
        c.hline(x + 1, ty, w - 1, FLOOR_2)
    c.hline(x, y, w, WALL)
    c.vline(x, y, h, WALL)
    c.hline(x, y + h, w, WALL)
    c.vline(x + w, y, h, WALL)
    # room labels are drawn in a final pass so nothing covers them


def coverage(c: Canvas, cx, cy, radius, colour, rings=3):
    for r in range(radius, radius - rings * 5, -5):
        for a in range(0, 360, 2):
            x = int(cx + r * math.cos(math.radians(a)))
            y = int(cy + r * math.sin(math.radians(a)) * 0.62)
            if (x + y) % 3 != 0:
                c.set(x, y, colour)


def door(c: Canvas, x, y, horizontal=True):
    if horizontal:
        c.rect(x, y, 9, 2, DOOR)
    else:
        c.rect(x, y, 2, 9, DOOR)


ROOM_LABELS = [
    (7, 7, "living"), (99, 7, "bedroom 1"),    (177, 17, "kitchen"),
    (177, 51, "bath"), (7, 77, "study / bed 2"), (99, 77, "corridor"),
    (177, 97, "rack"),
]


def plan() -> Canvas:
    p = Canvas(244, 152, (22, 22, 30, 255))
    room(p, 4, 4, 88, 66, "living")
    room(p, 96, 4, 74, 66, "bedroom 1")
    room(p, 174, 4, 66, 42, "kitchen")
    room(p, 174, 48, 66, 42, "bath")
    room(p, 4, 74, 88, 74, "study / bed 2")
    room(p, 96, 74, 74, 74, "corridor")
    room(p, 174, 94, 66, 54, "rack")

    door(p, 88, 80)       # living -> corridor
    door(p, 96, 70)       # bed 1 -> corridor
    door(p, 174, 68, False)   # bath -> corridor
    door(p, 174, 120, False)  # rack -> corridor
    door(p, 174, 22, False)   # kitchen -> corridor
    door(p, 130, 146)     # front door
    door(p, 4, 104)       # study -> outside (window)

    # living: sofa, tv, table
    p.rect(10, 30, 30, 10, (96, 78, 106, 255))
    p.rect(10, 28, 30, 2, (120, 100, 130, 255))
    p.rect(58, 8, 24, 12, FURN)
    p.rect(60, 10, 20, 8, (64, 74, 102, 255))
    p.rect(30, 46, 16, 8, (78, 66, 88, 255))
    # kitchen counter
    p.rect(178, 6, 58, 8, (70, 66, 82, 255))
    p.rect(178, 6, 58, 2, (120, 116, 132, 255))
    # bath fixtures
    p.rect(180, 52, 14, 12, (66, 84, 96, 255))
    p.rect(206, 52, 10, 8, (200, 204, 214, 255))
    # bed 1
    p.rect(102, 10, 36, 34, (72, 60, 78, 255))
    p.rect(104, 12, 32, 10, (116, 100, 124, 255))
    p.rect(160, 10, 6, 20, FURN)
    # study desk + workstation + nas
    p.rect(8, 112, 44, 12, (72, 64, 76, 255))
    p.rect(14, 106, 16, 8, (86, 200, 210, 255))
    p.rect(36, 108, 4, 4, (40, 42, 54, 255))
    p.rect(58, 108, 10, 18, (52, 60, 78, 255))
    p.rect(59, 110, 8, 2, P["neon_green"])
    p.rect(58, 118, 10, 2, P["grey_dk"])
    # rack cabinet in the utility room
    p.rect(186, 106, 34, 28, (44, 46, 58, 255))
    p.frame(186, 106, 34, 28, (96, 100, 118, 255))
    for i in range(4):
        p.rect(189, 110 + i * 5, 28, 3, (60, 64, 80, 255))
        p.set(190, 111 + i * 5, P["neon_green"] if i % 2 == 0 else P["neon_amber"])

    # fibre entry by the front door
    p.rect(150, 130, 11, 8, (150, 150, 162, 255))
    p.rect(151, 131, 9, 3, P["neon_amber"])
    p.text(140, 122, "fibre", P["neon_amber"])
    # router on the tv cabinet
    p.rect(66, 22, 12, 7, (60, 64, 82, 255))
    p.rect(67, 23, 10, 2, P["neon_cyan"])
    p.vline(69, 17, 5, P["grey_dk"])
    p.vline(74, 17, 5, P["grey_dk"])
    # ceiling APs
    p.rect(128, 30, 8, 6, (240, 240, 246, 255))
    p.rect(129, 31, 6, 1, P["neon_cyan"])
    p.rect(130, 100, 8, 6, (240, 240, 246, 255))
    p.rect(131, 101, 6, 1, P["neon_cyan"])

    # cat6 runs along the skirting
    runs = [(156, 134, 100, 138), (100, 138, 72, 30), (72, 30, 128, 36),
            (128, 36, 132, 106), (132, 106, 186, 112), (60, 116, 100, 138)]
    for (x1, y1, x2, y2) in runs:
        steps = max(abs(x2 - x1), abs(y2 - y1))
        for i in range(steps):
            if i % 4 < 2:
                p.set(x1 + (x2 - x1) * i // steps, y1 + (y2 - y1) * i // steps, (255, 200, 74, 255))

    # coverage: wired backhaul gives three clean cells
    coverage(p, 72, 26, 42, (70, 224, 230, 255))
    coverage(p, 131, 33, 40, (70, 224, 230, 255))
    coverage(p, 133, 103, 34, (70, 224, 230, 255))

    for (x, y, label) in ROOM_LABELS:
        p.alpha_rect(x, y, len(label) * 6 + 4, 9, (22, 22, 30), 238)
        p.text(x + 2, y + 1, label, LBL)
    return p


def right_panel(c: Canvas):
    x, y, w, h = 258, 26, 118, 150
    c.panel(x, y, w, h, border=P["neon_cyan"], title="build", title_c=P["neon_cyan"])
    c.text(x + 6, y + 6, "2b flat tsuen wan", P["grey"])
    c.text(x + 6, y + 15, "spent $5,240", P["white"])
    c.text_r(x + w - 6, y + 15, "$8k", P["gold"])
    c.meter(x + 6, y + 24, w - 12, 5, 0.65, P["gold"])

    rows = [
        ("isp 1g fibre", "ok", P["neon_green"]),
        ("wired backhaul", "ok", P["neon_green"]),
        ("cable runs", "4", P["white"]),
        ("iot vlan", "on", P["neon_cyan"]),
        ("guest ssid", "off", P["grey"]),
        ("ups on ont", "-", P["grey"]),
    ]
    ry = y + 36
    for (label, val, col) in rows:
        c.text(x + 6, ry, label, P["grey"])
        c.text_r(x + w - 6, ry, val, col)
        ry += 8

    c.hline(x + 4, ry, w - 8, P["grey_dk"])
    ry += 6
    for (label, pct, col) in (("coverage 92", 0.92, P["neon_cyan"]),
                              ("cost 76", 0.76, P["gold"]),
                              ("security 84", 0.84, P["neon_green"])):
        c.text(x + 6, ry, label, P["white"])
        c.meter(x + 6, ry + 8, w - 12, 3, pct, col)
        ry += 15

    c.text(x + 6, y + h - 13, "+15% remote pay", P["neon_green"])


def top(c: Canvas):
    c.panel(6, 5, 190, 13, border=P["grey"])
    c.text(10, 8, "home network - sat 21:10", P["white"])
    c.panel(200, 5, 178, 13, border=P["gold"])
    c.text(204, 8, "owned flat", P["white"])
    c.text_r(374, 8, "year 2 wk 12", P["grey"])


def bottom(c: Canvas):
    y = 182
    c.alpha_rect(0, y, W, H - y, P["ink"], 215)
    c.hline(0, y, W, P["grey_dk"])
    c.text(6, y + 6, "click place  r rotate  del remove  enter deploy", P["white"])
    c.text(6, y + 16, "concrete walls eat 5ghz - wired beats mesh here", P["grey"])
    c.text_r(376, y + 6, "score 84", P["neon_cyan"])


def main():
    c = Canvas(W, H, P["night0"])
    c.rect(0, 0, W, H, (20, 21, 30, 255))
    c.paste(plan(), 8, 26)
    c.frame(8, 26, 244, 152, P["grey_dk"])
    top(c)
    right_panel(c)
    bottom(c)
    c.save("03-home-network.png", scale=3)


if __name__ == "__main__":
    main()
