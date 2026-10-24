"""Fetch real places (food, stays, sights) around each destination from OpenStreetMap.

Usage: python -I tools/fetch_pois.py
Writes tools/raw/<dest>.json with the raw Overpass response.
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
RAW.mkdir(exist_ok=True)

DESTS = {
    # id: (lat, lon, radius_m)
    "suanphueng": (13.548, 99.345, 14000),
    "nakhonnayok": (14.250, 101.250, 15000),
    "khaoyai": (14.560, 101.400, 15000),
    "chaosamran": (13.060, 99.990, 16000),
    "bangsaen": (13.285, 100.920, 9000),
    "huahin": (12.570, 99.955, 9000),
    "amphawa": (13.425, 99.955, 7000),
    "banmai": (13.690, 101.070, 6000),
    "ayutthaya": (14.355, 100.568, 6000),
    # train destinations added 2026-10-23 (centred on the station, or the town for Pattaya)
    "kanchanaburi": (14.034, 99.522, 7000),
    "nakhonpathom": (13.824, 100.058, 5000),
    "ratchaburi": (13.530, 99.824, 6000),
    "phetchaburi": (13.116, 99.941, 6000),
    "chaam": (12.800, 99.966, 6000),
    "pattaya": (12.935, 100.880, 5000),
}

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


PARTS = [
    'nwr["amenity"~"^(restaurant|cafe)$"]["name"]',
    'nwr["tourism"~"^(hotel|guest_house|resort|hostel|motel|chalet)$"]["name"]',
    'nwr["tourism"~"^(attraction|viewpoint|museum|zoo|theme_park)$"]["name"]',
    'nwr["amenity"~"^(place_of_worship|marketplace)$"]["name"]',
    'nwr["natural"~"^(beach|waterfall|peak)$"]["name"]',
    'nwr["leisure"~"^(park|nature_reserve)$"]["name"]',
]


def query(lat, lon, r, parts=PARTS):
    a = f"(around:{r},{lat},{lon})"
    body = "\n".join(f"  {p}{a};" for p in parts)
    return f"""[out:json][timeout:90];
(
{body}
);
out center tags;"""


def fetch(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(8):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "suumtrip-student-project/0.1"})
            with urllib.request.urlopen(req, timeout=120) as r:
                txt = r.read().decode("utf-8")
            data = json.loads(txt)
            return data
        except Exception as e:  # noqa: BLE001
            wait = min(60, 5 * 2 ** attempt)
            print(f"  {url} failed ({e.__class__.__name__}: {str(e)[:80]}); retry in {wait}s", flush=True)
            time.sleep(wait)
    raise SystemExit("all Overpass attempts failed")


def main():
    only = sys.argv[1:] or list(DESTS)
    for dest in only:
        out = RAW / f"{dest}.json"
        if out.exists():
            print(f"{dest}: cached")
            continue
        lat, lon, r = DESTS[dest]
        print(f"{dest}: fetching", flush=True)
        try:
            data = fetch(query(lat, lon, r))
        except SystemExit:
            # a busy server answers small queries more often: one kind of place at a time
            print(f"{dest}: trying one kind of place at a time", flush=True)
            elements = {}
            for part in PARTS:
                for el in fetch(query(lat, lon, r, [part]))["elements"]:
                    elements[(el["type"], el["id"])] = el
                time.sleep(3)
            data = {"elements": list(elements.values())}
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"{dest}: {len(data.get('elements', []))} elements", flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
