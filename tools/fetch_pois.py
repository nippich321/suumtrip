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
}

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def query(lat, lon, r):
    a = f"(around:{r},{lat},{lon})"
    return f"""[out:json][timeout:90];
(
  nwr["amenity"~"^(restaurant|cafe)$"]["name"]{a};
  nwr["tourism"~"^(hotel|guest_house|resort|hostel|motel|chalet)$"]["name"]{a};
  nwr["tourism"~"^(attraction|viewpoint|museum|zoo|theme_park)$"]["name"]{a};
  nwr["amenity"~"^(place_of_worship|marketplace)$"]["name"]{a};
  nwr["natural"~"^(beach|waterfall|peak)$"]["name"]{a};
  nwr["leisure"~"^(park|nature_reserve)$"]["name"]{a};
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
        data = fetch(query(lat, lon, r))
        out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"{dest}: {len(data.get('elements', []))} elements", flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
