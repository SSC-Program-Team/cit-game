"""The wire — a Bloomberg-style headline strip across the top of the screen.

Item taxonomy and colour coding live here so every scene draws it identically.
Copy budget at scale 1: (384 - 40 - 40) // 6 = 50 characters.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P, text_width  # noqa: E402

WIRE_H = 12          # 1 border + 10 text + 1 border
SLUG_W = 34          # "ALERT" is 5 chars = 30 px, so 34 with padding

MODES = {
    # mode: (slug, fill, text-on-slug)
    "news":     ("WIRE", P["neon_cyan"]),
    "market":   ("MKT", P["gold"]),
    "distress": ("ALERT", P["neon_amber"]),
    "player":   ("JOBS", P["neon_green"]),
    "rich":     ("RICH", P["gold"]),
    "breaking": ("LIVE", P["neon_red"]),
}


def tags(c: Canvas, x, y, total, active):
    """Queue pips, so the player knows the strip repeats and how far in they are."""
    for i in range(total):
        col = P["white"] if i == active else P["grey_dk"]
        if i == active:
            c.rect(x + i * 5, y, 3, 3, col)
            c.rect(x + i * 5, y + 4, 3, 1, col)
        else:
            c.rect(x + i * 5, y + 1, 3, 3, col)


def bar(c: Canvas, mode: str, text: str, x=0, y=0, w=384, queue=(4, 0), dwell=0.6):
    slug, colour = MODES[mode]
    c.rect(x, y, w, WIRE_H, P["ink"])
    c.hline(x, y, w, tuple(min(255, ch + 30) for ch in colour[:3]) + (255,))
    c.hline(x, y + WIRE_H - 1, w, P["grey_dk"])
    # slug
    c.rect(x, y + 1, SLUG_W, WIRE_H - 2, colour)
    c.text_c(x + SLUG_W // 2, y + 3, slug, P["ink"])
    # headline
    c.text(x + SLUG_W + 6, y + 3, text, P["white"])
    # queue pips + dwell bar
    total, active = queue
    tags(c, x + w - 8 - total * 5, y + 3, total, active)
    c.rect(x + SLUG_W + 4, y + WIRE_H - 2, w - SLUG_W - 12, 1, P["grey_dk"])
    c.hline(x + SLUG_W + 4, y + WIRE_H - 2, int((w - SLUG_W - 12) * dwell), colour)


def breaking(c: Canvas, headline: str, detail: str, x=0, y=0, w=384):
    """Two lines, taller, red. Interrupts anything, including a job in progress."""
    h = 22
    c.alpha_rect(x, y, w, h, P["ink"], 245)
    c.frame(x, y, w, h, P["neon_red"])
    c.rect(x + 1, y + 1, 28, h - 2, P["neon_red"])
    # pulsing dot, drawn static in mockups
    c.rect(x + 11, y + 7, 5, 5, P["white"])
    c.text(x + 34, y + 4, headline, P["neon_red"])
    c.text(x + 34, y + 13, detail, P["grey"])
    c.text_r(x + w - 6, y + 4, "[t] open", P["white"])
    return h


def leader(c: Canvas, rows, x=0, y=0, w=384, subtitle="RICH LIST - THIS CLASS"):
    """Fallback mode: no live news, so the strip becomes the money scoreboard."""
    c.rect(x, y, w, WIRE_H, P["ink"])
    c.hline(x, y, w, P["gold"])
    c.hline(x, y + WIRE_H - 1, w, P["grey_dk"])
    c.rect(x, y + 1, SLUG_W, WIRE_H - 2, P["gold"])
    c.text_c(x + SLUG_W // 2, y + 3, "RICH", P["ink"])
    cx = x + SLUG_W + 6
    for i, (rank, name, money, is_you) in enumerate(rows):
        col = P["gold"] if is_you else P["white"]
        label = f"{rank} {name} {money}"
        c.text(cx, y + 3, label, col)
        cx += text_width(label) + 10
        if i < len(rows) - 1:
            c.set(cx - 6, y + 6, P["grey_dk"])
    c.text_r(x + w - 6, y + 3, "TAB", P["grey"])


def legend(c: Canvas, x, y):
    rows = [
        ("WIRE", P["neon_cyan"], "world + player news, 6 s each"),
        ("MKT", P["gold"], "prices, rent, wages, 2.5 s each"),
        ("ALERT", P["neon_amber"], "distress call - opens the job board"),
        ("PEOPLE", P["neon_green"], "anyone landed a job / promoted / bought"),
        ("RICH", P["gold"], "fallback when nothing happened in 6 h"),
    ]
    for i, (slug, colour, desc) in enumerate(rows):
        yy = y + i * 11
        c.rect(x, yy, 30, 9, colour)
        c.text_c(x + 15, yy + 1, slug, P["ink"])
        c.text(x + 36, yy + 1, desc, P["grey"])
