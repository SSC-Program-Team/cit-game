# Handoff — NETLIFE: HK (cit-game)

Read this before touching code. It is the state of the build, the decisions behind it, and the
traps that cost time.

- **Repo:** <https://github.com/SSC-Program-Team/cit-game> (private, `main`)
- **Live:** <https://ai.ssc.edu.hk/cit-game/> — a static build served by school Apache
- **Status:** playable slice, v0.3. One street, one job, saves, audio, ambience.

## What the game is

A browser pixel-art life sim for **HKDSE ICT students (S4–S6)** that teaches networking by giving
them paid IT work, not lessons. The player walks the real **Tung Tau Wan Road, Stanley** (SSC =
St Stephen's College at no. 22, Stanley Prison at 99, the mosque at 53, the fort gate closing the
east end), takes jobs, reads real console output, diagnoses real faults, and gets paid.

Non-negotiables, carried from the design conversation:

- **A game first.** No lessons, no XP bar, no levels, no locked doors. Progression is diegetic:
  tools owned, skills practised, people who vouch for you, money.
- **Real networking.** The console output and the answer options have to be correct for a DSE
  student; the first job teaches default gateway vs subnet mask with `ipconfig` + `ping` evidence.
- **iPad first, then laptop.** Touch is the primary input; the keyboard is a convenience.
- **No PHP, no framework, no backend** until a requirement forces one (a live leaderboard would be
  the first, and it would be Express + `node:sqlite` reusing the same payout logic).
- **Real names for real places.** 赤柱餐廳, 赤柱市集, Stanley Plaza — never invented placeholders.

## Stack — and why there is no Phaser

TypeScript + Vite, one `<canvas>` 640×360, drawn with Canvas2D, on a `requestAnimationFrame` loop the
game owns. `src/main.ts` is the whole game; `src/state.ts` is the save; `src/audio.ts` is the
procedural audio engine.

The slice was originally Phaser 3. It was removed for two reasons found in the same debugging session:

1. In the automated browser the tab was `hidden`, which suspends `rAF` — Phaser's loop never stepped,
   so scenes appeared frozen and `scene.start()` silently no-opped. That is an environment issue, but
   it made Phaser impossible to verify.
2. Even outside that, `this.scene.start('Job')` queued an operation that never ran while
   `game.scene.start('Job')` worked — a second scene would render one frame and then never update.

Hand-rolled modes removed both problems and took the bundle from **1.5 MB to 19.7 kB (8 kB gzipped)**.
Every frame is now observable via `window.__frames`.

**Do not reintroduce Phaser** unless you have a concrete feature that justifies it.

## Files

| Path | What it is |
|---|---|
| `src/main.ts` | The game: canvas, bitmap font renderer, input, city mode, job mode, HUD, ambience |
| `src/state.ts` | `money`, `x`, `y`, `energy`, `minutes`, `done[]`; `save`/`load`/`clock`/`addMoney`/`addMinutes`/`addMastery` |
| `src/audio.ts` | Procedural lo-fi loop + SFX (`ui`, `ok`, `bad`, `cash`, `door`, `step`); `unlock()` on first gesture |
| `public/img/map.png` | 640×360 street art, chrome-less, no HUD |
| `public/img/font.png` | 144×24 glyph strip, 24 cols × 6×8 cells, charset `A–Z 0–9` + `.,:;-/$%+!?[]()*#'<>=` |
| `tools/mockup/scene_world.py` | Generates the street art |
| `tools/mockup/pixelart.py` | PIL toolkit: palette `P`, 5×7 bitmap font, `Canvas`, `PIXEL_AUDIT=1` |
| `tools/mockup/export_game.py` | Exports 1:1 chrome-less art into `public/img/` |
| `docs/design/game-design-document.md` | Pillars, systems, DSE topic mapping, roadmap |
| `docs/design/layout-spec.md` | The layout grid and its rules |
| `docs/deploy.md` | Hosting, the tunnel, the `cloudflared route dns` trap |

## Build, run, deploy

```bash
npm install
npm run build                 # tsc --noEmit && vite build -> dist/
npm run dev                   # vite dev server
rsync -az --delete dist/ developer@172.100.0.211:/var/www/html/cit-game/
```

The build has no dependencies beyond `vite` and `typescript`. Regenerating art needs Pillow and
Noto Sans CJK HK:

```bash
python3 tools/mockup/export_game.py
PIXEL_AUDIT=1 python3 tools/mockup/build.py     # reports anything drawn off-canvas
```

## What is verified working (do not break it)

Played end to end on the live site: tap 陳太 → console types out → wrong answer costs 4 minutes and
an energy pip → correct diagnosis ("not forwarding") → correct explanation → `+$450`, money
`1280 → 1730`, clock `18:40 → 19:00`, marker clears, `localStorage` persists, audio context reaches
`running`.

- Modes: `job` (in `update`, `job ? job.update : city`), drawn over the city; `job.advance()` returns
  to the street and rebuilds spots.
- Spots carry **two anchors**: `y` on the road for reach (the road band is y 187–209, measured off
  `map.png`), `my` on the shopfront for the marker.
- Stanley shopfronts (restaurant, store, market, bakery, Stanley Plaza) are `shut: true` and only
  give a flavour line. They are the next place to hang real jobs.

## Known gaps

1. **Only one job** (陳太, tea shop, default gateway). `Job` is hard-coded to job 4471 and one fault
   tree; it needs a job definition object (id, client, pay, console script, fault tree, mastery tag)
   and a spawner that picks one per spot.
2. **Art is one flat painting.** Ambience was added over the top; the facades themselves are still
   flat blocks. A real art pass means repainting `scene_world.py` with shading, awnings, AC units,
   laundry, sign variety.
3. **No sudden missions**, no timed events, no prison consequence, no live wire (the ticker is a
   hard-coded `WIRE[]` array), no leaderboard.
4. **Energy and minutes** exist and are spent, but nothing yet punishes running out.
5. `mastery` is recorded via `addMastery` but never read by any UI.
6. No tests. Nothing enforces the grade logic; a wrong answer currently only costs time.

## Traps that cost real time

- **A hidden tab suspends `requestAnimationFrame`.** Before concluding "the game is frozen", check
  `document.visibilityState` and probe `rAF`; in automation call `Page.bringToFront` after navigating,
  then assert `window.__frames` is climbing.
- **Canvas CSS size ≠ backing store.** The canvas is 640×360 but its CSS box is whatever fits the
  viewport. Convert game coords → page coords with `rect.left + x * (rect.width / 640)` before any
  synthetic click.
- **The map is a painting, not a grid.** Positions were measured by sampling `map.png` rows, not
  guessed. Do the same for a new object.
- **`localStorage` throws on school iPads** (private mode, quota). `state.save()` already try/catches;
  keep it that way.
- **The font is a bitmap strip.** Only the charset above renders; lowercase is uppercased in `text()`,
  and CJK only exists inside `map.png`.

## Suggested next work, in order

1. **Job definitions + a second job.** Restaurant guest-wifi job (security lesson: open network,
   client isolation, MAC filtering) or bakery POS-to-printer job (subnetting across two devices).
   Acceptance: two spots offer different jobs; each has its own fault tree; payouts differ; both save.
2. **Sudden missions.** A timed `!` on the street with double pay and a miss penalty (money and
   reputation). Acceptance: the window is visible on the marker, expiry changes state, the wire
   announces it.
3. **Art pass on `scene_world.py`.** Facade shading, awnings, AC units, laundry, more sign variety,
   lit interiors. Acceptance: render at 640×360, no off-canvas draws under `PIXEL_AUDIT=1`.
4. **Prison consequence.** Only after there is something to lose: illegal work or leaving a client
   network wide open → 赤柱監獄 screen, time cost, reputation reset.
5. **Live wire.** Replace `WIRE[]` with real events from the session (jobs taken, money milestones),
   then a leaderboard service if the user asks for shared standings.
