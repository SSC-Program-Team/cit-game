#!/usr/bin/env python3
"""
Give buildings their real look: cut each one out of the 3D map rendered in the game's view.

    node --experimental-strip-types --no-warnings scripts/export-buildings.ts > buildings.json
    python3 scripts/import-photos.py render.png buildings.json

`render.png` (+ `render.json` beside it) comes from `scripts/render-oblique.py`: the Lands
Department 3D photo mesh seen from above with south walls at 0.4 of their height, which is how
the game draws buildings. For each building with a real height, this takes exactly the area the
game draws it in (its outline, lifted by 0.4 of its height) from the render, fills small gaps,
packs it into one atlas, and reduces the colours a little so it sits with the pixel art.

Writes public/img/buildings.webp (the atlas) and src/stanley-photos.ts (where each building is).
Buildings the render does not cover keep the game's own drawing. Needs numpy, scipy and Pillow.
"""
import json
import math
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None
ROOT = __file__.rsplit('/scripts/', 1)[0]
PX = None              # atlas pixels per metre: as fine as the render (8 = the game's art grid)
LIFT = 0.4             # wall height on screen, as a share of the real height (as in render-oblique.py)
MAX_WALL = 16.0        # metres: very tall towers are squashed, or they would hide whole streets

render_path, buildings_path = sys.argv[1], sys.argv[2]
meta = json.load(open(render_path.rsplit('.', 1)[0] + '.json'))
PX = round(1 / meta['cell'])
photo = np.asarray(Image.open(render_path).convert('RGBA'))
PH, PW = photo.shape[:2]
buildings = json.load(open(buildings_path))

src = open(f'{ROOT}/src/stanley-osm.ts').read()
osm = json.loads(src[src.index('String.raw`') + 11:src.rindex('`')])
lat0, lon0 = osm['origin']
shift = json.loads(re.search(r'SHIFT_3D = (\[[^\]]*\])', open(f'{ROOT}/src/stanley-shapes.ts').read()).group(1))

# ---- game metres <-> Hong Kong 1980 Grid (as in import-dsm.py, including its shift onto OSM)
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


WE, NN, CELL, PAD = meta['west_e'], meta['north_n'], meta['cell'], meta['pad']
P_, Q_ = [], []
for x in range(0, int(PW * CELL) + 1, 100):
    for y in range(0, int(PH * CELL) + 1, 100):
        P_.append([x, -y, 1])
        g = hk_to_game(WE + x, NN - y)
        Q_.append([g[0] + shift[0], g[1] + shift[1]])
Aff = np.linalg.lstsq(np.array(P_, float), np.array(Q_), rcond=None)[0]
Li = np.linalg.inv(Aff[:2].T)


def to_photo(gx, gy):
    """game screen metres -> render pixel (column, row). A raised point drawn at gy - 0.4 z lands
    on the render's row for N + 0.4 z, so the same map works for roofs, walls and ground."""
    lx, ly = np.einsum('ij,j...->i...', Li, np.stack([gx - Aff[2, 0], gy - Aff[2, 1]]))
    return lx / CELL, (-ly + PAD) / CELL


# ---- each building's patch
crops = []
for i, b in enumerate(buildings):
    h = b['height']
    if not h:
        continue
    wall = min(MAX_WALL, h * LIFT)
    p = b['poly']
    xs, ys = p[0::2], p[1::2]
    gx0, gx1 = math.floor(min(xs)), math.ceil(max(xs))
    gy0, gy1 = math.floor(min(ys) - wall), math.ceil(max(ys))
    w, hgt = (gx1 - gx0) * PX, (gy1 - gy0) * PX
    if w <= 0 or hgt <= 0 or w * hgt > 4_000_000:
        continue
    # the area the game draws the building in: its outline, swept up by the wall height
    sil = Image.new('L', (w, hgt), 0)
    dr = ImageDraw.Draw(sil)
    steps = max(1, int(wall * PX))
    for s in range(steps + 1):
        t = wall * s / steps
        dr.polygon([((x - gx0) * PX, (y - t - gy0) * PX) for x, y in zip(xs, ys)], fill=255)
    sil = np.asarray(sil) > 0
    yy, xx = np.mgrid[0:hgt, 0:w].astype(np.float64)
    c, r = to_photo(gx0 + (xx + 0.5) / PX, gy0 + (yy + 0.5) / PX)
    c, r = c.astype(np.int64), r.astype(np.int64)
    ok = (c >= 0) & (c < PW) & (r >= 0) & (r < PH)
    px = np.zeros((hgt, w, 4), np.uint8)
    px[ok] = photo[r[ok], c[ok]]
    got = sil & (px[..., 3] > 0)
    if got.sum() < 0.6 * sil.sum():
        continue  # mostly outside the render: keep the game's own drawing
    # fill gaps from the nearest drawn pixel, so a hole in the mesh does not show as a hole
    _, (iy, ix) = ndi.distance_transform_edt(~got, return_indices=True)
    px = px[iy, ix]
    px[..., 3] = np.where(sil, 255, 0)
    crops.append((i, gx0, gy0, wall, px))
print(f'{len(crops)} buildings have their real look', flush=True)

# ---- pack into one atlas (shelves, tallest first)
crops.sort(key=lambda c: -c[4].shape[0])
AW = 4096 if PX > 4 else 2048
x = y = shelf = 0
places = []
for i, gx0, gy0, wall, px in crops:
    hgt, w = px.shape[:2]
    if x + w > AW:
        x, y, shelf = 0, y + shelf + 1, 0
    places.append((i, x, y, w, hgt, gx0, gy0, wall))
    x += w + 1
    shelf = max(shelf, hgt)
AH = y + shelf + 1
atlas = np.zeros((AH, AW, 4), np.uint8)
for (i, ax, ay, w, hgt, *_), (_, _, _, _, px) in zip(places, crops):
    atlas[ay:ay + hgt, ax:ax + w] = px

# ---- a touch of pixel art: smoother, livelier colours, fewer of them
img = Image.fromarray(atlas, 'RGBA')
alpha = img.getchannel('A')
# a 3x3 median takes out photo speckle (leaves, noise) but keeps edges, windows and signs
rgb = Image.fromarray(ndi.median_filter(np.asarray(img.convert('RGB')), size=(3, 3, 1)))
rgb = ImageEnhance.Color(rgb).enhance(1.2)
rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
out = rgb.convert('RGBA')
out.putalpha(alpha)
# WebP keeps a detailed photo atlas to a few MB (every current browser, iPad Safari included, reads it)
out.save(f'{ROOT}/public/img/buildings.webp', quality=82, method=6)

index = {i: [ax, ay, w, hgt, gx0, gy0, round(wall, 3)] for i, ax, ay, w, hgt, gx0, gy0, wall in places}
ts = f"""/**
 * GENERATED by scripts/import-photos.py: where each building's real look sits in
 * public/img/buildings.png (from the Lands Department 3D Visualisation Map, 3d.map.gov.hk).
 * Building index -> [atlas x, y, width, height (px, {PX} per metre), game x, y of its top-left (m), wall height (m)]
 */
export const PHOTO_PX = {PX};
export const PHOTOS: Record<number, [number, number, number, number, number, number, number]> = {json.dumps(index, separators=(',', ':'))};
"""
open(f'{ROOT}/src/stanley-photos.ts', 'w').write(ts)
import os
print(f'atlas {AW}x{AH}, {os.path.getsize(f"{ROOT}/public/img/buildings.webp") / 1e6:.1f} MB; index {len(ts)} bytes')
