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
| Drawing | The map is about 22,500 × 20,500 px, so it is drawn in 512 px chunks as you walk; only nearby chunks are kept (fine on an iPad) |
| Buildings | Drawn from their exact outlines: roof, front wall a few storeys high, windows, a door in the middle of the front, shop awnings in the village, name plates on landmarks |
| Places | Every shop, employer and job is pinned to the door of a real building near where it belongs; landmarks (Murray House, Stanley Plaza, Tin Hau Temple, the library, SSC buildings) use their real buildings by name |

**How the data was made.** In a browser, the OpenStreetMap map API was queried for the box
22.2105–22.2235 N, 114.2045–114.2200 E, converted to whole metres from the map's top-left corner and
simplified to 0.4–0.8 m. `npm run import-osm`-style regeneration: save that export as JSON and run
`node --experimental-strip-types scripts/import-osm.ts file.json`, which writes `src/stanley-osm.ts`.

Known limits: OSM building outlines seal off a few courtyards (places are only put where you can
walk); buildings set at an angle show a stepped front wall, as any tile-based 3/4 view does.

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
