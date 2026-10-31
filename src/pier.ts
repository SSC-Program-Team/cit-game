/**
 * Blake Pier at Stanley: the cast-iron pavilion of the 1900 Blake Pier in Central, rebuilt here in
 * 2006 at the end of a new pier off the promenade by Murray House. A long granite-paved deck under
 * black cast-iron columns and arched ribs, a grey-tiled roof with a gable at the landward end, black
 * railings along both sides.
 *
 * Shape from OpenStreetMap's outline of the pier (the approach and the pavilion). In metres.
 */

/** the approach from the promenade: centre line and width */
const APPROACH = { ax: 428, ay: 569.5, bx: 447, by: 607, w: 4 };
/** the pavilion: its landward end's middle, the axis out to sea, length and width */
const PAV = (() => {
  const p0 = [441, 610], p1 = [453, 604], p2 = [471, 637], p3 = [459, 643];
  const sx = (p0[0] + p1[0]) / 2, sy = (p0[1] + p1[1]) / 2;
  const ex = (p2[0] + p3[0]) / 2, ey = (p2[1] + p3[1]) / 2;
  const len = Math.hypot(ex - sx, ey - sy);
  return { sx, sy, ux: (ex - sx) / len, uy: (ey - sy) / len, len, w: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) };
})();
export const PIER_BOX = { x0: 422, y0: 563, x1: 476, y1: 648 };

/** local coordinates along (s) and across (t) a strip from (ax, ay) along unit (ux, uy) */
function local(x: number, y: number, ax: number, ay: number, ux: number, uy: number): [number, number] {
  const dx = x - ax, dy = y - ay;
  return [dx * ux + dy * uy, -dx * uy + dy * ux];
}
const AUX = (() => { const l = Math.hypot(APPROACH.bx - APPROACH.ax, APPROACH.by - APPROACH.ay); return { l, ux: (APPROACH.bx - APPROACH.ax) / l, uy: (APPROACH.by - APPROACH.ay) / l }; })();

/** is the point (metres) on the pier deck? */
export function onPier(x: number, y: number): boolean {
  if (x < PIER_BOX.x0 || x > PIER_BOX.x1 || y < PIER_BOX.y0 || y > PIER_BOX.y1) return false;
  const [s, t] = local(x, y, APPROACH.ax, APPROACH.ay, AUX.ux, AUX.uy);
  if (s >= -1 && s <= AUX.l + 2 && Math.abs(t) <= APPROACH.w / 2) return true;
  const [s2, t2] = local(x, y, PAV.sx, PAV.sy, PAV.ux, PAV.uy);
  return s2 >= -0.5 && s2 <= PAV.len && Math.abs(t2) <= PAV.w / 2 - 0.5;
}

/** where to stand to look out from the end of the pier */
export const PIER_END = { x: PAV.sx + PAV.ux * (PAV.len - 4), y: PAV.sy + PAV.uy * (PAV.len - 4) };

/** draw the pier into a chunk (the context in metres, 8 art pixels each) */
export function drawPier(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  if (x1 < PIER_BOX.x0 || x0 > PIER_BOX.x1 || y1 < PIER_BOX.y0 || y0 > PIER_BOX.y1) return;
  const px = 1 / 8;
  // ---- the approach: granite slabs between black railings, a lamp now and then
  g.save();
  g.translate(APPROACH.ax, APPROACH.ay);
  g.rotate(Math.atan2(AUX.uy, AUX.ux));
  const L = AUX.l + 2, hw = APPROACH.w / 2;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, -hw + 0.6, L, APPROACH.w); // shadow on the water
  slabs(g, 0, -hw, L, APPROACH.w);
  railing(g, 0, -hw, L); railing(g, 0, hw - 0.25, L);
  for (let s = 4; s < L; s += 9) { g.fillStyle = '#1c1c20'; g.fillRect(s, -hw + 0.05, 0.375, 0.375); g.fillRect(s, hw - 0.45, 0.375, 0.375); }
  g.restore();

  // ---- the pavilion
  g.save();
  g.translate(PAV.sx, PAV.sy);
  g.rotate(Math.atan2(PAV.uy, PAV.ux));
  const W = PAV.w - 1, H = W / 2, len = PAV.len;
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0.8, -H + 0.8, len, W); // its shadow on the sea
  // piles under the deck at the edges
  g.fillStyle = '#4a4440'; for (let s = 1; s < len; s += 3) { g.fillRect(s, -H - 0.25, 0.5, 0.25); g.fillRect(s, H, 0.5, 0.25); }
  slabs(g, 0, -H, len, W);
  // the shadow of the roof on the deck, with sun coming through between the ribs (as in the photo)
  for (let s = 0; s < len; s += 2.4) { g.fillStyle = 'rgba(30,26,22,0.32)'; g.fillRect(s + 0.6, -H + 1.2, 1.5, W - 2.4); }
  railing(g, 0, -H, len); railing(g, 0, H - 0.25, len);
  // the roof: grey tiled eaves along both sides, open in the middle so you see the iron underneath
  for (const side of [-1, 1]) {
    const ey = side < 0 ? -H - 0.6 : H - 1.4;
    g.fillStyle = '#5a5e64'; g.fillRect(-0.6, ey, len + 1.2, 2);
    g.fillStyle = '#787c82'; for (let s = -0.6; s < len + 0.6; s += 0.5) g.fillRect(s, ey, 0.25, 2); // tile rows
    g.fillStyle = '#3a3e44'; g.fillRect(-0.6, side < 0 ? ey : ey + 2 - px * 2, len + 1.2, px * 2); // the eave edge
  }
  // the cast-iron ribs: an arch across between each pair of columns, and the ridge beam
  g.fillStyle = '#1e1e22';
  for (let s = 0.75; s <= len - 0.5; s += 2.4) {
    g.fillRect(s, -H + 0.6, 0.25, W - 1.2); // the arch, seen from above
    g.fillRect(s - 0.375, -H + 0.5, 1, 0.5); g.fillRect(s - 0.375, H - 1, 1, 0.5); // column heads
  }
  g.fillRect(0, -0.125, len, 0.25); // ridge
  g.fillStyle = '#e8d8a0'; for (let s = 6; s < len - 2; s += 9.6) g.fillRect(s - 0.2, -0.3, 0.6, 0.6); // lamps hanging from the ridge
  // the landward gable: grey tiles under a white plastered pediment
  g.fillStyle = '#d8d2c4'; g.fillRect(-0.9, -H - 0.6, 1.2, W + 1.2);
  g.fillStyle = '#5a5e64'; g.fillRect(-1.4, -H - 0.6, 0.5, W + 1.2);
  g.fillStyle = '#b8b0a0'; g.fillRect(-0.9, -0.5, 1.2, 1);
  // lifebuoys and red sand buckets along the rails
  g.fillStyle = '#e8501f';
  for (const s of [5, len - 6]) { g.fillRect(s, -H + 0.3, 0.6, 0.6); g.fillRect(s, H - 0.9, 0.6, 0.6); }
  g.restore();
}

/** pale granite slabs, half a metre by one */
function slabs(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const px = 1 / 8;
  g.fillStyle = '#d6cbb6'; g.fillRect(x, y, w, h);
  g.fillStyle = '#e2d8c4';
  for (let s = x; s < x + w; s += 1) for (let t = y; t < y + h; t += 0.5) if (Math.abs(Math.sin(s * 12.9 + t * 7.7)) > 0.7) g.fillRect(s, t, 1, 0.5);
  g.fillStyle = '#b8ad98';
  for (let s = x; s < x + w; s += 1) g.fillRect(s, y, px, h);
  for (let t = y; t < y + h; t += 0.5) g.fillRect(x, t, w, px);
}

/** black steel railing along a strip's edge */
function railing(g: CanvasRenderingContext2D, x: number, y: number, len: number): void {
  const px = 1 / 8;
  g.fillStyle = '#1c1c20'; g.fillRect(x, y, len, 0.25);
  g.fillStyle = '#3a3a40'; for (let s = x; s < x + len; s += 1.2) g.fillRect(s, y - px, 2 * px, 0.25 + 2 * px);
}
