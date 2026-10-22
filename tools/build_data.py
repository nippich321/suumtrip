"""Turn raw OpenStreetMap places into trip data for the website.

Usage: python -I tools/build_data.py
Reads tools/raw/<dest>.json, calls the public OSRM routers for walking and
driving legs (cached in tools/raw/routes.json), writes data/destinations.json.
"""
import json
import math
import pathlib
import random
import time
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE.parent / "data" / "destinations.json"
ROUTE_CACHE = RAW / "routes.json"

ORIGIN = (100.5383, 13.7649)  # Victory Monument, Bangkok (lon, lat)

DESTS = {
    "suanphueng": dict(name="สวนผึ้ง", province="ราชบุรี", cat="nat", gold=False, rack=1900,
                       center=(99.345, 13.548), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "nakhonnayok": dict(name="นครนายก", province="นครนายก", cat="nat", gold=False, rack=1800,
                        center=(101.250, 14.250), terminal="สถานีขนส่งหมอชิต 2"),
    "khaoyai": dict(name="เขาใหญ่", province="นครราชสีมา", cat="nat", gold=True, rack=4900,
                    center=(101.400, 14.560), terminal="สถานีขนส่งหมอชิต 2"),
    "chaosamran": dict(name="หาดเจ้าสำราญ", province="เพชรบุรี", cat="sea", gold=False, rack=1900,
                       center=(100.070, 13.0095), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "bangsaen": dict(name="บางแสน", province="ชลบุรี", cat="sea", gold=False, rack=1800,
                     center=(100.920, 13.285), terminal="สถานีขนส่งเอกมัย"),
    "huahin": dict(name="หัวหิน", province="ประจวบคีรีขันธ์", cat="sea", gold=True, rack=5200,
                   center=(99.955, 12.570), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "amphawa": dict(name="อัมพวา", province="สมุทรสงคราม", cat="old", gold=False, rack=1700,
                    center=(99.955, 13.425), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "banmai": dict(name="ตลาดบ้านใหม่", province="ฉะเชิงเทรา", cat="old", gold=False, rack=1600,
                   center=(101.070, 13.690), terminal="สถานีขนส่งเอกมัย"),
    "ayutthaya": dict(name="เกาะเมืองอยุธยา", province="พระนครศรีอยุธยา", cat="old", gold=True, rack=4500,
                      center=(100.568, 14.355), terminal="สถานีขนส่งหมอชิต 2"),
}

# Slot plan for a 2-day, 1-night trip. kinds are matched against classify().
SLOTS = [
    dict(id="d1a", day=1, time="10:30", label="ช่วงเช้า", kinds=["cafe"]),
    dict(id="d1b", day=1, time="12:00", label="มื้อกลางวัน", kinds=["food"]),
    dict(id="d1c", day=1, time="13:30", label="ช่วงบ่าย", kinds=["sight", "market", "temple", "waterfall", "park"]),
    dict(id="hotel", day=1, time="15:30", label="เช็กอินที่พัก", kinds=["stay"]),
    dict(id="d1d", day=1, time="sunset", label="ชมพระอาทิตย์ตก", kinds=["beach", "view", "park", "temple", "sight"], ranked=True),
    dict(id="d1e", day=1, time="19:00", label="มื้อเย็น", kinds=["food"]),
    dict(id="d2a", day=2, time="sunrise", label="เช้าตรู่", kinds=["view", "beach", "temple", "market", "park"], ranked=True),
    dict(id="d2b", day=2, time="08:30", label="อาหารเช้า", kinds=["cafe", "food"]),
    dict(id="d2c", day=2, time="10:00", label="ช่วงสาย", kinds=["sight", "museum", "market", "temple", "waterfall", "park"]),
    dict(id="d2d", day=2, time="12:00", label="มื้อกลางวัน", kinds=["food"]),
]


def classify(tags):
    t = tags.get
    if t("amenity") == "cafe":
        return "cafe"
    if t("amenity") == "restaurant":
        return "food"
    if t("tourism") in ("hotel", "guest_house", "resort", "hostel", "motel", "chalet"):
        return "stay"
    if t("tourism") == "viewpoint" or t("natural") == "peak":
        return "view"
    if t("natural") == "beach":
        return "beach"
    if t("natural") == "waterfall":
        return "waterfall"
    if t("amenity") == "marketplace":
        return "market"
    if t("amenity") == "place_of_worship":
        return "temple" if t("religion") in (None, "buddhist") else None
    if t("tourism") == "museum":
        return "museum"
    if t("leisure") in ("park", "nature_reserve"):
        return "park"
    if t("tourism") in ("attraction", "zoo", "theme_park"):
        return "sight"
    return None


def dist_km(a, b):
    (lon1, lat1), (lon2, lat2) = a, b
    p = math.pi / 180
    h = (math.sin((lat2 - lat1) * p / 2) ** 2 +
         math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(h))


def load_pois(dest):
    data = json.loads((RAW / f"{dest}.json").read_text(encoding="utf-8"))
    pois, seen = [], set()
    for el in data["elements"]:
        tags = el.get("tags", {})
        name = tags.get("name:th") or tags.get("name")
        if not name or name in seen:
            continue
        kind = classify(tags)
        if not kind or is_chain(tags, name):
            continue
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        seen.add(name)
        pois.append(dict(
            id=f"{el['type'][0]}{el['id']}", name=name,
            nameEn=tags.get("name:en") or (tags.get("name") if tags.get("name") != name else None),
            kind=kind, lon=round(lon, 6), lat=round(lat, 6),
            stars=tags.get("stars"), tourism=tags.get("tourism"),
            hours=tags.get("opening_hours"),
        ))
    return pois


CHAINS = ("amazon", "อเมซอน", "starbucks", "swensen", "kfc", "mcdonald", "7-eleven", "เซเว่น",
          "mk ", "black canyon", "inthanin", "อินทนิล", "chester", "mister donut", "pizza company",
          "dairy queen", "s&p", "bonchon", "sukiya", "yayoi", "fuji", "punthai", "พันธุ์ไทย",
          "apartment", "อพาร์ท", "อพาทเม้นท์", "แมนชั่น", "mansion")


GENERIC = {"coffee shop", "cafe", "café", "restaurant", "local restaurant", "cafe - ice cream",
           "noodle shop", "coffee", "ร้านกาแฟ", "ร้านอาหาร", "ร้านก๋วยเตี๋ยว"}


def is_chain(tags, name):
    n = name.lower().strip()
    return bool(tags.get("brand")) or n in GENERIC or len(n) < 3 or any(c in n + " " for c in CHAINS)


def thai_first(p):
    return 0 if any("฀" <= c <= "๿" for c in p["name"]) else 1


def rank(anchor, p):
    # nearest first; a Thai name is worth about 1.5 km
    return dist_km(anchor, (p["lon"], p["lat"])) + 1.5 * thai_first(p)


def choose_options(pool, kinds, anchor, used, rng, n=2, prefer=None, ranked=False):
    cands = [p for p in pool if p["kind"] in kinds and p["id"] not in used]
    if prefer:
        pref = [p for p in cands if prefer(p)]
        if len(pref) >= n:
            cands = pref
    if ranked:  # earlier kinds win if they are within reach
        near = sorted((p for p in cands if dist_km(anchor, (p["lon"], p["lat"])) < 12),
                      key=lambda p: dist_km(anchor, (p["lon"], p["lat"])))
        for k in kinds:
            best = [p for p in near if p["kind"] == k]
            if best:
                cands = best + [p for p in near if p["kind"] != k]
                break
        top = cands[:n]
        for p in top:
            used.add(p["id"])
        return top
    cands.sort(key=lambda p: rank(anchor, p))
    top = cands[:5]
    rng.shuffle(top)
    picked = top[:n]
    for p in picked:
        used.add(p["id"])
    return picked


# ---------- routing ----------
_cache = json.loads(ROUTE_CACHE.read_text(encoding="utf-8")) if ROUTE_CACHE.exists() else {}


def simplify(coords, tol):
    if len(coords) < 3:
        return coords

    def perp(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == dy == 0:
            return math.hypot(x - x1, y - y1)
        return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)

    dmax, idx = 0, 0
    for i in range(1, len(coords) - 1):
        d = perp(coords[i], coords[0], coords[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        return simplify(coords[: idx + 1], tol)[:-1] + simplify(coords[idx:], tol)
    return [coords[0], coords[-1]]


def route(a, b, mode):
    key = f"{mode}:{a[0]:.5f},{a[1]:.5f};{b[0]:.5f},{b[1]:.5f}"
    if key in _cache:
        return _cache[key]
    prof = "routed-foot/route/v1/foot" if mode == "walk" else "routed-car/route/v1/driving"
    url = (f"https://routing.openstreetmap.de/{prof}/{a[0]:.6f},{a[1]:.6f};{b[0]:.6f},{b[1]:.6f}"
           "?overview=full&geometries=geojson")
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "suumtrip-student-project/0.1"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode())
            rt = data["routes"][0]
            coords = [[round(x, 5), round(y, 5)] for x, y in rt["geometry"]["coordinates"]]
            tol = 0.0004 if rt["distance"] > 30000 else 0.00004
            res = dict(mode=mode, sec=round(rt["duration"]), m=round(rt["distance"]),
                       geom=simplify(coords, tol))
            _cache[key] = res
            ROUTE_CACHE.write_text(json.dumps(_cache), encoding="utf-8")
            time.sleep(0.6)
            return res
        except Exception as e:  # noqa: BLE001
            print(f"    route retry {attempt}: {e}", flush=True)
            time.sleep(3 * (attempt + 1))
    # fall back to a straight line so the site still works
    d = dist_km(a, b) * 1000
    res = dict(mode=mode, sec=round(d / (1.3 if mode == "walk" else 11)), m=round(d),
               geom=[list(a), list(b)], straight=True)
    _cache[key] = res
    return res


def leg(a, b):
    mode = "walk" if dist_km(a, b) < 1.0 else "drive"
    return route(a, b, mode)


def build(dest_id, meta):
    rng = random.Random(dest_id)
    pool = load_pois(dest_id)
    center = meta["center"]
    used = set()
    is_resort = (lambda p: p["tourism"] == "resort") if meta["gold"] else None
    hotels = choose_options(pool, ["stay"], center, used, rng, prefer=is_resort)
    if not hotels:
        raise SystemExit(f"{dest_id}: no hotels found")
    anchor = (sum(h["lon"] for h in hotels) / len(hotels), sum(h["lat"] for h in hotels) / len(hotels))
    slots = []
    for s in SLOTS:
        if s["id"] == "hotel":
            opts = hotels
        else:
            opts = choose_options(pool, s["kinds"], anchor, used, rng, ranked=s.get("ranked", False))
            if not opts:  # widen to any sight-like place
                opts = choose_options(pool, ["sight", "temple", "park", "market", "view", "museum"], anchor, used, rng)
        if opts:
            slots.append(dict(s, options=[p["id"] for p in opts]))
    pois = {p["id"]: p for p in pool if p["id"] in used}

    def pt(pid):
        return (pois[pid]["lon"], pois[pid]["lat"])

    legs = {}
    arrive = route(ORIGIN, center, "drive")
    legs["ORIGIN>ARRIVE"] = arrive

    # sequence of option lists between which legs are needed
    seq = [["ARRIVE"]]
    for s in slots:
        if s["id"] == "d2a":  # day 2 starts from the hotel
            seq.append(slots_by(slots, "hotel"))
        seq.append(s["options"])
        if s["id"] == "d1e":  # back to the hotel after dinner
            seq.append(slots_by(slots, "hotel"))
    seq.append(["ARRIVE"])

    def coord(pid):
        return center if pid == "ARRIVE" else pt(pid)

    for A, B in zip(seq, seq[1:]):
        for a in A:
            for b in B:
                k = f"{a}>{b}"
                if a == b or k in legs:
                    continue
                legs[k] = leg(coord(a), coord(b))
    print(f"{dest_id}: {len(pool)} places, {len(slots)} slots, {len(legs)} legs", flush=True)
    return dict(id=dest_id, name=meta["name"], province=meta["province"], cat=meta["cat"],
                gold=meta["gold"], rack=meta["rack"], terminal=meta["terminal"],
                center=list(center), slots=slots, pois=pois, legs=legs,
                placeCount=len(pool))


def slots_by(slots, sid):
    for s in slots:
        if s["id"] == sid:
            return s["options"]
    return []


def main():
    out = []
    for dest_id, meta in DESTS.items():
        if not (RAW / f"{dest_id}.json").exists():
            print(f"{dest_id}: no raw data, skipped")
            continue
        out.append(build(dest_id, meta))
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(dict(origin=list(ORIGIN), destinations=out), ensure_ascii=False),
                   encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
    write_checklist(out)


def write_checklist(dests):
    """CSV of every place the site can show, for the team to verify on Google Maps."""
    import csv
    path = HERE.parent / "docs" / "checklist.csv"
    path.parent.mkdir(exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ปลายทาง", "ช่วงในทริป", "ชื่อสถานที่", "ประเภท", "Google Maps", "ยังเปิดอยู่? (ใช่/ไม่)", "หมายเหตุ"])
        for d in dests:
            for s in d["slots"]:
                for pid in s["options"]:
                    p = d["pois"][pid]
                    url = f"https://www.google.com/maps/search/?api=1&query={p['lat']},{p['lon']}"
                    w.writerow([d["name"], s["label"], p["name"], p["kind"], url, "", ""])
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
