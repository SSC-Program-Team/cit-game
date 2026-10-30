# NETLIFE: Hong Kong

A browser-based pixel-art life sim for teaching networking to HKDSE ICT students.

You are a school leaver in Sham Shui Po with a second-hand laptop. You take IT jobs,
get paid, get burned, rent a walk-up studio, wire your first flat — and every job you
accept is a real networking task, scored.

![Sham Shui Po at night](docs/mockups/01-city-night.png)

**Status:** playable slice (v0.5) — a top-down Stanley village you walk around, freelance gigs on
the market notice board, two employers that send work tasks in real time (and fire you), a computer
shop, courses at Stanley Plaza, free study at the library, a warning-then-jail law system, and a
62-question MC bank: junior ICT/CIT, coding and AI for F1–3, and the five DSE ICT compulsory modules
for F4–6. The networking console jobs from v0.4 are still there.

**Read first:** [Stanley expansion plan](docs/design/stanley-expansion.md) — the decisions behind v0.5.

![Tung Tau Wan Road, v0.3](docs/mockups/v03-city.png)
![The job screen, v0.3](docs/mockups/v03-job.png)

**Play:** <https://ai.ssc.edu.hk/cit-game/> · **Design page:** <https://ai.ssc.edu.hk/cit-game/design/>

```bash
python3 tools/mockup/export_game.py   # 1:1 art from the mockups
npm install && npm run build          # -> dist/
rsync -rc --delete dist/ developer@172.100.0.211:/var/www/html/cit-game/
```

WASD / arrows or tap to walk, **E** to use a place, **I** (or the `i` button) for your status,
**M** mutes. In a quiz, **A–D** or **1–4** answers and **Enter** moves on. You start at the bus
terminus with a used laptop and $1,280.

| Where | What |
|---|---|
| Notice board, Stanley Market | freelance gigs: one-off, paid per right answer, need your own gear |
| Bayview Café / Tide Restaurant (Murray House) | employment: a work task every 5 real hours; relaxed boss fires at 5 days, strict at 3 |
| Pixel Fix | laptops, tools, software licences |
| Phone stall | pirated software and two illegal side jobs |
| Stanley Plaza | courses with a 5-question exam; Tide Restaurant wants the IT support certificate |
| Stanley Public Library | free practice by topic, with explanations |
| Stanley Police Station | your record |
| Bus shelter | go home, sleep, next day |

## What v0.3 changed

- **No Phaser.** The game draws itself to one 640×360 canvas on a loop it owns. The bundle went from
  1.5 MB to **19.7 kB (8 kB gzipped)**, which is the difference between a two-second iPad load and
  an instant one. Phaser's scene manager was also silently dead in the test browser: transitions
  queued and never ran, so a second scene rendered once and then froze. Scenes are now modes.
- **The street is alive.** Rain, four pedestrians with umbrellas, a car with headlights, neon glow
  above the night grade, wet-asphalt smears under the shop signs, flickering signage, and a light
  pool per lamp — all drawn per frame, none baked into the map.
- **Sound.** A procedural lo-fi loop (pad, bass, arpeggio, hat) plus SFX for keys, correct answers,
  wrong answers, cash, doors and footsteps — synthesised at runtime, so no audio files and no
  licensing.
- **The road band is measured, not guessed.** `map.png` was sampled row by row to find the asphalt
  (y 184–212) so the player walks on the road and pedestrians walk the pavement. Spots carry two
  vertical anchors: one on the road for reach, one on the shopfront for the marker.

## Read this first

- **[Game design document](docs/design/game-design-document.md)** — pillars, systems, curriculum mapping, demo scope, risks, open questions.
- **[Layout spec](docs/design/layout-spec.md)** — the grid every screen is drawn to, and the defects the visual pass caught.

## Visual direction

All mockups are generated pixel art (native 384×216, 3× upscale), not AI images:

| | |
|---|---|
| [City + sudden-mission alert](docs/mockups/01-city-night.png) | the overworld and the timed-incident interrupt |
| [Job ticket + diagnostic console](docs/mockups/02-job-console.png) | the learning surface: read real console output, name the fault |
| [Home network build](docs/mockups/03-home-network.png) | the housing capstone: plan, cable, score coverage/cost/security |
| [The ladder](docs/mockups/04-progression.png) | housing tiers and the employed / own-business fork |
| [The wire](docs/mockups/05-wire.png) | the headline strip: live news, richest-player fallback, breaking push |
| [iPad layout](docs/mockups/06-ipad.png) | the same job screen at 4:3 with a touch action bar |
| [The hub](docs/mockups/07-hub.png) | the front door: one next action, live board, cold resume |

Regenerate them:

```bash
python3 tools/mockup/build.py                     # needs Pillow + Noto Sans CJK HK
PIXEL_AUDIT=1 python3 tools/mockup/build.py       # also reports anything drawn off-canvas
```

`tools/mockup/pixelart.py` holds the canonical palette and the 5×7 bitmap font,
`tools/mockup/ui.py` holds the screen grammar (scrims, prompt line, paper, sticky) —
copy those values into the game, do not invent a second style.

**Layout rule:** one focus surface per screen, three permanent numbers, one prompt line,
and edges only on things that are physical objects. See §7.1 of the design doc.

## Stack

TypeScript + Vite, one 640×360 canvas, no Phaser and no backend. Content is TypeScript data
(`src/questions.ts`, `src/economy.ts`, `src/jobs.ts`, `src/world.ts`), checked at build time by
`npm run check`.

Runs in a browser on **school laptops (keyboard + mouse) and iPads (touch, landscape)**:
fixed 384 px design width with fluid height (216–272), every touch target ≥24 px
(≈70 pt), no OS keyboard anywhere, IndexedDB saves plus a copy-paste save code.
See §8.2 of the design document.

## Open decisions

Seven questions are waiting on the teacher in §12 of the design doc — syllabus binding,
lesson shape, grades vs practice, business-sim scope, who authors content, whether the
leaderboard needs a real backend at launch, and how player handles are chosen.
