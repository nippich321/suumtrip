"""Fetch train departures between Bangkok and each destination from the State Railway
of Thailand's own timetable lookup (https://www.railway.co.th/SRTTimetable/StationList).

Usage: python -I tools/fetch_schedules.py
Writes tools/raw/schedules_srt.json: for every route below, both directions, each train's
number, type, departure, arrival, duration and the railway's own note (service days,
fares, start date). These are not confirmed yet: tools/build_schedules.py turns them into
docs/schedules.csv for the team to check, and only ticked rows reach the site.
"""
import datetime
import html
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "raw" / "schedules_srt.json"
URL = "https://www.railway.co.th/SRTTimetable/StationList"

# destination id -> (Bangkok station code, destination station code); codes from the lookup page
ROUTES = {
    "ayutthaya": ("1000", "1031"),    # กรุงเทพอภิวัฒน์ - อยุธยา
    "banmai": ("1001", "3023"),       # กรุงเทพ (หัวลำโพง) - ชุมทางฉะเชิงเทรา
    "khaoyai": ("1000", "2093"),      # กรุงเทพอภิวัฒน์ - ปากช่อง
    "chaosamran": ("1000", "4101"),   # กรุงเทพอภิวัฒน์ - เพชรบุรี
    "huahin": ("1000", "4118"),       # กรุงเทพอภิวัฒน์ - หัวหิน
}


def text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def lookup(start, dest):
    body = urllib.parse.urlencode({"StartStation": start, "DestStation": dest}).encode()
    req = urllib.request.Request(URL, data=body, headers={"User-Agent": "suumtrip-student-project/0.1"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "ignore")
        except Exception as e:  # noqa: BLE001
            print(f"  retry {attempt}: {e}", flush=True)
            time.sleep(5 * (attempt + 1))
    raise SystemExit(f"lookup {start}->{dest} failed")


def parse(page):
    trains = []
    cards = re.split(r'<div id="Train', page)[1:]
    for card in cards:
        no = re.match(r"(\w+)", card).group(1)
        kind = text(re.search(r'train-info-text">(.*?)</span>', card, re.S).group(1))
        route = text(re.search(r'card-head-name[^>]*>(.*?)</b>', card, re.S).group(1))
        times = re.findall(r'card-detail-stationtime[^>]*>\s*(\d{1,2}:\d{2})\s*<', card)
        length = re.search(r'\|\s*(\d{1,2}:\d{2})\s*ชม', card)
        note = re.search(r'card-detail-warning">(.*?)</span>', card, re.S)
        if len(times) < 2:
            continue
        trains.append(dict(train=no, kind=kind, route=route,
                           depart=times[0].zfill(5), arrive=times[1].zfill(5),
                           duration=length.group(1) if length else None,
                           note=text(note.group(1)) if note else ""))
    trains.sort(key=lambda t: t["depart"])
    return trains


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    out = dict(source=URL, fetched=datetime.date.today().isoformat(), routes={})
    for dest, (bkk, here) in ROUTES.items():
        route = {}
        for direction, (a, b) in (("out", (bkk, here)), ("back", (here, bkk))):
            trains = parse(lookup(a, b))
            route[direction] = dict(start=a, dest=b, trains=trains)
            print(f"{dest} {direction}: {len(trains)} trains", flush=True)
            time.sleep(2)
        out["routes"][dest] = route
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
