#!/usr/bin/env python3
"""
Build src/stanley-cover.ts from a Lands Department-style 3D model export (.glb) of part of Stanley.

    python3 scripts/import-3d.py path/to/ssc-campus.glb

What it takes from the model, without decoding the (Draco-compressed) meshes:
  * the terrain's texture, which is an aerial photo of the area, to tell trees, lawn, rock and sand apart;
  * each building tile's bounding box, which gives its height;
  * the tile names, which are Hong Kong 1980 Grid coordinates, to place everything on the game map.

The result is stylised on purpose: land cover is cleaned into blobs of at least 8 m2 and roof colours
are snapped to a small palette, so the map reads as pixel art rather than a photo.
Needs numpy, scipy and Pillow.
"""
import base64, json, math, re, struct, sys
from io import BytesIO

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = __file__.rsplit('/scripts/', 1)[0]
glb_path = sys.argv[1]

# ---- the game map (OpenStreetMap, whole metres from the top-left corner)
src = open(f'{ROOT}/src/stanley-osm.ts').read()
osm = json.loads(src[src.index('String.raw`') + 11:src.rindex('`')])
W, H = osm['w'], osm['h']
lat0, lon0 = osm['origin']

# ---- the model
b = open(glb_path, 'rb').read()
jl, = struct.unpack('<I', b[12:16])
j = json.loads(b[20:20 + jl])
BIN = 20 + jl + 8
N, A = j['nodes'], j['accessors']

def image(i):
    v = j['bufferViews'][j['images'][i]['bufferView']]
    o = BIN + v.get('byteOffset', 0)
    return Image.open(BytesIO(b[o:o + v['byteLength']])).convert('RGB')

def tex_source(t):
    t = j['textures'][t]
    return t.get('source', t.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))

root = N[j['scenes'][0]['nodes'][0]]
m = re.match(r'[A-Z](\d{5})(\d{5})', root['name'])
E0, N0 = 800000 + int(m.group(1)), 800000 + int(m.group(2))  # B39763 08903 -> E 839763, N 808903

# ---- HK1980 Grid -> WGS84 -> game metres
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
    lat, lon = math.degrees(lat) - 5.5 / 3600, math.degrees(lon) + 8.8 / 3600  # HK80 -> WGS84 datum
    return (lon - lon0) * 111320 * math.cos(math.radians(lat0)), (lat0 - lat) * 110574

# ---- building tiles: bounding boxes in the model's Z-up metres
parent = {c: i for i, n in enumerate(N) for c in n.get('children', [])}
tiles = {}
for i, n in enumerate(N):
    if 'mesh' not in n:
        continue
    t, p, name = list(n.get('translation', [0, 0, 0])), parent.get(i), None
    while p is not None and 'rotation' not in N[p]:
        tr = N[p].get('translation', [0, 0, 0])
        t = [t[k] + tr[k] for k in range(3)]
        name, p = N[p]['name'], parent.get(p)
    if not name:
        continue
    for pr in j['meshes'][n['mesh']]['primitives']:
        ac = A[pr['attributes']['POSITION']]
        mn = [t[k] + ac['min'][k] for k in range(3)]
        mx = [t[k] + ac['max'][k] for k in range(3)]
        if name in tiles:
            o = tiles[name]
            mn = [min(o[0][k], mn[k]) for k in range(3)]
            mx = [max(o[1][k], mx[k]) for k in range(3)]
        tiles[name] = (mn, mx, n)
buildings = {k: v for k, v in tiles.items() if k[0] == 'B'}
terrain = next(v for k, v in tiles.items() if k[0] == 'T')

# ---- fit: shift and scale the projected tile centres onto OSM building outlines
outl = Image.new('L', (W, H), 0)
d = ImageDraw.Draw(outl)
for bl in osm['buildings']:
    p = bl[0]
    d.polygon(list(zip(p[0::2], p[1::2])), fill=1)
mask = np.array(outl) > 0
cent = np.array([hk_to_game(E0 + (mn[0] + mx[0]) / 2, N0 + (mn[1] + mx[1]) / 2) for mn, mx, _ in buildings.values()])
c0 = cent.mean(0)
best = (-1, 1, 0, 0)
for s in (0.99, 0.995, 1.0, 1.005, 1.01):
    cs = (cent - c0) * s + c0
    for dx in range(-60, 61):
        for dy in range(-60, 61):
            x = np.round(cs[:, 0] + dx).astype(int)
            y = np.round(cs[:, 1] + dy).astype(int)
            ok = (x >= 0) & (x < W) & (y >= 0) & (y < H)
            sc = int(mask[y[ok], x[ok]].sum())
            if sc > best[0]:
                best = (sc, s, dx, dy)
_, s, dx, dy = best
print(f'fit: {best[0]}/{len(cent)} tiles on an OSM building, scale {s}, shift {dx},{dy} m')
P, Q = [], []
for x in range(-40, 800, 40):
    for y in range(-560, 140, 40):
        gx, gy = hk_to_game(E0 + x, N0 + y)
        P.append([x, y, 1])
        Q.append([(gx - c0[0]) * s + c0[0] + dx, (gy - c0[1]) * s + c0[1] + dy])
Aff = np.linalg.lstsq(np.array(P), np.array(Q), rcond=None)[0]  # [x, y, 1] -> [gx, gy]
Li = np.linalg.inv(Aff[:2].T)

def to_game(x, y):
    return Aff[0, 0] * x + Aff[1, 0] * y + Aff[2, 0], Aff[0, 1] * x + Aff[1, 1] * y + Aff[2, 1]

# ---- classify the aerial photo: 1 trees, 2 lawn, 3 rock, 4 sand
tmin, tmax, tnode = terrain
mat = j['materials'][j['meshes'][tnode['mesh']]['primitives'][0]['material']]
ort = np.array(image(tex_source(mat['pbrMetallicRoughness']['baseColorTexture']['index']))).astype(np.float32)
oh, ow = ort.shape[:2]
r, g, bb = ort[..., 0], ort[..., 1], ort[..., 2]
V = (r + g + bb) / 3
mu = ndi.uniform_filter(V, 11)
sd = np.sqrt(np.maximum(ndi.uniform_filter(V * V, 11) - mu * mu, 0))  # texture over about 2 m
rs, gs, bs = (ndi.uniform_filter(c, 11) for c in (r, g, bb))
Vs, ex = (rs + gs + bs) / 3, 2 * gs - rs - bs
tree = (ex > 1) & (Vs < 118) & (sd > 11) & (gs >= rs - 4)
tree = ndi.binary_closing(tree, iterations=4) & (sd > 6)  # fill the shadows between crowns
lawn = (ex > 10) & (Vs >= 105) & (sd < 20) & (rs < gs + 12) & ~tree
sand = (rs > gs) & (gs > bs) & (Vs > 150) & (rs - bs > 30) & (rs - bs < 110) & (sd < 22)
rock = (rs > gs + 16) & (rs > bs + 40) & (Vs < 185) & ~lawn & ~tree
cls = np.zeros(V.shape, np.uint8)
cls[lawn], cls[tree], cls[sand], cls[rock] = 2, 1, 4, 3

# corners of the photo on the game map give the box to sample
cx = [to_game(x, y) for x in (tmin[0], tmax[0]) for y in (tmin[1], tmax[1])]
X0, Y0 = int(min(p[0] for p in cx)), int(min(p[1] for p in cx))
X1, Y1 = int(max(p[0] for p in cx)) + 1, int(max(p[1] for p in cx)) + 1
X0, Y0, X1, Y1 = max(X0, 0), max(Y0, 0), min(X1, W), min(Y1, H)
gy, gx = np.mgrid[Y0:Y1, X0:X1].astype(np.float64)
votes = np.zeros((5,) + gx.shape, np.int16)
inside = np.zeros(gx.shape, bool)
for fa in np.linspace(0.1, 0.9, 5):
    for fc in np.linspace(0.1, 0.9, 5):
        lx, ly = np.einsum('ij,jhw->ihw', Li, np.stack([gx + fa - Aff[2, 0], gy + fc - Aff[2, 1]]))
        u = ((lx - tmin[0]) / (tmax[0] - tmin[0]) * ow).astype(int)
        v = ((tmax[1] - ly) / (tmax[1] - tmin[1]) * oh).astype(int)
        ok = (u >= 0) & (u < ow) & (v >= 0) & (v < oh)
        inside |= ok
        k = np.where(ok, cls[np.clip(v, 0, oh - 1), np.clip(u, 0, ow - 1)], 0)
        for q in range(5):
            votes[q] += k == q
cover = votes.argmax(0).astype(np.uint8)
cover = np.stack([ndi.uniform_filter((cover == q).astype(np.float32), 3) for q in range(5)]).argmax(0).astype(np.uint8)
for q in (1, 2, 3, 4):
    lab, n = ndi.label(cover == q)
    if n:
        size = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
        cover[np.isin(lab, np.where(size < 8)[0] + 1)] = 0
cover[~inside] = 0
cover_rgb = np.zeros(gx.shape + (3,), np.float32)  # the photo on the game grid, for roof colours
for fa in (0.25, 0.75):
    for fc in (0.25, 0.75):
        lx, ly = np.einsum('ij,jhw->ihw', Li, np.stack([gx + fa - Aff[2, 0], gy + fc - Aff[2, 1]]))
        u = np.clip(((lx - tmin[0]) / (tmax[0] - tmin[0]) * ow).astype(int), 0, ow - 1)
        v = np.clip(((tmax[1] - ly) / (tmax[1] - tmin[1]) * oh).astype(int), 0, oh - 1)
        cover_rgb += ort[v, u] / 4

# ---- buildings: height from the model, roof colour from the photo, snapped to a palette
PALETTE = {
    '#b65a42': 'tile', '#8f3d34': 'tile', '#c98b6c': 'tile', '#a0705c': 'tile',
    '#d9d6cc': 'flat', '#b8b6ae': 'flat', '#94938e': 'flat', '#6f7074': 'flat', '#ecebe4': 'flat',
    '#7f8d98': 'flat', '#5c6b78': 'flat', '#b9a67e': 'flat', '#7a8f66': 'flat', '#5f7d8c': 'flat',
}
pal = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in PALETTE], np.float32)
pal_names = list(PALETTE)

def snap(rgb):
    c = np.array(rgb, np.float32)
    grey = c.mean()
    c = grey + (c - grey) * 1.35  # push the photo's muddy colours a little towards the palette
    w = np.array([0.3, 0.59, 0.11]) * 3
    return pal_names[int(np.argmin((((pal - c) ** 2) * w).sum(1)))]

out = {}
for i, bl in enumerate(osm['buildings']):
    p = bl[0]
    xs, ys = p[0::2], p[1::2]
    mx_, my_ = int(np.mean(xs)), int(np.mean(ys))
    if not (X0 <= mx_ < X1 and Y0 <= my_ < Y1) or not inside[my_ - Y0, mx_ - X0]:
        continue
    bx0, bx1, by0, by1 = max(min(xs) - 2, X0), min(max(xs) + 3, X1), max(min(ys) - 2, Y0), min(max(ys) + 3, Y1)
    img = Image.new('L', (bx1 - bx0, by1 - by0), 0)
    ImageDraw.Draw(img).polygon([(x - bx0, y - by0) for x, y in zip(xs, ys)], fill=1)
    mk = np.array(img) > 0
    inner = ndi.binary_erosion(mk, iterations=1)
    if inner.sum() < 4:
        inner = mk
    if not inner.any():
        continue
    px = cover_rgb[by0 - Y0:by1 - Y0, bx0 - X0:bx1 - X0][inner]
    red = (px[:, 0] > px[:, 1] + 18) & (px[:, 0] > px[:, 2] + 12)
    if red.mean() > 0.3:  # mostly red: a tiled roof, whatever the average says
        roof = snap(np.median(px[red], 0) * [1.08, 0.92, 0.88])
        if PALETTE[roof] != 'tile':
            roof = '#a0705c'
    else:
        roof = snap(np.median(px, 0))
    near = ndi.binary_dilation(mk, iterations=2)
    hs = []
    for mn, mx, _ in buildings.values():
        tx, ty = to_game((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2)
        tx, ty = int(tx) - bx0, int(ty) - by0
        h = mx[2] - mn[2]
        if 0 <= tx < near.shape[1] and 0 <= ty < near.shape[0] and near[ty, tx] and 2 < h < 120:
            hs.append(h)
    out[i] = [roof, round(max(hs)) if hs else 0, 1 if PALETTE[roof] == 'tile' else 0]

# ---- pack: runs of (class << 5 | length - 1), base64
flat = cover.flatten()
runs, v, n = bytearray(), int(flat[0]), 0
for x in flat:
    if x == v and n < 32:
        n += 1
    else:
        runs.append((v << 5) | (n - 1))
        v, n = int(x), 1
runs.append((v << 5) | (n - 1))
counts = {q: int((cover == q).sum()) for q in range(5)}
ts = f"""/**
 * GENERATED by scripts/import-3d.py from a 3D model of Stanley (aerial photo and building heights).
 * Land cover for part of the map, and roof colour, height and roof shape for the buildings in it.
 */
export const COVER = {{ x: {X0}, y: {Y0}, w: {X1 - X0}, h: {Y1 - Y0}, runs: '{base64.b64encode(bytes(runs)).decode()}' }};

/** OSM building index -> [roof colour, height in metres (0 = unknown), pitched tile roof 1/0] */
export const ROOF: Record<number, [string, number, number]> = {json.dumps(out, separators=(',', ':'))};
"""
open(f'{ROOT}/src/stanley-cover.ts', 'w').write(ts)
print(f'cover {X1 - X0}x{Y1 - Y0} at {X0},{Y0}: trees {counts[1]}, lawn {counts[2]}, rock {counts[3]}, sand {counts[4]} m2; '
      f'{len(out)} buildings; {len(ts)} bytes')
