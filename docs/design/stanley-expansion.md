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

Redrawn on 2026-10-30 from real coordinates. Every landmark's latitude and longitude was taken
from public sources and mapped to a tile, so directions between landmarks are right: Stanley Bay
lies **south** of Main Street, Stanley Main Beach is **north-east** of the village on Tai Tam Bay,
and the college and prison sit on the peninsula to the **south-east**. The mapping is piecewise —
the village core is drawn larger than the hills and bays around it — so distances are compressed,
but no landmark is on the wrong side of another. The anchor table lives at the top of
`src/world.ts`.

```
  N            MA HANG          (hill)              STANLEY VILLAGE RD     MAIN BEACH ~ TAI TAM
  ~ CARMEL RD  ESTATE                                  ║   BEACH RD ─────── water sports    BAY ~
  ~   ║                     LIBRARY   PIXEL FIX       ║   BUS TERMINUS                        ~
  ~ STANLEY PLAZA      ═══ STANLEY MARKET RD ═══════╣                                    ~
  ~ TIN HAU   STORE    T-SHIRTS │NEW ST│ SILK PHONES  ║   STANLEY POLICE STATION       ~
  ~ MURRAY HOUSE  TEA SHOP CAFE │ board│ BAKERY  OLD POLICE STN (supermarket)        ~
  ~ ═══════════════ STANLEY MAIN ST (promenade) ═══════╣                          ~
  ~~~~ BLAKE PIER ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ ╚═ TUNG TAU WAN RD ═════╗  ~
  ~~~~~~~~~~ STANLEY BAY ~~~~~~~~~~~~~~ ST STEPHEN'S   ST STEPHEN'S COLLEGE    ║ ~
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ BEACH           MILITARY CEMETERY   STANLEY PRISON
```

| Landmark | Lat, lon | Source |
|---|---|---|
| Ma Hang Estate | 22.2214, 114.2065 | Wikipedia |
| Murray House | 22.2182, 114.2097 | Wikipedia (map centre) |
| Stanley Market | 22.2188, 114.2120 | Wikipedia |
| Old Stanley Police Station | 22.2183, 114.2131 | Wikipedia |
| Stanley Main Beach | 22.2212, 114.2140 | Wikipedia |
| Stanley Bay (centre) | 22.2162, 114.2112 | Wikipedia |
| St Stephen's College | 22.2157, 114.2160 | Sygic travel listing |
| St Stephen's Beach | 22.2130, 114.2148 | Wikipedia |
| Stanley Prison | 22.2119, 114.2189 | Wikipedia |

Tin Hau Temple is placed from its description ("western end of Stanley Main Street, through Stanley
Plaza"), Blake Pier from "next to Murray House", the library from its address (6 Stanley Market
Road) and the new police station as "opposite the old one". The shop rows inside the market are
invented. Private housing is drawn without names.

Still worth a check against a Lands Department map before release: the exact line of Tung Tau Wan
Road (drawn as straight segments), and the shape of the Tai Tam Bay coast.

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
