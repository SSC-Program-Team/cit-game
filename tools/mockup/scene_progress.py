"""Mockup 04 — the progression board: housing ladder + the employed/own-business fork."""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P, text_width  # noqa: E402

W, H = 384, 216

TIERS = [
    ("family", "$0", 0),
    ("studio", "$6k/mo", 1),
    ("rented", "$13k/mo", 2),
    ("owned 2b", "$4.2m", 3),
    ("shop + hq", "$8m", 4),
]


def vignette(c: Canvas, x, y, kind):
    """Small 40x26 room scenes, one per housing tier."""
    c.rect(x, y, 40, 26, (32, 32, 42, 255))
    c.frame(x, y, 40, 26, (86, 88, 104, 255))
    if kind == 0:      # bunk bed in a shared room
        c.rect(x + 4, y + 6, 16, 3, (140, 128, 150, 255))
        c.rect(x + 4, y + 15, 16, 3, (120, 110, 132, 255))
        c.vline(x + 4, y + 6, 12, (96, 92, 108, 255))
        c.vline(x + 19, y + 6, 12, (96, 92, 108, 255))
        c.rect(x + 27, y + 8, 9, 10, (60, 62, 78, 255))
    elif kind == 1:    # walk-up studio, steps
        for i in range(5):
            c.hline(x + 6 + i * 2, y + 20 - i * 3, 8, (150, 120, 80, 255))
        c.rect(x + 24, y + 8, 12, 8, (58, 62, 80, 255))
        c.rect(x + 25, y + 9, 10, 5, (86, 200, 210, 255))
    elif kind == 2:    # rented flat, window + router
        c.rect(x + 6, y + 5, 14, 10, (26, 32, 50, 255))
        c.frame(x + 6, y + 5, 14, 10, (150, 130, 100, 255))
        c.rect(x + 24, y + 14, 8, 5, (60, 64, 82, 255))
        c.rect(x + 25, y + 15, 6, 1, P["neon_cyan"])
        c.rect(x + 6, y + 18, 28, 4, (72, 64, 76, 255))
    elif kind == 3:    # owned flat: rack + ap
        c.rect(x + 30, y + 6, 6, 16, (44, 46, 58, 255))
        for i in range(3):
            c.set(x + 32, y + 8 + i * 4, P["neon_green"])
        c.rect(x + 6, y + 8, 8, 5, (240, 240, 246, 255))
        c.rect(x + 7, y + 9, 6, 1, P["neon_cyan"])
        c.rect(x + 6, y + 17, 18, 4, (72, 64, 76, 255))
    else:              # shop + flat, storefront
        c.rect(x + 4, y + 6, 32, 6, P["neon_pink"])
        c.cjk(x + 9, y + 3, "電腦", size=9, color=(24, 20, 28, 255))
        c.alpha_rect(x + 5, y + 13, 30, 8, (255, 220, 170), 110)
        c.rect(x + 4, y + 21, 32, 4, (70, 62, 76, 255))


def arrow(c: Canvas, x, y, colour=None):
    colour = colour or P["grey_dk"]
    c.set(x, y - 2, colour)
    c.set(x + 1, y - 1, colour)
    c.set(x + 2, y, colour)
    c.set(x + 1, y + 1, colour)
    c.set(x, y + 2, colour)


def chip(c: Canvas, x, y, w, h, l1, l2, colour=None):
    colour = colour or P["neon_cyan"]
    c.alpha_rect(x, y, w, h, (18, 20, 32), 235)
    c.frame(x, y, w, h, colour)
    c.text(x + 4, y + 4, l1, P["white"])
    c.text(x + 4, y + 13, l2, P["gold"])


def note(c: Canvas, y, s, colour):
    c.text(8, y, s, colour)


def main():
    c = Canvas(W, H, (16, 17, 26, 255))

    # header
    c.panel(6, 5, 236, 14, border=P["neon_cyan"])
    c.text(10, 9, "the ladder - two school years", P["white"])
    c.text_r(374, 9, "one lesson = one week", P["grey"])

    # --- housing row
    c.text(8, 25, "home", P["neon_cyan"])
    c.text(46, 25, "each tier unlocks a build you cannot skip", P["grey"])
    x = 8
    for i, (name, price, kind) in enumerate(TIERS):
        vignette(c, x + 14, 34, kind)
        c.text_c(x + 34, 63, name, P["white"])
        c.text_c(x + 34, 72, price, P["gold"])
        if i < len(TIERS) - 1:
            arrow(c, x + 69, 47)
        x += 76

    # --- career fork
    c.hline(8, 84, 368, P["grey_dk"])
    c.text(8, 90, "career fork", P["neon_cyan"])
    c.text(92, 90, "same tickets, more risk", P["grey"])

    lanes = [
        (6, 100, "employed", P["neon_cyan"],
         [("shop sales", "$13k/mo"), ("isp tech", "$19k/mo"),
          ("school it", "$26k/mo"), ("bank noc", "$34k/mo")]),
        (6, 132, "own biz", P["neon_amber"],
         [("side gigs", "$3k/mo"), ("shopfront", "$1.2k rent"),
          ("2 staff", "$28k/mo"), ("6 staff", "$96k/mo")]),
    ]
    for (lx, ly, label, colour, nodes) in lanes:
        c.text(lx, ly + 8, label, colour)
        cx = 74
        for j, (a, b) in enumerate(nodes):
            chip(c, cx, ly, 70, 24, a, b, colour=colour)
            if j < len(nodes) - 1:
                arrow(c, cx + 74, ly + 11, colour)
            cx += 78

    # --- notes
    c.hline(8, 162, 368, P["grey_dk"])
    note(c, 167, "salary is capped by your rank.", P["white"])
    note(c, 176, "your own business is capped by who trusts you.", P["white"])

    # --- footer
    c.alpha_rect(0, 188, W, H - 188, P["ink"], 225)
    c.hline(0, 188, W, P["grey_dk"])
    c.text(8, 193, "both gated by what you can actually fix", P["gold"])
    c.text_r(376, 193, "netlife", P["neon_cyan"])

    c.save("04-progression.png", scale=3)


if __name__ == "__main__":
    main()
