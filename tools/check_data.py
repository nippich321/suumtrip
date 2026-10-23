"""Check data/destinations.json: leg lengths, how tightly each day is grouped,
places that do not fit their time of day, and breakfast picks.

Usage: python -I tools/check_data.py
Prints, per destination, the longest leg between consecutive stops (the Bangkok
leg ORIGIN>ARRIVE is skipped), every leg over LIMIT_KM, the spread of each day
(largest straight-line km between any two places that day, hotels included),
every time-of-day problem found, and the breakfast (d2b) options with their
opening hours and OSM cuisine tag.
"""
import difflib
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_data import (CAFE_NAME, GENERIC_SIGHT as GENERIC, MEAL_KINDS,  # noqa: E402
                        NIGHT_PLACE as NIGHT, SUN_TIMES, dist_km, parse_hours, to_min)

DATA = HERE.parent / "data" / "destinations.json"
LIMIT_KM = 15


def time_problems(d):
    """List of human-readable problems with places that do not fit their slot."""
    pois, out = d["pois"], []
    for s in d["slots"]:
        hhmm = SUN_TIMES.get(s["time"], s["time"])
        evening = to_min(hhmm) >= 17 * 60
        meal = s["id"] != "hotel" and any(k in MEAL_KINDS for k in s["kinds"])
        for pid in s["options"]:
            p = pois[pid]
            ranges = parse_hours(p["hours"])
            t = to_min(hhmm)
            if ranges and not any(a <= t < b for a, b in ranges):
                out.append(f"{s['id']} {hhmm}: {p['name']} closed ({p['hours']})")
            if NIGHT.search(p["name"]) and not evening:
                out.append(f"{s['id']} {hhmm}: {p['name']} is a night market")
            if meal and p["kind"] not in MEAL_KINDS and not (s["id"] == "d2b" and p["kind"] == "market"):
                out.append(f"{s['id']} {hhmm}: meal slot got a {p['kind']} ({p['name']})")
            if not meal and s["id"] != "hotel" and CAFE_NAME.search(p["name"]):
                out.append(f"{s['id']} {hhmm}: sight slot got a cafe ({p['name']})")
            if GENERIC.match(p["name"].strip()):
                out.append(f"{s['id']} {hhmm}: generic name ({p['name']})")
    names = [pois[pid]["name"] for s in d["slots"] for pid in s["options"]]
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if difflib.SequenceMatcher(None, a, b).ratio() >= 0.9:
                out.append(f"near-duplicate places: {a} / {b}")
    return out


def day_spread(d):
    pois, spread = d["pois"], {}
    hotel = next(s["options"] for s in d["slots"] if s["id"] == "hotel")
    for day in (1, 2):
        ids = set(hotel)
        ids.update(pid for s in d["slots"] if s["day"] == day for pid in s["options"])
        pts = [(pois[i]["lon"], pois[i]["lat"]) for i in ids]
        spread[day] = max((dist_km(a, b) for a in pts for b in pts), default=0)
    return spread


def raw_tags(dest_id):
    data = json.loads((HERE / "raw" / f"{dest_id}.json").read_text(encoding="utf-8"))
    return {f"{el['type'][0]}{el['id']}": el.get("tags", {}) for el in data["elements"]}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = json.loads(DATA.read_text(encoding="utf-8"))
    over = problems = 0
    spreads = []
    for d in data["destinations"]:
        pois, tags = d["pois"], raw_tags(d["id"])

        def name(pid):
            return "town centre" if pid == "ARRIVE" else pois[pid]["name"]

        legs = [(v["m"] / 1000, k) for k, v in d["legs"].items() if k != "ORIGIN>ARRIVE"]
        legs.sort(reverse=True)
        km, key = legs[0]
        a, b = key.split(">")
        print(f"\n{d['id']} ({d['name']}): longest leg {km:.1f} km  {name(a)} -> {name(b)}")
        for km, key in legs:
            if km <= LIMIT_KM:
                break
            over += 1
            a, b = key.split(">")
            print(f"  over {LIMIT_KM} km: {km:.1f} km  {name(a)} -> {name(b)}")
        sp = day_spread(d)
        spreads += sp.values()
        print(f"  day spread: day 1 {sp[1]:.1f} km, day 2 {sp[2]:.1f} km")
        for msg in time_problems(d):
            problems += 1
            print(f"  time: {msg}")
        for s in d["slots"]:
            if s["id"] != "d2b":
                continue
            for pid in s["options"]:
                p, t = pois[pid], tags.get(pid, {})
                kind = t.get("amenity") or t.get("shop") or p["kind"]
                print(f"  breakfast: {p['name']} [{kind}, cuisine={t.get('cuisine') or '-'}] "
                      f"hours={p['hours'] or 'unknown'}")
    print(f"\nlegs over {LIMIT_KM} km: {over}")
    print(f"day spread: mean {sum(spreads) / len(spreads):.1f} km, max {max(spreads):.1f} km")
    print(f"time-of-day problems: {problems}")


if __name__ == "__main__":
    main()
