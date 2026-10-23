"""Build the public-transport timetable for the site, with a person's check in between.

Usage: python -I tools/build_schedules.py
Reads  tools/raw/schedules_srt.json (trains, from tools/fetch_schedules.py) and
       tools/schedules_manual.csv (vans and buses, typed in with their source).
Writes docs/schedules.csv   - the check sheet. A person opens each source, checks the time and
                              writes ใช่ in "ยืนยันแล้ว" plus their name and the date. Ticks are
                              kept when this script runs again (rows are matched by "รหัส").
       data/schedules.json  - what the site reads: only rows ticked ใช่, plus, per destination,
                              how many rows still wait for a check.
"""
import csv
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
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
                "4118": "สถานีหัวหิน"}
DIR_TH = {"out": "ไป", "back": "กลับ"}
DAYS_TH = {"all": "ทุกวัน", "weekday": "จ-ศ", "weekend": "ส-อา"}
MODE_TH = {"train": "รถไฟ", "van": "รถตู้/มินิบัส", "bus": "รถบัส"}
HEAD = ["รหัส", "ปลายทาง", "ขา", "ประเภท", "ผู้ให้บริการ / ขบวน", "ขึ้นที่", "ลงที่", "ออก", "ถึง",
        "รอบสุดท้าย", "ทุกกี่นาที", "วันที่วิ่ง", "หมายเหตุ", "แหล่งที่มา", "ยืนยันแล้ว (ใช่/ไม่)",
        "ผู้ยืนยัน", "วันที่ยืนยัน"]


def days_of(note):
    if re.search(r"จันทร์\s*-\s*ศุกร์", note):
        return "weekday"
    if re.search(r"เสาร์\s*-\s*อาทิตย์|วันหยุด", note):
        return "weekend"
    return "all"


def within(t, window):
    return window[0] <= t <= window[1]


def rows():
    srt = json.loads(SRT.read_text(encoding="utf-8"))
    for dest, route in srt["routes"].items():
        for d in ("out", "back"):
            leg = route[d]
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


def key(r):
    return f"{r['dest']}|{r['dir']}|{r['operator']}|{r['depart']}"


def main():
    old = {}
    if SHEET.exists():
        with SHEET.open(encoding="utf-8-sig") as f:
            old = {r["รหัส"]: r for r in csv.DictReader(f)}
    sheet, confirmed, pending = [], {}, {}
    for r in rows():
        k = key(r)
        was = old.get(k, {})
        ok = was.get("ยืนยันแล้ว (ใช่/ไม่)", "").strip() == "ใช่"
        sheet.append([k, r["dest"], DIR_TH[r["dir"]], MODE_TH[r["mode"]], r["operator"], r["board"], r["alight"],
                      r["depart"], r["arrive"], r["last"], r["every_min"], DAYS_TH[r["days"]], r["note"], r["source"],
                      was.get("ยืนยันแล้ว (ใช่/ไม่)", ""), was.get("ผู้ยืนยัน", ""), was.get("วันที่ยืนยัน", "")])
        if ok and r["depart"]:
            item = {x: r[x] for x in ("mode", "operator", "board", "alight", "depart", "arrive", "last", "days", "source")}
            item["every"] = int(r["every_min"]) if r["every_min"] else None
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
    OUT.write_text(json.dumps(dict(confirmed=confirmed, pending=pending), ensure_ascii=False, indent=1),
                   encoding="utf-8")
    n = sum(len(d) for v in confirmed.values() for d in v.values())
    print(f"wrote {SHEET} ({len(sheet)} rows) and {OUT} ({n} confirmed, {sum(pending.values())} waiting)")


if __name__ == "__main__":
    main()
