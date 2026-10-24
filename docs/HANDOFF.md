# Handoff — Suumtrip (read this first if you pick up the work)

Last updated: 2026-10-24 16:50 +07 by Agent A. Keep this file current: update it with every push.

## Where things stand

- Live site: https://nippich321.github.io/suumtrip/ (push to `main` deploys in about a minute; the
  workflow tags css/js/data with `?v=<commit>`; never add version numbers by hand).
- Submission: Saturday 25 October 2026, 12:00–13:30 +07: the website link and a 2-minute `.mp4`
  (see `docs/TEAM_KIT.md`). The video is **not started**.
- Agent B has left (owner, 2026-10-24). Agent A owns every file and does not wait for approval;
  the owner wants replies in Thai, code/commits/AGENTS.md in English, and a short report after
  each push of what changed and what was not tested.
- Run locally: `python -m http.server 5173 --directory .` (or the preview config "suumtrip").
  In a hidden browser pane `requestAnimationFrame` stops; for tests, replace it with a
  `setTimeout` shim in the page.

## What the site does now

1. Home: 3D gift box (Blender model `assets/3d/gifts/giftbox.glb`, built by
   `tools/build_giftbox.py`; drawn by `js/giftbox3d.js`), pitch "no planning".
2. Booking pages (`js/app.js`, `wizard()` + `screens.cat/date/choose/who/cands/pay`): stepper,
   steps on the left, a sticky booking summary with price and the next button on the right
   (a fixed bottom bar on phones). Order: แนวทริป → วันเดินทาง → การเดินทาง → ผู้เดินทาง →
   ปลายทาง → ชำระเงิน. The owner **likes the picture cards** (category cards use the loader scene
   art) and the current colours: do not restyle all pages again. Only the travellers page was
   redone like Booking.com's guest details (labels above the boxes, square +/- buttons).
   Selection animations: the picked card rings out and its check pops; changed summary rows
   flash; the people counter bumps. A calmer all-pages restyle the owner rejected is kept in
   `git stash` ("calm-restyle-all-pages"); do not apply it.
3. Box opening (`#open`), then the trip page (`#trip`): MapLibre map with the 3D traveler
   (`js/traveler3d.js`: cars, van, coach, train with carriages; walkers), timeline, playback
   (on phones playback does not scroll the page).
4. Public transport: trains first (`pickTrainFirst` in `js/itinerary.js`), real State Railway
   times (`data/schedules.json` from `tools/fetch_schedules.py` + `tools/build_schedules.py`),
   trains drawn on the railway (`data/rails.json`, `tools/build_rails.py`); the "รถไป-กลับ"
   panel (`js/rides.js`) lets the customer pick runs, with fares only when the railway states
   them, and "ซื้อตั๋ว" → https://dticket.railway.co.th/.
5. Places are picked per day by the shortest total road distance (`planPlaces` in
   `js/itinerary.js`: every combination of the slots' options, then a random one within 12 % of the
   best), so a day does not run back and forth. Every trip goes from the station straight to the hotel to leave the bags; by public
   transport day 2 ends with collecting the bags just before the run home.
6. Self-drive: `js/drive.js` planner (departure time, TomTom traffic if `CONFIG.tomtomKey` is set
   — it is empty, so estimates labelled ประมาณการ; rest stops and fuel pins from
   `data/roadside.json`; travel-day mode; Google Maps links).
7. 15 destinations (`tools/build_data.py` → `data/destinations.json`): 11 by train, 4 by van.

## Open items

- Logo: `img/logo/logo-512.png` + `favicon-64.png`, rendered from the 3D gift box by
  `tools/render_logo.py` (Blender). The owner asked for a Higgsfield logo: the Higgsfield MCP here has
  no generate tool, the in-app browser is not logged in (the owner must log in themselves; never type
  passwords) and the account has 2 credits (one Nano Banana 2 image). Planned prompt: flat icon of a
  coral gift box (#FF6B4A) with a gold bow (#FFB020), lid slightly open with a map pin popping out,
  white background, no text.

- Video script and recording (2 minutes; answer "how do you beat OTAs?": we sell the whole
  trip and the decision, not a cheaper room; mystery-trip precedents: Waynabox, JAL
  どこかにマイル, JR East どこかにビューーン!).
- Van/bus times (Bang Saen, Amphawa, Nakhon Nayok, Suan Phueng) need a person's tick in
  `docs/schedules.csv` (AI ticks do not count), then `python -I tools/build_schedules.py`.
- Pricing (owner's real data, 2026-10-24): 5 hotels asked; low season they cut 1,800 → 1,300 and
  2,500 → 1,900 (about 25 %). Plan agreed ("ค"): regular boxes use hotels whose net is about 850
  (list price about 1,100-1,200); gold destinations (net about 1,900) come out 10 % of the time, so the
  average room cost is about 0.9 x 850 + 0.1 x 1,900 = 955 and a 1,290 box keeps about 335 (26 %)
  for marketing, operations and profit. Weekend hotel rates are not known yet. The partner page shows
  the real quotes.
- Prices: the box price is for 2; other party sizes say the team will quote. Hotel "secret
  rates" and rack prices are illustrative: say so in the video.
- Not tested on a real phone. Old console errors in a long-lived test tab are from before
  fixes; check a fresh tab.

## Rules that bit us

- Never hand-edit generated data (`data/*.json`); change the tool and run it.
- Before pushing: `git fetch && git rebase origin/main`, run the site, open Nature/Sea/Old Town
  trips (public and self-drive), and run the `buildTrip` console check in AGENTS.md.
- Overpass (OSM) is often overloaded: tools retry and split queries; be patient.
- Do not invent prices, times or claims; label estimates.
