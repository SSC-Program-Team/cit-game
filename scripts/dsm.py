"""
Build a 0.5 m surface-height map (DSM) of Stanley from Lands Department 3D OBJ tiles.

    python3 dsm.py out.npz sheet1.zip [sheet2.zip ...]

Reads every .obj straight out of the zips (nothing is unpacked), and for each 0.5 m cell keeps the
highest surface point: roofs where there are buildings, the ground elsewhere. OBJ coordinates are
Hong Kong 1980 Grid minus 800000 (x east, y north), z in metres above Principal Datum.
Output: z in decimetres (int16, -1 = no data), and the grid's origin and cell size.
"""
import re
import sys
import time
import zipfile

import numpy as np

CELL = 0.5
out_path, zips = sys.argv[1], sys.argv[2:]

# the area the sheets cover, from their 150 m tile names (Tile_+265_+059 -> x 39750, y 8850)
tiles = []
for z in zips:
    with zipfile.ZipFile(z) as zf:
        for n in zf.namelist():
            m = re.search(r'Tile_([+-]\d+)_([+-]\d+)\.obj$', n)
            if m:
                tiles.append((z, n, int(m.group(1)), int(m.group(2))))
x0 = min(t[2] for t in tiles) * 150.0
y0 = min(t[3] for t in tiles) * 150.0
x1 = (max(t[2] for t in tiles) + 1) * 150.0
y1 = (max(t[3] for t in tiles) + 1) * 150.0
W, H = int((x1 - x0) / CELL), int((y1 - y0) / CELL)
print(f'{len(tiles)} tiles, E {800000 + x0:.0f}-{800000 + x1:.0f} N {800000 + y0:.0f}-{800000 + y1:.0f}, grid {W}x{H}', flush=True)
dsm = np.full(H * W, -1e9, np.float32)

V_RE = re.compile(rb'^v (\S+) (\S+) (\S+)', re.M)
F_RE = re.compile(rb'^f (\d+)\S* (\d+)\S* (\d+)\S*', re.M)


def splat(px, py, pz):
    i = ((py - y0) / CELL).astype(np.int64)
    j = ((px - x0) / CELL).astype(np.int64)
    ok = (i >= 0) & (i < H) & (j >= 0) & (j < W)
    k = (H - 1 - i[ok]) * W + j[ok]  # row 0 is the north edge
    z = pz[ok]
    order = np.argsort(z)
    dsm[k[order]] = np.maximum(dsm[k[order]], z[order])  # writes in rising z: the last (highest) wins


t0 = time.time()
for n_done, (zp, name, _, _) in enumerate(tiles):
    with zipfile.ZipFile(zp) as zf:
        data = zf.read(name)
    v = np.array(V_RE.findall(data), dtype=np.float64)
    f = np.array(F_RE.findall(data), dtype=np.int64) - 1
    del data
    if not len(v):
        continue
    splat(v[:, 0], v[:, 1], v[:, 2])
    if len(f):
        A, B, C = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
        edge = np.maximum(np.maximum(np.linalg.norm(B - A, axis=1), np.linalg.norm(C - B, axis=1)), np.linalg.norm(A - C, axis=1))
        # sample each triangle finely enough that no 0.5 m cell under it is missed
        k = np.clip(np.ceil(edge / 0.35), 1, 200).astype(np.int64)
        for kk in np.unique(k):
            sel = k == kk
            a, b = np.meshgrid(np.arange(kk + 1), np.arange(kk + 1))
            keep = a + b <= kk
            a, b = a[keep] / kk, b[keep] / kk
            As, Bs, Cs = A[sel], B[sel], C[sel]
            step = max(1, 2_000_000 // len(a))  # keep each batch to about 2 million points
            for s in range(0, len(As), step):
                P = As[s:s + step, None, :] + a[None, :, None] * (Bs[s:s + step, None, :] - As[s:s + step, None, :]) \
                    + b[None, :, None] * (Cs[s:s + step, None, :] - As[s:s + step, None, :])
                P = P.reshape(-1, 3)
                splat(P[:, 0], P[:, 1], P[:, 2])
    print(f'{n_done + 1}/{len(tiles)} {name}: {len(v)} vertices, {len(f)} faces, {time.time() - t0:.0f}s', flush=True)

z = np.where(dsm > -1e8, np.round(dsm * 10), -1).astype(np.int16).reshape(H, W)
np.savez_compressed(out_path, z_dm=z, origin_e=800000 + x0, origin_n=800000 + y1, cell=CELL)
print(f'done: {(z >= 0).mean() * 100:.1f}% of cells have a height; saved {out_path}', flush=True)
