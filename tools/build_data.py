"""Turn raw OpenStreetMap places into trip data for the website.

Usage: python -I tools/build_data.py
Reads tools/raw/<dest>.json, calls the public OSRM routers for walking and
driving legs (cached in tools/raw/routes.json), writes data/destinations.json.
"""
import difflib
import json
import math
import pathlib
import random
import re
import sys
import time
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE.parent / "data" / "destinations.json"
ROUTE_CACHE = RAW / "routes.json"

ORIGIN = (100.5383, 13.7649)  # Victory Monument, Bangkok (lon, lat)

DESTS = {
    # Exception agreed with the user: OSM has every Suan Phueng hotel 12-22 km from the town and
    # its restaurants, so its legs may go up to 18 km by road instead of MAX_ROAD_KM.
    "suanphueng": dict(name="สวนผึ้ง", province="ราชบุรี", cat="nat", gold=False, rack=1900,
                       max_road_km=18, max_leg_km=22,
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
    # Train destinations added 2026-10-23 (owner: trains first). The centre is the station, where
    # a train trip starts, except Pattaya (the station is 3-4 km inland; the trip adds the ride).
    # rack is the usual price for comparison, illustrative like the others.
    "kanchanaburi": dict(name="กาญจนบุรี", province="กาญจนบุรี", cat="nat", gold=False, rack=1900,
                         center=(99.525611, 14.034206), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "nakhonpathom": dict(name="องค์พระปฐมเจดีย์", province="นครปฐม", cat="old", gold=False, rack=1600,
                         center=(100.058270, 13.824290), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "ratchaburi": dict(name="เมืองราชบุรี", province="ราชบุรี", cat="old", gold=False, rack=1600,
                       center=(99.824061, 13.529865), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "phetchaburi": dict(name="เมืองเพชร เขาวัง", province="เพชรบุรี", cat="old", gold=False, rack=1700,
                        center=(99.941500, 13.115894), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "chaam": dict(name="ชะอำ", province="เพชรบุรี", cat="sea", gold=False, rack=2000,
                  center=(99.966243, 12.799827), terminal="สถานีขนส่งสายใต้ (ตลิ่งชัน)"),
    "pattaya": dict(name="พัทยา", province="ชลบุรี", cat="sea", gold=False, rack=2200,
                    center=(100.880, 12.935), terminal="สถานีขนส่งเอกมัย"),
}

# Slot plan for a 2-day, 1-night trip. kinds are matched against classify().
SLOTS = [
    # straight to the hotel on arrival to leave the bags (owner's request), whatever the time
    dict(id="hotel", day=1, time="arrive", label="ฝากกระเป๋า/เช็กอินที่พัก", kinds=["stay"]),
    dict(id="d1a", day=1, time="10:30", label="ช่วงเช้า", kinds=["cafe"]),
    dict(id="d1b", day=1, time="12:00", label="มื้อกลางวัน", kinds=["food"]),
    dict(id="d1c", day=1, time="13:30", label="ช่วงบ่าย", kinds=["sight", "market", "temple", "waterfall", "park"]),
    dict(id="d1d", day=1, time="sunset", label="ชมพระอาทิตย์ตก", kinds=["beach", "view", "park", "temple", "sight"], ranked=True),
    dict(id="d1e", day=1, time="19:00", label="มื้อเย็น", kinds=["food"]),
    dict(id="d2a", day=2, time="sunrise", label="เช้าตรู่", kinds=["view", "beach", "temple", "market", "park"], ranked=True),
    dict(id="d2b", day=2, time="08:30", label="อาหารเช้า", kinds=["cafe", "food", "market"]),
    dict(id="d2c", day=2, time="10:00", label="ช่วงสาย",
         kinds=["sight", "museum", "market", "temple", "waterfall", "park", "beach", "view"]),
    dict(id="d2d", day=2, time="12:00", label="มื้อกลางวัน", kinds=["food"]),
]

# Straight-line km from the hotel midpoint (anchor). Meals and cafés stay close; a slot
# that cannot fill both options inside its limit is widened by WIDEN_STEP_KM at a time.
MAX_KM_MEAL = 5
MAX_KM_SIGHT = 8
WIDEN_STEP_KM = 3
WIDEN_MAX_STEPS = 4
MAX_LEG_KM = 7  # straight-line km to the previous / next stop (roads add about a third)
MAX_LEG_WIDEN_KM = 9  # straight-line legs are never widened past this
MAX_ROAD_KM = 10  # hard limit on every real road leg between stops; a slot that cannot keep it is left out
HOTEL_FROM_CENTER_KM = 15  # hotels go where places are densest, but stay this close to town
HOTEL_PAIR_KM = 4  # the two hotel options must be this close, so the anchor is near both
MEAL_KINDS = {"cafe", "food"}

# Breakfast (d2b): skip places whose cuisine or name does not fit a morning meal.
NOT_BREAKFAST = ("pizza", "พิซซ่า", "bar", "บาร์", "barbecue", "bbq", "บาร์บีคิว", "ปิ้งย่าง",
                 "หมูกะทะ", "mookata", "หมูจุ่ม", "ชาบู", "shabu", "สุกี้", "steak", "สเต็ก", "สเต๊ก",
                 "buffet", "บุฟเฟ่ต์", "บุฟเฟต์", "seafood", "ซีฟู้ด", "อาหารทะเล", "ice_cream",
                 "ไอศกรีม", "ไอติม", "beer", "เบียร์", "pub", "ผับ", "ร้านเหล้า",
                 "italian", "pasta", "อิตาเลียน", "wine", "ไวน์")
BREAKFAST_LIKE = ("coffee", "cafe", "bakery", "cake", "breakfast", "noodle", "congee", "rice",
                  "sandwich", "pancake", "กาแฟ", "คาเฟ่", "เบเกอรี่", "โจ๊ก", "ข้าวต้ม", "ก๋วยเตี๋ยว",
                  "ก๊วยเตี๋ยว", "เตี๋ยว", "บะหมี่", "ปาท่องโก๋", "ติ่มซำ", "ขนมปัง", "ข้าวมันไก่", "ข้าวแกง")


# Places that do not fit a daytime, sunrise or sunset visit, cafés posing as sights, and
# names too generic to find on Google Maps.
NIGHT_PLACE = re.compile(r"ไนท์|night|โต้รุ่ง|ถนนคนเดิน|walking street", re.I)
CAFE_NAME = re.compile(r"คาเฟ่|cafe|café|coffee|กาแฟ", re.I)
GENERIC_SIGHT = re.compile(r"^(wat|temple|park|viewpoint|recreation ground|จุดชมวิว\s*\d*|วัด|สวน)$", re.I)
SUN_TIMES = {"sunrise": "06:00", "sunset": "17:30"}  # close enough for an opening-hours check


def to_min(hhmm):
    h, m = hhmm.strip().split(":")
    return int(h) * 60 + int(m)


def parse_hours(text):
    """Opening ranges in minutes from an OSM opening_hours value, or None if unknown.

    Handles the common forms seen in tools/raw, e.g. "Mo-Su 07:00-17:00",
    "10:00-14:00,16:00-21:00", "Mo-Fr 11:00-21:00; Sa,Su 10:00-21:00", "24/7".
    Weekdays are ignored (the trip date is not known here), so a place counts as
    open at a time if any of its ranges covers it.
    """
    if not text:
        return None
    if text.strip() == "24/7":
        return [(0, 24 * 60)]
    ranges = []
    for rule in text.split(";"):
        for part in re.findall(r"(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})", rule):
            start, end = to_min(part[0]), to_min(part[1])
            if end <= start:  # closes after midnight
                end += 24 * 60
            ranges.append((start, end))
    return ranges or None


def open_at(p, hhmm, stay_min=45):
    """True / False when the hours are known, None when unknown."""
    ranges = parse_hours(p["hours"])
    if ranges is None:
        return None
    t = to_min(hhmm)
    return any(s <= t and t + stay_min <= e for s, e in ranges)


def fits_breakfast(p):
    text = f"{p['name']} {p['nameEn'] or ''} {p['cuisine'] or ''}".lower()
    return not any(w in text for w in NOT_BREAKFAST)


def fits_slot(p, s):
    """Whether place p suits slot s at its time of day (unknown opening hours count as open)."""
    sun = s["time"] in SUN_TIMES
    if open_at(p, SUN_TIMES.get(s["time"], s["time"]), stay_min=30 if sun else 45) is False:
        return False
    if NIGHT_PLACE.search(p["name"]):  # no slot is an evening market visit
        return False
    if not any(k in MEAL_KINDS for k in s["kinds"]) and CAFE_NAME.search(p["name"]):
        return False
    return s["id"] != "d2b" or fits_breakfast(p)


def breakfast_like(p):
    text = f"{p['name']} {p['nameEn'] or ''} {p['cuisine'] or ''}".lower()
    return p["kind"] in ("cafe", "market") or any(w in text for w in BREAKFAST_LIKE)


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
        if kind not in ("food", "cafe", "stay") and GENERIC_SIGHT.match(name.strip()):
            continue
        # the same place mapped twice with a slightly different spelling
        if any(q["kind"] == kind and difflib.SequenceMatcher(None, q["name"], name).ratio() >= 0.9
               for q in pois):
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
            hours=tags.get("opening_hours"), cuisine=tags.get("cuisine"),
        ))
    return pois


# keys written to data/destinations.json for each place (cuisine is used only here)
POI_KEYS = ("id", "name", "nameEn", "kind", "lon", "lat", "stars", "tourism", "hours")


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


def rank(anchor, p, toward=None):
    # nearest first; a Thai name is worth about 1.5 km. With toward (where the traveller
    # comes from), distance to it counts too, so a day's stops form one group instead of
    # a star around the hotel.
    pt = (p["lon"], p["lat"])
    return dist_km(anchor, pt) + (dist_km(toward, pt) if toward else 0) + 1.5 * thai_first(p)


def candidates(pool, kinds, anchor, used, max_km=None, accept=None):
    return [p for p in pool if p["kind"] in kinds and p["id"] not in used
            and (accept is None or accept(p))
            and (max_km is None or dist_km(anchor, (p["lon"], p["lat"])) <= max_km)]


def choose_options(pool, kinds, anchor, used, rng, n=2, prefer=None, ranked=False,
                   max_km=None, accept=None, toward=None):
    cands = candidates(pool, kinds, anchor, used, max_km, accept)
    if prefer:
        pref = [p for p in cands if prefer(p)]
        if len(pref) >= n:
            cands = pref
    if ranked:  # earlier kinds are worth 2 km each, so a near beach beats a far viewpoint
        reach = max_km or 12
        cands = sorted((p for p in cands if dist_km(anchor, (p["lon"], p["lat"])) <= reach),
                       key=lambda p: rank(anchor, p, toward) - 1.5 * thai_first(p) + 2 * kinds.index(p["kind"]))
        top = cands[:n]
        for p in top:
            used.add(p["id"])
        return top
    cands.sort(key=lambda p: rank(anchor, p, toward))
    top = cands[:4]
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
    road_km = meta.get("max_road_km", MAX_ROAD_KM)
    leg_cap = meta.get("max_leg_km", MAX_LEG_WIDEN_KM)

    def near_km(kinds, near, limit, accept=None, n=2):
        """Smallest limit (widened step by step) that has n candidates, and the steps taken."""
        for step in range(WIDEN_MAX_STEPS + 1):
            km = limit + step * WIDEN_STEP_KM
            if len(candidates(pool, kinds, near, used, km, accept)) >= n:
                return km, step
        return km, WIDEN_MAX_STEPS

    def richness(h):
        """How many meals and sights lie within the slot limits of hotel h (capped)."""
        pt = (h["lon"], h["lat"])
        meals = sum(p["kind"] in MEAL_KINDS and dist_km(pt, (p["lon"], p["lat"])) <= MAX_KM_MEAL for p in pool)
        sights = sum(p["kind"] not in MEAL_KINDS and p["kind"] != "stay" and
                     dist_km(pt, (p["lon"], p["lat"])) <= MAX_KM_SIGHT for p in pool)
        return min(meals, 12) + min(sights, 10)

    # hotels go where the places are, so every day can stay in one group around them
    stays = [p for p in pool if p["kind"] == "stay"
             and dist_km(center, (p["lon"], p["lat"])) <= HOTEL_FROM_CENTER_KM]
    best = max((richness(h) for h in stays), default=0)
    rich = {h["id"] for h in stays if richness(h) >= best - 2}
    hotels = choose_options(pool, ["stay"], center, used, rng, n=1, prefer=is_resort,
                            accept=lambda p: p["id"] in rich)
    if not hotels:
        raise SystemExit(f"{dest_id}: no hotels found")
    first = (hotels[0]["lon"], hotels[0]["lat"])
    km, _ = near_km(["stay"], first, HOTEL_PAIR_KM, n=1)
    hotels += choose_options(pool, ["stay"], first, used, rng, n=1, prefer=is_resort, max_km=km)
    anchor = (sum(h["lon"] for h in hotels) / len(hotels), sum(h["lat"] for h in hotels) / len(hotels))
    notes = []
    if km > HOTEL_PAIR_KM:
        notes.append(f"hotel pair widened to {km} km")
    slots = []
    by_id = {p["id"]: p for p in pool}
    day1_meals = []
    prev = [center]  # day 1 starts in the town centre (ARRIVE)
    hotel_pts = [(h["lon"], h["lat"]) for h in hotels]
    for i, s in enumerate(SLOTS):
        if s["id"] == "hotel":
            opts = hotels
        else:
            meal = any(k in MEAL_KINDS for k in s["kinds"])

            def fits(p, s=s):
                return fits_slot(p, s)
            toward = (sum(q[0] for q in prev) / len(prev), sum(q[1] for q in prev) / len(prev))
            prefer = breakfast_like if s["id"] == "d2b" else None
            # every option must be within reach of each place the traveller comes from or goes to next
            neighbours = list(prev)
            if s["id"] in ("d1a", "d1e", "d2a"):  # the day starts, ends and restarts at the hotel
                neighbours += hotel_pts
            if i == len(SLOTS) - 1:  # then back to the town centre
                neighbours.append(center)
            limit = MAX_KM_MEAL if meal else MAX_KM_SIGHT
            # widen the area first, then settle for one option, and only then allow longer legs
            tries = [(leg_km, limit + ks * WIDEN_STEP_KM, n)
                     for leg_km in (MAX_LEG_KM, MAX_LEG_WIDEN_KM, *range(MAX_LEG_WIDEN_KM + 3, leg_cap + 1, 3))
                     for n in (2, 1)
                     for ks in range(WIDEN_MAX_STEPS + 1)]
            for step, (leg_km, km, n) in enumerate(tries):

                def accept(p, fits=fits, leg_km=leg_km, neighbours=neighbours):
                    return ((fits is None or fits(p)) and
                            all(dist_km(q, (p["lon"], p["lat"])) <= leg_km for q in neighbours))
                if len(candidates(pool, s["kinds"], anchor, used, km, accept)) >= n:
                    break
            opts = choose_options(pool, s["kinds"], anchor, used, rng, n=n, ranked=s.get("ranked", False),
                                  max_km=km, accept=accept, prefer=prefer, toward=toward)
            if not opts and meal:  # a meal anywhere in the destination beats a sight at mealtime
                opts = choose_options(pool, sorted(MEAL_KINDS), anchor, used, rng, n=1, accept=accept,
                                      toward=toward)
                if opts:
                    notes.append(f"{s['id']} filled from the whole destination")
            if not opts and meal:  # last resort: a restaurant from the other day
                again = [by_id[pid] for pid in day1_meals if accept(by_id[pid])]
                again.sort(key=lambda p: rank(anchor, p, toward))
                opts = again[:1]
                if opts:
                    notes.append(f"{s['id']} reuses {opts[0]['name']} from day 1")
            if not opts:  # widen to any sight-like place
                opts = choose_options(pool, ["sight", "temple", "park", "market", "view", "museum"],
                                      anchor, used, rng, accept=accept, toward=toward)
                notes.append(f"{s['id']} filled with sights" if opts else f"{s['id']} left out (nothing near)")
            if step:
                notes.append(f"{s['id']} widened to {km} km, legs {leg_km} km, {n} option(s)")
        prev = [(p["lon"], p["lat"]) for p in opts] or prev
        if s["id"] == "d1e":
            prev = hotel_pts
        if opts:
            slots.append(dict(s, options=[p["id"] for p in opts]))
            if s["day"] == 1 and s["id"] != "hotel":
                day1_meals.extend(p["id"] for p in opts if p["kind"] in MEAL_KINDS)

    def coord(pid):
        return center if pid == "ARRIVE" else (by_id[pid]["lon"], by_id[pid]["lat"])

    hotel_opts = slots_by(slots, "hotel")

    def sequence():
        """Option lists between which legs are needed, in the order js/itinerary.js walks them:
        the hotel first, the night at the hotel, day 2 from there, and back to the hotel for the
        bags before the station (the lists are the slots' own)."""
        seq, day = [["ARRIVE"]], 1
        for s in slots:
            if s["day"] == 2 and day == 1:
                if seq[-1] is not hotel_opts:
                    seq.append(hotel_opts)
                day = 2
            seq.append(s["options"])
        if seq[-1] is not hotel_opts:  # pick up the bags at the hotel before going home
            seq.append(hotel_opts)
        seq.append(["ARRIVE"])
        return seq

    # The limits above are straight-line; enforce MAX_ROAD_KM on the real road legs. Drop the
    # worst option first while its slot keeps another one (a hotel option too), otherwise leave
    # the whole slot out (never the hotel).
    while True:
        owner = {pid: s for s in slots for pid in s["options"]}
        bad = {}
        for A, B in zip(sequence(), sequence()[1:]):
            for a in A:
                for b in B:
                    if a != b and leg(coord(a), coord(b))["m"] > road_km * 1000:
                        for pid in (a, b):
                            if pid in owner and (owner[pid]["id"] != "hotel" or len(owner[pid]["options"]) > 1):
                                bad[pid] = bad.get(pid, 0) + 1
        if not bad:
            break
        pid = max(bad, key=lambda q: (len(owner[q]["options"]) > 1, bad[q]))
        s = owner[pid]
        if len(s["options"]) > 1:
            s["options"].remove(pid)
            notes.append(f"dropped {by_id[pid]['name']} from {s['id']} (road leg over {road_km} km)")
        else:
            slots.remove(s)
            notes.append(f"left out {s['id']} ({by_id[pid]['name']} is over {road_km} km by road)")
    seq = sequence()

    for s in slots:
        if s["id"] != "hotel" and any(k in MEAL_KINDS for k in s["kinds"]) and ":" in s["time"]:
            STATS["meal_options"] += len(s["options"])
            STATS["unknown_hours"] += sum(open_at(by_id[pid], s["time"]) is None for pid in s["options"])
    pois = {pid: {k: by_id[pid][k] for k in POI_KEYS} for s in slots for pid in s["options"]}
    if notes:
        print(f"  {dest_id}: " + "; ".join(notes), flush=True)

    legs = {"ORIGIN>ARRIVE": route(ORIGIN, center, "drive")}
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


STATS = dict(meal_options=0, unknown_hours=0)


def slots_by(slots, sid):
    for s in slots:
        if s["id"] == sid:
            return s["options"]
    return []


def main():
    sys.stdout.reconfigure(encoding="utf-8")
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
    print(f"meal/cafe options: {STATS['meal_options']}, opening hours unknown: {STATS['unknown_hours']}")
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
