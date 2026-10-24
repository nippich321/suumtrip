"""Train lines on the map: the railway track between each Bangkok station and each
destination station, so a train leg is drawn along the rails instead of the road.

Usage: python -I tools/build_rails.py [--cached]
Reads  tools/raw/schedules_srt.json (which station pairs have trains) and the station
       positions in tools/fetch_schedules.py.
Writes tools/raw/rails_<line>.json - Overpass railway=rail ways per corridor (reused with --cached)
       data/rails.json              - {"<from>-<to>": [[lon, lat], ...]} along the track, keyed by
                                      the two station codes in ascending order (reverse it for the
                                      other direction).
The path is the shortest way along the OSM track graph between the nodes nearest the stations.
"""
import heapq
import json
import math
import pathlib
import sys
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fetch_schedules import STATIONS  # noqa: E402

RAW = HERE / "raw"
SRT = RAW / "schedules_srt.json"
OUT = HERE.parent / "data" / "rails.json"
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
             "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
# corridors as (south, west, north, east); together they cover every line the trips use
LINES = {
    "north": (13.70, 100.45, 14.80, 101.50),   # Bangkok - Ayutthaya - Pak Chong
    "east": (12.85, 100.45, 13.82, 101.12),    # Bangkok - Chachoengsao - Pattaya
    "south": (12.50, 99.45, 14.10, 100.62),    # Bangkok - Nakhon Pathom - Ratchaburi - Phetchaburi - Hua Hin, Kanchanaburi
}
SNAP_M = 600  # a station must have track within this distance


def dist(a, b):
    p = math.pi / 180
    h = math.sin((b[1] - a[1]) * p / 2) ** 2 + math.cos(a[1] * p) * math.cos(b[1] * p) * math.sin((b[0] - a[0]) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(h))


def fetch(bbox):
    q = f"""[out:json][timeout:120];
way["railway"="rail"]["service"!~"yard|siding|spur"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});
out geom qt;"""
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(10):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(url, data=body, headers={
                "User-Agent": "suumtrip-student-project/0.1 (github.com/nippich321/suumtrip)"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - try the next mirror
            print(f"  {url}: {e}", flush=True)
            time.sleep(min(60, 5 * 2 ** (attempt // 2)))
    raise SystemExit("Overpass is not answering; try again later")


def graph(ways):
    pos, adj = {}, {}
    for w in ways:
        ids, geom = w.get("nodes", []), w.get("geometry", [])
        for nid, g in zip(ids, geom):
            pos[nid] = (g["lon"], g["lat"])
        for a, b in zip(ids, ids[1:]):
            d = dist(pos[a], pos[b])
            adj.setdefault(a, []).append((b, d))
            adj.setdefault(b, []).append((a, d))
    return pos, adj


def nearest(pos, pt):
    best = min(pos, key=lambda n: dist(pos[n], pt))
    return best, dist(pos[best], pt)


def shortest(adj, a, b):
    seen, prev, heap = {a: 0}, {}, [(0, a)]
    while heap:
        d, n = heapq.heappop(heap)
        if n == b:
            break
        if d > seen.get(n, math.inf):
            continue
        for m, w in adj.get(n, []):
            if d + w < seen.get(m, math.inf):
                seen[m], prev[m] = d + w, n
                heapq.heappush(heap, (d + w, m))
    if b not in seen:
        return None, None
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    return path[::-1], seen[b]


def simplify(coords, tol=0.0003):
    if len(coords) < 3:
        return coords
    (x1, y1), (x2, y2) = coords[0], coords[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    far, idx = 0, 0
    for i, (x, y) in enumerate(coords[1:-1], 1):
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
        if d > far:
            far, idx = d, i
    if far > tol:
        return simplify(coords[:idx + 1], tol)[:-1] + simplify(coords[idx:], tol)
    return [coords[0], coords[-1]]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    cached = "--cached" in sys.argv
    ways = []
    for name, bbox in LINES.items():
        f = RAW / f"rails_{name}.json"
        if cached and f.exists():
            data = json.loads(f.read_text(encoding="utf-8"))
        else:
            print("fetching", name, flush=True)
            data = fetch(bbox)
            f.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        ways += [e for e in data["elements"] if e["type"] == "way"]
        print(f"{name}: {len(data['elements'])} ways", flush=True)
    pos, adj = graph(ways)
    srt = json.loads(SRT.read_text(encoding="utf-8"))
    pairs = {tuple(sorted((r["out"]["start"], r["out"]["dest"])))
             for routes in srt["routes"].values() for r in routes if r["out"]["trains"] or r["back"]["trains"]}
    out = {}
    for a, b in sorted(pairs):
        na, da = nearest(pos, STATIONS[a])
        nb, db = nearest(pos, STATIONS[b])
        if max(da, db) > SNAP_M:
            print(f"{a}-{b}: no track near a station ({da:.0f} m, {db:.0f} m); left as the road")
            continue
        path, length = shortest(adj, na, nb)
        if not path:
            print(f"{a}-{b}: stations not connected in the track data; left as the road")
            continue
        coords = [list(STATIONS[a])] + [[round(pos[n][0], 5), round(pos[n][1], 5)] for n in path] + [list(STATIONS[b])]
        out[f"{a}-{b}"] = simplify(coords)
        print(f"{a}-{b}: {length / 1000:.1f} km of track, {len(out[f'{a}-{b}'])} points")
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print("wrote", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
