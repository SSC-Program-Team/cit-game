/**
 * Rules of the road (docs/design/stanley-expansion.md §13) for every NPC car, the minibuses and the
 * taxi: signal-controlled crossings, junctions taken one vehicle at a time, giving way to the more
 * important road, and keeping a distance. Your own car is the exception.
 *
 * Where the signals are comes from the Transport Department's Traffic Aids Drawings
 * (stanley-roads.ts): Stanley has no signal-controlled road junctions, only three signal-controlled
 * pedestrian crossings (the bus terminus, Tung Tau Wan Road by the college, and the west edge of
 * the map). Each runs: vehicles green 20 s, amber 3 s, then red 11 s while the green man shows.
 */
import { OSM } from './stanley-osm.ts';
import { ROADS } from './stanley-roads.ts';

const TILE = 16;

// ------------------------------------------------------------- signals ---
export type Crossing = { x: number; y: number; offset: number; lights: Array<[string, number, number, number]> };

/** signal heads within 20 m of each other are one crossing */
export const CROSSINGS: Crossing[] = (() => {
  const out: Crossing[] = [];
  for (const l of ROADS.lights) {
    const [, x, y] = l;
    const c = out.find((o) => Math.hypot(o.x - x, o.y - y) < 20);
    if (c) { c.lights.push(l); c.x = c.lights.reduce((s, q) => s + q[1], 0) / c.lights.length; c.y = c.lights.reduce((s, q) => s + q[2], 0) / c.lights.length; }
    else out.push({ x, y, offset: 0, lights: [l] });
  }
  out.forEach((c, i) => { c.offset = (i * 11.3) % 34; });
  return out;
})();

export const CYCLE = 34;
/** what vehicles see at a crossing, at a time in seconds */
export function crossingLight(c: Crossing, t: number): 'green' | 'amber' | 'red' {
  const p = (t + c.offset) % CYCLE;
  return p < 20 ? 'green' : p < 23 ? 'amber' : 'red';
}
/** the green man shows a second after vehicles get red, and goes before they get green */
export function walkLight(c: Crossing, t: number): boolean {
  const p = (t + c.offset) % CYCLE;
  return p >= 24 && p < 32;
}

// ----------------------------------------------------------- junctions ---
const RANK: Record<string, number> = { secondary: 4, tertiary: 3, tertiary_link: 3, unclassified: 2, residential: 2, living_street: 1, service: 1 };
export type Junction = { x: number; y: number; r: number; rank: number; holder: object | null; held: number };

/** where three or more road ends meet, or a road ends on another: points within 16 m are one junction */
export const JUNCTIONS: Junction[] = (() => {
  const ends = new Map<string, { x: number; y: number; n: number; rank: number }>();
  const lines = OSM.roads.filter(([, h]) => RANK[h]);
  const key = (x: number, y: number): string => `${Math.round(x)},${Math.round(y)}`;
  for (const [p, h] of lines) {
    for (let i = 0; i < p.length; i += 2) {
      const k = key(p[i], p[i + 1]);
      const e = ends.get(k) ?? { x: p[i], y: p[i + 1], n: 0, rank: 0 };
      // an end counts once, a point the line passes through counts twice (two arms)
      e.n += i === 0 || i === p.length - 2 ? 1 : 2;
      e.rank = Math.max(e.rank, RANK[h]);
      ends.set(k, e);
    }
  }
  const out: Junction[] = [];
  for (const e of ends.values()) {
    if (e.n < 3) continue;
    const j = out.find((o) => Math.hypot(o.x - e.x, o.y - e.y) < 16);
    if (j) { j.x = (j.x + e.x) / 2; j.y = (j.y + e.y) / 2; j.r = Math.min(14, Math.max(j.r, Math.hypot(j.x - e.x, j.y - e.y) + 6)); j.rank = Math.max(j.rank, e.rank); }
    else out.push({ x: e.x, y: e.y, r: 7, rank: e.rank, holder: null, held: 0 });
  }
  return out;
})();

/** the rank of the road a point (metres) is on: the nearest drive line's */
const SEGS = OSM.roads.filter(([, h]) => RANK[h]).flatMap(([p, h]) => {
  const s: Array<[number, number, number, number, number]> = [];
  for (let i = 0; i + 3 < p.length; i += 2) s.push([p[i], p[i + 1], p[i + 2], p[i + 3], RANK[h]]);
  return s;
});
export function rankAt(x: number, y: number): number {
  let best = 0, bd = 12;
  for (const [ax, ay, bx, by, r] of SEGS) {
    if (Math.max(ax, bx) < x - 12 || Math.min(ax, bx) > x + 12 || Math.max(ay, by) < y - 12 || Math.min(ay, by) > y + 12) continue;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// ------------------------------------------------------------- vehicles ---
/** anything that obeys the rules: position in world pixels, heading, speed (px/s) */
export type Vehicle = { x: number; y: number; angle: number; speed: number; waited?: number; rank?: number };

/**
 * The fastest a vehicle may go right now (px/s), given the signals, the junctions and the other
 * vehicles. `all` is every vehicle that obeys the rules; `t` is the time in seconds.
 */
export function rulesOfTheRoad(v: Vehicle, all: Vehicle[], t: number, dt: number): number {
  let cap = Infinity;
  const mx = v.x / TILE, my = v.y / TILE;
  const cos = Math.cos(v.angle), sin = Math.sin(v.angle);
  /** a point ahead: how far along (m) and how far to the side */
  const rel = (x: number, y: number): [number, number] => {
    const dx = x - mx, dy = y - my;
    return [dx * cos + dy * sin, -dx * sin + dy * cos];
  };
  const stopBy = (metres: number): void => {
    // come to rest by then: v^2 = 2as, a gentle 3 m/s2
    const room = Math.max(0, metres);
    cap = Math.min(cap, Math.sqrt(2 * 3 * room) * TILE);
  };
  // signal-controlled crossings: stop at the line on red, and on amber if there is room to
  for (const c of CROSSINGS) {
    const [along, side] = rel(c.x, c.y);
    if (along < 2 || along > 40 || Math.abs(side) > 9) continue;
    const light = crossingLight(c, t);
    const line = along - 6;
    if (light === 'red' || (light === 'amber' && line > (v.speed / TILE) ** 2 / 6)) stopBy(line);
  }
  // junctions: one vehicle in a junction at a time; on a lesser road, give way to a greater one
  v.rank ??= rankAt(mx, my);
  for (const j of JUNCTIONS) {
    const d = Math.hypot(j.x - mx, j.y - my);
    if (j.holder === v && d > j.r + 3) { j.holder = null; continue; }
    if (d > j.r + 14) continue;
    const [along] = rel(j.x, j.y);
    if (along < 0 && j.holder !== v) continue; // behind us
    const entry = d - j.r;
    if (j.holder && j.holder !== v) {
      // someone is in it; a holder that has waited too long lets go, so two junctions close
      // together can never lock each other up
      if (t - j.held > 6) j.holder = null;
      else { stopBy(entry - 1); continue; }
    }
    if (entry < 2 && !j.holder) {
      // give way: anything on a greater road coming into this junction
      const yieldTo = all.some((o) => o !== v && (o.rank ?? 0) > (v.rank ?? 0) && o.speed > 10
        && Math.hypot(j.x - o.x / TILE, j.y - o.y / TILE) < j.r + 18);
      if (yieldTo && entry > -1 && v.rank! < j.rank) { stopBy(entry - 1); v.waited = (v.waited ?? 0) + dt; if (v.waited < 8) continue; }
      j.holder = v; j.held = t; v.waited = 0;
    }
  }
  // keep a distance from anything ahead going the same way
  for (const o of all) {
    if (o === v || Math.abs(o.x - v.x) > 30 * TILE || Math.abs(o.y - v.y) > 30 * TILE) continue;
    const [along, side] = rel(o.x / TILE, o.y / TILE);
    if (along <= 0 || along > 25 || Math.abs(side) > 1.8) continue;
    const same = Math.cos(o.angle - v.angle) > 0.3;
    if (same) stopBy(along - 6);
    else if (along < 12) stopBy(along - 5); // head on in a narrow lane: the later one waits
  }
  return cap;
}
