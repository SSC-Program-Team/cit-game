"""Cut Stanley out of the Lands Department's iB1000 1:1000 digital topographic map (GML sheets).

    python3 scripts/import-ib1000.py path/to/unzipped-sheets/  > content/ib1000-stanley.json

The sheets (15-NE-12A to 12D, 13C, 17A, 17B, 18A) come from open.hkmapservice.gov.hk as GML zips;
unzip each into the folder first. Coordinates go from the Hong Kong 1980 Grid to game metres
through longitude/latitude, by an affine fit to points the CSDI service returned in both systems
(residual under 1 mm over Stanley), then the same shift as the pedestrian network (1 m west, 7.5 m
south) onto OpenStreetMap. Output: per kind, a list of point lists [x0, y0, x1, y1, ...] rounded to
0.1 m. Source: Lands Department, HKSAR Government.
"""
import glob, json, sys
import xml.etree.ElementTree as ET

G = '{http://www.opengis.net/gml}'
F = '{http://www.safe.com/gml/fme}'

# HK1980 (E, N) -> (lon, lat): least squares on 12 control points from the 3D Pedestrian Network
CL = None
def fit():
    import numpy as np
    P = np.array([[114.20741438156337,22.22004327721337,839416.7457999997,809042.1397999991],[114.20744121818615,22.22019136215908,839419.5093999999,809058.5383000001],[114.20817965430297,22.220805917112703,839495.6295999996,809126.6055999994],[114.20985439057834,22.21982466263576,839668.3213,809017.9846999999],[114.2073642028402,22.22112577805654,839411.5481000002,809162.0077],[114.20899039444828,22.219875123206126,839579.2401,809023.5532000009],[114.20784965506658,22.221685469637986,839461.5861999998,809223.9944000002],[114.20704497119742,22.221174580880803,839378.6338,809167.4052000009],[114.21010187611942,22.219690465617877,839693.8409000002,809003.1302000005],[114.20927380343673,22.220284778212804,839608.4505000003,809068.9219000004],[114.21385204154754,22.221141269570673,840080.4528000001,809163.8723000009],[114.20697521021066,22.22102705833254,839371.4446,809151.0680999998]])
    A = np.c_[P[:, 2] - 840000, P[:, 3] - 809000, np.ones(len(P))]
    cl = np.linalg.lstsq(A, P[:, 0], rcond=None)[0]
    ca = np.linalg.lstsq(A, P[:, 1], rcond=None)[0]
    return [float(v) for v in cl], [float(v) for v in ca]
cl, ca = fit()
import math
KX = 111320 * math.cos(math.radians(22.217)); KY = 110574
LAT0, LON0 = 22.22282, 114.2058          # the game's top-left corner (OSM.origin)
SHIFT = (-1.0, 7.5)                      # as scripts/import-pedestrian.ts found

def game(E, N):
    lon = cl[0] * (E - 840000) + cl[1] * (N - 809000) + cl[2]
    lat = ca[0] * (E - 840000) + ca[1] * (N - 809000) + ca[2]
    return (lon - LON0) * KX + SHIFT[0], (LAT0 - lat) * KY + SHIFT[1]

def feats(path):
    for ev, el in ET.iterparse(path, events=('end',)):
        if el.tag != G + 'featureMember':
            continue
        f = list(el)[0]
        attrs = {c.tag[len(F):]: c.text for c in f if c.tag.startswith(F) and len(c) == 0}
        geoms = []
        for pl in f.iter(G + 'posList'):
            v = list(map(float, pl.text.split()))
            geoms.append([(v[i + 1], v[i]) for i in range(0, len(v), 3)])  # GML gives N E h
        yield attrs, geoms
        el.clear()

# which features to keep: (layer, type attribute, codes) -> kind
KEEP = [
    ('Transportation/CartoTransLine', 'TRANSPORTATIONLINETYPE', {'RM': 'kerb', 'FY': 'flyover'}),
    ('Transportation/CartoPedLine', 'PEDESTRIANTYPE', {'PA': 'pavement', 'FP': 'footpath', 'FPW': 'footpath', 'FBR': 'footbridge', 'CWY': 'covered', 'PAU': 'pavement'}),
    ('Hydrography/Shoreline', 'SHORELINETYPE', {'HWM': 'shore', 'SWA': 'seawall'}),
    ('Buildings/CartoBuildingLine', 'BUILDINGLINETYPE', {'WL': 'wall', 'F': 'fence', 'GA': 'gate'}),
    ('Transportation/TransportPolygon', 'TRANSPORTPOLYGONTYPE', {'CPA': 'carpark'}),
]
W, H = 1408, 1280
out = {}
for layer, key, codes in KEEP:
    for path in sorted(glob.glob(f'{sys.argv[1]}/**/Layers/{layer}.gml', recursive=True)):
        for attrs, geoms in feats(path):
            t = attrs.get(key) or next((v for k, v in attrs.items() if k.endswith('TYPE')), None)
            kind = codes.get(t)
            if not kind:
                continue
            for g in geoms:
                pts = [game(E, N) for E, N in g]
                if not any(-10 <= x <= W + 10 and -10 <= y <= H + 10 for x, y in pts):
                    continue
                out.setdefault(kind, []).append([round(v, 1) for p in pts for v in p])
json.dump({'src': 'Lands Department, HKSAR Government: iB1000 Digital Topographic Map', 'shift': SHIFT, 'kinds': out}, sys.stdout, separators=(',', ':'))
print(file=sys.stderr, *[f'{k}: {len(v)}' for k, v in out.items()])
