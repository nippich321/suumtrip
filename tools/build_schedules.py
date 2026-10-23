"""Build the public-transport timetable for the site, with a person's check in between.

Usage: python -I tools/build_schedules.py
Reads  tools/raw/schedules_srt.json (trains, from tools/fetch_schedules.py) and
       tools/schedules_manual.csv (vans and buses, typed in with their source).
Writes docs/schedules.csv   - the check sheet. A person opens each source, checks the time and
                              writes ใช่ in "ยืนยันแล้ว" plus their name and the date. Ticks are
                              kept when this script runs again (rows are matched by "รหัส").
       data/schedules.json  - what the site reads: trains from the railway's own lookup (owner's
                              decision 2026-10-23: the official timetable is used as fetched,
                              labelled with its date) and van/bus rows ticked ใช่, plus, per destination,
                              how many rows still wait for a check, and, where the train station
                              is far from the destination, the road legs of that transfer.
"""
import csv
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_data import DESTS, ORIGIN, dist_km, leg, route  # noqa: E402
ROOT = HERE.parent
SRT = HERE / "raw" / "schedules_srt.json"
MANUAL = HERE / "schedules_manual.csv"
SHEET = ROOT / "docs" / "schedules.csv"
OUT = ROOT / "data" / "schedules.json"

# Only departures a 2-day trip can use go on the sheet, so the team checks fewer rows.
OUT_WINDOW = ("05:00", "10:30")    # leave Bangkok in the morning of day 1
BACK_WINDOW = ("12:30", "20:00")   # leave the destination in the afternoon of day 2

STATION_NAME = {"1000": "สถานีกลางกรุงเทพอภิวัฒน์", "1001": "สถานีกรุงเทพ (หัวลำโพง)", "1031": "สถานีอยุธยา",
                "2093": "สถานีปากช่อง", "3023": "สถานีชุมทางฉะเชิงเทรา", "4101": "สถานีเพชรบุรี",
                "4118": "สถานีหัวหิน", "4002": "สถานีธนบุรี", "4057": "สถานีกาญจนบุรี", "4016": "สถานีนครปฐม",
                "4089": "สถานีราชบุรี", "4111": "สถานีชะอำ", "3041": "สถานีพัทยา"}
TRANSFER_KM = 3  # a station farther than this (straight line) from the destination needs a ride
DIR_TH = {"out": "ไป", "back": "กลับ"}
DAYS_TH = {"all": "ทุกวัน", "weekday": "จ-ศ", "weekend": "ส-อา"}
MODE_TH = {"train": "รถไฟ", "van": "รถตู้/มินิบัส", "bus": "รถบัส"}
HEAD = ["รหัส", "ปลายทาง", "ขา", "ประเภท", "ผู้ให้บริการ / ขบวน", "ขึ้นที่", "ลงที่", "ออก", "ถึง",
        "รอบสุดท้าย", "ทุกกี่นาที", "วันที่วิ่ง", "หมายเหตุ", "แหล่งที่มา", "ยืนยันแล้ว (ใช่/ไม่)",
        "ผู้ยืนยัน", "วันที่ยืนยัน"]


def days_of(note):
    if re.search(r"จันทร์\s*-\s*ศุกร์|วันทำงาน", note):
        return "weekday"
    if re.search(r"เสาร์\s*-\s*อาทิตย์|วันหยุด", note):
        return "weekend"
    return "all"


def within(t, window):
    return window[0] <= t <= window[1]


def rows():
    srt = json.loads(SRT.read_text(encoding="utf-8"))
    for dest, routes in srt["routes"].items():
        for route_, d in ((r, d) for r in routes for d in ("out", "back")):
            leg = route_[d]
            for t in leg["trains"]:
                if not within(t["depart"], OUT_WINDOW if d == "out" else BACK_WINDOW):
                    continue
                yield dict(dest=dest, dir=d, mode="train", operator=f"ขบวน {t['train']} {t['kind']}",
                           board=STATION_NAME.get(leg["start"], leg["start"]),
                           alight=STATION_NAME.get(leg["dest"], leg["dest"]),
                           depart=t["depart"], arrive=t["arrive"], last="", every_min="",
                           days=days_of(t["note"]), note=t["note"],
                           source=f"{srt['source']} (ดึงเมื่อ {srt['fetched']})")
    with MANUAL.open(encoding="utf-8") as f:
        yield from csv.DictReader(f)


def transfers():
    """Road legs between each far-away station and its destination (OSRM, cached in routes.json)."""
    srt = json.loads(SRT.read_text(encoding="utf-8"))
    out = {}
    for dest, routes in srt["routes"].items():
        code = routes[0]["out"]["dest"]
        st = srt["stations"][code]
        here, town = (st["lon"], st["lat"]), DESTS[dest]["center"]
        km = dist_km(here, town)
        if km <= TRANSFER_KM:
            continue
        out[dest] = dict(station=STATION_NAME[code], lon=here[0], lat=here[1],
                         toTown=leg(here, town), fromTown=leg(town, here), fromBangkok=route(ORIGIN, here, "drive"))
        print(f"  transfer {dest}: {STATION_NAME[code]} {km:.1f} km from the destination, "
              f"{out[dest]['toTown']['m'] / 1000:.1f} km by road")
    return out


def key(r):
    return f"{r['dest']}|{r['dir']}|{r['operator']}|{r['depart']}"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    old = {}
    if SHEET.exists():
        with SHEET.open(encoding="utf-8-sig") as f:
            old = {r["รหัส"]: r for r in csv.DictReader(f)}
    sheet, confirmed, pending = [], {}, {}
    for r in rows():
        k = key(r)
        was = old.get(k, {})
        # a person's tick; a tick written by an AI agent ("Agent A/B") does not count
        ticked = (was.get("ยืนยันแล้ว (ใช่/ไม่)", "").strip() == "ใช่"
                  and not was.get("ผู้ยืนยัน", "").strip().lower().startswith("agent"))
        ok = ticked or r["mode"] == "train"  # the railway's own timetable counts as checked
        sheet.append([k, r["dest"], DIR_TH[r["dir"]], MODE_TH[r["mode"]], r["operator"], r["board"], r["alight"],
                      r["depart"], r["arrive"], r["last"], r["every_min"], DAYS_TH[r["days"]], r["note"], r["source"],
                      was.get("ยืนยันแล้ว (ใช่/ไม่)", ""), was.get("ผู้ยืนยัน", ""), was.get("วันที่ยืนยัน", "")])
        if ok and r["depart"]:
            item = {x: r[x] for x in ("mode", "operator", "board", "alight", "depart", "arrive", "last", "days", "source")}
            item["every"] = int(r["every_min"]) if r["every_min"] else None
            item["checked"] = "railway" if r["mode"] == "train" else "person"
            confirmed.setdefault(r["dest"], {"out": [], "back": []})[r["dir"]].append(item)
        else:
            pending[r["dest"]] = pending.get(r["dest"], 0) + 1
    SHEET.parent.mkdir(exist_ok=True)
    with SHEET.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEAD)
        w.writerows(sheet)
    for v in confirmed.values():
        for d in v.values():
            d.sort(key=lambda x: x["depart"])
    OUT.write_text(json.dumps(dict(confirmed=confirmed, pending=pending, transfers=transfers()),
                              ensure_ascii=False), encoding="utf-8")
    n = sum(len(d) for v in confirmed.values() for d in v.values())
    print(f"wrote {SHEET} ({len(sheet)} rows) and {OUT} ({n} confirmed, {sum(pending.values())} waiting)")


if __name__ == "__main__":
    main()
