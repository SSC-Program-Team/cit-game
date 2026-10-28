"""Mockup 05 — the wire: Bloomberg-style headline strip, its fallback and the breaking push."""
from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixelart import Canvas, P  # noqa: E402
import wire  # noqa: E402
import scene_city  # noqa: E402

W, H = 384, 216


def label(c: Canvas, y, s):
    c.text(4, y, s, P["grey"])


def main():
    c = Canvas(W, H, (16, 17, 26, 255))

    # --- in context: the top of the city screen, wire live
    city = scene_city.render(with_wire=True)
    c.paste(city.img.crop((0, 0, W, 92)), 0, 0)
    c.alpha_rect(0, 86, W, 6, P["ink"], 200)
    c.hline(0, 92, W, P["grey_dk"])

    # --- sample 1: live news
    label(c, 96, "MKT + NEWS - LIVE FEED, 6 S PER ITEM")
    wire.bar(c, "market", "PARTS +12% AT GOLDEN ARCADE - CAT6 DRUM $680",
             y=103, queue=(5, 2), dwell=0.35)

    # --- sample 2: fallback leaderboard
    label(c, 119, "FALLBACK - NOTHING HAPPENED ON THE SERVER FOR 6 H")
    wire.leader(c, [("1", "AMING", "482K", False), ("2", "MS_CHAN", "310K", False),
                    ("3", "YOU", "128K", True), ("4", "KEN", "96K", False)], y=126)

    # --- sample 3: breaking push
    label(c, 142, "BREAKING - TRUMPS ANY SCREEN, ONCE PER SESSION")
    wire.breaking(c, "TYPHOON T8 - ALL TRANSPORT SUSPENDED",
                  "emergency repairs pay 2x; you cannot reach the client",
                  y=149)

    # --- rules
    c.text(4, 176, "alert = distress call, enter on the strip opens the job board", P["white"])
    c.text(4, 186, "mkt = parts, rent and wages. 2.5 s dwell, gold slug.", P["white"])
    c.text(4, 196, "rotation: newest first, then severity. pause on focus.", P["grey"])
    c.text(4, 206, "no name is ever typed by a student - headlines are templates.", P["gold"])

    c.save("05-wire.png", scale=3)


if __name__ == "__main__":
    main()
