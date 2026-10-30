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
| Language | English only (the bitmap font stays A–Z, 0–9) |
| F1–3 content | Junior ICT/CIT basics, coding and computational thinking, CDC junior AI module |
| F4–6 content | DSE ICT compulsory part A–E |
| Form split | **Job tiers, open to all.** Every job and gig is tagged JUNIOR or DSE; anyone can take any |
| MC delivery | Inside jobs and gigs (pay depends on answers), plus a free **study spot** at the library |
| Work | Employment (steady wage, real-time tasks, can be fired) and freelance (one-off, pays more, needs gear) |
| Upgrades | Equipment, software licences, courses/certificates, and later your own shop |
| Law | **Warning first** for a first minor offence; repeat or serious offences mean jail |
| Names | Landmarks keep real names; private shops get invented names |

## 2. The map

Real Stanley, compressed so it fits on about three screens each way. North is up. The sea (Stanley
Bay) is on the west and south-west, as it really is.

```
              N   STANLEY VILLAGE RD (from the 6/6X/260/73 buses)
   ~~~~~~~~     ┌──────────┐ ║
   ~ STANLEY ~  │ LIBRARY  │ ║  BUS TERMINUS
   ~   BAY   ~  │ (6 Mkt Rd)│ ║  POLICE STN ── OLD POLICE STN (supermarket)
   ~~~~~~~~     └──────────┘ ║
   ~~ MAIN ST ══ MARKET LANES ═╣
   ~~ cafés,     stalls,       ║
   ~~ bars       notice board  ║
   ~~~~~~~~ ═════════════════  ╚═ TUNG TAU WAN RD ─▶ COLLEGE (22) ─▶ PRISON (99)
   ~ BLAKE PIER  MURRAY HOUSE  STANLEY PLAZA  TIN HAU TEMPLE
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

The layout is approximate and from public sources. Before release, check it against a Lands
Department map: students will notice a shop on the wrong side of the road.

**Naming rule.** Real names are used for public places and landmarks: Stanley Plaza, Murray House,
Blake Pier, Stanley Market, Stanley Public Library (Stanley Municipal Services Building, 6 Stanley
Market Road), Stanley Police Station, the Old Stanley Police Station (1859), Tin Hau Temple,
St Stephen's College and Stanley Prison. Private shops get invented names (陳太's tea shop, Bayview
Café, Pixel Fix computer shop and so on), because the game shows businesses getting hacked, cheated
and fined, and no real shop should be the one that happens to.

## 3. Content tiers

Every job, gig and practice question carries a tier and a topic code. Anyone can take anything; the
board just tells you what you are walking into.

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
| Buying or using pirated software | Copyright Ordinance (Cap. 528) | minor |
| Selling or distributing pirated copies | Copyright Ordinance (Cap. 528) | serious |
| Logging into a system you were not given access to | Crimes Ordinance (Cap. 200) s.161 | serious |
| Copying or leaking a client's customer data | Personal Data (Privacy) Ordinance (Cap. 486) | serious |

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

1. Should the teacher switch that turns off law consequences for younger classes (§4.11 of the main
   doc) also apply to F1–3 players automatically?
2. Who reviews the question bank for accuracy against the current DSE ICT curriculum and
   assessment framework before students see it?
3. Is 30 real minutes of jail right for F1 students, or should the sentence scale with severity?
