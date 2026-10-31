#!/usr/bin/env python3
"""
Real building footprints, heights and roof shapes from the Lands Department's 3D map.

    python3 scripts/import-dsm.py dsm.npz

`dsm.npz` is a 0.5 m surface-height map made from the 3D Visualisation Map's OBJ tiles by
`scripts/dsm.py` (run that where the big OBJ zips are; it only needs numpy). This script:

  1. puts the height map on the game's grid (Hong Kong 1980 Grid -> WGS84 -> game metres, then a
     small shift found by lining its buildings up with OpenStreetMap's);
  2. finds what is a building: more than 2.2 m above the ground around it, and made of flat or
     evenly sloped patches (roofs are planes; tree tops are speckled bumps);
  3. for each OSM building, takes the building cells around its outline and traces them: the real
     shape, height above the ground beside it, and whether the roof is pitched;
  4. adds buildings the 3D map has but OSM does not (at least 60 m2, 3 m tall, with walls).

Writes src/stanley-shapes.ts. Buildings it cannot read reliably keep their OSM outline.
Source: Lands Department, 3D Visualisation Map (3d.map.gov.hk). Needs numpy, scipy and Pillow.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = __file__.rsplit('/scripts/', 1)[0]
src = open(f'{ROOT}/src/stanley-osm.ts').read()
osm = json.loads(src[src.index('String.raw`') + 11:src.rindex('`')])
W, H = osm['w'], osm['h']
lat0, lon0 = osm['origin']

d = np.load(sys.argv[1])
zdm = d['z_dm']
DE, DN, DC = float(d['origin_e']), float(d['origin_n']), float(d['cell'])  # top-left corner, cell size
dsm = np.where(zdm >= 0, zdm / 10.0, np.nan).astype(np.float32)
DH, DW = dsm.shape

# ---- HK1980 Grid -> WGS84 -> game metres (as in import-3d.py)
a_, f_ = 6378388.0, 1 / 297.0
e2 = 2 * f_ - f_ * f_
phi0 = math.radians(22 + 18 / 60 + 43.68 / 3600)
lam0 = math.radians(114 + 10 / 60 + 42.80 / 3600)
Eo, No = 836694.05, 819069.80


def merid(p):
    return a_ * ((1 - e2 / 4 - 3 * e2 ** 2 / 64) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32) * math.sin(2 * p) + (15 * e2 ** 2 / 256) * math.sin(4 * p))


def hk_to_game(E, Nn):
    mm = merid(phi0) + (Nn - No)
    p = phi0
    for _ in range(10):
        p += (mm - merid(p)) / (a_ * (1 - e2))
    nu = a_ / math.sqrt(1 - e2 * math.sin(p) ** 2)
    rho = a_ * (1 - e2) / (1 - e2 * math.sin(p) ** 2) ** 1.5
    t = math.tan(p)
    dE = E - Eo
    lat = p - (t / rho) * (dE ** 2 / (2 * nu))
    lon = lam0 + dE / (nu * math.cos(p)) - dE ** 3 / (6 * nu ** 3 * math.cos(p)) * (nu / rho + 2 * t * t)
    lat, lon = math.degrees(lat) - 5.5 / 3600, math.degrees(lon) + 8.8 / 3600
    return (lon - lon0) * 111320 * math.cos(math.radians(lat0)), (lat0 - lat) * 110574


# a linear fit is exact to millimetres over a few km: game = A @ [E - DE, N - DN, 1]
P, Q = [], []
for x in range(0, int(DW * DC) + 1, 100):
    for y in range(0, int(DH * DC) + 1, 100):
        P.append([x, -y, 1])
        Q.append(hk_to_game(DE + x, DN - y))
Aff = np.linalg.lstsq(np.array(P, float), np.array(Q), rcond=None)[0]
Li = np.linalg.inv(Aff[:2].T)

# ---- 1. the height map on the game grid, at 0.5 m
S = 2  # cells per game metre
gy, gx = np.mgrid[0:H * S, 0:W * S].astype(np.float64) / S + 0.25


def sample(shift):
    lx, ly = np.einsum('ij,jhw->ihw', Li, np.stack([gx - shift[0] - Aff[2, 0], gy - shift[1] - Aff[2, 1]]))
    j = np.floor(lx / DC).astype(np.int64)
    i = np.floor(-ly / DC).astype(np.int64)
    ok = (i >= 0) & (i < DH) & (j >= 0) & (j < DW)
    z = np.full(gx.shape, np.nan, np.float32)
    z[ok] = dsm[i[ok], j[ok]]
    return z


z = sample((0, 0))
have = ~np.isnan(z)
zf = np.where(have, z, np.nanmin(z))

# ground: the lowest surface within 12 m, smoothed; height above it
ground = ndi.uniform_filter(ndi.grey_opening(zf, size=(49, 49)), 25)
above = zf - ground


def plane_resid(a, s):
    """how far the surface is from a plane over an s x s window (0 for a flat or evenly pitched roof)"""
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]].astype(np.float64)
    m = lambda q: ndi.uniform_filter(q, s)
    a = a.astype(np.float64)
    mz, mx, my = m(a), m(xx), m(yy)
    vz = m(a * a) - mz * mz
    vx = m(xx * xx) - mx * mx
    vy = m(yy * yy) - my * my
    cx = m(a * xx) - mz * mx
    cy = m(a * yy) - mz * my
    return np.sqrt(np.maximum(vz - cx * cx / vx - cy * cy / vy, 0)).astype(np.float32)


def classify(zf, above, have):
    """tall cells, and how roof-like each is: the share of planar 1.5 m patches around it"""
    resid = plane_resid(zf, 3)
    tall = have & (above > 2.2)
    frac = ndi.uniform_filter((tall & (resid < 0.12)).astype(np.float32), 7)
    core = ndi.binary_opening(tall & (frac > 0.72), iterations=2)  # surely a roof
    return resid, tall, frac, core


resid, tall, frac, roof = classify(zf, above, have)

# ---- 2. line the 3D buildings up with OSM's: best shift within 15 m
osm_mask = Image.new('L', (W * S, H * S), 0)
dr = ImageDraw.Draw(osm_mask)
for bl in osm['buildings']:
    p = bl[0]
    dr.polygon([(p[k] * S, p[k + 1] * S) for k in range(0, len(p), 2)], fill=1)
osm_mask = np.array(osm_mask) > 0
best = (-1, 0, 0)
r1 = roof[::2, ::2]
o1 = osm_mask[::2, ::2]
for dx in range(-15, 16):
    for dy in range(-15, 16):
        sh = np.roll(np.roll(r1, dy, 0), dx, 1)
        sc = int((sh & o1).sum())
        if sc > best[0]:
            best = (sc, dx, dy)
_, sdx, sdy = best
print(f'shift onto OSM: {sdx}, {sdy} m', flush=True)
if sdx or sdy:
    z = sample((sdx, sdy))
    have = ~np.isnan(z)
    zf = np.where(have, z, np.nanmin(z))
    ground = ndi.uniform_filter(ndi.grey_opening(zf, size=(49, 49)), 25)
    above = zf - ground
    resid, tall, frac, roof = classify(zf, above, have)


# ---- 3. each OSM building: its cells, traced
def trace(mask, ox, oy):
    """outside boundary of the largest blob in a 0.5 m mask, as game-metre points"""
    Hm, Wm = mask.shape
    get = lambda x, y: mask[y, x] if 0 <= x < Wm and 0 <= y < Hm else False
    nxt = {}
    for y, x in zip(*np.nonzero(mask)):
        if not get(x, y - 1): nxt[(x, y)] = (x + 1, y)
        if not get(x + 1, y): nxt[(x + 1, y)] = (x + 1, y + 1)
        if not get(x, y + 1): nxt[(x + 1, y + 1)] = (x, y + 1)
        if not get(x - 1, y): nxt[(x, y + 1)] = (x, y)
    best, used = [], set()
    for start in nxt:
        if start in used:
            continue
        loop, k = [], start
        while k not in used and k in nxt:
            used.add(k)
            loop.append(k)
            k = nxt[k]
        if len(loop) > len(best):
            best = loop
    return [(ox + x / S, oy + y / S) for x, y in best]


def simplify(pts, tol):
    """Douglas-Peucker on a closed ring"""
    if len(pts) < 4:
        return pts
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    keep = [False] * len(pts)
    keep[0] = keep[far] = True

    def rec(a, b):
        ax, ay = pts[a]
        bx, by = pts[b % len(pts)]
        L = math.hypot(bx - ax, by - ay) or 1
        fi, fd = -1, tol
        for i in range(a + 1, b):
            dd = abs((pts[i][0] - ax) * (by - ay) - (pts[i][1] - ay) * (bx - ax)) / L
            if dd > fd:
                fi, fd = i, dd
        if fi >= 0:
            keep[fi] = True
            rec(a, fi)
            rec(fi, b)

    rec(0, far)
    rec(far, len(pts))
    return [p for p, k in zip(pts, keep) if k]


def roof_shape(cells_z):
    """height spread and whether the roof is pitched (evenly sloping) rather than flat"""
    if cells_z.size < 8:
        return 0
    med = np.median(cells_z)
    flat_share = np.mean(np.abs(cells_z - med) < 0.4)
    spread = np.percentile(cells_z, 90) - np.percentile(cells_z, 10)
    return 1 if flat_share < 0.35 and 1.0 < spread < 9 else 0


# which OSM building each cell is nearest to (within 3 m), so neighbours do not swallow each other
lab = Image.new('I', (W * S, H * S), 0)
dl = ImageDraw.Draw(lab)
for i, bl in enumerate(osm['buildings']):
    p = bl[0]
    dl.polygon([(p[k] * S, p[k + 1] * S) for k in range(0, len(p), 2)], fill=i + 1)
lab = np.array(lab)
dist, (iy, ix) = ndi.distance_transform_edt(lab == 0, return_indices=True)
owner = np.where(dist <= 3 * S, lab[iy, ix], 0)
# strict building cells (for finding buildings OSM lacks): around sure roof, out to the walls
building_cells = tall & ndi.binary_dilation(roof, iterations=3)
# for buildings OSM already has: tall cells inside the outline, and roof-like ones just outside it
inside_any = lab > 0
loose_cells = tall & (inside_any | (frac > 0.5))

shapes = {}
for i, bl in enumerate(osm['buildings']):
    p = bl[0]
    xs, ys = p[0::2], p[1::2]
    x0, x1 = max(int(min(xs) - 4) * S, 0), min(int(max(xs) + 5) * S, W * S)
    y0, y1 = max(int(min(ys) - 4) * S, 0), min(int(max(ys) + 5) * S, H * S)
    if x1 <= x0 or y1 <= y0 or not have[y0:y1, x0:x1].mean() > 0.9:
        continue
    mine = (owner[y0:y1, x0:x1] == i + 1) & loose_cells[y0:y1, x0:x1]
    mine = ndi.binary_fill_holes(ndi.binary_closing(mine, iterations=2))
    lbl, n = ndi.label(mine)
    if not n:
        continue
    inside = lab[y0:y1, x0:x1] == i + 1
    sizes = ndi.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    over = ndi.sum(inside, lbl, range(1, n + 1))
    keep = [k + 1 for k in range(n) if over[k] > 0.3 * sizes[k]]
    if not keep:
        continue
    mine = np.isin(lbl, keep)
    osm_area = inside.sum()
    if not (0.5 * osm_area <= mine.sum() <= 2.0 * osm_area):
        continue  # the 3D map and OSM disagree too much: keep OSM's outline
    pts = simplify(trace(mine, x0 / S, y0 / S), 0.6)
    if len(pts) < 3:
        continue
    # height: the roof (upper quartile) above the ground just outside the walls (lower quartile)
    ring = ndi.binary_dilation(mine, iterations=8) & ~ndi.binary_dilation(mine, iterations=3) & have[y0:y1, x0:x1] & ~tall[y0:y1, x0:x1]
    zz = zf[y0:y1, x0:x1]
    core = ndi.binary_erosion(mine, iterations=2)
    if ring.sum() < 6 or core.sum() < 6:
        continue
    h = float(np.percentile(zz[core], 75) - np.percentile(zz[ring], 25))
    if not 2 <= h <= 150:
        continue
    shapes[i] = [[round(c * 4) / 4 for xy in pts for c in xy], round(h), roof_shape(zz[core])]

# ---- 4. buildings the 3D map has and OSM does not
near_osm = ndi.binary_dilation(osm_mask, iterations=6)
extra = []
lbl, n = ndi.label(ndi.binary_fill_holes(ndi.binary_closing(building_cells & ~near_osm, iterations=2)))
objs = ndi.find_objects(lbl)
for k, sl in enumerate(objs):
    m = lbl[sl] == k + 1
    area = m.sum() / (S * S)
    if area < 60:
        continue
    ys_, xs_ = sl
    z0, x0_ = ys_.start, xs_.start
    pad = 8
    yA, yB = max(z0 - pad, 0), min(ys_.stop + pad, H * S)
    xA, xB = max(x0_ - pad, 0), min(xs_.stop + pad, W * S)
    mm = lbl[yA:yB, xA:xB] == k + 1
    zz = zf[yA:yB, xA:xB]
    core = ndi.binary_erosion(mm, iterations=2)
    ring = ndi.binary_dilation(mm, iterations=6) & ~ndi.binary_dilation(mm, iterations=2) & have[yA:yB, xA:xB]
    if core.sum() < 20 or ring.sum() < 10:
        continue
    planar = np.mean(frac[yA:yB, xA:xB][core] > 0.6)
    h = float(np.percentile(zz[core], 75) - np.percentile(zz[ring], 25))
    # walls: right outside the edge the surface drops sharply (a tree crown tapers off instead)
    edge = mm & ~ndi.binary_erosion(mm)
    drop = zz - ndi.grey_erosion(np.where(mm, 1e4, zz), size=(5, 5))
    walls = np.mean(drop[edge] > 2.0) if edge.any() else 0
    if planar < 0.75 or walls < 0.6 or h < 3 or h > 150:
        continue
    pts = simplify(trace(mm, xA / S, yA / S), 0.6)
    if len(pts) >= 3:
        extra.append([[round(c * 4) / 4 for xy in pts for c in xy], round(h), roof_shape(zz[core])])

ts = f"""/**
 * GENERATED by scripts/import-dsm.py from the Lands Department's 3D Visualisation Map
 * (3d.map.gov.hk): real building footprints, heights and roof shapes.
 */
/** OSM building index -> [outline in metres, height in metres, pitched roof 1/0] */
export const SHAPE_3D: Record<number, [number[], number, number]> = {json.dumps(shapes, separators=(',', ':'))};

/** buildings the 3D map has and OpenStreetMap does not: [outline, height, pitched] */
export const EXTRA_3D: Array<[number[], number, number]> = {json.dumps(extra, separators=(',', ':'))};
"""
open(f'{ROOT}/src/stanley-shapes.ts', 'w').write(ts)
print(f'{len(shapes)} of {len(osm["buildings"])} OSM buildings reshaped, {len(extra)} new buildings; {len(ts)} bytes')

if len(sys.argv) > 2:  # debug: the building cells and the height above ground, for checking by eye
    np.savez_compressed(sys.argv[2], cells=building_cells, roof=roof, above=above.astype(np.float16), have=have)
