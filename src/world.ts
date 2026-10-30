/**
 * Stanley village, top-down. North is up; Stanley Bay is west and south.
 *
 * The ground is painted from rectangles rather than typed as ASCII so a street can be moved
 * by editing one line. The layout follows the real village (see
 * docs/design/stanley-expansion.md §2) but is compressed to fit a few screens.
 */

export const TILE = 16;
export const MAP_W = 80;
export const MAP_H = 46;

/** ground kinds; capital letters never appear here, buildings are separate */
export type Ground = '~' | ',' | '=' | '-' | 'o' | 'm' | 'p' | 'b' | '_' | 't' | 'x';

const SOLID_GROUND = new Set<Ground>(['~', 't', 'x']);

export type BuildingStyle = 'shop' | 'civic' | 'stall' | 'colonial' | 'mall' | 'temple' | 'prison' | 'school';

export type Building = {
  id: string;
  x: number; y: number; w: number; h: number;
  sign: string;
  style: BuildingStyle;
  roof: string;
  wall: string;
  /** sign colour */
  ink?: string;
};

export type PlaceKind =
  | 'job' | 'board' | 'shop' | 'pirate' | 'employer' | 'library' | 'course'
  | 'police' | 'prison' | 'flavour' | 'offer' | 'bus';

export type Place = {
  id: string;
  /** tile the player stands on to interact */
  tx: number; ty: number;
  name: string;
  kind: PlaceKind;
  line: string;
  /** a person stands here (drawn by main.ts) */
  person?: string;
};

export const ground: Ground[][] = Array.from({ length: MAP_H }, () => Array<Ground>(MAP_W).fill(','));

function paint(g: Ground, x: number, y: number, w: number, h: number): void {
  for (let r = y; r < y + h; r += 1) {
    for (let c = x; c < x + w; c += 1) {
      if (r >= 0 && r < MAP_H && c >= 0 && c < MAP_W) ground[r][c] = g;
    }
  }
}

// ---- the sea: Stanley Bay wraps the west and south of the village
paint('~', 0, 0, 3, MAP_H);
paint('~', 0, 29, 58, MAP_H - 29);
paint('_', 3, 0, 1, 25);                // a strip of rocks and sand on the west shore

// ---- west: the Stanley Plaza / Murray House forecourt
paint('o', 4, 3, 14, 22);

// ---- Stanley Main Street: the waterfront promenade, west to the village road
paint('-', 3, 25, 57, 4);
// Blake Pier runs out into the bay in front of Murray House
paint('p', 8, 29, 3, 7);
paint('p', 6, 35, 7, 2);

// ---- Stanley Village Road (north-south) and Tung Tau Wan Road (east to the college and prison)
paint('-', 59, 0, 1, 25);
paint('=', 60, 0, 3, 24);
paint('-', 63, 0, 1, 23);
paint('=', 60, 24, 20, 3);
paint('-', 64, 23, 16, 1);
paint('-', 58, 27, 22, 1);

// ---- Stanley Market Road, along the front of the municipal building
paint('-', 18, 9, 41, 1);
paint('=', 18, 10, 42, 2);
paint('-', 18, 12, 41, 1);

// ---- the shop block between the plaza and the market
paint('-', 18, 13, 12, 12);

// ---- Stanley Market: lanes between the stall blocks
paint('m', 30, 13, 22, 12);
paint('-', 52, 13, 7, 12);

// ---- bus terminus
paint('b', 64, 1, 14, 10);

// ---- trees: the hill above the village, around the police station, by the college
const TREES: Array<[number, number]> = [
  [4, 1], [7, 0], [10, 1], [14, 0], [17, 1], [19, 0], [23, 0], [44, 1], [47, 3], [50, 1], [53, 4],
  [56, 2], [46, 6], [52, 7], [56, 7], [49, 5], [78, 1], [78, 5], [78, 9], [64, 12], [64, 15],
  [64, 19], [74, 13], [76, 17], [77, 20], [58, 31], [58, 35], [58, 39], [61, 43], [66, 43],
  [70, 43], [72, 30], [4, 19], [16, 23],
];
for (const [x, y] of TREES) ground[y][x] = 't';

export const BUILDINGS: Building[] = [
  { id: 'plaza', x: 5, y: 4, w: 12, h: 6, sign: 'STANLEY PLAZA', style: 'mall', roof: '#7d8fa3', wall: '#c9d3dc', ink: '#2a4a6a' },
  { id: 'murray', x: 5, y: 16, w: 9, h: 6, sign: 'MURRAY HOUSE', style: 'colonial', roof: '#8a8f86', wall: '#d9cfb8', ink: '#5a4a34' },
  { id: 'tinhau', x: 13, y: 12, w: 4, h: 3, sign: 'TIN HAU', style: 'temple', roof: '#3f7a5a', wall: '#b8463a', ink: '#ffd36a' },
  { id: 'pixelfix', x: 19, y: 4, w: 7, h: 5, sign: 'PIXEL FIX', style: 'shop', roof: '#3a4458', wall: '#d8d4cc', ink: '#2f6fb5' },
  { id: 'library', x: 29, y: 2, w: 14, h: 7, sign: 'STANLEY LIBRARY', style: 'civic', roof: '#8c8478', wall: '#e3ddd0', ink: '#3a3a3a' },
  { id: 'teashop', x: 19, y: 19, w: 5, h: 5, sign: 'TEA SHOP', style: 'shop', roof: '#9a4e3c', wall: '#e8dcc2', ink: '#b8323c' },
  { id: 'cafe', x: 25, y: 19, w: 5, h: 5, sign: 'BAYVIEW CAFE', style: 'shop', roof: '#3d6b6a', wall: '#efe6d4', ink: '#2a6a6a' },
  { id: 'bakery', x: 19, y: 13, w: 5, h: 4, sign: 'BAKERY', style: 'shop', roof: '#a8743a', wall: '#f0e2c8', ink: '#9a5a1e' },
  { id: 'store', x: 25, y: 13, w: 5, h: 4, sign: 'STORE', style: 'shop', roof: '#4a5a3e', wall: '#e4e0d0', ink: '#3e7a3a' },
  { id: 'stall1', x: 31, y: 14, w: 6, h: 3, sign: 'T-SHIRTS', style: 'stall', roof: '#c8463a', wall: '#6a4a3a' },
  { id: 'stall2', x: 39, y: 14, w: 5, h: 3, sign: 'CHOPS', style: 'stall', roof: '#3a7ac8', wall: '#6a4a3a' },
  { id: 'stall3', x: 46, y: 14, w: 5, h: 3, sign: 'PAINTINGS', style: 'stall', roof: '#e0a83a', wall: '#6a4a3a' },
  { id: 'stall4', x: 31, y: 19, w: 6, h: 3, sign: 'SILK', style: 'stall', roof: '#3aa86a', wall: '#6a4a3a' },
  { id: 'stall5', x: 39, y: 19, w: 5, h: 3, sign: 'PHONES', style: 'stall', roof: '#8a3ac8', wall: '#6a4a3a' },
  { id: 'stall6', x: 46, y: 19, w: 5, h: 3, sign: 'TOYS', style: 'stall', roof: '#c83a8a', wall: '#6a4a3a' },
  { id: 'oldpolice', x: 52, y: 14, w: 6, h: 5, sign: 'SUPERMARKET', style: 'colonial', roof: '#7a6a5a', wall: '#f2efe6', ink: '#c8323c' },
  { id: 'police', x: 66, y: 13, w: 8, h: 6, sign: 'POLICE', style: 'civic', roof: '#4a5a7a', wall: '#dfe3ea', ink: '#1e3a7a' },
  { id: 'college', x: 63, y: 30, w: 8, h: 6, sign: 'ST STEPHENS', style: 'school', roof: '#8a3a32', wall: '#b86a52', ink: '#f2e2c2' },
  { id: 'prison', x: 73, y: 29, w: 7, h: 14, sign: 'PRISON', style: 'prison', roof: '#6a6a70', wall: '#9a989e', ink: '#2a2a30' },
];

/** a sports field in front of the college */
paint(',', 61, 37, 11, 7);

export const PLACES: Place[] = [
  { id: 'terminus', tx: 70, ty: 11, name: 'bus terminus', kind: 'offer', person: '#2c2e36',
    line: 'the 6, 6x, 260 and 73 all end here.' },
  { id: 'bus', tx: 66, ty: 5, name: 'bus shelter', kind: 'bus',
    line: 'the bus home. a night in your own bed: the day moves on.' },
  { id: 'board', tx: 37, ty: 17, name: 'notice board', kind: 'board',
    line: 'freelance gigs, pinned up by the stall holders.' },
  { id: 'library', tx: 36, ty: 9, name: 'stanley public library', kind: 'library',
    line: 'free to study. quiet, warm, sixteen computers.' },
  { id: 'pixelfix', tx: 22, ty: 9, name: 'pixel fix', kind: 'shop',
    line: 'laptops, tools and legit software. the owner is called ah yan.' },
  { id: 'pirate', tx: 41, ty: 22, name: 'phone stall', kind: 'pirate', person: '#3a2e4a',
    line: 'a man with a bag of discs. everything is cheap.' },
  { id: 'plaza', tx: 11, ty: 10, name: 'stanley plaza', kind: 'course',
    line: 'the training centre on the first floor runs short courses.' },
  { id: 'murray', tx: 9, ty: 22, name: 'tide restaurant', kind: 'employer',
    line: 'a restaurant in murray house. the manager is strict.' },
  { id: 'cafe', tx: 27, ty: 24, name: 'bayview cafe', kind: 'employer',
    line: 'the owner, miss ho, is easy-going.' },
  { id: 'chantai', tx: 21, ty: 24, name: 'chan tai tea shop', kind: 'job',
    line: 'chan tai waves. she always needs something fixed.' },
  { id: 'bakery', tx: 21, ty: 17, name: 'bakery', kind: 'job',
    line: 'warm bread and a receipt printer that misbehaves.' },
  { id: 'store', tx: 27, ty: 17, name: 'the store', kind: 'job',
    line: 'a corner store with a card machine.' },
  { id: 'market', tx: 48, ty: 17, name: 'stanley market', kind: 'job',
    line: 'the stall holders share one router.' },
  { id: 'tinhau', tx: 15, ty: 15, name: 'tin hau temple', kind: 'flavour',
    line: 'incense coils hang from the ceiling. built in 1767.' },
  { id: 'pier', tx: 9, ty: 35, name: 'blake pier', kind: 'flavour',
    line: 'moved here from central, like murray house. ferries to po toi.' },
  { id: 'oldpolice', tx: 55, ty: 19, name: 'old stanley police station', kind: 'flavour',
    line: 'built 1859, the oldest police station building in hong kong. now a supermarket.' },
  { id: 'police', tx: 70, ty: 19, name: 'stanley police station', kind: 'police',
    line: 'the duty officer looks up. your record is on file here.' },
  { id: 'college', tx: 67, ty: 36, name: "st stephen's college", kind: 'flavour',
    line: '22 tung tau wan road. the field lights are on.' },
  { id: 'prison', tx: 76, ty: 28, name: 'stanley prison', kind: 'prison',
    line: '99 tung tau wan road. you would rather not go in.' },
];

export const START = { tx: 69, ty: 8 };
export const RELEASE = { tx: 76, ty: 27 };

// ---------------------------------------------------------------- queries ---
const blocked: boolean[][] = Array.from({ length: MAP_H }, (_, y) =>
  Array.from({ length: MAP_W }, (_, x) => SOLID_GROUND.has(ground[y][x])));
for (const b of BUILDINGS) {
  for (let r = b.y; r < b.y + b.h; r += 1) for (let c = b.x; c < b.x + b.w; c += 1) blocked[r][c] = true;
}

export function solidTile(tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return blocked[ty][tx];
}

/** a point in world pixels is solid if any corner of a small foot box is */
export function solidAt(px: number, py: number): boolean {
  const pts: Array<[number, number]> = [[px - 4, py - 3], [px + 4, py - 3], [px - 4, py + 2], [px + 4, py + 2]];
  return pts.some(([x, y]) => solidTile(Math.floor(x / TILE), Math.floor(y / TILE)));
}

/** breadth-first path over tiles; returns tile centres in pixels, excluding the start */
export function findPath(sx: number, sy: number, gx: number, gy: number): Array<{ x: number; y: number }> {
  const start = [Math.floor(sx / TILE), Math.floor(sy / TILE)];
  let goal = [Math.floor(gx / TILE), Math.floor(gy / TILE)];
  if (solidTile(goal[0], goal[1])) {
    // tapped a building or the sea: walk to the nearest open tile instead
    let best: number[] | null = null;
    let bd = Infinity;
    for (let r = -4; r <= 4; r += 1) for (let c = -4; c <= 4; c += 1) {
      const x = goal[0] + c, y = goal[1] + r;
      if (!solidTile(x, y) && Math.abs(c) + Math.abs(r) < bd) { bd = Math.abs(c) + Math.abs(r); best = [x, y]; }
    }
    if (!best) return [];
    goal = best;
  }
  const key = (x: number, y: number): number => y * MAP_W + x;
  const prev = new Map<number, number>();
  const q: number[] = [key(start[0], start[1])];
  prev.set(q[0], -1);
  const target = key(goal[0], goal[1]);
  while (q.length) {
    const k = q.shift()!;
    if (k === target) break;
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const nk = key(nx, ny);
      if (solidTile(nx, ny) || prev.has(nk)) continue;
      prev.set(nk, k);
      q.push(nk);
    }
  }
  if (!prev.has(target)) return [];
  const path: Array<{ x: number; y: number }> = [];
  for (let k = target; k !== -1 && k !== key(start[0], start[1]); k = prev.get(k)!) {
    path.unshift({ x: (k % MAP_W) * TILE + TILE / 2, y: Math.floor(k / MAP_W) * TILE + TILE / 2 + 4 });
  }
  return path;
}

// ---------------------------------------------------------------- render ---
type TextFn = (g: CanvasRenderingContext2D, s: string, x: number, y: number, colour: string) => void;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const GROUND_COLOURS: Record<Ground, [string, string]> = {
  '~': ['#2a5f86', '#2f6a94'],
  ',': ['#5e8a4a', '#567f44'],
  '=': ['#4a4c58', '#464854'],
  '-': ['#b4b0a6', '#aaa69c'],
  'o': ['#cdbf9e', '#c4b695'],
  'm': ['#a89a86', '#9e907c'],
  'p': ['#8a6a4a', '#7e6044'],
  'b': ['#56585f', '#5c5e66'],
  '_': ['#c8b88a', '#bcac80'],
  't': ['#5e8a4a', '#567f44'],
  'x': ['#6a6a70', '#5e5e64'],
};

/** draws the whole map, once, into an offscreen canvas */
export function renderWorld(text: TextFn): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = MAP_W * TILE;
  c.height = MAP_H * TILE;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const r = rand(7);

  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const k = ground[y][x];
      const [a, b] = GROUND_COLOURS[k];
      const px = x * TILE, py = y * TILE;
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(px, py, TILE, TILE);
      if (k === '-' || k === 'o') {
        g.fillStyle = 'rgba(0,0,0,0.07)';
        g.fillRect(px, py + TILE - 1, TILE, 1);
        g.fillRect(px + TILE - 1, py, 1, TILE);
      } else if (k === 'm') {
        g.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < 3; i += 1) g.fillRect(px + Math.floor(r() * 14), py + Math.floor(r() * 14), 2, 1);
      } else if (k === ',' || k === 't') {
        g.fillStyle = 'rgba(30,60,30,0.35)';
        for (let i = 0; i < 4; i += 1) g.fillRect(px + Math.floor(r() * 15), py + Math.floor(r() * 14), 1, 2);
      } else if (k === 'p') {
        g.fillStyle = 'rgba(40,24,10,0.45)';
        for (let i = 3; i < TILE; i += 4) g.fillRect(px, py + i, TILE, 1);
      } else if (k === '~') {
        g.fillStyle = 'rgba(255,255,255,0.06)';
        if (r() < 0.3) g.fillRect(px + Math.floor(r() * 10), py + Math.floor(r() * 12), 5, 1);
      } else if (k === '_') {
        g.fillStyle = 'rgba(90,80,60,0.4)';
        if (r() < 0.5) g.fillRect(px + Math.floor(r() * 12), py + Math.floor(r() * 12), 3, 2);
      }
      // a foam line where the sea meets land
      if (k === '~' && y > 0 && ground[y - 1][x] !== '~') {
        g.fillStyle = 'rgba(220,240,255,0.5)';
        g.fillRect(px, py, TILE, 2);
      }
    }
  }

  // road markings: dashed centre lines
  g.fillStyle = '#d8d0a0';
  for (let y = 0; y < 24; y += 1) if (y % 2 === 0) g.fillRect(61 * TILE + 7, y * TILE + 3, 2, 9);
  for (let x = 60; x < MAP_W; x += 1) if (x % 2 === 0) g.fillRect(x * TILE + 3, 25 * TILE + 7, 9, 2);
  for (let x = 18; x < 60; x += 1) if (x % 2 === 0) g.fillRect(x * TILE + 3, 11 * TILE - 1, 9, 2);
  // zebra crossing from the market to the police station
  g.fillStyle = '#e8e4d8';
  for (let i = 0; i < 3; i += 1) for (let s = 0; s < 4; s += 1) g.fillRect((60 + i) * TILE + 1, 18 * TILE + s * 4, TILE - 2, 2);
  // bus bays
  g.fillStyle = '#e0c040';
  for (let i = 0; i < 3; i += 1) g.fillRect(66 * TILE, (3 + i * 3) * TILE, 10 * TILE, 1);
  // waterfront railing along the promenade, with a gap for the pier
  g.fillStyle = '#d8d8de';
  for (let x = 3; x < 58; x += 1) if (x < 8 || x > 10) g.fillRect(x * TILE, 29 * TILE - 2, TILE, 2);
  // field markings
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.strokeRect(62 * TILE + 0.5, 38 * TILE + 0.5, 9 * TILE, 5 * TILE);

  for (const b of [...BUILDINGS].sort((p, q) => p.y - q.y)) drawBuilding(g, b, text);

  // trees last so canopies overlap what is behind them
  for (let y = 0; y < MAP_H; y += 1) for (let x = 0; x < MAP_W; x += 1) {
    if (ground[y][x] !== 't') continue;
    const px = x * TILE, py = y * TILE;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 2, py + 12, 14, 4);
    g.fillStyle = '#5a3e26'; g.fillRect(px + 7, py + 9, 3, 6);
    g.fillStyle = '#2f5e34'; g.fillRect(px + 1, py - 3, 15, 13);
    g.fillStyle = '#3e7442'; g.fillRect(px + 3, py - 5, 11, 12);
    g.fillStyle = '#5a9a54'; g.fillRect(px + 4, py - 4, 5, 4);
  }

  // the notice board in the market lane: a cork board on two legs
  {
    const bx = 37 * TILE + 2, by = 15 * TILE + 4;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + 2, by + 16, 26, 3);
    g.fillStyle = '#4a3226'; g.fillRect(bx + 3, by + 10, 2, 8); g.fillRect(bx + 23, by + 10, 2, 8);
    g.fillStyle = '#5a3e2a'; g.fillRect(bx, by - 2, 28, 15);
    g.fillStyle = '#b8864a'; g.fillRect(bx + 2, by, 24, 11);
    const notes = ['#f2eee4', '#ffe28a', '#a8d8ff', '#f2eee4'];
    notes.forEach((c2, i) => { g.fillStyle = c2; g.fillRect(bx + 3 + i * 6, by + 2 + (i % 2) * 2, 4, 5); });
  }

  // street names, painted on the ground like a map
  const label = (s: string, x: number, y: number): void => text(g, s, x, y, 'rgba(30,32,40,0.55)');
  label('STANLEY MAIN ST', 31 * TILE, 27 * TILE + 4);
  label('STANLEY MARKET RD', 44 * TILE, 10 * TILE + 4);
  label('TUNG TAU WAN RD', 66 * TILE, 24 * TILE + 4);
  return c;
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawBuilding(g: CanvasRenderingContext2D, b: Building, text: TextFn): void {
  const x = b.x * TILE, y = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
  // front wall: the bottom two tiles (one for stalls); the rest is roof seen from above
  const front = b.style === 'stall' ? TILE + 6 : TILE * 2;
  const roofH = h - front;

  // cast shadow, down and right
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x + 4, y + h, w, 4);
  g.fillRect(x + w, y + 6, 4, h - 2);

  // roof
  g.fillStyle = b.roof; g.fillRect(x, y, w, roofH);
  g.fillStyle = shade(b.roof, 1.18); g.fillRect(x, y, w, 2);
  g.fillStyle = shade(b.roof, 0.8); g.fillRect(x, y + roofH - 3, w, 3);

  if (b.style === 'stall') {
    // striped awning
    for (let i = 0; i < w; i += 8) { g.fillStyle = i % 16 ? '#f2eee4' : b.roof; g.fillRect(x + i, y, 8, roofH); }
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + roofH - 2, w, 2);
  } else if (b.style === 'temple') {
    g.fillStyle = '#2a5a40';
    for (let i = 0; i < w; i += 4) g.fillRect(x + i, y + 2, 2, roofH - 5);
    g.fillStyle = '#d8a83a'; g.fillRect(x - 2, y + roofH - 4, w + 4, 2);
  } else if (b.style === 'prison') {
    // a wall seen from above, with the yard inside and a watchtower
    g.fillStyle = '#4e5a48'; g.fillRect(x + 6, y + 6, w - 12, roofH - 12);
    g.fillStyle = '#8a8890'; g.fillRect(x + 10, y + 14, w - 20, 28);
    g.fillStyle = '#5a5860'; g.fillRect(x + 12, y + 16, w - 24, 24);
    g.fillStyle = '#3a3a40'; g.fillRect(x + 2, y + 2, 10, 10);
    g.fillStyle = '#c8c8cc';
    for (let i = 0; i < w; i += 3) g.fillRect(x + i, y, 1, 2);
  } else if (b.style === 'mall' || b.style === 'civic' || b.style === 'school') {
    // rooftop plant: a few units and a vent
    g.fillStyle = shade(b.roof, 0.85);
    g.fillRect(x + 8, y + 8, 18, 10);
    g.fillRect(x + w - 30, y + 10, 20, 8);
    g.fillStyle = shade(b.roof, 1.1); g.fillRect(x + 10, y + 10, 14, 2);
  } else if (b.style === 'colonial') {
    // pitched roof ridge
    g.fillStyle = shade(b.roof, 1.1); g.fillRect(x, y + Math.floor(roofH / 2) - 1, w, 2);
    g.fillStyle = shade(b.roof, 0.9);
    for (let i = 4; i < w; i += 6) g.fillRect(x + i, y + 3, 1, roofH - 6);
  }

  // front wall
  const fy = y + roofH;
  g.fillStyle = b.wall; g.fillRect(x, fy, w, front);
  g.fillStyle = shade(b.wall, 0.82); g.fillRect(x, fy + front - 3, w, 3);

  if (b.style === 'stall') {
    // goods on a counter
    const cols = ['#e05a4a', '#4a8ae0', '#e0c04a', '#5ac08a', '#c05ae0'];
    for (let i = 4; i < w - 4; i += 6) { g.fillStyle = cols[(i / 6 + b.x) % cols.length | 0]; g.fillRect(x + i, fy + 4, 4, 6); }
    g.fillStyle = '#4a3226'; g.fillRect(x, fy + 11, w, 4);
    if (b.sign) text(g, b.sign, x + Math.max(2, Math.floor((w - b.sign.length * 6) / 2)), y + 3, '#2a2420');
    return;
  }

  // windows
  if (b.style === 'colonial') {
    for (let i = 6; i < w - 6; i += 12) {
      g.fillStyle = '#5a6a7a'; g.fillRect(x + i, fy + 8, 6, 14);
      g.fillStyle = '#3a6a4a'; g.fillRect(x + i - 2, fy + 8, 2, 14); g.fillRect(x + i + 6, fy + 8, 2, 14);
      g.fillStyle = shade(b.wall, 0.9); g.fillRect(x + i - 1, fy + 6, 8, 2);
    }
  } else if (b.style === 'prison') {
    g.fillStyle = '#6e6c72';
    for (let i = 4; i < w; i += 8) g.fillRect(x + i, fy + 4, 1, front - 8);
  } else {
    const glass = b.style === 'mall' ? '#6aa0c0' : '#7aa8c0';
    for (let i = 6; i < w - 4; i += 14) {
      g.fillStyle = shade(glass, 0.7); g.fillRect(x + i, fy + 12, 10, 14);
      g.fillStyle = glass; g.fillRect(x + i, fy + 12, 10, 10);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + i + 1, fy + 13, 3, 4);
    }
  }
  // door, centred
  const dx = x + Math.floor(w / 2) - 5;
  g.fillStyle = '#3a2e26'; g.fillRect(dx, fy + front - 15, 10, 12);
  g.fillStyle = '#5a4636'; g.fillRect(dx + 1, fy + front - 14, 8, 1);

  // sign board above the windows
  if (b.sign) {
    const sw = Math.min(w - 4, b.sign.length * 6 + 6);
    const sx = x + Math.floor((w - sw) / 2);
    g.fillStyle = b.style === 'school' || b.style === 'temple' ? '#3a2420' : '#f8f6f0';
    g.fillRect(sx, fy + 2, sw, 9);
    text(g, b.sign, sx + 3, fy + 3, b.ink ?? '#202020');
  }
}
