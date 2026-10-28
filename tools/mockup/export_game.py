"""Export 1:1, chrome-less art for the game from the design mockups.

The mockups are 3x with their own HUD baked in; the game canvas is 384x216 and draws
its own HUD, so it needs the raw scenes at 1:1.

    python3 tools/mockup/export_game.py
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

DST = os.path.join(ROOT, "public", "img")
os.makedirs(DST, exist_ok=True)

import scene_world    # noqa: E402
import scene_console  # noqa: E402


def save(canvas, name: str) -> None:
    canvas.img.save(os.path.join(DST, name))
    print(f"{name}: {canvas.w}x{canvas.h}")


# the road without the wire/HUD/prompt: the game draws those itself
save(scene_world.render(with_wire=False), "map.png")
# the job screen without the answer row: the game owns the interaction
save(scene_console.render(chrome=False), "job.png")

# the prison sheet is a static screen, just needs 1:1
prison = Image.open(os.path.join(ROOT, "docs", "mockups", "08-prison.png"))
prison.resize((prison.width // 3, prison.height // 3), Image.NEAREST).save(
    os.path.join(DST, "prison.png")
)
print("prison.png: 384x216")
