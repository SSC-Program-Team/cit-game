"""Mockup 02 — a job in progress: 茶餐廳 interior, ticket, diagnostic console, diagnosis choices."""
from __future__ import annotations

import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P  # noqa: E402

W, H = 384, 216

OWNER = {
    "h": P["grey_dk"], "s": P["skin"], "e": P["ink"], "b": P["white"],
    "a": (214, 92, 108, 255), "p": (60, 64, 88, 255), "k": P["ink"],
}
OWNER_SPR = [
    "..hhhhhh..",
    ".hhhhhhhh.",
    ".hssssssh.",
    ".hsesessh.",
    ".hssssssh.",
    "..ssssss..",
    ".bbbbbbbb.",
    "sbaaaaaabs",
    "sbaaaaaabs",
    ".bbbbbbbb.",
    "..pppppp..",
    "..pppppp..",
    "..pp..pp..",
    "..kk..kk..",
]

PLAYER = {
    "h": P["hair"], "s": P["skin"], "e": P["ink"], "b": P["shirt"],
    "p": P["trouser"], "k": P["ink"],
}
PLAYER_SPR = [
    ".hhhhhh.",
    "hhhhhhhh",
    "hssssssh",
    "hsesessh",
    "hssssssh",
    ".ssssss.",
    "bbbbbbbb",
    "sbbbbbbs",
    "sbbbbbbs",
    ".bbbbbb.",
    ".pppppp.",
    ".pppppp.",
    ".pp..pp.",
    ".kk..kk.",
]


def interior(rng) -> Canvas:
    w, h = 150, 150
    c = Canvas(w, h, (58, 46, 40, 255))
    # wall + tile band
    c.rect(0, 0, w, 74, (214, 196, 158, 255))
    c.rect(0, 46, w, 28, (196, 176, 140, 255))
    for tx in range(0, w, 10):
        c.vline(tx, 46, 28, (176, 156, 124, 255))
    c.hline(0, 46, w, (166, 146, 116, 255))
    # menu boards
    for i, ch in enumerate("奶茶多士"):
        c.rect(8 + i * 26, 6, 24, 18, (40, 32, 30, 255))
        c.cjk(11 + i * 26, 5, ch, size=15, color=(250, 226, 176, 255))
    c.text(96, 28, "no wifi", (120, 40, 40, 255))
    c.text(96, 36, "ask staff", (120, 40, 40, 255))
    # hanging lamp
    c.vline(60, 0, 6, P["grey_dk"])
    c.rect(52, 6, 17, 3, P["grey"])
    c.dither(50, 9, 21, 6, (255, 230, 170, 255), 3)

    # window to the street (rain)
    c.rect(4, 52, 46, 34, (26, 32, 50, 255))
    c.frame(4, 52, 46, 34, (150, 130, 100, 255))
    for _ in range(26):
        c.set(rng.randrange(6, 48), rng.randrange(54, 84), (120, 160, 190, 255))
    c.alpha_rect(6, 78, 42, 6, (255, 120, 150), 60)

    # counter
    c.rect(54, 78, 96, 16, (122, 78, 48, 255))
    c.rect(54, 78, 96, 4, (158, 106, 66, 255))
    c.rect(54, 94, 96, 30, (96, 60, 38, 255))
    for px in range(58, 148, 18):
        c.vline(px, 80, 40, (78, 48, 30, 255))

    # POS terminal on the counter
    c.rect(96, 58, 30, 22, (34, 36, 44, 255))
    c.rect(98, 60, 26, 14, (86, 200, 210, 255))
    c.text(100, 62, "pos", (16, 40, 44, 255))
    c.text(100, 69, "offline", (150, 30, 40, 255))
    c.rect(104, 80, 14, 3, (28, 30, 38, 255))
    # receipt printer + card reader
    c.rect(130, 66, 12, 12, (60, 62, 74, 255))
    c.rect(131, 68, 10, 3, (140, 146, 166, 255))
    c.rect(132, 78, 8, 2, (230, 230, 236, 255))
    # kettle + steam
    c.rect(62, 66, 10, 11, (180, 184, 196, 255))
    c.rect(69, 68, 4, 3, (150, 154, 168, 255))
    for i in range(3):
        c.set(66 + i, 62 - i, (220, 220, 226, 255))
        c.set(68 + i, 58 - i, (196, 196, 206, 255))

    # floor
    c.rect(0, 124, w, 26, (150, 140, 122, 255))
    for fx in range(0, w, 12):
        c.vline(fx, 124, 26, (128, 118, 102, 255))
    c.hline(0, 124, w, (110, 100, 86, 255))

    # stool + table
    c.rect(16, 96, 20, 3, (196, 66, 66, 255))
    c.rect(18, 99, 2, 25, P["grey_dk"])
    c.rect(32, 99, 2, 25, P["grey_dk"])
    c.rect(10, 118, 14, 3, (196, 66, 66, 255))
    c.rect(12, 121, 2, 12, P["grey_dk"])
    c.rect(20, 121, 2, 12, P["grey_dk"])

    # owner behind the counter, customer at the table
    c.sprite(78, 94, OWNER_SPR, OWNER)
    c.sprite(36, 108, PLAYER_SPR, PLAYER)
    # player toolbox + laptop bag on the floor
    c.rect(50, 132, 12, 8, (200, 160, 60, 255))
    c.hline(50, 132, 12, (230, 200, 100, 255))
    c.rect(30, 134, 6, 6, (60, 62, 74, 255))
    return c


def console_panel(c: Canvas):
    x, y, w, h = 162, 26, 216, 100
    c.panel(x, y, w, h, border=P["neon_green"], title="console - pos-01", title_c=P["neon_green"])
    lines = [
        ("C:\\> ipconfig", P["white"], 0),
        ("  ipv4 .......... 192.168.18.77", P["grey"], 0),
        ("  mask .......... 255.255.255.0", P["grey"], 0),
        ("  gateway ....... 192.168.18.254", P["grey"], 0),
        ("C:\\> ping 192.168.18.50", P["white"], 3),
        ("  reply  time=1ms  ttl=64", P["neon_green"], 0),
        ("C:\\> ping 8.8.8.8", P["white"], 3),
        ("  request timed out.", P["neon_red"], 0),
    ]
    cy = y + 8
    for (txt, col, gap) in lines:
        cy += gap
        c.text(x + 6, cy, txt, col)
        cy += 8
    c.text(x + 6, cy + 3, "C:\\> _", P["neon_green"])
    c.dither(x + w - 5, y + 4, 3, h - 8, P["grey_dk"], 2)

def ticket(c: Canvas):
    x, y, w, h = 6, 26, 150, 150
    c.frame(x, y, w, h, P["grey_dk"])



def head(c: Canvas):
    c.panel(6, 5, 246, 13, border=P["grey"])
    c.text(10, 8, "job #4471", P["white"])
    c.text(70, 8, "18:52  day 3", P["white"])
    c.text_r(248, 8, "350m from home", P["grey"])
    c.panel(258, 5, 120, 13, border=P["neon_amber"])
    c.text(262, 8, "on site", P["white"])
    c.text_r(374, 8, "t-38:12", P["neon_amber"])

def goals(c: Canvas):
    x, y, w, h = 6, 150, 150, 26
    c.alpha_rect(x, y, w, h, P["ink"], 215)
    c.hline(x, y, w, P["grey_dk"])
    c.text(x + 4, y + 5, "objective", P["grey"])
    c.text(x + 4, y + 13, "till cannot reach the net", P["win_lit"])
    c.text(x + 4, y + 21, "checks 1/3   hints 2", P["neon_cyan"])

def diagnosis(c: Canvas):
    x, y, w, h = 162, 132, 216, 62
    c.panel(x, y, w, h, border=P["neon_cyan"], title="what is wrong?", title_c=P["neon_cyan"])
    opts = [
        "wrong subnet mask",
        "router not forwarding",
        "printer is offline",
    ]
    for i, t in enumerate(opts):
        c.text(x + 8, y + 7 + i * 12, f"[{i + 1}] {t}", P["white"])
    c.frame(x + 4, y + 5 + 12, w - 8, 11, P["neon_cyan"])
    c.text(x + 8, y + 46, "wrong answer costs 4 min", P["grey"])
    c.text_r(x + w - 8, y + 46, "hint 3/3", P["neon_cyan"])

def footer(c: Canvas):
    y = 200
    c.alpha_rect(0, y, W, H - y, P["ink"], 220)
    c.text(6, y + 3, "1-3 choose    enter confirm    h hint    tab map", P["grey"])


def main():
    rng = random.Random(3)
    c = Canvas(W, H, P["night0"])
    # dim room backdrop behind the panels
    c.rect(0, 0, W, H, (30, 24, 26, 255))
    c.paste(interior(rng), 6, 26)
    head(c)
    ticket(c)
    console_panel(c)
    diagnosis(c)
    goals(c)
    footer(c)
    c.save("02-job-console.png", scale=3)


if __name__ == "__main__":
    main()
