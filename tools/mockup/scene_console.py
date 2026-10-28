"""Mockup 02 (v2) — the job screen as a desk, not a dashboard.

The world fills the frame. Three objects carry the whole task: a paper ticket stub
clipped to the corner, your laptop screen, and a sticky note. One prompt line at the
bottom. No panel borders, no title tabs, no key legend.
"""
from __future__ import annotations

import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P, text_width  # noqa: E402
import ui  # noqa: E402

W, H = 384, 216

OWNER = {"h": P["grey_dk"], "s": P["skin"], "e": P["ink"], "b": P["white"],
         "a": (214, 92, 108, 255), "p": (60, 64, 88, 255), "k": P["ink"]}
OWNER_SPR = [
    "..hhhhhh..", ".hhhhhhhh.", ".hssssssh.", ".hsesessh.", ".hssssssh.",
    "..ssssss..", ".bbbbbbbb.", "sbaaaaaabs", "sbaaaaaabs", ".bbbbbbbb.",
    "..pppppp..", "..pppppp..", "..pp..pp..", "..kk..kk..",
]
PLAYER = {"h": P["hair"], "s": P["skin"], "e": P["ink"], "b": P["shirt"],
          "p": P["trouser"], "k": P["ink"]}
PLAYER_SPR = [
    ".hhhhhh.", "hhhhhhhh", "hssssssh", "hsesessh", "hssssssh", ".ssssss.",
    "bbbbbbbb", "sbbbbbbs", "sbbbbbbs", ".bbbbbb.", ".pppppp.", ".pppppp.",
    ".pp..pp.", ".kk..kk.",
]


def cafe(rng) -> Canvas:
    """A wide cha chaan teng: wall, tiles, menu boards, counter, floor."""
    c = Canvas(W, H, (58, 46, 40, 255))
    c.rect(0, 0, W, 74, (208, 190, 152, 255))
    c.rect(0, 74, W, 46, (188, 168, 132, 255))
    for tx in range(0, W, 12):
        c.vline(tx, 74, 46, (170, 150, 118, 255))
    c.hline(0, 74, W, (160, 140, 110, 255))

    for i, ch in enumerate("奶茶"):
        bx = 212 + i * 46
        c.rect(bx, 3, 42, 30, (40, 32, 30, 255))
        c.cjk(bx + 12, 7, ch, size=22, color=(250, 226, 176, 255))
    c.text(312, 14, "no wifi", (120, 40, 40, 255))
    c.text(312, 23, "ask staff", (120, 40, 40, 255))

    # window to the wet street
    c.rect(286, 40, 90, 72, (26, 32, 50, 255))
    c.frame(286, 40, 90, 72, (150, 130, 100, 255))
    for _ in range(40):
        c.set(rng.randrange(290, 372), rng.randrange(44, 108), (120, 160, 190, 255))
    c.alpha_rect(290, 96, 82, 10, (255, 120, 150), 55)

    # counter
    c.rect(0, 120, W, 14, (122, 78, 48, 255))
    c.rect(0, 120, W, 3, (158, 106, 66, 255))
    c.rect(0, 134, W, 40, (96, 60, 38, 255))
    for px in range(0, W, 26):
        c.vline(px, 136, 38, (78, 48, 30, 255))
    c.rect(0, 174, W, 42, (150, 140, 122, 255))
    for fx in range(0, W, 14):
        c.vline(fx, 174, 42, (128, 118, 102, 255))
    c.hline(0, 174, W, (110, 100, 86, 255))

    c.rect(150, 88, 34, 26, (34, 36, 44, 255))
    c.rect(152, 90, 30, 16, (86, 200, 210, 255))
    c.text(154, 92, "pos", (16, 40, 44, 255))
    c.text(154, 100, "offline", (150, 30, 40, 255))
    c.rect(210, 100, 16, 14, (180, 184, 196, 255))
    c.rect(224, 103, 5, 4, (150, 154, 168, 255))
    for i in range(3):
        c.set(216 + i, 96 - i, (220, 220, 226, 255))

    c.vline(96, 0, 10, P["grey_dk"])
    c.rect(84, 10, 25, 4, P["grey"])
    c.dither(78, 14, 37, 8, (255, 230, 170, 255), 3)

    c.sprite(250, 100, OWNER_SPR, OWNER)
    return c


def laptop(c: Canvas):
    """The one surface allowed a border: your screen, sitting on the counter."""
    x, y, w, h = 104, 40, 268, 122
    c.rect(x, y, w, h, (28, 30, 38, 255))
    c.rect(x + 2, y + 2, w - 4, h - 4, (10, 12, 18, 255))
    c.hline(x, y, w, (86, 90, 110, 255))
    c.frame(x, y, w, h, (58, 62, 80, 255))
    c.dither(x + 4, y + h, w - 8, 5, (40, 90, 90, 255), 3)

    lines = [
        ("C:\\\\> ipconfig", P["white"], 0),
        ("  ipv4 ....... 192.168.18.77", (168, 172, 190, 255), 0),
        ("  mask ....... 255.255.255.0", (168, 172, 190, 255), 0),
        ("  gateway .... 192.168.18.254", (168, 172, 190, 255), 0),
        ("C:\\\\> ping 192.168.18.50", P["white"], 4),
        ("  reply  1ms  ttl=64", P["neon_green"], 0),
        ("C:\\\\> ping 8.8.8.8", P["white"], 4),
        ("  request timed out.", P["neon_red"], 0),
    ]
    cy = y + 8
    for txt, col, gap in lines:
        cy += gap
        c.text(x + 8, cy, txt, col)
        cy += 8
    c.text(x + 8, cy + 4, "C:\\\\> _", P["neon_green"])


def ticket(c: Canvas):
    """Paper stub clipped to the corner — the job facts, once, small."""
    x, y, w, h = 8, 16, 88, 54
    ui.paper(c, x, y, w, h, (206, 200, 184))
    c.text(x + 4, y + 4, "#4471", (60, 58, 52, 255))
    c.text_r(x + w - 4, y + 4, "18:52", (60, 58, 52, 255))
    c.cjk(x + 4, y + 14, "陳太", size=12, color=(52, 48, 42, 255))
    c.text(x + 4, y + 32, "pay $450", (52, 48, 42, 255))
    c.text(x + 4, y + 42, "t-38:12", (140, 40, 40, 255))


def note(c: Canvas):
    """Sticky note on the counter: the objective, said once."""
    x, y, w = 8, 78, 88
    ui.sticky(c, x, y, w, ["no internet", "1 of 3 checks"],
              title="objective", colour=P["win_lit"])


def main():
    rng = random.Random(5)
    c = cafe(rng)
    ui.scrim(c, 0, 0, W, H, 96)          # focus the work, not the room
    ticket(c)
    note(c)
    laptop(c)
    ui.prompt(c, 190, ["[1] wrong mask", "[2] not forwarding", "[3] printer"],
              active=1, gap=18)
    c.text(8, 205, "h  call the master  -$80", P["grey"])
    c.save("02-job-console.png", scale=3)


if __name__ == "__main__":
    main()
