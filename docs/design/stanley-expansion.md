# Stanley expansion — plan (v0.5)

Agreed with the project owner on 2026-10-30. Where this document and the main
[game design document](game-design-document.md) disagree, this one wins: it records later decisions.

## 1. What changes

The game stops being one strip of Tung Tau Wan Road and becomes **Stanley village**, top-down, that
F1–F6 students walk around. They find work at businesses, take freelance gigs, buy gear and courses
that unlock better work, and can end up in Stanley Prison if they break the law.

The questions are no longer networking-only. F1–3 get junior ICT/CIT, coding and the EDB junior AI
module; F4–6 get the **whole DSE ICT compulsory part**. All questions are four-option MCs in DSE
style.

| Decision | Choice |
|---|---|
| Map scope | Village core: bus terminus, Stanley Village Rd, Stanley Market, Stanley Main St waterfront, Stanley Plaza, Murray House, Blake Pier, the library, the police station, and the link to Tung Tau Wan Rd (college, prison) |
| Camera | Top-down, scrolling, north up, traced from the real street layout |
| Language | English only (the pixel font now has lowercase for questions; no Chinese) |
| F1–3 content | Junior ICT/CIT basics, coding and computational thinking, CDC junior AI module |
| F4–6 content | DSE ICT compulsory part A–E |
| Form split | **Nobody is assigned a form.** Questions range from F1 to F6 and every player sees all of them. Easier work pays less (§3.1) |
| MC delivery | Inside jobs and gigs (pay depends on answers), plus a free **study spot** at the library |
| Work | Employment (steady wage, real-time tasks, can be fired) and freelance (one-off, pays more, needs gear) |
| Upgrades | Equipment, software licences, courses/certificates, and later your own shop |
| Law | **Warning first** for a first minor offence; repeat or serious offences mean jail |
| Names | Landmarks keep real names; private shops get invented names |

## 2. The map

**Real Stanley, at real scale.** One tile is one metre (16 px). The ground, every road and path, the
coastline, the prison walls and all 662 building outlines come from OpenStreetMap (© OpenStreetMap
contributors, ODbL: credit them in the game's credits). The map covers about 1.4 × 1.3 km, from
Ma Hang Estate in the north-west to Stanley Prison in the south-east.

| Decision | Choice |
|---|---|
| Scale | 1 m per tile. Walking Stanley Plaza → SSC back gate (≈600 m) takes **5 minutes**; running (Shift or the run button) is 2.4× faster |
| SSC back gate | Where the campus meets Wong Ma Kok Road beside Wong Ma Kok Road Playground |
| Drawing | The map is about 22,500 × 20,500 px, so it is drawn in 512 px chunks as you walk; only nearby chunks are kept (fine on an iPad). The game is laid out on a 640 × 360 grid, but the canvas has as many real pixels as the screen shows it at (up to 4 per grid unit), so nothing is blown up |
| Ground | Drawn at 8 art pixels per metre (2 px each). Each pixel takes the class with most pull from the 5×5 metres around it, so diagonal edges come out straight and coastlines curve; natural edges (grass, woods, sand) also wander a little. Painted from hand-picked tones, not raw noise: patchy grass with blades, mown stripes on lawns and pitches, dry patches on meadows, granite boulders on the shore, two bands of shallows, half-metre paving, kerbs and gutters. Pavements are added beside every road |
| Buildings | Outlines are tidied first, for drawing and collision alike (artistic, walls move up to about a metre): near-rectangles become their rectangle; mostly-square outlines are redrawn on a 1 m grid in the building's own direction (snapped square to the map within 20°), filling notches and trimming stubs under 2 m; outlines with real diagonal walls are simplified and have near-square corners squared; any sawtooth of short walls (a terrace stepping along a diagonal street) becomes one straight frontage. Each is a block seen from the south, kept inside its footprint: front walls rise from every south-facing edge and are painted back to front, then the roof sits on top, lifted by the wall height, so notched or stepped outlines come out as proper stepped facades. Windows, doors, shopfronts and awnings are drawn on the plane of their wall, so they slant with it; edges under 1.2 m stay plain wall, and outlines drop jogs under 0.35 m. Drawn from their exact outlines as polygons: pitched roofs with a shaded far slope, tile rows and a ridge, or flat roofs with a parapet, water tanks, air-con units, stair houses and (on big ones) solar panels; a front wall on every south-facing edge at any angle, a window row per storey with floor lines, glass shopfronts and striped awnings in the village, a door at the real entrance, a shadow that grows with height, name plates on landmarks. Walls turned well away from the viewer show piers instead of windows |
| Detail | Woods are packed with overlapping pixel-art crowns in three greens (some in blossom), with a walkable 2 m edge of scrub along every path. Street trees and lamps along roads, shrubs, grass tufts, flowers, shore boulders, bins, benches, parked cars on side streets, market stalls, beach umbrellas, boats, about fifty people walking |
| View | Zoomed out by default: 80 × 45 m on screen (ground art pixels land one-to-one on canvas pixels, so it stays crisp); Z or the zoom button toggles the close 40 × 22 m view. People are drawn a little larger when zoomed out. Labels are drawn at screen size: a coloured chip with an icon and name over every place, then landmark name plates where there is room |
| Entrances | Every usable place has a pulsing pad on the ground in its colour (shops green, work yellow, minibuses green, police blue...) with a chevron pointing to the door. Green minibus stops have a pole and the green-and-white sign with their route numbers |
| Landmarks | Buildings people know get their own look from the `LANDMARKS` table in `src/world.ts` (wall and roof colour, roof shape, façade: windows, open colonnades or a glass curtain wall, a public roof terrace, chimneys, wall height). So far: Murray House (granite colonnades on every floor, grey hipped roof, chimneys). Add more by name |
| Stanley Plaza | Not drawn as a block: `src/plaza.ts` lays it out as the terraced mall it is. Following the real one (Link REIT's 2011 rebuild: six floors of semi-outdoor shops), it steps down the hill in six floors: 5/F level with Carmel Road, the bus stop and the coach park (a deli and a youth centre); 4/F the observation deck with telescopes, a waffle bar and the management office; 3/F a bank, an optician and a grill with tables on the terrace; 2/F the supermarket, a kids' play centre and a salon, with a bridge to the car park; 1/F fried chicken, a surf shop, pizza and the training centre, with the walkway towards Ma Hang Estate at the west end; G/F the piazza with the amphitheatre and the pirate-ship playground, ringed by a café, burger places, a bistro, pizza and gelato with outdoor tables. What is on each floor follows the real directory (OpenRice and shop addresses, 2026); the names are invented, as for every private business. Each floor is a deck you walk on; the shops of a floor are the row of shopfronts in the wall under the deck above (solid), with blue glass canopies. The HUD names the floor you are on ("stanley plaza, 2/f"). Shoppers wander every floor |
| Stanley Market | Drawn from how visitors and guides describe it: a warren of narrow, largely covered lanes lined on both sides with small open-fronted stalls (about 260 here; guides count 100–150 vendors and shops) along Stanley New Street, Stanley Market Road and the market stretch of Stanley Main Street. Each stall is 2.4 m wide, facing the lane, with a canvas awning and a red sign, and sells one thing: silk dresses and Chinese clothes, T-shirts, paintings, bags, toys or souvenirs (chopsticks, fans, seals, red lanterns). Most have a stallholder inside. Where a shop comes right up to the lane, a shallow display stands in front of it. Translucent corrugated roofing covers most of each lane. 30 shoppers browse the lanes and stay there. The hawker bazaar (a 1972 site with 28 licensed pitches) is rows of covered pitches inside its real outline, around the notice board |
| Escalators | One escalator pair per floor in Stanley Plaza, zig-zagging (G/F→1/F by the piazza café, then east, west, east, and up to 5/F), so you walk along each terrace on the way up; a stair at the other end of each terrace goes straight through, and a glass lift runs through every floor: stand at a lift stop, press E and pick a floor (`FLIGHTS` and `LIFT_STOPS` in `src/plaza.ts`). The west lane carries you down, the east lane up, about 1.5 m/s; the steps move. Floor boards (G/F … 4/F) stand at the head and foot of each escalator |
| Walking | Every mapped road, path and steps stays open: buildings are never built over one (a passage under a building stays a passage) and a fence crossing one has a gate there. Pockets of open ground sealed in by woods or a fence get a scrub trail or a gate to the nearest street (prison yards stay shut); 96% of open ground is one connected walk. Tap-to-walk uses A* in eight directions (no squeezing past corners) over a wide window, then straightens the route into a few walkable lines; a tap on somewhere unreachable walks as close as it can. Walking into a corner eases you round it instead of stopping dead |
| Behind buildings | A building's picture covers ground north of its footprint (its roof is lifted to show the front wall). Anyone standing there, or in a passage under it, is drawn behind it: the building joins the depth sort at its front edge, and you see yourself as a faint outline through it |
| Places | Every shop, employer and job is pinned to the door of a real building near where it belongs; landmarks (Murray House, Stanley Plaza, Tin Hau Temple, the library, SSC buildings) use their real buildings by name |

**How the data was made.** In a browser, the OpenStreetMap map API was queried for the box
22.2105–22.2235 N, 114.2045–114.2200 E, converted to whole metres from the map's top-left corner and
simplified to 0.4–0.8 m. `npm run import-osm`-style regeneration: save that export as JSON and run
`node --experimental-strip-types scripts/import-osm.ts file.json`, which writes `src/stanley-osm.ts`.

**The 3D model (SSC area).** The project owner supplied a 3D model (.glb) of about 750 × 600 m
around St Stephen's College, St Stephen's Beach and the hill to Stanley Main Beach. Its meshes are
Draco-compressed and are not decoded; the import uses only what is readable without that: the
terrain's texture (an aerial photo), each building tile's bounding box (its height), and the tile
names (Hong Kong 1980 Grid coordinates), which place it on the map to within a couple of metres.
The model is one 750 × 600 m tile of the Lands Department's 3D Visualisation Map
(3d.map.gov.hk); the game map spans a 3 × 3 block of them, and this is the centre one.
`python3 scripts/import-3d.py tile1.glb tile2.glb ...` takes any number of tiles, stitches them,
sorts the photos into woods, lawn, shore rock and sand and
writes `src/stanley-cover.ts`, along with a roof colour (snapped to a small palette), height and
roof shape for the 184 buildings it covers. Front walls are drawn at about 0.4 of a building's real
height (2–10 m) so roofs stay visible. Woods block walking, except a 2 m fringe along paths, roads
and buildings. Outside the model, open hillside gets invented copses so it matches; that part is
artistic, not surveyed.

**Real building shapes (Lands Department OBJ sheets).** The 3D Visualisation Map's tile-based
OBJ download (photo mesh, by 1:1000 map sheet: Stanley is 15-NE-12A to 12D, with 13A, 13C, 17A,
17B and 18A for the edges) is turned into a 0.5 m surface-height map by `scripts/dsm.py` (run it
where the zips are, about 2 minutes for 20 GB; needs numpy), then `python3 scripts/import-dsm.py
dsm.npz` writes `src/stanley-shapes.ts`. A cell is building if it stands 2.2 m above the ground
around it and is made of flat or evenly sloped patches (tree crowns are speckled). Each OSM
building takes the building cells around its outline: real footprint, height above the ground
outside its walls, and pitched or flat roof. 374 of 662 OSM buildings are reshaped this way and 11
missing ones added (they must have walls all round, so trees are not mistaken for buildings).
Landmarks in `LANDMARKS` keep their drawn outline and take only the height. The outlines then go
through the same tidying as OSM's. Credit: Lands Department, HKSAR Government (terms of use of
3d.map.gov.hk); shown on the status screen.

**Buildings' real look (textures).** `scripts/render-oblique.py` (run where the OBJ zips are, about
2 minutes a sheet) renders the 3D photo mesh in the game's own view: from above, with south walls at
0.4 of their height, only what stands above the ground. `scripts/export-buildings.ts` prints the
outlines the game draws, and `python3 scripts/import-photos.py render.png buildings.json` cuts each
building's area out of the render (its outline swept up by its wall), fills mesh gaps, smooths
photo speckle with a 3×3 median and lifts colour a little. The render is at 8 pixels per metre, the
same as the game's art grid. Output: `public/img/buildings.webp` (one 4096-wide atlas, under 2 MB) and
`src/stanley-photos.ts`. 390 buildings use it; the rest keep the drawn style. The game draws the
map without them until the atlas has loaded, then redraws.

Known limits: OSM building outlines seal off a few courtyards (places are only put where you can
walk). Collision still uses the 1 m grid, so you stop up to half a metre short of a slanted wall.

### 2.1 Green minibuses

Two real routes run on the real roads, and you can ride them.

| Route | Stops in the game | Fare |
|---|---|---|
| GMB 40 (Stanley Village – Causeway Bay) | Stanley Beach Road terminus, Stanley Plaza | $3.1 |
| GMB 52 (Aberdeen – Stanley Prison) | Ma Hang Estate, Stanley Plaza, St Stephen's College, Stanley Prison | $3.1 |

Walk to a stop, press E, pick where to go and pay as you board. You watch the ride from above
(tap to skip) and get off at your stop; the in-game clock moves on a few minutes. The 52's $3.1 is
the Transport Department's Ma Hang Estate – Stanley Prison section fare from 6 September 2026.
The 40 publishes no fare for a hop inside Stanley, so the game uses the same $3.1: check before
release.

**Naming rule.** Real names are used for public places and landmarks: Stanley Plaza, Murray House,
Blake Pier, Stanley Market, Stanley Public Library (Stanley Municipal Services Building, 6 Stanley
Market Road), Stanley Police Station, the Old Stanley Police Station (1859), Tin Hau Temple,
St Stephen's College and Stanley Prison. Private shops get invented names (陳太's tea shop, Bayview
Café, Pixel Fix computer shop and so on), because the game shows businesses getting hacked, cheated
and fined, and no real shop should be the one that happens to.

## 3. Content tiers

Every question carries a **form level (F1–F6)** and a topic code. F1–3 questions use the junior
topics and F4–6 the DSE ones. Players are never assigned a form: everyone sees the whole range.

| Tier | Code | Topic |
|---|---|---|
| JUNIOR | J1 | Computer basics: hardware, software, storage, units, file types |
| JUNIOR | J2 | Digital citizenship: passwords, phishing, privacy, copyright, cyberbullying |
| JUNIOR | J3 | Coding and computational thinking: algorithms, flowcharts, sequence, selection, iteration |
| JUNIOR | J4 | AI (CDC junior module): what AI is, machine learning, training data, bias, ethics |
| DSE | A | Information processing: data vs information, number systems, character codes, databases, spreadsheets |
| DSE | B | Computer system fundamentals: CPU, memory, storage, I/O, OS, utilities |
| DSE | C | Internet and its applications: networks, IP, DNS, protocols, web, security |
| DSE | D | Computational thinking and programming: algorithms, pseudocode, testing, data types |
| DSE | E | Social implications: health and safety, IP and copyright, privacy (PDPO), cybercrime |

### 3.1 Easier work pays less

Each right answer on a gig pays its form's rate, times the gig's gear multiplier and the laptop
boost: F1 $80, F2 $100, F3 $120, F4 $160, F5 $190, F6 $220 (`FORM_RATE` in `src/questions.ts`).
Each gig draws questions from a form range (e.g. F1–2 or F5–6), so the board shows roughly what it
pays. Employment pays a flat wage per task, and the junior-level employer pays less than the DSE one.

### 3.2 The question bank

The owner will supply the main bank. Teachers fill in `content/question-bank-template.csv` (columns
`id, form, topic, question, a, b, c, d, answer, explanation`) and run
`npm run import -- path/to/bank.csv`. That writes `src/questions-imported.ts`, which is merged into
the bank, and rejects rows with a wrong form/topic pairing, a bad answer letter, or characters the
pixel font cannot draw. The 62 starter questions stay unless they are removed from
`src/questions.ts`.

**Questions are original.** They are written in the style of DSE Paper 1 MCs and test the same
skills, but none is copied from an HKEAA past paper. Past papers are HKEAA copyright, and a game
that jails players for copyright infringement should not commit it. A teacher who wants real past
papers can still use them in class alongside the game.

Content lives in `src/questions.ts`; `npm run check` fails the build on a question without exactly
one right answer, a missing explanation, or a string the font cannot draw.

## 4. Work

### 4.1 Freelance gigs

- Posted on the **notice board** in Stanley Market and occasionally by a shopkeeper who waves you
  over. Each gig is a client scenario at a named Stanley business with 3–5 MCs.
- **One-off.** Paid once, then gone; a new set is posted every in-game day.
- **Pays more than a shift** of employment for the same number of questions (about 1.4×), and
  scales with how many you get right. 0 right pays nothing and costs a little reputation.
- **Needs your own gear.** A gig lists what it needs (laptop tier, a cable tester, a camera, a
  licensed copy of some software). No gear, no gig.

### 4.2 Employment

- Apply in person at a business with a vacancy. One employer at a time. Some ask for a certificate
  or a minimum reputation.
- **Steady wage:** every completed work task pays the shift wage, whatever the score. Score affects
  reputation, and reputation decides raises.
- **Tasks arrive every 5 real-world hours**, even while the game is closed, as the owner asked. A
  task is 3 MCs at the workplace. Up to 4 can stack.
- **Getting fired** depends on the boss:
  - **Relaxed** employers fire you if your oldest unfinished task is **5 days** old.
  - **Strict** employers fire you at **3 days**.
  - At half the limit the boss warns you, on the wire and when you walk in.
- Fired means the job is gone, reputation with that business drops, and you can reapply after 7
  days.

*Note:* this is the one place the game deliberately runs on real time, which goes against pillar 5
of the main design document ("nothing rots while you are away"). The owner chose it on purpose. The
resume screen always says what is waiting ("2 work tasks at Bayview Café, oldest 2 days — strict
boss fires at 3"). Because it uses the device clock, a student can cheat it by changing the clock.
That is acceptable for a game played for fun; it is fixed for free when the live service exists
(§8.3 of the design doc).

### 4.3 Study spot

**Stanley Public Library.** Pick a tier and topic, get 5 MCs with full explanations. It pays
nothing and costs nothing, and nothing bad happens for a wrong answer. It is where you practise
before a course exam.

## 5. Upgrades

| Kind | Where | Examples | What it unlocks |
|---|---|---|---|
| Equipment | Pixel Fix (computer shop) | used laptop → mid laptop → workstation, cable tester, camera, label printer | gig types that list them; a better laptop also pays +10%/+20% |
| Software licences | Pixel Fix | office suite, photo editor, accounting package | gigs that need them |
| Pirated software | a stall holder in the market | the same, at 15% of the price | the same gigs, plus a copyright offence on record (§6) |
| Courses | Stanley Plaza training centre | Junior Digital Skills, IT Support Certificate, Network Basics | employers that require them; passing needs 4/5 on a short MC exam |
| Own business | a vacant shopfront in the market | rent a shop, then hire help | late game, not in this slice |

## 6. The law

Offences are things the player chooses, never random. Each one cites the real Hong Kong ordinance on
the case sheet. A teacher should check the wording before students see it.

| Act | Ordinance | Severity |
|---|---|---|
| Using pirated software for paid work | Copyright Ordinance (Cap. 528) s.31A | minor |
| Selling or distributing pirated copies | Copyright Ordinance (Cap. 528) s.118 | serious |
| Logging into a system you were not given access to | Crimes Ordinance (Cap. 200) s.161 | serious |
| Copying or leaking a client's customer data | Personal Data (Privacy) Ordinance (Cap. 486) s.64 | serious |

- **First minor offence:** a police officer stops you. A written warning and a fine, and the pirated
  item is confiscated. The warning goes on your record.
- **Second minor offence, or any serious offence:** arrested, Stanley Police Station, then Stanley
  Prison. The existing case-sheet screen and real-time sentence (30 minutes) are kept.
- The record is visible on the status screen. Some employers will not hire you with a record in the
  last 14 in-game days.

## 7. First playable slice (v0.5)

What this build delivers, in order:

1. A top-down, scrolling Stanley village map with collision and tap-to-walk pathfinding.
2. A four-option MC engine used by gigs, work tasks, courses and the library.
3. A starter question bank: at least 24 JUNIOR and 30 DSE questions across all topic codes.
4. A notice board with freelance gigs that need gear.
5. Two employers (one relaxed, one strict) with real-time tasks, warnings and firing.
6. Pixel Fix shop (equipment and licences), the pirate stall, and Stanley Plaza courses.
7. Warning-then-jail law system, reusing the prison screen.
8. The existing networking console jobs (陳太's till, the bakery) kept and placed on the new map.

**Not in this slice:** own business, more districts, the live board, 繁中.

## 8. Open questions

Answered on 2026-10-30: players do not pick a form, so the law applies the same to everyone; the
owner will provide the question bank; the map has been redrawn from real coordinates.

1. Should the starter questions be kept alongside the owner's bank, or replaced by it?

## 9. Gameplay direction (agreed 2026-10-30, for v0.6 onwards)

| Decision | Choice |
|---|---|
| When students play | Freely, any time, not tied to lessons |
| Goal | Be the **richest on the server** (a net-worth leaderboard) |
| Other players | A leaderboard, competing in one shared job market, and (late game) owning a business. Nothing else: no chat, no trading |
| Teachers | Admins and observers only. They do not steer what students get |

### 9.1 What those decisions force

1. **A server, with the economy on it.** Today money, answers and the clock live in the browser
   (localStorage and the device clock), which any student can edit. That is fine for one player and
   fatal for a leaderboard. The server must own money, the clock and the answer key: the browser
   sends the choice and gets back right or wrong, never the answer in advance.
2. **A real-time cap on play.** At the moment taking the bus home starts a new day with full
   energy, so energy is unlimited and "richest" would just mean "played longest". Proposal: energy
   comes back in real time (say 1 every 30 minutes, up to 8), and sleeping only moves the in-game
   clock.
3. **Accuracy beats volume.** Pay follows right answers, with a streak bonus. A question you have
   already seen pays less each time, so memorising a shared answer list stops paying. Wrong answers
   cost reputation.
4. **One job market per server.** One notice board for everyone: gigs are claimed first come,
   first served, and employers have a fixed number of jobs and hire the applicants with the best
   reputation and certificates.
5. **Money has to drain out**, or the leaderboard is just a record of the past: rent, software
   licences that expire, gear that wears out, fines, minibus fares, a business's running costs.
   Net worth counts what you own at resale value, so buying gear never drops you down the board.
6. **Businesses are real shopfronts.** Late game, a limited number of real Stanley shopfronts can
   be rented, one player each. Income depends on reputation and on handling incidents (questions);
   a neglected shop loses customers and can be lost.
7. **Teacher tools.** Observer: a class view of progress by topic, accuracy and records.
   Admin: reset or suspend a player, rename an unsuitable shop name.
8. **No seasons.** The leaderboard never resets (decided, §9.2). Because a student who joins late
   starts far behind, the money drains in point 5 matter even more.

### 9.2 Answered on 2026-10-30

- **Log-in:** Google accounts, but not yet: build without accounts for now.
- **The server:** one for the whole school; everyone plays together.
- **Seasons:** none for now; the leaderboard never resets.

Still open: who builds and hosts the server, and whether the real-time work tasks (every 5 hours)
stay as they are now that play is free.
