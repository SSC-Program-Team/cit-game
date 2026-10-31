/**
 * Stanley Plaza, drawn as what it is: a mall built into the hillside in terraces, five floors
 * stepping down from the bus deck on Carmel Road (4/F) to the piazza by the waterfront (G/F).
 *
 * Each floor is an open-air deck you walk along. The shops of a floor are in the storey under the
 * deck above it, so seen from the south (the way the game looks) each step down shows a row of
 * shopfronts: the front wall of the floor above. Escalator pairs zig-zag up through those walls,
 * one flight per floor, with stairs at the other end of each terrace.
 *
 * Everything here is in metres, in the same coordinates as the rest of the map. Not surveyed:
 * the floors sit where the real building is and step the way it does, laid out to play well.
 */

/** how deep, on the map, one storey's front wall is (a storey is about 4.5 m; drawn a little less) */
export const FACE = 5;

/**
 * The decks: where you walk on each floor. `open` lists the sides that meet the street at the same
 * level (n, e, w); every other side has a glass balustrade. A floor can be several rectangles.
 * A `roof` is not walked on: it is only there for the row of shops in the wall under it (5/F's).
 *
 * The real plaza (Link REIT, 2011 rebuild) has six floors of semi-outdoor shops, G/F to 5/F: the top
 * at the bus stop and coach park on Carmel Road, the observation deck and the management office on
 * 4/F, the 1/F walkway to Ma Hang Estate, and the piazza with the amphitheatre and the pirate ship
 * on G/F, ringed by restaurants with outdoor tables.
 */
export type Deck = { level: number; x0: number; x1: number; y0: number; y1: number; open: string; roof?: boolean };
export const DECKS: Deck[] = [
  // the block on top of 5/F's shops (the deli, the youth centre)
  { level: 6, x0: 405, x1: 421, y0: 343, y1: 346, open: '', roof: true },
  // 5/F: level with Carmel Road, the bus stop and the coach park
  { level: 5, x0: 401, x1: 425, y0: 351, y1: 357, open: 'ne' },
  // 4/F: the observation deck, over Stanley Bay
  { level: 4, x0: 395, x1: 431, y0: 362, y1: 369, open: '' },
  // 3/F: the bank, an optician, a grill with tables out on the terrace
  { level: 3, x0: 390, x1: 437, y0: 374, y1: 381, open: '' },
  // 2/F: the supermarket, a kids' play centre; a bridge to the car park on the east
  { level: 2, x0: 386, x1: 442, y0: 386, y1: 393, open: 'e' },
  // 1/F: fried chicken, pizza, the training centre; the walkway to Ma Hang Estate leaves the west end
  { level: 1, x0: 382, x1: 451, y0: 398, y1: 405, open: 'w' },
  // 1/F east wing, over the G/F restaurants on the piazza
  { level: 1, x0: 421, x1: 458, y0: 398, y1: 418, open: 'n' },
];

export const FLOOR_NAMES = ['g/f', '1/f', '2/f', '3/f', '4/f', '5/f'];

/** the deck under a point, if any */
export function deckAt(x: number, y: number): Deck | undefined {
  let best: Deck | undefined;
  for (const d of DECKS) if (!d.roof && x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1 && (!best || d.level > best.level)) best = d;
  return best;
}

/**
 * Flights between floors. An escalator pair (`w` wide, the west lane going down, the east lane up)
 * or a straight stair, cut through the front wall under deck `upper`'s south edge.
 */
export type Flight = { kind: 'escalator' | 'stairs' | 'lift'; upper: number; x: number; w: number };
/** the deck index of a floor's main rectangle */
const D = (level: number): number => DECKS.findIndex((d) => d.level === level);
export const FLIGHTS: Flight[] = [
  // the escalators zig-zag, so each floor is walked along on the way up
  { kind: 'escalator', upper: D(1), x: 404, w: 5 }, // G/F to 1/F, by the café on the piazza
  { kind: 'escalator', upper: D(2), x: 432, w: 5 }, // 1/F to 2/F, east end
  { kind: 'escalator', upper: D(3), x: 400, w: 5 }, // 2/F to 3/F, west end
  { kind: 'escalator', upper: D(4), x: 426, w: 5 }, // 3/F to 4/F, east
  { kind: 'escalator', upper: D(5), x: 422, w: 5 }, // 4/F to 5/F
  // stairs at the other ends, for going straight through
  { kind: 'stairs', upper: D(1), x: 386.5, w: 3 },
  { kind: 'stairs', upper: D(1) + 1, x: 453.5, w: 3 },
  { kind: 'stairs', upper: D(2), x: 390.5, w: 3 },
  { kind: 'stairs', upper: D(3), x: 434.5, w: 3 },
  { kind: 'stairs', upper: D(4), x: 398.5, w: 3 },
  { kind: 'stairs', upper: D(5), x: 403.5, w: 3 },
  // the lift: one glass shaft through every floor, G/F to 5/F
  ...[1, 2, 3, 4, 5].map((l): Flight => ({ kind: 'lift', upper: D(l), x: 418, w: 2.5 })),
];
/** where you stand to call the lift on each floor, G/F up, in metres */
export const LIFT_STOPS: Array<{ x: number; y: number }> = [
  { x: 418, y: DECKS[D(1)].y1 + FACE + 0.8 },
  ...[1, 2, 3, 4, 5].map((l) => ({ x: 418, y: DECKS[D(l)].y1 - 1 })),
];
/** the escalators, in the form world.ts uses for the moving steps: landings 1.2 m onto each floor */
export const PLAZA_ESCALATORS = FLIGHTS.filter((f) => f.kind === 'escalator').map((f) => {
  const d = DECKS[f.upper];
  return { name: `stanley plaza escalators ${FLOOR_NAMES[d.level - 1]} to ${FLOOR_NAMES[d.level]}`, x: f.x, y0: d.y1 - 1.2, y1: d.y1 + FACE + 1.2, w: f.w };
});

/** the front wall under a deck: which columns of it are wall (not another deck of the same floor) */
export function faceRuns(di: number): Array<[number, number]> {
  const d = DECKS[di];
  const out: Array<[number, number]> = [];
  let a = -1;
  for (let x = d.x0; x <= d.x1; x += 1) {
    const wall = x < d.x1 && !DECKS.some((o) => o !== d && o.level >= d.level && x >= o.x0 && x < o.x1 && d.y1 >= o.y0 && d.y1 < o.y1);
    if (wall && a < 0) a = x;
    if (!wall && a >= 0) { out.push([a, x]); a = -1; }
  }
  return out;
}
/** the flights cut through deck `di`'s front wall, as [x0, x1] */
const cutsOf = (di: number): Array<[number, number]> =>
  FLIGHTS.filter((f) => f.upper === di).map((f): [number, number] => [f.x - f.w / 2, f.x + f.w / 2]).sort((p, q) => p[0] - q[0]);

/**
 * Shops: the bays along each front wall. Generated evenly between the flights, then a few are
 * given names (and doors the game uses). `level` is the floor the shop is on: one below the deck.
 */
export type Shop = { level: number; x0: number; x1: number; y: number; colour: string; name: string; open: boolean; tables: boolean };
const SIGN = ['#2a5a8a', '#a8323a', '#2f7a52', '#c8902a', '#5a3a7a', '#1f6f7a', '#8a4a2a', '#3a3a44'];
/**
 * What is on each floor follows the real directory (a café, burger places and pizza round the
 * piazza; fried chicken and a surf shop on 1/F; the supermarket and a kids' play centre on 2/F; a
 * bank, an optician and a grill on 3/F; a waffle bar and the management office on 4/F; a deli and a
 * youth centre on 5/F). The names are invented, as for every private business in the game.
 */
const NAMED: Array<{ level: number; x: number; name: string; colour: string; tables?: boolean }> = [
  { level: 0, x: 391, name: 'burger bar', colour: '#c8302a' },
  { level: 0, x: 398, name: 'harbour coffee', colour: '#1f6a4a', tables: true },
  { level: 0, x: 409, name: 'the corner bistro', colour: '#3a3a44', tables: true },
  { level: 0, x: 414, name: 'pizza and doughnuts', colour: '#e07a3a' },
  { level: 0, x: 425, name: 'burger grill', colour: '#8a2a2a', tables: true },
  { level: 0, x: 431, name: 'gelato', colour: '#e07aa0' },
  { level: 0, x: 440, name: 'souvenirs', colour: '#c8902a' },
  { level: 0, x: 446, name: 'pet shop', colour: '#2f7a52' },
  { level: 1, x: 395, name: 'fried chicken', colour: '#b02a2a' },
  { level: 1, x: 410, name: 'training centre', colour: '#2a4a8a' },
  { level: 1, x: 425, name: 'surf shop', colour: '#1f6f9a' },
  { level: 1, x: 438, name: 'pizza', colour: '#a8323a' },
  { level: 2, x: 394, name: 'kids play centre', colour: '#e0a020' },
  { level: 2, x: 406, name: 'supermarket', colour: '#1f7a3a' },
  { level: 2, x: 425, name: 'hair salon', colour: '#5a3a7a' },
  { level: 3, x: 403, name: 'bank', colour: '#a8282a' },
  { level: 3, x: 409, name: 'optician', colour: '#2a5a8a' },
  { level: 3, x: 421, name: 'grill house', colour: '#3a2a22', tables: true },
  { level: 4, x: 408, name: 'waffle bar', colour: '#c8902a', tables: true },
  { level: 4, x: 414, name: 'management office', colour: '#3a3a44' },
  { level: 5, x: 408, name: 'gourmet deli', colour: '#2f5a3a' },
  { level: 5, x: 417, name: 'youth centre', colour: '#1f6f7a' },
];
export const SHOPS: Shop[] = (() => {
  const out: Shop[] = [];
  DECKS.forEach((d, di) => {
    for (const [a, b] of faceRuns(di)) {
      // the stretches of wall between flights; a stretch under 3 m is plain wall
      let segs: Array<[number, number]> = [[a, b]];
      for (const [c0, c1] of cutsOf(di)) {
        segs = segs.flatMap(([s0, s1]): Array<[number, number]> => (c1 <= s0 || c0 >= s1 ? [[s0, s1]] : [[s0, c0], [c1, s1]].filter(([p, q]) => q - p > 0.5) as Array<[number, number]>));
      }
      for (const [s0, s1] of segs.filter(([p, q]) => q - p >= 3)) {
        const n = Math.max(1, Math.round((s1 - s0) / 6.5));
        const w = (s1 - s0) / n;
        for (let i = 0; i < n; i += 1) {
          const x0 = s0 + i * w, x1 = x0 + w;
          const named = NAMED.find((s) => s.level === d.level - 1 && s.x >= x0 && s.x < x1);
          const h = Math.abs(Math.sin(x0 * 12.9898 + d.level * 78.233) * 43758.5453) % 1;
          out.push({
            level: d.level - 1, x0, x1, y: d.y1, colour: named?.colour ?? SIGN[Math.floor(h * SIGN.length)],
            name: named?.name ?? '', open: !!named || h > 0.45, tables: !!named?.tables,
          });
        }
      }
    }
  });
  return out;
})();
/** where to stand in front of a named shop's door, in metres */
export function shopDoor(name: string): { x: number; y: number } | undefined {
  const s = SHOPS.find((p) => p.name === name);
  return s && { x: (s.x0 + s.x1) / 2, y: s.y + FACE + 1 };
}

/** is a deck's side at this point covered by another deck of the same floor or higher? */
const coveredBy = (d: Deck, x: number, y: number): boolean =>
  DECKS.some((o) => o !== d && o.level >= d.level && x >= o.x0 && x < o.x1 && y >= o.y0 && y < o.y1);
/** which sides of the 1 m tile at (x, y) on deck d have a balustrade */
function railSides(d: Deck, x: number, y: number): string {
  // where two rectangles of one floor overlap, a side open on either is open
  const shared = DECKS.filter((o) => o !== d && o.level === d.level && x + 0.5 >= o.x0 && x + 0.5 < o.x1 && y + 0.5 >= o.y0 && y + 0.5 < o.y1);
  const openOn = (side: string): boolean => shared.some((o) => o.open.includes(side) && (side === 'n' ? y === o.y0 : side === 'w' ? x === o.x0 : x === o.x1 - 1));
  let s = '';
  if (x === d.x0 && !d.open.includes('w') && !openOn('w') && !coveredBy(d, x - 0.5, y + 0.5)) s += 'w';
  if (x === d.x1 - 1 && !d.open.includes('e') && !openOn('e') && !coveredBy(d, x + 1.5, y + 0.5)) s += 'e';
  if (y === d.y0 && !d.open.includes('n') && !openOn('n') && !coveredBy(d, x + 0.5, y - 0.5) &&
    !DECKS.some((o) => o.level > d.level && x >= o.x0 && x < o.x1 && y - 0.5 >= o.y1 && y - 0.5 < o.y1 + FACE)) s += 'n';
  return s;
}

/**
 * What the plaza puts on the 1 m tile at (x, y): part of a floor, a balustrade at a floor's edge,
 * the front wall of the floor above (shops, solid), an escalator or a stair, or nothing.
 */
export function plazaTile(x: number, y: number): '' | 'deck' | 'rail' | 'face' | 'escalator' | 'stairs' | 'lift' {
  if (x < PLAZA_BOX.x0 || x > PLAZA_BOX.x1 || y < PLAZA_BOX.y0 || y > PLAZA_BOX.y1) return '';
  const cx = x + 0.5, cy = y + 0.5;
  for (const f of FLIGHTS) {
    const d = DECKS[f.upper];
    if (Math.abs(cx - f.x) < f.w / 2 && cy >= d.y1 && cy < d.y1 + FACE) return f.kind;
  }
  const d = DECKS.filter((o) => cx >= o.x0 && cx < o.x1 && cy >= o.y0 && cy < o.y1);
  if (d.some((o) => o.roof)) return 'face';
  if (d.length) return d.some((o) => railSides(o, x, y)) ? 'rail' : 'deck';
  for (let i = 0; i < DECKS.length; i += 1) {
    const o = DECKS[i];
    if (cy >= o.y1 && cy < o.y1 + FACE && faceRuns(i).some(([a, b]) => cx >= a && cx < b)) return 'face';
  }
  return '';
}

/** the whole plaza, for skipping it quickly */
export const PLAZA_BOX = { x0: 376, y0: 342, x1: 464, y1: 446 };

/** spots on every floor for shoppers to wander between (metres) */
export const PLAZA_SPOTS: Array<{ x: number; y: number }> = [
  ...SHOPS.filter((s) => s.open).map((s) => ({ x: (s.x0 + s.x1) / 2, y: s.y + FACE + 1.5 })),
  { x: 410, y: 352 }, { x: 420, y: 356 }, { x: 395, y: 425 }, { x: 420, y: 430 }, { x: 430, y: 426 },
];

// ------------------------------------------------------------------ drawing ---
const PAVE: Record<number, [string, string, string]> = {
  // [base, joint, light brick]: terracotta on the terraces, pale granite on the top deck
  1: ['#bf7458', '#a5603f', '#cb8466'],
  2: ['#c47c5e', '#aa6646', '#d08c6e'],
  3: ['#c9846a', '#ad6c50', '#d59478'],
  4: ['#d4cbb8', '#b8ae9a', '#e0d8c6'],
  5: ['#cfcabe', '#b2ac9e', '#dcd8cc'],
};
const rnd = (x: number, y: number, s: number): number => {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + s * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Draw the plaza into a chunk: the context is scaled to metres (8 art pixels each) and clipped to
 * the chunk by its canvas. x0..y1 is the chunk's box, to skip the plaza when it is not in it.
 */
export function drawPlaza(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  if (x1 < PLAZA_BOX.x0 || x0 > PLAZA_BOX.x1 || y1 < PLAZA_BOX.y0 || y0 > PLAZA_BOX.y1) return;
  const px = 1 / 8;
  // ---- the piazza (G/F): big pale granite slabs with a darker band leading to the amphitheatre
  pirateShip(g, 381, 413);

  // ---- decks, lowest first
  const order = DECKS.map((d, i) => i).sort((a, b) => DECKS[a].level - DECKS[b].level);
  for (const di of order) {
    const d = DECKS[di];
    if (d.roof) { roofBlock(g, d); continue; }
    const [base, joint, light] = PAVE[d.level];
    g.fillStyle = base; g.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
    if (d.level >= 4) {
      // granite slabs, 1 m square
      g.fillStyle = joint;
      for (let x = Math.ceil(d.x0); x < d.x1; x += 1) g.fillRect(x, d.y0, px, d.y1 - d.y0);
      for (let y = Math.ceil(d.y0); y < d.y1; y += 1) g.fillRect(d.x0, y, d.x1 - d.x0, px);
      g.fillStyle = light;
      for (let y = d.y0; y < d.y1; y += 1) for (let x = d.x0; x < d.x1; x += 1) if (rnd(x, y, 3) < 0.3) g.fillRect(x + px, y + px, 1 - px, 1 - px);
    } else {
      // brick, laid in rows a quarter of a metre deep, half-metre bricks, every other row offset
      g.fillStyle = light;
      for (let y = d.y0; y < d.y1; y += 0.25) {
        const off = (Math.round(y * 4) % 2) * 0.25;
        for (let x = d.x0 - off; x < d.x1; x += 0.5) if (rnd(x * 2, y * 4, 5) < 0.22) g.fillRect(Math.max(d.x0, x), y, 0.5, 0.25);
      }
      g.fillStyle = joint;
      for (let y = d.y0; y < d.y1; y += 0.25) {
        g.fillRect(d.x0, y, d.x1 - d.x0, px);
        const off = (Math.round(y * 4) % 2) * 0.25;
        for (let x = d.x0 + off; x < d.x1; x += 0.5) g.fillRect(x, y, px, 0.25);
      }
      // a granite strip along the shopfronts (the north edge) and down the middle
      g.fillStyle = 'rgba(232,224,208,0.55)';
      g.fillRect(d.x0, d.y0, d.x1 - d.x0, 0.5);
    }
  }

  // ---- front walls: one row of shopfronts under each deck's south edge
  DECKS.forEach((d, di) => {
    for (const [a, b] of faceRuns(di)) {
      g.fillStyle = '#e6dfd0'; g.fillRect(a, d.y1 + 0.5, b - a, FACE - 0.5); // plain render where there is no shop
      g.fillStyle = '#9a9286'; g.fillRect(a, d.y1 + FACE - 0.25, b - a, 0.25);
    }
  });
  for (const s of SHOPS) shopfront(g, s);
  DECKS.forEach((d, di) => {
    for (const [a, b] of faceRuns(di)) {
      // the deck's edge: a slab with a dark line under it, then the shadow it throws on the floor below
      g.fillStyle = '#efe9dc'; g.fillRect(a, d.y1, b - a, 0.375);
      g.fillStyle = '#8a8478'; g.fillRect(a, d.y1 + 0.375, b - a, px);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(a, d.y1 + FACE, b - a, 0.5);
      g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(a, d.y1 + FACE + 0.5, b - a, 0.5);
      // a glass balustrade along the edge of the deck above, gapped where a flight comes up
      // (a roof has a parapet instead)
      const cuts = cutsOf(di);
      if (d.roof) { g.fillStyle = '#d8d0c0'; g.fillRect(a, d.y1 - 0.5, b - a, 0.5); continue; }
      for (let x = a; x < b; x += 0.25) {
        if (cuts.some(([c0, c1]) => x + 0.25 > c0 && x < c1)) continue;
        g.fillStyle = 'rgba(176,218,236,0.7)'; g.fillRect(x, d.y1 - 0.5, 0.25, 0.375);
        g.fillStyle = '#eef3f6'; g.fillRect(x, d.y1 - 0.5, 0.25, px);
        if (Math.abs((x * 4) % 6) < 0.01) { g.fillStyle = '#7c8690'; g.fillRect(x, d.y1 - 0.5, px, 0.5); }
      }
    }
    // balustrades along the closed sides
    if (!d.roof) sideRails(g, d);
  });

  // ---- flights
  for (const f of FLIGHTS) {
    const d = DECKS[f.upper];
    if (f.kind === 'escalator') escalator(g, f.x, d.y1 - 1.2, d.y1 + FACE + 1.2, f.w);
    else if (f.kind === 'lift') liftShaft(g, f.x - f.w / 2, d.y1, f.w, d.level);
    else stairs(g, f.x - f.w / 2, d.y1, f.w);
  }
}

/** the block over 5/F's shops: a flat roof with a parapet, plant and a planted edge */
function roofBlock(g: CanvasRenderingContext2D, d: Deck): void {
  const px = 1 / 8, w = d.x1 - d.x0, h = d.y1 - d.y0;
  g.fillStyle = '#bdb6a6'; g.fillRect(d.x0, d.y0, w, h);
  g.fillStyle = '#d8d0c0'; g.fillRect(d.x0, d.y0, w, 0.375); g.fillRect(d.x0, d.y0, 0.375, h); g.fillRect(d.x1 - 0.375, d.y0, 0.375, h);
  g.fillStyle = '#9a9384'; for (let x = d.x0 + 2; x < d.x1 - 2; x += 4) g.fillRect(x, d.y0 + 0.75, 1.5, 1.25); // air-con units
  g.fillStyle = '#6a6458'; for (let x = d.x0 + 2; x < d.x1 - 2; x += 4) g.fillRect(x + 0.25, d.y0 + 1, 1, px);
  g.fillStyle = '#4f8a46'; g.fillRect(d.x0 + 0.375, d.y1 - 0.75, w - 0.75, 0.375); // planting along the edge
}

/** a glass lift shaft through one storey's wall, with the car waiting at the top on every other one */
function liftShaft(g: CanvasRenderingContext2D, x0: number, t: number, w: number, level: number): void {
  const px = 1 / 8;
  g.fillStyle = '#5a6672'; g.fillRect(x0 - 0.25, t, w + 0.5, FACE); // steel frame
  g.fillStyle = 'rgba(150,200,225,0.85)'; g.fillRect(x0, t + 0.25, w, FACE - 0.5); // glass
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0 + 0.375, t + 0.25, 0.25, FACE - 0.5);
  g.fillStyle = '#3a4048'; for (let y = t + 1.25; y < t + FACE; y += 1.25) g.fillRect(x0, y, w, px);
  if (level % 2) {
    // the car
    const cy = t + 0.75;
    g.fillStyle = '#d8dee4'; g.fillRect(x0 + 0.25, cy, w - 0.5, 2);
    g.fillStyle = '#8a96a2'; g.fillRect(x0 + 0.25, cy + 2 - px, w - 0.5, px); g.fillRect(x0 + w / 2 - px / 2, cy + 0.25, px, 1.5);
  }
  // the call button panel and doors at the foot, on the floor below
  g.fillStyle = '#2a3038'; g.fillRect(x0 + 0.25, t + FACE - 1.75, w - 0.5, 1.5);
  g.fillStyle = '#c8ccd4'; g.fillRect(x0 + w / 2 - px / 2, t + FACE - 1.75, px, 1.5);
  g.fillStyle = '#e8c23a'; g.fillRect(x0 + w + 0.25, t + FACE - 1.5, 0.25, 0.375);
}

/** glass balustrades on the sides of a deck that do not open to the street */
function sideRails(g: CanvasRenderingContext2D, d: Deck): void {
  const px = 1 / 8;
  const rail = (x: number, y: number, w: number, h: number): void => {
    g.fillStyle = 'rgba(176,218,236,0.7)'; g.fillRect(x, y, w, h);
    g.fillStyle = '#eef3f6'; if (w > h) g.fillRect(x, y, w, px); else g.fillRect(x, y, px, h);
    g.fillStyle = 'rgba(0,0,0,0.12)'; if (w > h) g.fillRect(x, y + h, w, px); else g.fillRect(x + w, y, px, h);
  };
  for (let y = d.y0; y < d.y1; y += 1) for (let x = d.x0; x < d.x1; x += 1) {
    if (x > d.x0 && x < d.x1 - 1 && y > d.y0) continue;
    const s = railSides(d, x, y);
    // the drop beyond a side: the deck's edge throws a shadow on the lower ground
    g.fillStyle = 'rgba(0,0,0,0.2)';
    if (s.includes('w')) g.fillRect(x - 0.5, y, 0.5, 1);
    if (s.includes('e')) g.fillRect(x + 1, y, 0.5, 1);
    if (s.includes('w')) rail(x, y, 0.25, 1);
    if (s.includes('e')) rail(x + 0.75, y, 0.25, 1);
    if (s.includes('n')) rail(x, y, 1, 0.25);
  }
}

/** one shop bay in the wall under a deck: pilasters, a sign, a blue glass canopy, the shopfront */
function shopfront(g: CanvasRenderingContext2D, s: Shop): void {
  const px = 1 / 8, t = s.y, w = s.x1 - s.x0;
  g.fillStyle = '#e6dfd0'; g.fillRect(s.x0, t + 0.5, w, FACE - 0.5); // the rendered wall
  g.fillStyle = '#d2c9b6'; g.fillRect(s.x0, t + 0.5, 0.375, FACE - 0.5); g.fillRect(s.x1 - 0.375, t + 0.5, 0.375, FACE - 0.5); // pilasters
  // the sign: a coloured board with light "lettering"
  g.fillStyle = s.colour; g.fillRect(s.x0 + 0.625, t + 0.75, w - 1.25, 0.625);
  g.fillStyle = 'rgba(255,248,230,0.85)';
  const letters = Math.max(2, Math.floor((w - 2) / 0.5));
  for (let i = 0; i < letters; i += 1) if (Math.abs(Math.sin((s.x0 + i) * 3.7)) > 0.25) g.fillRect(s.x0 + 1 + i * 0.5, t + 0.875, 0.375, 0.375);
  // the canopy: Stanley Plaza's blue glass, over the shop door
  g.fillStyle = '#4f86ba'; g.fillRect(s.x0 + 0.25, t + 1.5, w - 0.5, 0.375);
  g.fillStyle = '#9cc6e8'; g.fillRect(s.x0 + 0.25, t + 1.5, w - 0.5, px);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(s.x0 + 0.5, t + 1.875, w - 1, 0.25);
  // the shopfront: dark glass with mullions, a lit interior where the shop is open
  const gx = s.x0 + 0.5, gw = w - 1, gy = t + 2.125, gh = FACE - 2.375;
  g.fillStyle = s.open ? '#3d5a66' : '#2c3e4a'; g.fillRect(gx, gy, gw, gh);
  if (s.open) {
    // shelves and people's shapes inside, warm light
    g.fillStyle = 'rgba(240,214,150,0.35)'; g.fillRect(gx, gy + gh * 0.45, gw, gh * 0.55);
    for (let x = gx + 0.375; x < gx + gw - 0.5; x += 0.75) {
      const h = Math.abs(Math.sin(x * 9.1 + s.y)) % 1;
      g.fillStyle = ['#e8c86a', '#d86a5a', '#7ab0d8', '#f2eee4'][Math.floor(h * 4)];
      g.fillRect(x, gy + gh * 0.55 + (h > 0.5 ? 0.125 : 0), 0.375, 0.25);
    }
  }
  g.fillStyle = 'rgba(200,228,240,0.28)'; // a reflection across the glass
  for (let i = 0; i < 3; i += 1) g.fillRect(gx + ((i * 1.7 + s.x0) % Math.max(0.5, gw - 0.5)), gy, 0.25, gh);
  g.fillStyle = '#b8c2ca';
  for (let x = gx; x <= gx + gw; x += 1.25) g.fillRect(Math.min(x, gx + gw - px), gy, px, gh);
  g.fillRect(gx, gy, gw, px);
  // the door, in the middle, with a mat in front
  const dx = s.x0 + w / 2 - 0.75;
  g.fillStyle = s.open ? '#f0dcaa' : '#1c2830'; g.fillRect(dx, gy + 0.25, 1.5, gh - 0.25);
  g.fillStyle = '#cfd6dc'; g.fillRect(dx, gy + 0.25, px, gh - 0.25); g.fillRect(dx + 1.5 - px, gy + 0.25, px, gh - 0.25); g.fillRect(dx + 0.75 - px / 2, gy + 0.25, px, gh - 0.25);
  g.fillStyle = '#9a9286'; g.fillRect(s.x0, t + FACE - 0.25, w, 0.25); // kick plate
  if (s.open) { g.fillStyle = 'rgba(60,40,30,0.45)'; g.fillRect(dx + 0.125, t + FACE, 1.25, 0.375); }
}

/** an escalator pair: glass balustrades, steel median, two lanes of steps, comb plates at each end */
function escalator(g: CanvasRenderingContext2D, x: number, y0: number, y1: number, w: number): void {
  const px = 1 / 8, x0 = x - w / 2, len = y1 - y0;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 0.375, y0 + 0.5, w, len); // shadow
  g.fillStyle = '#d8d2c4'; g.fillRect(x0 - 0.25, y0 + 1.2, 0.25, len - 2.4); g.fillRect(x0 + w, y0 + 1.2, 0.25, len - 2.4); // side cladding
  g.fillStyle = '#3a3d48'; g.fillRect(x0, y0, w, len);
  const lanes = [x0 + 0.45, x + 0.3];
  const lw = w / 2 - 0.75;
  for (const lx of lanes) {
    g.fillStyle = '#a9afb8'; g.fillRect(lx, y0 + 1.2, lw, len - 2.4);
    g.fillStyle = '#6e737e';
    for (let y = y0 + 1.2; y < y1 - 1.2; y += 0.375) g.fillRect(lx, y, lw, px);
    g.fillStyle = '#e8c23a'; g.fillRect(lx, y0 + 1.2, px, len - 2.4); g.fillRect(lx + lw - px, y0 + 1.2, px, len - 2.4);
    g.fillStyle = '#16171c'; g.fillRect(lx - 0.22, y0 + 0.9, 0.16, len - 1.8); g.fillRect(lx + lw + 0.06, y0 + 0.9, 0.16, len - 1.8);
  }
  g.fillStyle = 'rgba(170,215,235,0.75)'; g.fillRect(x0, y0 + 0.8, 0.22, len - 1.6); g.fillRect(x0 + w - 0.22, y0 + 0.8, 0.22, len - 1.6);
  g.fillStyle = '#c8ccd4'; g.fillRect(x - 0.3, y0 + 0.8, 0.6, len - 1.6);
  g.fillStyle = '#f2e6a0'; for (let y = y0 + 2; y < y1 - 2; y += 2) g.fillRect(x - px, y, 2 * px, 0.25);
  for (const [ly, top] of [[y0, true], [y1 - 1.2, false]] as Array<[number, boolean]>) {
    g.fillStyle = '#8d929c'; g.fillRect(x0, ly, w, 1.2);
    g.fillStyle = '#a4a9b2';
    for (let y = ly; y < ly + 1.2; y += 0.25) for (let xx = x0 + (Math.round((y - ly) * 4) % 2) * 0.25; xx < x0 + w; xx += 0.5) g.fillRect(xx, y, 0.25, 0.25);
    g.fillStyle = '#e8c23a'; g.fillRect(x0, top ? ly + 1.2 - 2 * px : ly, w, 2 * px);
    lanes.forEach((lx, i) => {
      const down = i === 0, cx = lx + lw / 2, cy = ly + 0.6;
      g.fillStyle = down ? '#ff8a4a' : '#7be08a';
      g.beginPath();
      if (down) { g.moveTo(cx - 0.45, cy - 0.25); g.lineTo(cx + 0.45, cy - 0.25); g.lineTo(cx, cy + 0.3); }
      else { g.moveTo(cx - 0.45, cy + 0.25); g.lineTo(cx + 0.45, cy + 0.25); g.lineTo(cx, cy - 0.3); }
      g.closePath(); g.fill();
    });
  }
}

/** a straight stair down through the wall: granite treads, cheek walls, handrails */
function stairs(g: CanvasRenderingContext2D, x0: number, t: number, w: number): void {
  const px = 1 / 8;
  g.fillStyle = '#cfc8b8'; g.fillRect(x0, t, w, FACE);
  for (let y = t; y < t + FACE; y += 0.375) {
    // lighter going down: the treads lower down catch less of the deck's shadow
    const k = (y - t) / FACE;
    g.fillStyle = `rgb(${200 + k * 30},${194 + k * 28},${180 + k * 26})`; g.fillRect(x0, y, w, 0.25);
    g.fillStyle = '#8f887a'; g.fillRect(x0, y + 0.25, w, px);
  }
  g.fillStyle = '#b8b0a0'; g.fillRect(x0 - 0.25, t, 0.25, FACE); g.fillRect(x0 + w, t, 0.25, FACE);
  g.fillStyle = '#4a4e58'; g.fillRect(x0 + 0.125, t - 0.25, px, FACE + 0.25); g.fillRect(x0 + w - 0.25, t - 0.25, px, FACE + 0.25);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0, t, w, 0.5);
}

/** the piazza's playground: a wooden pirate ship facing the bay, for climbing on */
function pirateShip(g: CanvasRenderingContext2D, x: number, y: number): void {
  const px = 1 / 8;
  g.fillStyle = '#8fb8c8'; g.fillRect(x - 1, y - 1, 15, 9); // soft blue safety surface
  g.fillStyle = '#7aa8ba'; for (let i = 0; i < 15; i += 1.5) g.fillRect(x - 1 + i, y - 1, px, 9);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.moveTo(x + 0.5, y + 2.6); g.lineTo(x + 11, y + 2.6); g.lineTo(x + 13.4, y + 4.2); g.lineTo(x + 11, y + 6.6); g.lineTo(x + 1.5, y + 6.6); g.closePath(); g.fill();
  // hull, then deck planks, a rail
  g.fillStyle = '#7a4a2a';
  g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + 10.5, y + 2); g.lineTo(x + 13, y + 3.8); g.lineTo(x + 10.5, y + 6); g.lineTo(x + 1, y + 6); g.closePath(); g.fill();
  g.fillStyle = '#c49a64';
  g.beginPath(); g.moveTo(x + 0.5, y + 2.5); g.lineTo(x + 10.3, y + 2.5); g.lineTo(x + 12.2, y + 3.8); g.lineTo(x + 10.3, y + 5.25); g.lineTo(x + 1.2, y + 5.25); g.closePath(); g.fill();
  g.fillStyle = '#a87a4a'; for (let yy = y + 2.75; yy < y + 5.25; yy += 0.5) g.fillRect(x + 0.75, yy, 10, px);
  g.fillStyle = '#5a3418'; g.fillRect(x, y + 5.6, 10.6, 0.4);
  g.fillStyle = '#e8c23a'; for (let xx = x + 1.5; xx < x + 10; xx += 1.5) g.fillRect(xx, y + 5.6, 0.25, 0.25); // portholes
  // the stern cabin, a slide off the side, the mast and sail
  g.fillStyle = '#8a5a34'; g.fillRect(x + 0.5, y + 1, 2.5, 2.5); g.fillStyle = '#c8463a'; g.fillRect(x + 0.4, y + 0.75, 2.7, 0.5);
  g.fillStyle = '#e8c23a'; g.fillRect(x + 4, y + 6, 1.2, 2); g.fillStyle = '#f2d860'; g.fillRect(x + 4.2, y + 6, 0.8, 2);
  g.fillStyle = '#4a2e16'; g.fillRect(x + 6.6, y - 1.5, 0.25, 5);
  g.fillStyle = '#f2eee4'; g.fillRect(x + 5.25, y - 1.1, 3, 2.4);
  g.fillStyle = '#c8463a'; g.fillRect(x + 5.25, y - 0.1, 3, 0.4);
  g.fillStyle = '#1c1c22'; g.fillRect(x + 6.85, y - 1.75, 1, 0.5); // the flag
}

/**
 * The small things, drawn at full resolution in world pixels (16 a metre): café tables on the
 * terraces, planters, telescopes on the top deck, floor numbers at each escalator.
 * `text` draws game lettering.
 */
export function drawPlazaProps(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number,
  text: (g: CanvasRenderingContext2D, s: string, x: number, y: number, colour: string) => void): void {
  if (x1 < PLAZA_BOX.x0 || x0 > PLAZA_BOX.x1 || y1 < PLAZA_BOX.y0 || y0 > PLAZA_BOX.y1) return;
  const T = 16;
  const clearOf = (x: number, y: number): boolean => !FLIGHTS.some((f) => {
    const d = DECKS[f.upper];
    return Math.abs(x - f.x) < f.w / 2 + (f.kind === 'lift' ? 2.5 : 1.5) && y > d.y1 - 3 && y < d.y1 + FACE + 3;
  });
  for (const d of DECKS) {
    const mid = d.y0 + Math.max(3, (d.y1 - d.y0) / 2);
    for (let x = d.x0 + 3; x < d.x1 - 2; x += d.level === 3 ? 4 : 7) {
      if (!clearOf(x, mid)) continue;
      const px = Math.round(x * T), py = Math.round(mid * T);
      if (d.roof) continue;
      if (d.level === 3) cafeTable(g, px, py, Math.round(x) % 3);
      else if (d.level === 5) bench(g, px, py - 12);
      else if (d.level === 4) planter(g, px, py - 8);
      else if (Math.round((x - d.x0) / 7) % 2) tree(g, px, py);
      else { planter(g, px - 14, py); bench(g, px + 2, py + 2); }
    }
    if (d.level === 4) {
      // the observation deck: telescopes along the south rail, over Stanley Bay
      for (let x = d.x0 + 2; x < d.x1 - 1; x += 3.5) if (clearOf(x, d.y1 - 1)) telescope(g, Math.round(x * T), Math.round((d.y1 - 1.3) * T));
    }
  }
  // outdoor tables in front of the restaurants that have them (round the piazza, mostly)
  for (const s of SHOPS) {
    if (!s.tables) continue;
    for (const x of [s.x0 + 1.6, s.x1 - 1.6]) if (clearOf(x, s.y + FACE + 2.4)) cafeTable(g, Math.round(x * T), Math.round((s.y + FACE + 2.4) * T), Math.round(s.x0) % 3);
  }
  // the lift's call buttons: a sign with the floor at every stop
  LIFT_STOPS.forEach((p, i) => {
    const px = Math.round((p.x + 1.6) * T), py = Math.round((p.y - (i ? 0.6 : 1.4)) * T);
    g.fillStyle = '#1e2a3a'; g.fillRect(px, py, 32, 13);
    g.fillStyle = '#7ab0d8'; g.fillRect(px, py, 32, 2);
    text(g, 'LIFT', px + 4, py + 3, '#f2eee4');
  });
  // floor numbers, on boards beside the foot and the head of each escalator
  for (const f of FLIGHTS) {
    if (f.kind !== 'escalator') continue;
    const d = DECKS[f.upper];
    const sign = (x: number, y: number, s: string): void => {
      const px = Math.round(x * T), py = Math.round(y * T);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 2, py + 2, 26, 13);
      g.fillStyle = '#1e2a3a'; g.fillRect(px, py, 26, 13);
      g.fillStyle = '#e8c23a'; g.fillRect(px, py, 26, 2);
      text(g, s, px + 4, py + 3, '#f2eee4');
    };
    sign(f.x + f.w / 2 + 0.4, d.y1 - 1.6, FLOOR_NAMES[d.level]);
    sign(f.x + f.w / 2 + 0.4, d.y1 + FACE + 0.5, FLOOR_NAMES[d.level - 1]);
  }
}

function cafeTable(g: CanvasRenderingContext2D, px: number, py: number, c: number): void {
  const cols = [['#c8463a', '#f2eee4'], ['#2f6a8a', '#f2eee4'], ['#3a7a52', '#f2eee4']][c];
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(px + 4, py + 8, 15, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6a4a2e'; g.fillRect(px - 12, py + 2, 5, 5); g.fillRect(px + 9, py + 2, 5, 5); // chairs
  g.fillStyle = '#f2eee4'; g.fillRect(px - 5, py + 1, 12, 6); // table
  g.fillStyle = '#d8d0c0'; g.fillRect(px + 0, py - 14, 2, 16); // pole
  g.fillStyle = cols[0]; g.beginPath(); g.arc(px + 1, py - 14, 13, Math.PI, 0); g.fill();
  g.fillStyle = cols[1]; g.fillRect(px - 4, py - 20, 3, 6); g.fillRect(px + 4, py - 20, 3, 6);
}
function planter(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(px - 9, py + 6, 22, 4);
  g.fillStyle = '#d2c9b6'; g.fillRect(px - 10, py - 2, 20, 9);
  g.fillStyle = '#b8ae9a'; g.fillRect(px - 10, py + 5, 20, 2);
  g.fillStyle = '#3f7a3a'; g.beginPath(); g.ellipse(px, py - 4, 10, 6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a9a4a'; g.beginPath(); g.ellipse(px - 2, py - 6, 6, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e86a8a'; g.fillRect(px + 3, py - 7, 2, 2); g.fillRect(px - 6, py - 4, 2, 2);
}
function tree(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(px + 6, py + 8, 20, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d2c9b6'; g.fillRect(px - 12, py - 2, 24, 10); g.fillStyle = '#b8ae9a'; g.fillRect(px - 12, py + 6, 24, 2);
  g.fillStyle = '#5a4030'; g.fillRect(px - 2, py - 14, 4, 14);
  for (const [dx, dy, r, c] of [[0, -22, 16, '#2f6a34'], [-6, -26, 10, '#3f8a42'], [6, -20, 10, '#3a7e3c'], [-2, -30, 7, '#5aa456']] as Array<[number, number, number, string]>) {
    g.fillStyle = c; g.beginPath(); g.arc(px + dx, py + dy, r, 0, Math.PI * 2); g.fill();
  }
}
function bench(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 1, py + 11, 22, 2);
  g.fillStyle = '#7a5a3a'; g.fillRect(px, py + 4, 22, 3); g.fillRect(px, py + 1, 22, 2);
  g.fillStyle = '#3a3a3a'; g.fillRect(px + 1, py + 7, 2, 4); g.fillRect(px + 19, py + 7, 2, 4);
}
function telescope(g: CanvasRenderingContext2D, px: number, py: number): void {
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px - 2, py + 9, 8, 3);
  g.fillStyle = '#3a3e4a'; g.fillRect(px + 1, py, 2, 10);
  g.fillStyle = '#2f6a8a'; g.fillRect(px - 3, py - 4, 9, 5);
  g.fillStyle = '#9cc6e8'; g.fillRect(px + 4, py - 3, 2, 3);
}
