# Handoff — NETLIFE: HK (cit-game)

Read this before touching code. It is the state of the build, the decisions behind it, and the
traps that cost time.

- **Repo:** <https://github.com/SSC-Program-Team/cit-game> (private, `main`)
- **Live:** <https://ai.ssc.edu.hk/cit-game/> — a static build served by school Apache
- **Status:** playable slice, v0.5. Top-down Stanley village, MC gigs and work tasks, employers on a
  real-time clock, shop, courses, library, warning-then-jail. See
  [stanley-expansion.md](design/stanley-expansion.md) for the decisions. The v0.4 notes below still
  hold for the console jobs, missions and prison; where they mention `map.png`, the road band or
  spot anchors, they describe the old side-on street, which v0.5 replaced.

## v0.5 in one screen

| Path | What it is |
|---|---|
| `src/world.ts` | The map: ground painted from rectangles, `BUILDINGS`, `PLACES` (what you can use, on which tile), collision, BFS `findPath` for tap-to-walk, and `renderWorld()` which draws everything once into an offscreen canvas |
| `src/questions.ts` | The MC bank. Four options, one answer, an explanation. Tier `junior` (J1–J4) or `dse` (A–E). All original — **do not paste HKEAA past-paper questions** |
| `src/economy.ts` | Items, Pixel Fix and pirate stock, courses, employers, gigs, the daily board, offences |
| `src/font.ts` | The pixel font as a glyph table (caps from `pixelart.py` plus lowercase). Replaces `font.png` |
| `src/state.ts` | Save v2. A v1 save migrates: money and progress kept, position reset |
| `src/main.ts` | Modes in priority order: prison, console job, quiz, menu, village |

- **Real time on purpose.** `state.work.tasks` holds wall-clock issue times. `tickWork()` runs at
  start and every second: it issues tasks that fell due (every 5 h, max 4 waiting), warns at half the
  firing limit and fires at the limit (strict 3 days, relaxed 5). Test with `__skip(hours)`.
- **The law is deterministic.** A gig done with a pirated licence ends with a police check. First
  offence of any kind and not serious: $500 fine, pirated items confiscated, a record entry. Any
  later offence, or a serious one (selling discs, leaking the customer list, the console-job
  crimes): jail for 30 real minutes.
- **Test hooks:** `__goto(placeId)` stands you at a place and uses it; `__quiz()` exposes the right
  answer; `__menu()`; `__skip(h)`; `__reset()`; plus the v0.4 hooks.
- **Build in a sandbox without npm:** if the registry is blocked, `tsc --noEmit` and
  `esbuild src/main.ts --bundle --format=esm` give a playable bundle; `npm run build` is still the
  real build.

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
game owns. `src/main.ts` is the engine and modes; `src/jobs.ts` is all job, mission and offer
content; `src/state.ts` is the save; `src/audio.ts` is the procedural audio engine.

The slice was originally Phaser 3. It was removed for two reasons found in the same debugging session:

1. In the automated browser the tab was `hidden`, which suspends `rAF` — Phaser's loop never stepped,
   so scenes appeared frozen and `scene.start()` silently no-opped. That is an environment issue, but
   it made Phaser impossible to verify.
2. Even outside that, `this.scene.start('Job')` queued an operation that never ran while
   `game.scene.start('Job')` worked — a second scene would render one frame and then never update.

Hand-rolled modes removed both problems and took the bundle from **1.5 MB to 19.7 kB (8 kB gzipped)**.
With jobs, missions and prison it is **32.7 kB (12.8 kB gzipped)**. Every frame is observable via
`window.__frames`.

**Do not reintroduce Phaser** unless you have a concrete feature that justifies it.

## Files

| Path | What it is |
|---|---|
| `src/main.ts` | The game: canvas, bitmap font renderer, input, city / job / prison modes, missions, HUD, ambience |
| `src/jobs.ts` | `JOBS` (陳太, bakery), `MISSIONS` (store DNS, market DHCP pool), `OFFER` (the man at the terminus), `CHARSET` |
| `scripts/check-jobs.ts` | Build-time content check: charset, line lengths, one right answer per stage, every wrong answer has a hint or a crime |
| `src/state.ts` | `money`, `x`, `y`, `energy`, `minutes`, `done[]`, `rep{}`, `jail`, `mission`; `save`/`load`/`clock`/`addMoney`/`addMinutes`/`addMastery` |
| `src/audio.ts` | Procedural lo-fi loop + SFX (`ui`, `ok`, `bad`, `cash`, `door`, `step`, `alert`); `unlock()` on first gesture |
| `public/img/map.png` | 640×360 street art, chrome-less, no HUD |
| `public/img/font.png` | 144×24 glyph strip, 24 cols × 6×8 cells, charset `A–Z 0–9` + `.,:;-/$%+!?[]()*#'<>=\` |
| `tools/art/hi_world.py` | **Generates `map.png`** (and the 2× copy in `docs/mockups/`) |
| `tools/art/font_sheet.py` | Generates `font.png`; its `CHARSET` must match `src/jobs.ts` |
| `tools/mockup/pixelart.py` | PIL toolkit: palette `P`, 5×7 bitmap font, `Canvas`, `PIXEL_AUDIT=1`, `CJK_FONT` env var |
| `tools/mockup/scene_world.py` | The old 384×216 street. Not used by the game any more |
| `docs/design/game-design-document.md` | Pillars, systems, DSE topic mapping, roadmap |
| `docs/design/layout-spec.md` | The layout grid and its rules |
| `docs/deploy.md` | Hosting, the tunnel, the `cloudflared route dns` trap |

## Build, run, deploy

```bash
npm install
npm run build                 # check-jobs && tsc --noEmit && vite build -> dist/
npm run dev                   # vite dev server
npx vite preview --port 4173  # serves dist/ at http://localhost:4173/ (base is relative: not /cit-game/)
rsync -az --delete dist/ developer@172.100.0.211:/var/www/html/cit-game/
```

Pushing to `main` does **not** update the live site; there is no CI. Someone with the server key
runs the rsync. `npm run check` needs Node ≥ 22.6 (`--experimental-strip-types`). Restart
`vite preview` after a build: it indexes `dist/` once at startup.

The build has no dependencies beyond `vite` and `typescript`. Regenerating art needs Pillow and
Noto Sans CJK Bold; point `CJK_FONT` at it if it is not at the Debian path:

```bash
CJK_FONT=/path/to/NotoSansCJK-Bold.ttc PIXEL_AUDIT=1 python3 -B tools/art/hi_world.py
```

Run with `-B`: a stale `.pyc` once reported audit figures from the previous version of the file.
The audit is clean as of v0.4.

## What is verified working (do not break it)

Played end to end on the live site: tap 陳太 → console types out → wrong answer costs 4 minutes and
an energy pip → correct diagnosis ("not forwarding") → correct explanation → `+$450`, money
`1280 → 1730`, clock `18:40 → 19:00`, marker clears, `localStorage` persists, audio context reaches
`running`.

- Modes: `job` (in `update`, `job ? job.update : city`), drawn over the city; `job.advance()` returns
  to the street and rebuilds spots.
- Spots carry **two anchors**: `y` on the road for reach (the road band is y 187–209, measured off
  `map.png`), `my` on the shopfront for the marker.
- **Jobs are data.** A `JobDef` in `src/jobs.ts` has a console script, an optional note slip, and
  stages of 2–3 choices. A choice is `ok`, wrong with a `hint` (costs 4 min + an energy pip, except
  in `free` "tell the client" stages), or a `crime` (arrest). The bakery job (subnetting a till and
  a receipt printer) has four stages, the last one an illegal shortcut offered for $200.
- **Sudden missions.** First at 60 s of street time, then every 120–180 s. The wire flashes `ALERT`,
  the shopfront gets a red `!` with a 90 s countdown; walk or tap to accept for double pay. Expiry:
  −$100, `rep[client] −10`, the wire says the client called Ah Ming. Missions tick only on the street.
  The store and market open for good once their mission is done.
- **Prison.** Any `crime` choice (in a job, a mission, or the terminus offer) sets `state.jail` to
  `Date.now() + 30 min` and saves. While jailed only the case sheet and a real-time countdown render;
  reload does not escape. Release puts the player at the prison gate. The case sheet cites Crimes
  Ordinance (Cap. 200) s.161; **have a teacher check that wording** before students see it.
- Restaurant and Stanley Plaza are still `shut: true` with a flavour line.
- Test hooks: `__cit` (state), `__job()` (id, step, stage, options), `__mission()` (force a callout
  now), `__frames`, `__audio`.

## Known gaps

1. **Two jobs, two missions.** Each spot has a fixed job; there is no spawner or repeat work.
2. **No live wire** beyond session news (jobs paid, missions missed), and no leaderboard.
3. **Energy and minutes** are spent, but nothing yet punishes running out.
4. `mastery` is recorded via `addMastery` but never read by any UI.
5. No unit tests. `scripts/check-jobs.ts` catches content mistakes, not logic ones. The bakery's
   crime choice was not clicked in a play-test; it shares the code path with the store mission's,
   which was.
6. Shopfront art is static: the store and market look the same whether or not they have opened.

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

1. **Restaurant guest-wifi job** (open network, client isolation, WPA2/WPA3). It is the last shut
   shopfront with a real business behind it.
2. **Make energy matter.** At 0 pips the player should have to go home (the night ends, the clock
   jumps), not lose anything permanent.
3. **Show mastery diegetically**: clients ask for you by skill, harder jobs only come from people who
   vouch for you. No bars.
4. **Live wire + leaderboard** if the user asks for shared standings.
