"""Fetch train departures between Bangkok and each destination from the State Railway
of Thailand's own timetable lookup (https://www.railway.co.th/SRTTimetable/StationList).

Usage: python -I tools/fetch_schedules.py
Writes tools/raw/schedules_srt.json: for every destination station and every Bangkok station
that has trains to it, both directions, each train's
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

# Bangkok stations with intercity trains: กรุงเทพอภิวัฒน์, กรุงเทพ (หัวลำโพง), ธนบุรี
BANGKOK = ("1000", "1001", "4002")
# destination id -> its station code (codes from the lookup page)
ROUTES = {
    "ayutthaya": "1031",    # อยุธยา
    "banmai": "3023",       # ชุมทางฉะเชิงเทรา
    "khaoyai": "2093",      # ปากช่อง
    "chaosamran": "4101",   # เพชรบุรี
    "huahin": "4118",       # หัวหิน
}
# Where the stations are (OpenStreetMap, looked up with Nominatim on 2026-10-23), so a trip
# can add the ride from the station to the destination when they are far apart.
STATIONS = {
    "1000": (100.541865, 13.803976), "1001": (100.517003, 13.740669), "4002": (100.479044, 13.760588),
    "1031": (100.582953, 14.356707), "3023": (101.058881, 13.695576), "2093": (101.410591, 14.705048),
    "4101": (99.941500, 13.115895), "4118": (99.955171, 12.564624),
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
    out["stations"] = {code: dict(lon=lon, lat=lat) for code, (lon, lat) in STATIONS.items()}
    for dest, here in ROUTES.items():
        routes = []
        for bkk in BANGKOK:
            route = {}
            for direction, (a, b) in (("out", (bkk, here)), ("back", (here, bkk))):
                trains = parse(lookup(a, b))
                route[direction] = dict(start=a, dest=b, trains=trains)
                print(f"{dest} {bkk} {direction}: {len(trains)} trains", flush=True)
                time.sleep(2)
            if route["out"]["trains"] or route["back"]["trains"]:
                routes.append(route)
        out["routes"][dest] = routes
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
