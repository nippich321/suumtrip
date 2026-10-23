# Transport choices: pick the train/bus/van, plan the drive, 3D train and bus

Date: 2026-10-23. Owner approved this design in chat. Deadline: submission 25 Oct 2026, 12:00 +07.

## Decisions made by the owner

- **Public transport:** after "ขนส่งสาธารณะ" the customer picks the kind of ride (รถไฟ / รถทัวร์ / รถตู้), sees departure times and prices, and can buy a ticket.
- **Tickets:** the "ซื้อตั๋ว" button opens the operator's real booking page (State Railway D-Ticket, บขส. e-ticket, or the van operator's phone/page). No fake checkout for tickets: the site never takes money for tickets it cannot issue.
- **Traffic:** use the TomTom Routing API (free daily quota). The owner signs up and gives the key; it lives in `js/config.js` (`tomtomKey`, empty by default) and is visible in the page, so it should be restricted to `nippich321.github.io` if TomTom allows. With no key, or when TomTom fails, fall back to the OSRM route with a rush-hour estimate and label it "ประมาณการ".
- **3D train:** Kenney Train Kit (CC0, same artist as the car models). Candidates are in `assets/3d/trains/` (sheet: `tools/art/train-candidates.png`); show the owner the chosen train before shipping.
- **3D bus (รถทัวร์):** Kenney has no bus. Build one in Blender 5.2 (installed on the owner's PC) from the Kenney van's own parts and colormap (longer body, more windows, Thai double-decker coach look). Show a render to the owner first; do not ship it if the owner says no. (The owner does not want art designed from scratch; reusing Kenney parts was the owner's own suggestion.)
- **Live re-routing:** no in-house turn-by-turn navigation. The site plans; a "นำทางด้วย Google Maps" button hands the route and stops to Google Maps for live navigation. On the travel day the site can refresh the ETA from the customer's location every 5 minutes and suggest a faster TomTom alternative.

## Part 1: public transport choice (Agent B, builds on `agent-b/wizard`, now on `main`)

- On the transport step, after "ขนส่งสาธารณะ", show cards for the kinds the destination actually has in `data/schedules.json` (train, bus, van).
- Each card lists outbound and return runs: depart/arrive time, station or stop, price, and status (✅ ยืนยันแล้ว / 🟡 รอยืนยันเวลารถ).
- "ซื้อตั๋ว" per run opens the operator booking page in a new tab (store the URL per operator in the schedule data, with its source).
- The chosen run becomes the Bangkok legs of the trip (the itinerary already supports timetabled runs).

## Part 2: self-drive planner (Agent A)

1. Departure time input on the self-drive path (default 07:00).
2. TomTom `calculateRoute` with `departAt`, `traffic=true`, `maxAlternatives=2`: show ETA, distance and "รถติดเพิ่ม X นาที"; the customer can pick an alternative; the chosen route is drawn on the map.
3. Rest stops: `tools/fetch_roadside.py` precomputes fuel stations, cafés and restaurants within 500 m of each Bangkok → destination route from OpenStreetMap (Overpass `around` a polyline) into `data/roadside.json`. Suggest a stop about every 60-90 minutes of driving; the customer can add or remove stops, and the time is recomputed (TomTom waypoints, OSRM fallback).
4. Travel-day mode: with the customer's permission, use their location, refresh the ETA every 5 minutes, and show a "ทางเร็วกว่า X นาที" suggestion when an alternative saves more than 5 minutes.
5. "นำทางด้วย Google Maps": `https://www.google.com/maps/dir/?api=1&origin=...&destination=...&waypoints=...&travelmode=driving`.

## Part 3: 3D vehicles (Agent A)

- New traveler kinds `train` and `bus` in `js/traveler3d.js`, with the same pop, hop, settle and smoke effects; a train is a locomotive plus one or two carriages following the route.
- Legs that ride a train or a coach (from the timetable data) use these kinds on the map.

## Honesty and testing

- Every time, price or traffic figure shows its source or an "ประมาณการ" label; unconfirmed timetable rows say so.
- Check locally on desktop and phone sizes for Nature, Sea and Old Town, with and without a TomTom key; no console errors. Say plainly what was not tested.
