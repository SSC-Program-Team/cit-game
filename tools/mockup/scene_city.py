"""Mockup 01 — the city: Sham Shui Po street at night, HUD, sudden-mission alert."""
from __future__ import annotations

import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P, text_width  # noqa: E402
import wire  # noqa: E402

W, H = 384, 216
GROUND = 152          # pavement top
KERB = 172            # pavement/road boundary

SHIRT = {
    "h": P["hair"], "s": P["skin"], "e": P["ink"], "b": P["shirt"],
    "B": P["shirt_dk"], "p": P["trouser"], "k": P["ink"], "g": P["grey_dk"],
    "w": P["white"],
}
PLAYER = [
    "....hhhhhh....",
    "...hhhhhhhh...",
    "...hssssssh...",
    "...hsesesssh..",
    "...hssssssh...",
    "....ssssss....",
    "...bbbbbbbb...",
    "..gbbbbbbbbg..",
    "..gbbBBbbbbg..",
    "..gbbBBbbbbg..",
    "...bbbbbbbb...",
    "...pppppppp...",
    "...pppppppp...",
    "...ppp..ppp...",
    "...ppp..ppp...",
    "...kkk..kkk...",
]
UMBRELLA = [
    "..ppppppp..",
    ".ppppppppp.",
    "ppppppppppp",
]


def sky(c: Canvas, rng):
    for name, y0, y1 in (("night0", 0, 30), ("night1", 30, 58), ("night2", 58, 80)):
        c.rect(0, y0, W, y1 - y0, P[name])
    for y in range(62, 82):
        c.alpha_rect(0, y, W, 1, (72, 44, 78), int(70 * (y - 62) / 20))
    for _ in range(12):
        c.set(rng.randrange(0, W), rng.randrange(2, 36), P["grey_dk"])
    c.hline(304, 16, 4, P["grey_dk"])
    c.set(309, 15, P["neon_red"])


def skyline(c: Canvas, rng):
    towers = [
        (0, 62, 22, 70), (24, 74, 16, 58), (44, 58, 20, 74), (66, 80, 14, 52),
        (84, 66, 24, 66), (112, 86, 12, 46), (128, 54, 18, 78), (150, 72, 22, 60),
        (176, 62, 14, 70), (214, 76, 18, 56), (236, 48, 16, 84), (256, 70, 20, 62),
        (280, 84, 12, 48), (296, 66, 18, 66), (318, 58, 14, 74), (336, 78, 20, 54),
        (360, 52, 24, 80),
    ]
    for (x, y, w, h) in towers:
        c.rect(x, 118 - h, w, h, P["far"])
        for wy in range(118 - h + 3, 116, 5):
            for wx in range(x + 2, x + w - 2, 4):
                if rng.random() < 0.26:
                    c.set(wx, wy, P["far_win"])
    c.rect(344, 36, 10, 82, P["far"])
    c.vline(349, 16, 20, P["far"])
    c.set(349, 14, P["neon_red"])
    for wy in range(42, 114, 6):
        c.hline(345, wy, 8, P["far_win"])


def facade(c: Canvas, x, y, w, h, base, rng, lit=0.34):
    c.rect(x, y, w, h, base)
    for sx in range(x + 1, x + w, 9):
        c.vline(sx, y, h, tuple(min(255, ch + 5) for ch in base[:3]) + (255,))
    for wy in range(y + 5, y + h - 4, 8):
        for wx in range(x + 3, x + w - 4, 6):
            r = rng.random()
            if r < lit:
                col = P["win_lit"]
            elif r < lit + 0.08:
                col = P["win_warm"]
            elif r < lit + 0.16:
                col = P["win_tv"]
            else:
                col = P["win_dark"]
            c.rect(wx, wy, 3, 4, col)
            c.hline(wx - 1, wy + 4, 5, tuple(max(0, ch - 10) for ch in base[:3]) + (255,))
    for wy in range(y + 10, y + h - 10, 18):
        ax = x + 10 + rng.randrange(0, max(1, w - 24))
        c.rect(ax, wy, 5, 4, P["grey_dk"])
        c.vline(ax + 2, wy + 4, 2, P["grey_dk"])


def neon_v(c: Canvas, x, y, chars, color, dark):
    size = 12
    step = size + 1
    w = size + 8
    h = len(chars) * step + 4
    c.rect(x - 1, y - 1, w + 2, h + 2, P["ink"])
    c.rect(x, y, w, h, dark)
    c.frame(x, y, w, h, tuple(min(255, ch + 40) for ch in dark[:3]) + (255,))
    for i, ch in enumerate(chars):
        c.cjk(x + 4, y + 2 + i * step, ch, size=size, color=color)
    c.hline(x + 1, y - 3, 2, P["grey_dk"])
    c.hline(x + w - 3, y - 3, 2, P["grey_dk"])


def buildings(c: Canvas, rng):
    facade(c, -4, 56, 72, GROUND - 56, P["facade0"], rng)
    # bamboo scaffolding
    for i in range(2):
        c.vline(60 + i * 6, 58, GROUND - 60, (146, 116, 78, 255))
    for y in range(62, GROUND - 6, 9):
        c.hline(60, y, 7, (122, 96, 64, 255))

    facade(c, 74, 42, 62, GROUND - 42, P["facade1"], rng)
    neon_v(c, 104, 60, "茶餐廳", P["neon_pink"], (86, 26, 62, 255))
    c.rect(78, 120, 56, 32, P["ink"])
    c.alpha_rect(80, 122, 52, 24, (255, 200, 130), 75)
    for wx in range(84, 132, 11):
        c.vline(wx, 122, 24, (70, 60, 62, 255))
    c.hline(76, 117, 60, P["neon_amber"])
    c.text(84, 108, "open 24h", P["neon_amber"])

    c.rect(138, 62, 12, GROUND - 62, P["ink"])
    c.alpha_rect(138, 96, 12, 56, (255, 130, 60), 40)

    facade(c, 152, 66, 94, GROUND - 66, P["facade2"], rng)
    neon_v(c, 224, 66, "電腦", P["neon_cyan"], (20, 78, 86, 255))
    # parts shop front
    c.rect(154, 124, 90, 28, P["ink"])
    c.alpha_rect(156, 126, 86, 20, P["white"], 120)
    for sx in range(158, 240, 4):
        c.vline(sx, 126, 20, (206, 214, 224, 255) if (sx // 4) % 2 else (152, 162, 182, 255))
    c.rect(154, 118, 90, 6, P["neon_green"])

    facade(c, 250, 46, 70, GROUND - 46, P["facade3"], rng)
    neon_v(c, 292, 66, "網吧", P["neon_amber"], (88, 56, 8, 255))
    facade(c, 326, 60, 62, GROUND - 60, P["facade0"], rng)


def street(c: Canvas, rng):
    c.rect(0, GROUND, W, KERB - GROUND, P["concrete0"])
    c.dither(0, GROUND, W, 4, P["concrete1"])
    for tx in range(0, W, 16):
        c.vline(tx, GROUND + 4, KERB - GROUND - 4, P["concrete2"])
    c.hline(0, KERB - 3, W, P["concrete1"])
    c.hline(0, KERB - 2, W, P["concrete2"])

    c.rect(0, KERB, W, H - KERB, P["road"])
    c.dashed_h(0, KERB + 14, W, P["road_line"], on=6, off=9)
    c.hline(0, KERB + 2, W, P["wet"])
    c.hline(0, KERB + 6, W, P["rail"])
    c.hline(0, KERB + 26, W, P["rail"])

    # wet-road reflections: narrow, only under the signs
    for (x, colour, wdt) in ((147, P["neon_amber"], 5), (238, P["neon_cyan"], 4),
                             (306, P["neon_amber"], 4)):
        for y in range(KERB + 4, H, 3):
            c.dither(x - wdt, y, wdt * 2, 1, colour, 3)

    # MTR entrance
    c.rect(6, 126, 48, 26, P["facade0"])
    c.frame(6, 126, 48, 26, P["grey_dk"])
    c.alpha_rect(8, 128, 44, 22, (38, 58, 68), 160)
    c.rect(20, 118, 20, 10, (196, 30, 48, 255))
    c.text_c(30, 119, "mtr", P["white"])
    c.text(11, 132, "to platform", P["grey"])
    c.dither(10, 145, 40, 4, P["win_lit"], 3)

    # lamp with a warm pool
    c.rect(206, 92, 2, GROUND - 92, P["grey_dk"])
    c.hline(198, 92, 12, P["grey_dk"])
    c.rect(203, 90, 6, 3, P["neon_amber"])
    c.dither(188, GROUND - 3, 32, 5, (255, 200, 120, 255), 3)

    # stall + bin
    c.rect(120, 140, 14, 12, P["facade2"])
    c.rect(119, 138, 16, 3, P["neon_red"])
    c.rect(94, 144, 6, 8, P["grey_dk"])
    c.rect(93, 143, 8, 2, P["grey"])


def tram(c: Canvas, x, y):
    w, h = 92, 44
    c.rect(x, y, w, h, (40, 86, 74, 255))
    c.rect(x, y, w, 7, (26, 64, 56, 255))
    c.rect(x + 2, y + 9, w - 4, 14, (198, 222, 210, 255))
    for wx in range(x + 6, x + w - 8, 12):
        c.rect(wx, y + 11, 8, 10, (255, 208, 140, 255))
    c.rect(x + 2, y + 26, w - 4, 11, (198, 222, 210, 255))
    for wx in range(x + 6, x + w - 8, 12):
        c.rect(wx, y + 28, 8, 7, (132, 152, 164, 255))
    c.rect(x, y + 38, w, 6, (20, 42, 38, 255))
    c.text(x + 5, y + 39, "#62", P["win_lit"])
    c.text_r(x + w - 5, y + 39, "kenndy tn", P["win_lit"])
    c.set(x + 4, y + 3, P["neon_amber"])
    c.rect(x + 12, y + h - 2, 8, 3, P["ink"])
    c.rect(x + w - 20, y + h - 2, 8, 3, P["ink"])


def rain(c: Canvas, rng):
    for _ in range(60):
        x, y = rng.randrange(0, W), rng.randrange(0, H - 20)
        c.set(x, y, (150, 170, 200, 255))


def hud(c: Canvas, dy=0):
    c.panel(6, 5 + dy, 96, 13, border=P["grey"])
    c.text(10, 8 + dy, "day 3  18:40", P["white"])
    c.panel(276, 5 + dy, 102, 13, border=P["gold"])
    c.text(280, 8 + dy, "$1,280", P["gold"])
    c.text_r(374, 8 + dy, "xp 240", P["grey"])
    c.panel(6, 21 + dy, 96, 23, border=P["grey_dk"])
    c.text(10, 24 + dy, "energy", P["grey"])
    c.meter(54, 24 + dy, 42, 5, 0.62, P["neon_green"])
    c.text(10, 33 + dy, "focus", P["grey"])
    c.meter(54, 33 + dy, 42, 5, 0.40, P["neon_cyan"])


def incident(c: Canvas):
    x, y, w, h = 202, 100, 176, 92
    c.panel(x, y, w, h, border=P["neon_red"], title="incident", title_c=P["neon_red"])
    c.text(x + 8, y + 6, "! network down !", P["neon_red"])
    c.cjk(x + 8, y + 15, "陳太茶餐廳", size=12, color=P["white"])
    c.text(x + 8, y + 32, "pos + card reader offline", P["win_lit"])
    c.text(x + 8, y + 42, "queue out the door", P["grey"])
    c.text(x + 8, y + 54, "reward  $1,200", P["gold"])
    c.text_r(x + w - 8, y + 54, "45 min", P["neon_amber"])
    c.meter(x + 8, y + 63, w - 16, 5, 0.75, P["neon_amber"])
    c.text(x + 8, y + 71, "[y] take", P["white"])
    c.text_r(x + w - 8, y + 71, "[n] skip  -10 rep", P["grey"])


def footer(c: Canvas):
    y = 196
    c.alpha_rect(0, y, W, H - y, P["ink"], 205)
    c.hline(0, y, W, P["grey_dk"])
    c.text(8, y + 6, "wasd move", P["white"])
    c.text(62, y + 6, "e interact", P["white"])
    c.text(124, y + 6, "j jobs", P["white"])
    c.text(164, y + 6, "c console", P["white"])
    c.text_r(376, y + 6, "sham shui po", P["grey"])



def player(c: Canvas):
    x, y = 150, 134
    c.alpha_rect(x + 2, y + len(PLAYER) - 1, 12, 3, P["ink"], 140)
    c.sprite(x, y, PLAYER, SHIRT)
    c.sprite(x + 2, y - 6, UMBRELLA, {"p": P["neon_pink"]})
    c.vline(x + 6, y - 3, 4, P["grey"])
    c.text_c(x + 6, y - 16, "you", P["white"], shadow=P["ink"])


def render(with_wire=True):
    rng = random.Random(11)
    c = Canvas(W, H)
    sky(c, rng)
    skyline(c, rng)
    buildings(c, rng)
    street(c, rng)
    tram(c, 16, 152)
    rain(c, rng)
    player(c)
    if with_wire:
        wire.bar(c, "player", "AMING LANDED THE BANK NOC CONTRACT - $3,400",
                 queue=(5, 1), dwell=0.55)
        hud(c, dy=wire.WIRE_H)
    else:
        hud(c)
    incident(c)
    footer(c)
    return c


def main():
    render().save("01-city-night.png", scale=3)


if __name__ == "__main__":
    main()
