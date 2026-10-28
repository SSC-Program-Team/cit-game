"""Mockup 07 — the hub: what a player sees when they open the game at 11 p.m.

A game played in free time lives or dies on this screen: it has to say where you were,
what the one next action is, and that the world kept moving without you.
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


def room(rng) -> Canvas:
    c = Canvas(W, H, (26, 28, 40, 255))
    c.rect(0, 0, W, 170, (34, 36, 50, 255))
    c.rect(0, 170, W, H - 170, (46, 40, 35, 255))
    for fx in range(0, W, 22):
        c.vline(fx, 170, H - 170, (40, 35, 31, 255))
    c.hline(0, 170, W, (86, 62, 44, 255))

    # window onto the street: rain and neon spill
    c.rect(236, 12, 140, 50, (18, 22, 36, 255))
    c.frame(236, 12, 140, 50, (70, 66, 62, 255))
    for _ in range(70):
        c.set(rng.randrange(240, 372), rng.randrange(16, 60), (110, 140, 170, 255))
    c.alpha_rect(240, 44, 132, 16, (255, 90, 150), 34)
    c.vline(306, 12, 50, (70, 66, 62, 255))

    # one chair, so the floor is not empty
    c.rect(332, 150, 34, 40, (40, 36, 48, 255))
    c.rect(332, 150, 34, 4, (56, 52, 66, 255))
    c.rect(340, 190, 4, 12, (34, 31, 42, 255))
    c.rect(356, 190, 4, 12, (34, 31, 42, 255))

    return c


def title(c: Canvas):
    c.text(8, 24, "netlife", P["white"], scale=3)
    c.text(10, 50, "hong kong", P["grey"])
    c.text(10, 60, "season 2  -  week 4", P["neon_cyan"])


def continue_card(c: Canvas):
    """The one next action, in words a person can act on."""
    x, y, w, h = 8, 74, 176, 66
    ui.scrim(c, x, y, w, h, 225)
    c.rect(x, y, 3, h, P["neon_amber"])
    c.text(x + 10, y + 5, "continue", P["neon_amber"])
    ui.paper(c, x + 10, y + 14, 44, 15, (208, 202, 186))
    c.cjk(x + 13, y + 15, "陳太", size=12, color=(52, 48, 42))
    c.text(x + 60, y + 18, "tea shop", P["grey"])
    c.text(x + 10, y + 34, "till still down", P["win_lit"])
    c.text(x + 10, y + 44, "12 min left  $450", P["gold"])
    c.hline(x + 10, y + 55, w - 20, (60, 62, 78, 255))
    c.text(x + 10, y + 58, "enter  continue", P["white"])


def side(c: Canvas):
    x, y = 200, 74
    ui.scrim(c, x, y - 4, 176, 70, 215)
    c.text(x + 4, y, "on now", P["grey"])
    c.text(x + 46, y, "3 players", P["white"])
    c.text(x + 4, y + 10, "momentum", P["grey"])
    for i in range(5):
        c.rect(x + 56 + i * 5, y + 11, 4, 6, P["neon_green"] if i < 3 else P["grey_dk"])
    c.text(x + 4, y + 22, "school board", P["grey"])
    c.text(x + 4, y + 32, "1  aming     482k", P["white"])
    c.text(x + 4, y + 41, "2  ms_chan   310k", P["white"])
    c.text(x + 4, y + 50, "7  you       128k", P["gold"])
    c.text(x + 4, y + 62, "6th is 14k away", P["neon_cyan"])


def bottom(c: Canvas):
    y = 196
    ui.scrim(c, 0, y, W, H - y, 205)
    c.hline(0, y, W, (52, 54, 68, 255))
    c.text(10, y + 6, "enter continue", P["white"])
    c.text(100, y + 6, "j jobs", P["grey"])
    c.text(146, y + 6, "l board", P["grey"])
    c.text_r(376, y + 6, "autosaved 2 min ago", P["grey"])


def main():
    rng = random.Random(4)
    c = room(rng)
    wire.bar(c, "player", "AMING BOUGHT THE 2-BED IN TSUEN WAN - $4.2M",
             w=W, queue=(6, 3), dwell=0.5)
    title(c)
    continue_card(c)
    side(c)
    bottom(c)
    c.save("07-hub.png", scale=3)


if __name__ == "__main__":
    main()
