"""Minimal UI primitives — the decluttered visual language.

Rules this file encodes (from the reference pass in docs/design/):
  1. Nothing gets a box unless it is a physical object (paper, a note, a screen).
  2. Three numbers may be permanently on screen. Not five.
  3. One prompt line at the bottom, keys in brackets, active option marked with a caret.
  4. Text sits on a soft scrim, never inside a bordered panel.
  5. Hierarchy comes from size and contrast: a heading is 2x, a value is 1x, a label is 1x grey.
"""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P, text_width  # noqa: E402

INK = P["ink"]


def scrim(c: Canvas, x, y, w, h, a=150, col=None):
    """Soft dark wash so text reads over art without a frame. Fades at the edges."""
    col = col or INK
    c.alpha_rect(x, y, w, h, col[:3], a)
    # one-pixel feather so the wash does not end on a hard line
    c.alpha_rect(x, y, w, 1, col[:3], max(0, a - 70))
    c.alpha_rect(x, y + h - 1, w, 1, col[:3], max(0, a - 70))


def stat_line(c: Canvas, x, y, parts, gap=10):
    """Right-aligned cluster of bare values: '18:40  $1,280  ####'. No boxes."""
    widths = []
    for (kind, value, colour) in parts:
        if kind == "text":
            widths.append(text_width(value))
        elif kind == "pips":
            widths.append(value * 4 - 1)
    total = sum(widths) + gap * (len(parts) - 1)
    cx = x - total
    for i, (kind, value, colour) in enumerate(parts):
        if kind == "text":
            c.text(cx, y, value, colour)
            cx += widths[i]
        elif kind == "pips":
            for p in range(value):
                filled = p < parts[i][2]
                c.rect(cx + p * 4, y + 2, 3, 4, P["neon_green"] if filled else P["grey_dk"])
            cx += widths[i]
        cx += gap


def bolt(c: Canvas, x, y, colour=None):
    """Tiny energy glyph: cheaper than a 6-character label at this size."""
    colour = colour or P["win_lit"]
    for (dx, dy) in ((0, 0), (1, 0), (1, 1), (0, 2), (0, 3), (1, 3), (0, 4)):
        c.set(x + dx, y + dy, colour)


def energy(c: Canvas, x, y, filled, total=5):
    for p in range(total):
        c.rect(x + p * 4, y + 1, 3, 5, P["win_lit"] if p < filled else P["grey_dk"])


def prompt(c: Canvas, y, options, active=0, w=384, gap=14):
    """The only instruction surface in the game. One line, no panel."""
    scrim(c, 0, y - 5, w, 12, 170)
    cx = 10
    for i, label in enumerate(options):
        col = P["white"] if i == active else P["grey"]
        if i == active:
            c.rect(cx - 7, y + 2, 3, 3, P["neon_cyan"])
        c.text(cx, y, label, col)
        cx += text_width(label) + gap


def sticky(c: Canvas, x, y, w, lines, title=None, colour=None):
    """A note pinned in the world: 1px paper edge, no heavy border, no title tab."""
    colour = colour or P["win_lit"]
    h = 6 + len(lines) * 8 + (9 if title else 0)
    c.alpha_rect(x, y, w, h, (36, 32, 26), 205)
    c.hline(x, y, w, (96, 86, 68))
    c.vline(x, y, 1, (96, 86, 68))
    cy = y + 4
    if title:
        c.text(x + 4, cy, title, colour)
        cy += 9
    for ln in lines:
        c.text(x + 4, cy, ln, P["white"])
        cy += 8
    return h


def paper(c: Canvas, x, y, w, h, tone=(226, 220, 202)):
    """A physical sheet: the only thing on screen allowed a real border."""
    c.rect(x, y, w, h, tone)
    c.hline(x, y, w, (250, 246, 232))
    c.hline(x, y + h - 1, w, (150, 144, 128))
    c.vline(x + w - 1, y, h, (150, 144, 128))


def caption(c: Canvas, x, y, s, colour=None):
    """Tiny grey label. Used sparingly — labels are the first thing to cut."""
    c.text(x, y, s, colour or P["grey"])
