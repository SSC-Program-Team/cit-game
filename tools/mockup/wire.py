"""The wire — a hairline headline strip. No panel, no slug box, no border.

Vocabulary stays tiny on purpose: a colour plus a 3-5 letter slug is all the player
needs to tell market news from a distress call. Copy budget: ~52 chars.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P, text_width  # noqa: E402
import ui  # noqa: E402

H = 10
SLUG_X = 7

COLOURS = {
    "news": P["neon_cyan"], "market": P["gold"], "distress": P["neon_amber"],
    "player": P["neon_green"], "rich": P["gold"],
}
SLUGS = {"news": "WIRE", "market": "MKT", "distress": "ALERT",
         "player": "JOBS", "rich": "RICH"}


def _slug(c, x, y, text, colour):
    c.text(x, y, text, colour)
    c.vline(x + text_width(text) + 4, y - 1, 9, (56, 58, 74, 255))
    return x + text_width(text) + 10


def _pips(c, right, y, total, active):
    for i in range(total):
        on = i == active
        c.rect(right - (total - i) * 5, y + (0 if on else 1), 3, 3 if on else 2,
               P["white"] if on else (72, 74, 90, 255))


def bar(c: Canvas, mode: str, text: str, y=0, w=384, queue=(4, 0), dwell=0.6):
    colour = COLOURS[mode]
    ui.scrim(c, 0, y, w, H, 205)
    c.hline(0, y + H - 1, w, (48, 50, 64, 255))
    cx = _slug(c, SLUG_X, y + 2, SLUGS[mode], colour)
    c.text(cx, y + 2, text, P["white"])
    total, active = queue
    _pips(c, w - 7, y + 3, total, active)
    if dwell:
        c.hline(SLUG_X, y + H - 1, int((w - 40) * dwell), colour)


def breaking(c: Canvas, headline: str, detail: str, y=0, w=384):
    """Two lines, red rule on the left, no frame. The only element allowed to shout."""
    h = 24
    ui.scrim(c, 0, y, w, h, 238)
    c.rect(0, y, 3, h, P["neon_red"])
    c.text(10, y + 4, headline, P["neon_red"])
    c.text(10, y + 13, detail, P["grey"])
    c.text_r(w - 8, y + 4, "[T]", P["white"])
    c.hline(0, y + h - 1, w, P["neon_red"])
    return h


def leader(c: Canvas, rows, y=0, w=384):
    colour = P["gold"]
    ui.scrim(c, 0, y, w, H, 205)
    c.hline(0, y + H - 1, w, (48, 50, 64, 255))
    cx = _slug(c, SLUG_X, y + 2, "RICH", colour)
    for i, (rank, name, money, is_you) in enumerate(rows):
        col = colour if is_you else P["white"]
        label = f"{rank} {name} {money}"
        c.text(cx, y + 2, label, col)
        cx += text_width(label) + 9
    c.text_r(w - 7, y + 2, "TAB", P["grey"])
