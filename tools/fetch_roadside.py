"""Rest stops along each Bangkok -> destination drive, from OpenStreetMap.

Usage: python -I tools/fetch_roadside.py [--cached]
Reads  data/destinations.json (the stored OSRM route ORIGIN>ARRIVE of every destination).
Writes tools/raw/roadside/<dest>.json  - the raw Overpass response (reused with --cached)
       data/roadside.json               - what the site reads: per destination, fuel stations,
                                          cafes and restaurants within 500 m of the route, with
                                          how far along the drive they are (km and minutes).

The site suggests a stop about every 60-90 minutes of driving from this list and lets the
customer add or remove stops (js/drive.js).
"""
import json
import math
import pathlib
import sys
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
RAW = HERE / "raw" / "roadside"
DATA = ROOT / "data" / "destinations.json"
OUT = ROOT / "data" / "roadside.json"

AROUND_M = 500
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
CHUNK = 4  # route points per query: small bounding boxes are light for the server
# Stops in the first half hour are still in Bangkok traffic, and the last 15 minutes are
# almost there: neither is a useful break.
SKIP_START_MIN = 30
SKIP_END_MIN = 15
BUCKET_KM = 3  # keep at most one place of each kind per 3 km, so the list stays short


def dist(a, b):
    """Metres between two [lon, lat] points."""
    p = math.pi / 180
    h = math.sin((b[1] - a[1]) * p / 2) ** 2 + math.cos(a[1] * p) * math.cos(b[1] * p) * math.sin((b[0] - a[0]) * p / 2) ** 2
    return 12742000 * math.asin(math.sqrt(h))


def project(geom, cum, pt):
    """Distance along the route (m) of the point nearest to pt, and how far off it is (m)."""
    best = (float("inf"), 0.0)
    kx = math.cos(pt[1] * math.pi / 180)
    for i in range(1, len(geom)):
        a, b = geom[i - 1], geom[i]
        ax, ay, bx, by = a[0] * kx, a[1], b[0] * kx, b[1]
        px, py = pt[0] * kx, pt[1]
        dx, dy = bx - ax, by - ay
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        off = dist(q, pt)
        if off < best[0]:
            best = (off, cum[i - 1] + dist(a, q))
    return best[1], best[0]


def query(geom):
    """Everything in the box around a few route points (filtered to 500 m afterwards)."""
    pad = 0.006  # about 650 m
    a = (f"({min(p[1] for p in geom) - pad:.5f},{min(p[0] for p in geom) - pad:.5f},"
         f"{max(p[1] for p in geom) + pad:.5f},{max(p[0] for p in geom) + pad:.5f})")
    return f"""[out:json][timeout:60];
(
  nwr["amenity"="fuel"]{a};
  nwr["amenity"~"^(cafe|restaurant)$"]["name"]{a};
);
out center tags;"""


def fetch(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(9):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(url, data=body, headers={
                "User-Agent": "suumtrip-student-project/0.1 (github.com/nippich321/suumtrip)"})
            with urllib.request.urlopen(req, timeout=150) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - try the next mirror
            print(f"  {url}: {e}", file=sys.stderr)
            time.sleep(5 + attempt * 3)
    raise SystemExit("Overpass is not answering; try again later or use --cached")


def name_of(tags):
    return tags.get("name:th") or tags.get("name") or tags.get("brand:th") or tags.get("brand") or tags.get("operator")


def places(dest, raw):
    leg = dest["legs"]["ORIGIN>ARRIVE"]
    geom = leg["geom"]
    cum = [0.0]
    for i in range(1, len(geom)):
        cum.append(cum[-1] + dist(geom[i - 1], geom[i]))
    total_m = cum[-1]
    found = []
    for el in raw["elements"]:
        tags = el.get("tags", {})
        lon, lat = (el["lon"], el["lat"]) if "lon" in el else (el["center"]["lon"], el["center"]["lat"])
        name = name_of(tags)
        if not name:
            continue
        along, off = project(geom, cum, [lon, lat])
        if off > AROUND_M * 1.2:
            continue
        minute = leg["sec"] * along / total_m / 60
        if minute < SKIP_START_MIN or minute > leg["sec"] / 60 - SKIP_END_MIN:
            continue
        kind = "fuel" if tags.get("amenity") == "fuel" else tags["amenity"]
        found.append(dict(name=name, kind=kind, brand=tags.get("brand", ""), lon=round(lon, 6), lat=round(lat, 6),
                          km=round(along / 1000, 1), min=round(minute), off=round(off)))
    # a fuel station with a cafe or restaurant next to it is the classic Thai rest stop
    for f in found:
        if f["kind"] == "fuel":
            f["food"] = any(g["kind"] != "fuel" and dist([f["lon"], f["lat"]], [g["lon"], g["lat"]]) < 150 for g in found)
    found.sort(key=lambda p: (p["km"], p["off"]))
    keep, seen = [], set()
    for p in found:
        key = (p["kind"], int(p["km"] // BUCKET_KM))
        if key in seen:
            continue
        seen.add(key)
        keep.append(p)
    return keep


def main():
    cached = "--cached" in sys.argv
    RAW.mkdir(parents=True, exist_ok=True)
    data = json.loads(DATA.read_text(encoding="utf-8"))
    out = {"source": "OpenStreetMap via Overpass, within 500 m of the stored OSRM route", "around_m": AROUND_M,
           "destinations": {}}
    for dest in data["destinations"]:
        raw_file = RAW / f"{dest['id']}.json"
        if cached and raw_file.exists():
            raw = json.loads(raw_file.read_text(encoding="utf-8"))
        else:
            print("fetching", dest["id"], flush=True)
            leg = dest["legs"]["ORIGIN>ARRIVE"]
            geom = leg["geom"]
            cum = [0.0]
            for i in range(1, len(geom)):
                cum.append(cum[-1] + dist(geom[i - 1], geom[i]))
            # only the stretch where a stop is useful (not Bangkok, not the last minutes)
            minute = [leg["sec"] * c / cum[-1] / 60 for c in cum]
            first = max(0, next(i for i, m in enumerate(minute) if m >= SKIP_START_MIN) - 1)
            last = min(len(geom), max(i for i, m in enumerate(minute) if m <= leg["sec"] / 60 - SKIP_END_MIN) + 2)
            elements = {}
            for i in range(first, last - 1, CHUNK):
                print(".", end="", flush=True)
                for el in fetch(query(geom[i:i + CHUNK + 1]))["elements"]:
                    elements[(el["type"], el["id"])] = el
                time.sleep(1)
            raw = {"elements": list(elements.values())}
            raw_file.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
            time.sleep(2)
        ps = places(dest, raw)
        out["destinations"][dest["id"]] = ps
        kinds = {k: sum(p["kind"] == k for p in ps) for k in ("fuel", "cafe", "restaurant")}
        print(f"\n{dest['id']:12} {round(dest['legs']['ORIGIN>ARRIVE']['sec'] / 60)} min drive, "
              f"{len(raw['elements'])} raw, kept {kinds}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("wrote", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
