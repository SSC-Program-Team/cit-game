"""Mockup 06 — the same job screen on an iPad: fluid height, touch targets, no keyboard.

The laptop build is 384x216 (16:9). An iPad in landscape is 4:3-ish, which at a fixed
384 design width gives ~267 px of height instead of 216. So: width is fixed, height is
fluid, and everything that matters is anchored to the top or the bottom edge.
"""
from __future__ import annotations

import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P, text_width  # noqa: E402
import ui  # noqa: E402
import wire  # noqa: E402

W, H = 432, 300            # 4:3-ish landscape, the iPad case
SHEET_W, SHEET_H = 488, 352

OWNER = {"h": P["grey_dk"], "s": P["skin"], "e": P["ink"], "b": P["white"],
         "a": (214, 92, 108, 255), "p": (60, 64, 88, 255), "k": P["ink"]}
OWNER_SPR = [
    "..hhhhhh..", ".hhhhhhhh.", ".hssssssh.", ".hsesessh.", ".hssssssh.",
    "..ssssss..", ".bbbbbbbb.", "sbaaaaaabs", "sbaaaaaabs", ".bbbbbbbb.",
    "..pppppp..", "..pp..pp..", "..kk..kk..",
]


def cafe(rng, w, h) -> Canvas:
    """The room is a frame around the work, not a scene: wall, counter, floor."""
    c = Canvas(w, h, (58, 46, 40, 255))
    floor_y = h - 62
    counter_y = floor_y - 52
    c.rect(0, 0, w, counter_y, (206, 188, 150, 255))
    c.rect(0, counter_y - 34, w, 34, (188, 168, 132, 255))
    for tx in range(0, w, 12):
        c.vline(tx, counter_y - 34, 34, (170, 150, 118, 255))
    c.hline(0, counter_y - 34, w, (160, 140, 110, 255))

    # POS peeking out from behind the laptop, and 陳太 at the far right
    c.rect(w - 58, counter_y - 24, 30, 24, (34, 36, 44, 255))
    c.rect(w - 56, counter_y - 22, 26, 14, (86, 200, 210, 255))
    c.text(w - 54, counter_y - 20, "pos", (16, 40, 44, 255))
    c.text(w - 54, counter_y - 12, "off", (150, 30, 40, 255))
    c.sprite(w - 30, counter_y - 2, OWNER_SPR, OWNER)

    c.rect(0, counter_y, w, 14, (122, 78, 48, 255))
    c.rect(0, counter_y, w, 3, (158, 106, 66, 255))
    c.rect(0, counter_y + 14, w, floor_y - counter_y - 14, (96, 60, 38, 255))
    for px in range(0, w, 26):
        c.vline(px, counter_y + 16, floor_y - counter_y - 18, (78, 48, 30, 255))
    c.rect(0, floor_y, w, h - floor_y, (150, 140, 122, 255))
    for fx in range(0, w, 14):
        c.vline(fx, floor_y, h - floor_y, (128, 118, 102, 255))
    c.hline(0, floor_y, w, (110, 100, 86, 255))

    # lamp, high left, kept out of the HUD row
    c.vline(70, 34, 12, P["grey_dk"])
    c.rect(58, 46, 25, 4, P["grey"])
    c.dither(52, 50, 37, 7, (255, 230, 170, 255), 3)
    return c


def laptop(c: Canvas, x, y, w, h):
    c.rect(x, y, w, h, (28, 30, 38, 255))
    c.rect(x + 2, y + 2, w - 4, h - 4, (10, 12, 18, 255))
    c.hline(x, y, w, (86, 90, 110, 255))
    c.frame(x, y, w, h, (58, 62, 80, 255))
    c.dither(x + 4, y + h, w - 8, 4, (40, 90, 90, 255), 3)
    lines = [
        ("C:\\\\> ipconfig", P["white"], 0),
        ("  ipv4 ....... 192.168.18.77", (168, 172, 190, 255), 0),
        ("  mask ....... 255.255.255.0", (168, 172, 190, 255), 0),
        ("  gateway .... 192.168.18.254", (168, 172, 190, 255), 0),
        ("C:\\\\> ping 192.168.18.50", P["white"], 5),
        ("  reply  1ms  ttl=64", P["neon_green"], 0),
        ("C:\\\\> ping 8.8.8.8", P["white"], 5),
        ("  request timed out.", P["neon_red"], 0),
    ]
    cy = y + 10
    for txt, col, gap in lines:
        cy += gap
        c.text(x + 10, cy, txt, col)
        cy += 9
    c.text(x + 10, cy + 6, "C:\\\\> _", P["neon_green"])


def ticket(c: Canvas):
    x, y, w, h = 10, 26, 96, 54
    ui.paper(c, x, y, w, h, (206, 200, 184))
    c.text(x + 4, y + 4, "#4471", (60, 58, 52, 255))
    c.text_r(x + w - 4, y + 4, "18:52", (60, 58, 52, 255))
    c.cjk(x + 5, y + 15, "陳太", size=12, color=(52, 48, 42, 255))
    c.text(x + 4, y + 32, "pay $450", (52, 48, 42, 255))
    c.text(x + 4, y + 42, "t-38:12", (140, 40, 40, 255))


def icon_button(c: Canvas, x, y, glyph):
    """Touch needs a visible control where the laptop build had a key hint."""
    c.alpha_rect(x, y, 20, 20, (18, 20, 30), 235)
    c.frame(x, y, 20, 20, (96, 100, 120, 255))
    c.text_c(x + 10, y + 7, glyph, P["white"])


def action_bar(c: Canvas, w, h, options, active=1):
    """Three full-width segments, 24 px tall: ~70 pt on a 10.9-inch iPad."""
    bar_h = 24
    y = h - bar_h
    ui.scrim(c, 0, y - 8, w, bar_h + 8, 215)
    c.hline(0, y - 1, w, (56, 58, 74, 255))
    seg = w // len(options)
    for i, label in enumerate(options):
        x = i * seg
        on = i == active
        if on:
            c.rect(x, y, seg - 1, bar_h, (26, 44, 52, 255))
            c.hline(x, y, seg - 1, P["neon_cyan"])
        c.vline(x + seg - 1, y, bar_h, (48, 50, 64, 255))
        c.text_c(x + seg // 2, y + 8, label, P["white"] if on else P["grey"])


def screen() -> Canvas:
    rng = random.Random(9)
    c = cafe(rng, W, H)
    ui.scrim(c, 0, 0, W, H, 90)
    wire.bar(c, "player", "AMING LANDED THE BANK NOC CONTRACT - $3,400",
             w=W, queue=(5, 1), dwell=0.55)

    # HUD row: district left, three numbers right
    y = 16
    c.text(10, y, "sham shui po", P["grey"])
    c.text(300, y, "18:40", P["white"])
    c.text(342, y, "$1,280", P["gold"])
    ui.energy(c, 388, y, 3)

    ticket(c)
    ui.sticky(c, 10, 90, 96, ["no internet", "1 of 3 checks"],
              title="objective", colour=P["win_lit"])
    laptop(c, 118, 62, W - 176, H - 152)

    # thumb-reach controls, just above the action bar
    icon_button(c, W - 52, H - 58, "?")
    icon_button(c, W - 28, H - 58, "x")

    action_bar(c, W, H, ["wrong mask", "no forwarding", "printer"], active=1)
    return c


def main():
    sheet = Canvas(SHEET_W, SHEET_H, (16, 17, 26, 255))
    sheet.text(6, 6, "ipad landscape - 432x300, fluid height", P["grey"])
    sheet.paste(screen(), 24, 16)
    sheet.frame(24, 16, W, H, (70, 74, 92, 255))
    sheet.text(24, 318, "action bar 24px = 70pt. hint and leave are buttons, not keys.", P["neon_cyan"])
    sheet.text(24, 329, "384 design width, fluid height 216-272: the world absorbs the extra.", P["grey"])
    sheet.text(24, 340, "8px safe inset top and bottom: nothing tappable inside them.", P["grey"])
    sheet.save("06-ipad.png", scale=3)


if __name__ == "__main__":
    main()
