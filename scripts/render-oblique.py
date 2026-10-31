"""
Render the Lands Department 3D photo mesh in the game's own view: from above, with south walls
shown at 0.4 of their height (as the game draws them). Only what stands above the ground is drawn.

    python3 render-oblique.py out-prefix dsm.npz sheet1.zip [sheet2.zip ...]
    (CELL=0.25 in the environment for a quicker, coarser render)

Writes out-prefix.png (colour, transparent where nothing was drawn) and out-prefix.json (where the
image sits). Rows: south is down; a point at grid north N and height z (above the local ground)
lands on row (N_top - N + PAD - 0.4 z) / CELL. Needs numpy, scipy and Pillow.
Runs where the OBJ zips are (they are large); the PNG it makes is what the game build needs.
"""
import io
import json
import re
import sys
import time
import zipfile

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None
CELL = float(__import__('os').environ.get('CELL', '0.125'))  # metres per pixel (8 per metre, the game's art grid)
LIFT = 0.4    # how much of a wall's height shows, as in the game
PAD = 40.0    # metres of room above the top edge for tall buildings near it
MIN_Z = 1.2   # metres above ground: anything lower is ground, drawn by the game itself

out, dsm_path, zips = sys.argv[1], sys.argv[2], sys.argv[3:]

# ---- the ground, from the 0.5 m surface map (as scripts/import-dsm.py works it out)
d = np.load(dsm_path)
zdm = d['z_dm']
DE, DN, DC = float(d['origin_e']) - 800000, float(d['origin_n']) - 800000, float(d['cell'])
surf = np.where(zdm >= 0, zdm / 10.0, np.nan).astype(np.float32)
zf = np.where(np.isnan(surf), np.nanmin(surf), surf)
ground = ndi.uniform_filter(ndi.grey_opening(zf, size=(49, 49)), 25)
GH, GW = ground.shape


def ground_at(x, y):
    j = np.clip(((x - DE) / DC).astype(np.int64), 0, GW - 1)
    i = np.clip(((DN - y) / DC).astype(np.int64), 0, GH - 1)
    return ground[i, j]


# ---- the image
tiles = []
for z in zips:
    with zipfile.ZipFile(z) as zf_:
        for n in zf_.namelist():
            m = re.search(r'Tile_([+-]\d+)_([+-]\d+)\.obj$', n)
            if m:
                tiles.append((z, n, int(m.group(1)), int(m.group(2))))
x0 = min(t[2] for t in tiles) * 150.0
y0 = min(t[3] for t in tiles) * 150.0
x1 = (max(t[2] for t in tiles) + 1) * 150.0
y1 = (max(t[3] for t in tiles) + 1) * 150.0
W = int((x1 - x0) / CELL)
H = int((y1 - y0 + PAD) / CELL)
print(f'{len(tiles)} tiles -> {W}x{H} px', flush=True)
key = np.full(H * W, -1e9, np.float32)
rgb = np.zeros((H * W, 3), np.uint8)


def splat(px, py, zr, col):
    j = ((px - x0) / CELL).astype(np.int64)
    i = ((y1 - py + PAD - LIFT * zr) / CELL).astype(np.int64)
    ok = (i >= 0) & (i < H) & (j >= 0) & (j < W)
    k = i[ok] * W + j[ok]
    zr, col = zr[ok], col[ok]
    order = np.argsort(zr, kind='stable')  # the highest point (nearest the viewer) is written last
    k, zr, col = k[order], zr[order], col[order]
    better = zr > key[k]
    # among several hits on one pixel in this batch, numpy keeps the last write: the highest
    key[k[better]] = zr[better]
    rgb[k[better]] = col[better]


V_RE = re.compile(rb'^v (\S+) (\S+) (\S+)', re.M)
T_RE = re.compile(rb'^vt (\S+) (\S+)', re.M)
F_RE = re.compile(rb'^f (\d+)/(\d+)\S* (\d+)/(\d+)\S* (\d+)/(\d+)\S*', re.M)
t0 = time.time()
for n_done, (zp, name, _, _) in enumerate(tiles):
    with zipfile.ZipFile(zp) as zfile:
        data = zfile.read(name)
        folder = name.rsplit('/', 1)[0] + '/' if '/' in name else ''
        mtl_name = re.search(rb'^mtllib (\S+)', data, re.M)
        textures = {}
        if mtl_name:
            mtl = zfile.read(folder + mtl_name.group(1).decode()).decode('utf-8', 'replace')
            cur = None
            for line in mtl.splitlines():
                line = line.strip()
                if line.startswith('newmtl '):
                    cur = line[7:].strip()
                elif line.startswith('map_Kd ') and cur:
                    textures[cur] = folder + line[7:].strip()
        v = np.array(V_RE.findall(data), dtype=np.float64)
        vt = np.array(T_RE.findall(data), dtype=np.float64)
        if not len(v) or not len(vt):
            continue
        # faces, by material
        parts = re.split(rb'^usemtl (\S+)\s*$', data, flags=re.M)
        groups = []
        for g in range(1, len(parts) - 1, 2):
            f = np.array(F_RE.findall(parts[g + 1]), dtype=np.int64) - 1
            if len(f):
                groups.append((parts[g].decode(), f))
        del data, parts
        n_pts = 0
        for mat, f in groups:
            A, B, C = v[f[:, 0]], v[f[:, 2]], v[f[:, 4]]
            cz = (A[:, 2] + B[:, 2] + C[:, 2]) / 3 - ground_at((A[:, 0] + B[:, 0] + C[:, 0]) / 3, (A[:, 1] + B[:, 1] + C[:, 1]) / 3)
            keep = cz > MIN_Z
            if not keep.any() or mat not in textures:
                continue
            f, A, B, C = f[keep], A[keep], B[keep], C[keep]
            tex = np.asarray(Image.open(io.BytesIO(zfile.read(textures[mat]))).convert('RGB'))
            th, tw = tex.shape[:2]
            TA, TB, TC = vt[f[:, 1]], vt[f[:, 3]], vt[f[:, 5]]
            # sample each triangle densely enough to cover its pixels in this view
            def proj(P):
                return np.stack([P[:, 0], P[:, 1] + LIFT * P[:, 2]], 1)
            pa, pb, pc = proj(A), proj(B), proj(C)
            edge = np.maximum(np.maximum(np.linalg.norm(pb - pa, axis=1), np.linalg.norm(pc - pb, axis=1)), np.linalg.norm(pa - pc, axis=1))
            edge = np.maximum(edge, np.maximum(np.maximum(np.linalg.norm(B[:, :2] - A[:, :2], axis=1), np.linalg.norm(C[:, :2] - B[:, :2], axis=1)), np.linalg.norm(A[:, :2] - C[:, :2], axis=1)))
            kk_all = np.clip(np.ceil(edge / (CELL * 0.7)), 1, 120).astype(np.int64)
            for kk in np.unique(kk_all):
                sel = kk_all == kk
                a, b = np.meshgrid(np.arange(kk + 1), np.arange(kk + 1))
                m_ = a + b <= kk
                a, b = (a[m_] / kk)[None, :, None], (b[m_] / kk)[None, :, None]
                As, Bs, Cs, Ta, Tb, Tc = A[sel], B[sel], C[sel], TA[sel], TB[sel], TC[sel]
                step = max(1, 3_000_000 // a.shape[1])
                for s in range(0, len(As), step):
                    sl = slice(s, s + step)
                    P = (As[sl, None, :] + a * (Bs[sl, None, :] - As[sl, None, :]) + b * (Cs[sl, None, :] - As[sl, None, :])).reshape(-1, 3)
                    T = (Ta[sl, None, :] + a * (Tb[sl, None, :] - Ta[sl, None, :]) + b * (Tc[sl, None, :] - Ta[sl, None, :])).reshape(-1, 2)
                    u = np.clip((T[:, 0] % 1.0) * (tw - 1), 0, tw - 1).astype(np.int64)
                    w = np.clip((1 - (T[:, 1] % 1.0)) * (th - 1), 0, th - 1).astype(np.int64)
                    zr = P[:, 2] - ground_at(P[:, 0], P[:, 1])
                    up = zr > MIN_Z * 0.5
                    splat(P[up, 0], P[up, 1], zr[up].astype(np.float32), tex[w[up], u[up]])
                    n_pts += int(up.sum())
            del tex
    print(f'{n_done + 1}/{len(tiles)} {name}: {n_pts / 1e6:.1f}M points, {time.time() - t0:.0f}s', flush=True)

alpha = (key > -1e8).reshape(H, W)
img = np.dstack([rgb.reshape(H, W, 3), (alpha * 255).astype(np.uint8)])
Image.fromarray(img, 'RGBA').save(out + '.png', optimize=True)
json.dump({'cell': CELL, 'lift': LIFT, 'pad': PAD, 'west_e': 800000 + x0, 'north_n': 800000 + y1, 'w': W, 'h': H}, open(out + '.json', 'w'))
print(f'done: {alpha.mean() * 100:.1f}% drawn; {out}.png', flush=True)
