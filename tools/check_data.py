"""Check data/destinations.json: leg lengths inside each destination and breakfast picks.

Usage: python -I tools/check_data.py
Prints, per destination, the longest leg between consecutive stops (the Bangkok
leg ORIGIN>ARRIVE is skipped), every leg over LIMIT_KM, and the breakfast (d2b)
options with their opening hours and OSM cuisine tag.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "data" / "destinations.json"
LIMIT_KM = 15


def raw_tags(dest_id):
    data = json.loads((HERE / "raw" / f"{dest_id}.json").read_text(encoding="utf-8"))
    return {f"{el['type'][0]}{el['id']}": el.get("tags", {}) for el in data["elements"]}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = json.loads(DATA.read_text(encoding="utf-8"))
    over = 0
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
        for s in d["slots"]:
            if s["id"] != "d2b":
                continue
            for pid in s["options"]:
                p, t = pois[pid], tags.get(pid, {})
                kind = t.get("amenity") or t.get("shop") or p["kind"]
                print(f"  breakfast: {p['name']} [{kind}, cuisine={t.get('cuisine') or '-'}] "
                      f"hours={p['hours'] or 'unknown'}")
    print(f"\nlegs over {LIMIT_KM} km: {over}")


if __name__ == "__main__":
    main()
