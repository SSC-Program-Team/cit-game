"""Render every design mockup: python3 tools/mockup/build.py"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import scene_city      # noqa: E402
import scene_console   # noqa: E402
import scene_home      # noqa: E402
import scene_progress  # noqa: E402
import scene_wire      # noqa: E402
import scene_ipad      # noqa: E402

for mod in (scene_city, scene_console, scene_home, scene_progress, scene_wire, scene_ipad):
    mod.main()
