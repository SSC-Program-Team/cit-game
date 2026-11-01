/**
 * Homes for sale (docs/design/stanley-expansion.md §11.1): every real house on the map, and up to
 * six flats in each private block. Worked out from the map at load, the same way on the server and
 * in the browser, so ids and prices agree. Ids: `h<building>` for a house, `f<building>.<n>` for a
 * flat (building = its index in BUILDINGS, which never moves: new buildings are added at the end).
 *
 * Price = floor area x $260/m2: a house is its footprint times its storeys (from the 3D map's
 * height, 1-3), a flat 35-140 m2. Near the sea is dearer (within 60 m x1.7, within 120 m x1.3), a
 * detached house x1.25, a higher flat a little more.
 */
import { BUILDINGS, PLACE_BUILDINGS, grid, Gr, MAP_W, MAP_H, standAt, type Building } from './world.ts';
import { OSM } from './stanley-osm.ts';

export type Home = {
  id: string;
  /** index in BUILDINGS */
  b: number;
  kind: 'house' | 'flat';
  name: string;
  /** floor area, m2 */
  area: number;
  price: number;
  /** the tile you stand on at its door */
  tx: number; ty: number;
  /** a flat's floor (1-based) */
  floor?: number;
};

export const PRICE_PER_M2 = 260;

const polyArea = (p: number[]): number => {
  let a = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length;
    a += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  return Math.abs(a) / 2;
};

const hash = (n: number, salt: number): number => {
  let h = (n * 374761393 + salt * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** not for sale: public housing, staff and prison quarters, schools, shops, landmarks */
const NOT_HOMES = /^block |^house [0-9a-z]+$|ma house|estate|prison|correctional|quarters|staff|police|school|college|church|chapel|temple|library|plaza|murray|museum|hostel|block [a-z0-9]+$|hall|centre|center|club|market|station|services|barracks|cemetery/i;

// metres from each tile to the sea, up to 130
const toSea = ((): Uint8Array => {
  const N = MAP_W * MAP_H, d = new Uint8Array(N).fill(255), q = new Int32Array(N);
  let h = 0, t = 0;
  for (let k = 0; k < N; k += 1) if (grid[k] === Gr.Sea) { d[k] = 0; q[t++] = k; }
  while (h < t) {
    const k = q[h++];
    if (d[k] >= 130) continue;
    const x = k % MAP_W;
    for (const n of [x > 0 ? k - 1 : -1, x < MAP_W - 1 ? k + 1 : -1, k - MAP_W, k + MAP_W]) {
      if (n >= 0 && n < N && d[n] === 255) { d[n] = d[k] + 1; q[t++] = n; }
    }
  }
  return d;
})();
const seaFactor = (b: Building): number => {
  const k = Math.min(MAP_H - 1, Math.max(0, Math.round((b.y0 + b.y1) / 2))) * MAP_W + Math.min(MAP_W - 1, Math.max(0, Math.round((b.x0 + b.x1) / 2)));
  const d = toSea[k];
  return d <= 60 ? 1.7 : d <= 120 ? 1.3 : 1;
};

/** the nearest named road to a point, for the address */
const NAMED = OSM.roads.filter(([, , name]) => name && /^[\x20-\x7e]+$/.test(name));
function streetNear(x: number, y: number): string {
  let best = '', bd = Infinity;
  for (const [p, , name] of NAMED) {
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < bd) { bd = d; best = name; }
    }
  }
  return best.toLowerCase() || 'stanley';
}

/** is another building within a metre and a half of this one (so not detached) */
function touches(b: Building, i: number): boolean {
  return BUILDINGS.some((o, j) => j !== i && !o.hidden && o.x0 <= b.x1 + 1.5 && o.x1 >= b.x0 - 1.5 && o.y0 <= b.y1 + 1.5 && o.y1 >= b.y0 - 1.5);
}

function build(): Home[] {
  const out: Home[] = [];
  const onStreet = new Map<string, number>();
  const blockNames = new Map<string, number>();
  BUILDINGS.forEach((b, i) => {
    if (b.hidden || !b.door || PLACE_BUILDINGS.has(b)) return;
    if (b.style !== 'house' && b.style !== 'apartments') return;
    if (b.name && NOT_HOMES.test(b.name)) return;
    const foot = polyArea(b.poly);
    if (foot < 25) return; // sheds and kiosks
    const stand = standAt(b.door.x, b.door.y + 1.5, 6);
    const street = streetNear(b.door.x, b.door.y);
    const sea = seaFactor(b);
    if (b.style === 'house') {
      if (foot > 450) return; // too big for a house: a hall, a depot or part of the prison
      const storeys = b.height ? Math.max(1, Math.min(3, Math.round(b.height / 3))) : 2;
      const area = Math.round(foot * storeys);
      const detached = !touches(b, i);
      const price = Math.round((area * PRICE_PER_M2 * sea * (detached ? 1.25 : 1)) / 1000) * 1000;
      const n = (onStreet.get(street) ?? 0) + 1;
      onStreet.set(street, n);
      out.push({ id: `h${i}`, b: i, kind: 'house', name: `no. ${n}, ${street}`, area, price, tx: stand.tx, ty: stand.ty });
      return;
    }
    // a block of flats: up to six for sale, spread up the building
    const storeys = b.height ? Math.max(3, Math.round(b.height / 3)) : 6;
    let label = b.name && /^[\x20-\x7e]+$/.test(b.name) ? b.name.toLowerCase() : street;
    const seen = blockNames.get(label) ?? 0;
    blockNames.set(label, seen + 1);
    if (seen) label = `${label} tower ${seen + 1}`;
    const flats = Math.min(6, Math.max(2, Math.round(storeys / 2)));
    for (let n = 0; n < flats; n += 1) {
      const floor = Math.max(1, Math.round(((n + 0.5) / flats) * storeys));
      const area = Math.round(35 + hash(i * 7 + n, 3) * Math.min(105, Math.max(10, foot / 4 - 35)));
      const price = Math.round((area * PRICE_PER_M2 * sea * (1 + floor * 0.015)) / 1000) * 1000;
      out.push({ id: `f${i}.${n}`, b: i, kind: 'flat', name: `flat ${floor}${'abcdef'[n]}, ${label}`, area, price, tx: stand.tx, ty: stand.ty, floor });
    }
  });
  return out.sort((a, b) => a.price - b.price);
}

export const HOMES: Home[] = build();
export const home = (() => {
  const by = new Map(HOMES.map((h) => [h.id, h]));
  return (id: string): Home | undefined => by.get(id);
})();

/** homes at each building, for the boards by the front doors */
export const HOMES_AT: Map<number, Home[]> = (() => {
  const m = new Map<number, Home[]>();
  for (const h of HOMES) m.set(h.b, [...(m.get(h.b) ?? []), h]);
  return m;
})();
