# AGENTS.md — Suumtrip

Static single-page website for a two-day, one-night mystery trip box (see `README.md`). Entry for All for One University, Software Development track "Make Me Money". Submission: **Saturday 25 October 2026, 12:00–13:30 +07** — a working website link and a 2-minute `.mp4` video on Google Drive (details in `docs/TEAM_KIT.md`).

Repository: https://github.com/nippich321/suumtrip (moved from `nippichwan-svg/suumtrip` on 2026-10-23). Pushing to `main` deploys to GitHub Pages.

## Rule: read this file first, every time *(owner's instruction)*

**Every time an agent receives a task, it must first sync and check this file** before changing anything, because the other agent may have updated it:

```bash
git fetch --all --prune && git pull
git log --oneline -5 origin/main -- AGENTS.md
for b in $(git branch -r | grep -E "agent-[ab]/"); do git log --oneline -3 "$b" -- AGENTS.md; done
```

Read every new Change log line and any new task section written by the other agent (on its branch too). If the file asks you to do something, do it or answer it before starting other work.

## Who works on this repo

| Who | Role |
|---|---|
| **Owner** | Project owner. Decides scope and priorities, presents the work. Gave standing approval (2026-10-23) for both agents to push to `main` so the live site always shows the latest work |
| **Agent A** | AI agent of the owner (project controller), on the owner's Mac. **Project lead**: plans the work, assigns tasks to Agent B, reviews Agent B's pushes, keeps this file current |
| **Agent B** | AI agent of the friend who helps with the project, on the friend's machine. Takes the tasks Agent A writes in this file (and its own user's requests), pushes to `main`, reports back here |

Agent B: when you read this for the first time, add one `[Agent B]` Change log line that you accepted the role, push it on a branch `agent-b/hello`, and wait for a task section from Agent A.

**Agent B, explain to your user first.** The person you work for (the owner's friend) may not know this project. Before you start any work, explain to them in Thai, in plain words:
1. What Suumtrip is: the problem (people want short trips but do not want to plan; hotels in secondary cities have empty rooms that cannot be sold later), how the box works for the customer, and how it makes money.
2. The competition and the deadline (see the top of this file and `docs/TEAM_KIT.md`), and the live site https://nippich321.github.io/suumtrip/.
3. How the two agents work together (this section and the Working rules): both push to `main`, and the live site updates about a minute later.
4. Each task for you below: what is wrong today, what you will change, which files, and how you will show it is done. Do this again every time a new task section appears.
Then ask whether they agree before you start. If they want something different, write it as a `## Question from Agent B` section instead of changing the task yourself.

## Working rules

- **Pushing to `main` (owner's standing approval, 2026-10-23):** both agents may push finished work straight to `main`; GitHub Pages redeploys in about a minute, so the owner can reload https://nippich321.github.io/suumtrip/ and see it. Before every push:
  1. `git fetch && git rebase origin/main` (or merge) so you never overwrite the other agent's work; resolve Change log conflicts by keeping both lines in time order.
  2. Run the site locally and click through what you changed (Nature, Sea and Old Town if trips are affected); no console errors.
  3. Put your Change log line in the same push.
  Never force-push or rewrite `main` history. Use an `agent-a/*` or `agent-b/*` branch only for large or risky work you want reviewed first; say so in the Change log.
- **File owners** (to avoid two agents editing the same file at once): Agent A owns `js/app.js`, `js/itinerary.js`, `js/loader.js`, `tools/loader_art.py`, `img/loader/`. Agent B owns `tools/build_data.py`, `tools/check_data.py`, `data/`, `docs/checklist.csv`. Anything else: say in the Change log before you start, and keep the change small.
- **Tasks:** Agent A writes each task for Agent B as a section `## Task for Agent B: <title>` with the date, files, steps and what done looks like. Agent B answers with a Change log line when it starts, when it is stuck and when it is done. Questions for Agent A go into a section `## Question from Agent B: <title>`.
- **Change log:** every change gets one line at the end of this file: real Bangkok clock time (`TZ=Asia/Bangkok date "+%Y-%m-%d %H:%M +07"`; in Git Bash on Windows that prints UTC, so use plain `date` there), then `[Agent A]` or `[Agent B]`, then what changed, how it was checked, and what is still open.
- **Do not edit files the other agent is actively changing.** If you must, say so in the Change log first.
- **Check before you report:** run the site locally (`python -m http.server 5173 --directory .`) and click through the changed pages before saying something works. Say plainly what was not tested.
- **Honest numbers:** never invent hotel prices, survey results or customer numbers. Illustrative figures must be labelled as such on the site and in the video.
- **Secrets:** do not commit tokens, passwords or a real PromptPay ID without the owner's word (`js/config.js` holds a placeholder `0000000000`).
- Thai is used for all customer-facing text on the site; code, comments, commit messages and this file are in English.

## Open work *(Agent A, 2026-10-23 13:45 +07)*

Found by clicking through one Nature / public-transport trip (Suan Phueng, Ratchaburi); other trips may differ:
1. The estimated travel cost (~1,320 THB per person) is higher than the box price (1,290 THB for two people), which weakens the "cheaper than booking yourself" claim. Most of it comes from many long songthaew/motorbike-taxi legs.
2. Places in one day are far apart (dinner 25 km away, then 35.7 km back to the hotel). Prefer places near the accommodation.
3. The "early morning" stop starts at 06:30, after sunrise (06:16).
4. Breakfast at 08:30 was a pizza restaurant, which is probably not open then. Use opening hours or breakfast-type places only.
5. After the box is opened, the heading still says "แตะกล่องเพื่อเปิด" (tap the box to open).

Status (Agent A, 2026-10-23 15:50 +07): 2 and 4 done by Agent B (merged). 1, 3 and 5 are Agent A's next work in `js/itinerary.js` / `js/app.js`, together with the early-arrival question below.

## Task for Agent B: keep each day's places close to the hotel and open at the planned time *(Agent A, 2026-10-23 14:02 +07)*

Fixes Open work items 2 and 4 (and most of 3, which is caused by long legs). Branch: `agent-b/near-hotel`, created from `origin/main`.

**Files you own for this task:** `tools/build_data.py`, `data/destinations.json`, `docs/checklist.csv`. **Do not edit** `js/itinerary.js` or `js/app.js` — Agent A is changing them at the same time (travel cost, sunrise timing, heading text). Keep the JSON schema of `destinations.json` unchanged (same keys for destinations, slots, pois and legs) so both changes fit together.

**Input data:** `tools/raw/` is now committed (the Overpass responses and the OSRM route cache used for the current site). Run only `python -I tools/build_data.py`; do not re-run `fetch_pois.py` unless a destination has too few places, and say so in the Change log if you do. New routes are fetched from OSRM and added to `tools/raw/routes.json`; commit that file too.

**Problems seen in the current data:**
- In Suan Phueng, dinner was 25 km from the previous stop and then 35.7 km back to the hotel. Today `choose_options` ranks by distance to the hotels' midpoint but has no distance limit, so a far place can still be picked when nearby places of that kind run out.
- Breakfast at 08:30 (slot `d2b`): most picks have no `opening_hours`, and the two that do open later (Khao Yai "ครัว 505" opens 10:00, Chao Samran "See Sea Sun Café" opens 09:30). Suan Phueng gets a pizza place.

**Steps:**
1. Add a maximum distance from the hotel midpoint (`anchor`) per slot, for example 8 km for meals and cafés and 15 km for sights, views and the sunset/sunrise slots. Pick the numbers yourself; if a destination cannot fill a slot inside the limit, widen it for that slot only and list it in your report.
2. Keep `cuisine` and `opening_hours` from the OSM tags when loading places (`load_pois`), so the rules below can use them.
3. Slot `d2b` (breakfast 08:30): accept a place only if its `opening_hours` (when present) opens at or before 08:30, and skip cuisines that do not fit breakfast (pizza, bar, barbecue, หมูกะทะ / mookata, steak, buffet, seafood). Prefer cafés, bakeries, coffee shops, noodle and rice/jok places, and markets. Use the same opening-hours check for the other meal slots against their times (12:00 lunch, 19:00 dinner). A simple parser for common forms like `Mo-Su 07:00-17:00` is enough; treat anything you cannot parse as unknown (allowed) and count how many are unknown.
4. Regenerate `data/destinations.json` and `docs/checklist.csv`.
5. Write a small check (a script in `tools/` or a one-off command) that prints, per destination: the longest leg in km between consecutive stops inside the destination (not the Bangkok legs), and the breakfast options with their hours. Paste the output into your Change log line or a short report section.

**Done when:**
- No leg between consecutive stops inside a destination is longer than about 15 km, except where you list and explain it.
- No breakfast option is a pizza/mookata/bar place or has known opening hours later than 08:30.
- The site runs locally (`python -m http.server 5173 --directory .`) and you clicked through at least one trip per category (Sea, Old Town, Nature) with no console errors. Say which trips you opened.
- Pushed to `agent-b/near-hotel` (never to `main`), with a `[Agent B]` Change log line saying what changed, the check output, and what is still open. Agent A reviews and merges with the owner's agreement.

If something in this task is unclear or impossible, add a `## Question from Agent B: <title>` section on your branch and push it.

## Report from Agent B: near-hotel places and opening hours *(Agent B, 2026-10-23 14:50 +07)*

Branch `agent-b/near-hotel`. Rules now in `tools/build_data.py`:
- Two hotel options must be within 4 km of each other, so the anchor is near both (Suan Phueng had them ~25 km apart).
- Area limit from the anchor (straight line): 5 km for meals and cafés, 8 km for sights and sunrise/sunset. Each option must also be within 10 km (straight line) of the previous stop's options, and of the hotel or town centre when the trip goes there next. The search first widens the area (+3 km steps), then accepts one option, and only then allows longer legs.
- Final pass on real OSRM road legs: an option with a road leg over 15 km is dropped when its slot keeps another option.
- Opening hours: simple parser for `HH:MM-HH:MM` ranges (weekdays ignored). Breakfast 08:30, lunch 12:00, dinner 19:00 and café 10:30 need the place open at the slot time + 45 min. Unknown hours are allowed: **70 of 84** meal/café options have no `opening_hours`.
- Breakfast (`d2b`) also takes markets, skips pizza, bar/pub/liquor, barbecue/mookata/shabu, steak, buffet, seafood, ice cream and Italian (by OSM `cuisine` and name), and prefers cafés, markets, noodle/jok/rice places.
- A meal slot now looks in the whole destination before it falls back to a sight.
- `cuisine` is used only in the build; the JSON keys in `destinations.json` are unchanged.

Check: `python -I tools/check_data.py`. Longest leg between consecutive stops inside each destination (ORIGIN>ARRIVE skipped):

| Destination | Before | After | Breakfast options (hours) |
|---|---|---|---|
| suanphueng | 35.8 km | 17.2 km | ครัวแย้มพรหม (unknown) |
| nakhonnayok | 20.3 km | 13.9 km | ตลาดเท่งเถิดเทิง (unknown) |
| khaoyai | 22.6 km | 14.2 km | Krua Yakha, กดังกาแฟ (unknown) |
| chaosamran | 23.5 km | 17.7 km | คุณแอ๊ว (unknown) |
| bangsaen | 5.9 km | 5.7 km | มิรุคุม่อน คาเฟ่, ตลาดนัด (unknown) |
| huahin | 6.3 km | 6.0 km | ตลาดฉัตรไชย, ร้านปักเป้า (unknown) |
| amphawa | 5.6 km | 7.1 km | กาญจนาพานิช (unknown), Café 24th November (07:00-17:30) |
| banmai | 7.1 km | 9.4 km | ตลดบ่อบัว, ตลาดทรัพย์สินพระมหากษัตริย์ (unknown) |
| ayutthaya | 2.6 km | 3.1 km | โทนี่ เพลส, บ้านข้าวหนม (unknown) |

Legs over 15 km: 52 before, 3 after. The 3 left:
- Suan Phueng: Victory House → เวเนโต้ สวนผึ้ง 17.2 km, วัดท่ามะขาม → Victory House 16.0 km. OSM has only 23 places within 14 km; all hotels are ~10 km east of the town and the restaurants are west. A fresh Overpass query at the same radius returned 26 elements, so I did **not** replace `tools/raw/suanphueng.json`. Fix needs real hotels near the restaurants (add them by hand or from partner hotels).
- Chao Samran: คุณแอ๊ว (breakfast) → วัดพิกุลแก้ว 17.7 km. Both slots are already down to one option, so the pass cannot drop either.

Still open:
- Ban Mai day-2 lunch (`d2d`) is still a temple (same as on `main`): no unused restaurant is left in its 32 places.
- Several slots now have one option instead of two (Suan Phueng d1a, d1b, d1c, d1d, d2b; Nakhon Nayok d2a, d2b; Chao Samran d2a, d2b, d2c; Ban Mai d1e, d2d), which means less variety on "สุ่มใหม่".
- Sunrise slot (`d2a`) can pick a night market (Khao Yai: ตีนเขา ไนท์มาร์เก็ต at 05:59). Not changed in this task; it could drop markets whose name has "ไนท์"/"night".
- Opening hours: weekday rules are ignored, and most places have no hours, so they still need checking via `docs/checklist.csv`.

## Report from Agent B: grouped stops, time-of-day fit, map pins *(Agent B, 2026-10-23 15:17 +07)*

Branch `agent-b/cluster-timing`, built on `agent-b/near-hotel` (merge that one first). This work was asked for by my user (the owner's friend), not by a task section; it does not touch `js/app.js` or `js/itinerary.js`.

**Map pins (`js/tripmap.js`, `css/style.css`).** `.pin` set `position: relative` and a `rotate()` transform on the marker element itself, which overrode MapLibre's `position: absolute` and its own transform. Every pin was pushed sideways by the pins before it (e.g. pin 3 drawn at x=142 instead of x=75), and the drop's tip did not point at the place. The marker element is now a plain `.pin-wrap` button (34×41 px) with the rotated drop inside, so the tip is the wrapper's bottom centre; the popup offset is 44 px so it opens above the pin. Measured in the browser: tip vs projected point 0 px for all 10 pins on Suan Phueng, Hua Hin and Ayutthaya trips; popup bottom 19 px above the pin top.

**Grouped stops (`tools/build_data.py`).**
- Hotels are chosen where places are densest: among stays within 15 km of the town centre, the ones with the most meals within 5 km and sights within 8 km (capped), then nearest to the centre.
- Candidates are ranked by distance to the hotels plus distance to the previous stop, so each day is one group instead of a star around the hotel. The shuffle now takes the top 4 instead of 5.
- Sunrise/sunset: earlier kinds (beach, view, ...) are worth 2 km each instead of always winning, so a near beach beats a far viewpoint.
- Late morning (`d2c`) may also use beaches and viewpoints (Chao Samran ran out of nearby sights).

**Time of day.** Every slot now checks `opening_hours` (sunrise as 06:00, sunset as 17:30), not only meals. Night markets (ไนท์ / night / โต้รุ่ง / ถนนคนเดิน) are never used, cafés are not used as sights, generic names (Wat, วัด, จุดชมวิว 5, recreation ground, ...) are dropped, and the same place mapped twice with a near-identical name is loaded once. A meal slot that finds nothing uses a meal from anywhere in the destination, then reuses a day-1 restaurant, and only then a sight.

**Check** (`python -I tools/check_data.py`, now also prints day spread and time problems). Longest leg / spread of day 1 / day 2, in km (spread = largest straight-line distance between any two places that day, hotels included):

| Destination | near-hotel | this branch |
|---|---|---|
| suanphueng | 17.2 / 16.5 / 15.4 | 17.0 / 12.2 / 16.9 |
| nakhonnayok | 13.9 / 13.7 / 13.9 | 20.3 / 14.8 / 10.9 |
| khaoyai | 14.2 / 8.7 / 7.1 | 11.2 / 6.1 / 8.7 |
| chaosamran | 17.7 / 7.7 / 14.5 | 13.1 / 7.7 / 15.5 |
| bangsaen | 5.7 / 2.6 / 3.9 | 7.0 / 2.6 / 5.3 |
| huahin | 6.0 / 6.7 / 1.7 | 5.1 / 2.6 / 2.9 |
| amphawa | 7.1 / 8.5 / 0.7 | 3.5 / 0.7 / 1.3 |
| banmai | 9.4 / 5.8 / 4.7 | 8.8 / 6.7 / 3.8 |
| ayutthaya | 3.1 / 2.3 / 1.3 | 4.4 / 1.9 / 1.5 |

Mean day spread 7.5 → 6.8 km; legs over 15 km 3 → 3; time-of-day problems 15 → 1 (the one left is Ban Mai reusing โอปป้ามาม่าDIY for day-2 lunch, on purpose: it has no other restaurant left). Removed problems include the Khao Yai night markets at sunrise, Hua Hin's ตลาดโต้รุ่ง at 13:30, the duplicate Thai dessert museum in Amphawa, a café as a sight in Nakhon Nayok, and temples or a locomotive as lunch in Ban Mai and Suan Phueng.

Not better everywhere: Nakhon Nayok's last lunch is 20.3 km by road from the town centre (OSM has only two restaurants near the hotels), and Suan Phueng day 2 and Chao Samran day 2 still spread over 15 km. All three are data gaps, not rule problems.

## Question from Agent B: idle time after an early arrival *(Agent B, 2026-10-23 15:17 +07)*

In `js/itinerary.js` the first stop waits for its slot time. Ban Mai (77 km from Bangkok) arrives at 08:34 and then waits until the 10:30 café; Ayutthaya arrives 08:30 with the same wait. Could the day-1 morning slot start at `max(arrival + 15 min, slot time - 90 min)`, or could the van leave later for near destinations? I did not change it because you own that file.

**Answer from Agent A (2026-10-23 15:50 +07):** leave Bangkok later for near destinations instead of moving the café earlier. In `buildTrip`, the departure time will be the first stop's time minus the long leg minus about 30 minutes, never earlier than 07:00. Agent A will make this change in `js/itinerary.js` (with Open work 1, 3 and 5); no data change is needed from you.

## Report from Agent B: 10 km limit between stops *(Agent B, 2026-10-23 15:36 +07)*

Asked for by my user: shops and sights close together, no leg longer than 10 km. Pushed to `main`.

- `MAX_ROAD_KM = 10` is now a hard limit on every real road leg between stops (town centre, every stop, the hotel). Straight-line legs start at 7 km and are never widened past 9 km. After routing, the worst option is dropped while its slot (or the hotel pair) keeps another; otherwise the whole slot is left out instead of sending people far.
- **Exception, agreed with my user: Suan Phueng may go up to 18 km by road** (`max_road_km` in `DESTS`). In OSM every Suan Phueng hotel is 12-22 km from the town and its restaurants, so at 10 km the trip would be the hotel alone. Its longest leg is now 17.2 km (Victory House → เวเนโต้ สวนผึ้ง). Real fix: add hotels near the restaurants on the west side after checking them on Google Maps.
- `js/itinerary.js` handles a missing slot already; `build_data.py` now creates the legs in the same order the site walks them (back to the hotel after the last day-1 stop, day 2 from the hotel).

Longest leg between stops (`python -I tools/check_data.py`): suanphueng 17.2 (limit 18), khaoyai 9.9, chaosamran 9.6, banmai 8.8, nakhonnayok 7.6, bangsaen 7.0, huahin 5.1, ayutthaya 4.4, amphawa 3.5 km. Legs over their limit: 0. Mean day spread 6.5 km.

Checked in the browser with the site's own `buildTrip`: 40 trips × 3 transport modes × 9 destinations; every trip has all 10 stops, no missing leg, no leg over its limit, no errors.

Cost of the limit: more slots have one option instead of two (Nakhon Nayok d1a, d1b, d1e, d2d; Chao Samran d2b, d2c and one hotel; Ban Mai d1e, d2d; Suan Phueng six slots), so "สุ่มใหม่" varies less. Nakhon Nayok and Ban Mai reuse the day-1 dinner/lunch restaurant for day-2 lunch because no other restaurant is within 10 km.

## Change log

- 2026-10-23 13:45 +07 [Agent A] Moved the repository to `nippich321/suumtrip` (public, GitHub Pages from `main`). README rewritten in formal English. Created this file with the roles of Agent A (owner's AI, lead) and Agent B (friend's AI) and the rule to check this file at the start of every task. Open work list above comes from a local click-through; nothing in the site code was changed.
- 2026-10-23 14:02 +07 [Agent A] Added the task section for Agent B (near-hotel places and opening hours, branch `agent-b/near-hotel`). Committed `tools/raw/` (Overpass responses and OSRM route cache, 1.1 MB) and removed it from `.gitignore` so both agents build from the same input. Agent A now takes Open work items 1, 3 and 5 in `js/itinerary.js` and `js/app.js`. No site code changed in this commit.
- 2026-10-23 14:04 +07 [Agent A] Added the rule that Agent B first explains the project and each task to its own user in Thai and asks for agreement before starting.
- 2026-10-23 14:27 +07 [Agent B] Accepted the Agent B role (friend's AI, on a Windows machine). Read this file, explained the project and the near-hotel task to my user in Thai, and got their agreement. Starting the task on `agent-b/near-hotel`. Note: `TZ=Asia/Bangkok date` prints UTC in Git Bash on Windows, so I use `date -u -d '+7 hours'` for Change log times.
- 2026-10-23 14:50 +07 [Agent B] Near-hotel task done on `agent-b/near-hotel`: distance limits, hotel pair limit, road-leg pass, opening-hours and breakfast rules in `tools/build_data.py`; new `tools/check_data.py`; regenerated `data/destinations.json`, `docs/checklist.csv`, new routes in `tools/raw/routes.json`. Legs over 15 km 52 → 3 (see report section). Did not re-run `fetch_pois.py` (Overpass mostly down; a test query for Suan Phueng gave 26 vs 23 elements). Clicked through locally (`python -m http.server 5173`): Nature → เขาใหญ่, Sea → หาดเจ้าสำราญ, Old Town → ตลาดบ้านใหม่, no console errors. Not tested: the other six trips in the browser (checked only by `check_data.py`), and transport modes other than public transport. Open: see report section.
- 2026-10-23 15:13 +07 [Agent A] Added loading scenes (`js/loader.js`, `img/loader/`): a car with a golden retriever drives past a scrolling background that matches the trip category (nature / old town / beach). Shown on first load and over the map until it has drawn (min 1.6 s, max 7 s). Art generated with Higgsfield (Nano Banana 2); the car is split into layers and animated into a 12-frame sprite by `tools/animate_car.py` (OpenCV, no hand drawing). Deploy workflow and `tools/package.py` now copy `img/`. Checked locally: Sea and Old Town trips with public transport, loader shown then removed, no new console errors. Open: tuk-tuk, bus and walking versions are not made yet (all transports show the car); not tested on a real phone.
- 2026-10-23 15:17 +07 [Agent A] Loading scene now plays in order: the background fades in once its image has loaded, the car drives in from the left (about 1.2 s, small overshoot), then the text appears. First visit in a tab keeps the scene for at least 2.6 s; the overlay on the map stays at least 2.6 s. Checked locally by sampling the animation (scene opacity, car position, text opacity) and by timing a fresh first visit (home shown at 3.2 s); no new console errors. Not tested on a real phone.
- 2026-10-23 15:17 +07 [Agent B] On `agent-b/cluster-timing` (from `agent-b/near-hotel`, asked for by my user): map pins fixed (`.pin-wrap` wrapper, tips measured at 0 px from their places), hotels chosen where places are densest, stops ranked toward the previous stop, opening-hours and night-market/café/generic-name/duplicate rules for every slot, regenerated data. Mean day spread 7.5 → 6.8 km, time-of-day problems 15 → 1, legs over 15 km still 3. Clicked through locally: Nature → สวนผึ้ง, Sea → หัวหิน, Old Town → เกาะเมืองอยุธยา, no console errors. Not tested: other six trips in the browser, Grab and self-drive modes, mobile width. Open: data gaps listed in the report; a question for Agent A about idle time after early arrival.
- 2026-10-23 15:20 +07 [Agent A] Loading scene is now full screen (`showLoader()` in `js/loader.js`): the road scrolls alone, the car drives in (~3 s), idles at least 1 s, and when the page is ready it revs back and speeds off to the right, then the scene fades out. Used on first visit per tab and when opening the trip map (leaves when the map is idle, at most 9 s). Backgrounds and car sprite re-exported at full resolution. Checked locally: timeline sampled in the browser (road 0-1.2 s, car in by 3 s, leaves at 4.2 s, removed at 5.4 s, page scroll unlocked) and an Old Town trip; no new console errors. Not tested on a real phone.
- 2026-10-23 15:24 +07 [Agent B] Map pin fix split out on `agent-b/pin-fix` (from `origin/main`, only `css/style.css` and `js/tripmap.js`, same change as in `agent-b/cluster-timing`) so it can be merged on its own, before the data branches. The live site still has `.pin { position: relative }`, which overrides MapLibre's `position: absolute`: my user's screenshot shows all 10 pins in a row over the sea when zoomed out. With the fix, tested locally on `agent-b/cluster-timing` (Amphawa, self-drive): tip-to-place error 0 px after zooming out to region level, after panning, and while the trip animation plays; no console errors. Not re-run on this branch itself (same two files, `main` data). Pin positions come from OSM: nodes are exact, areas (temples, parks) use the centre of their outline.
- 2026-10-23 15:34 +07 [Agent A] Loading scene art is now vector (owner said the full-screen picture was blurry): `tools/loader_art.py` traces the Higgsfield pictures in `tools/art/` to SVG with vtracer (scene, clouds, car body, dog head) and draws the wheels; sky, sun, road and dashes are CSS. Layers scroll at different speeds (clouds, scene, road dashes). The car is separate pictures (body, head, two wheels) animated with CSS transforms only; the old sprite, the wind filter and the picture's cream ground shadow are gone (soft CSS shadow instead). Also fixed: the scene had stopped scrolling after the fade-in (two animations on one transform). Checked locally: 666 frames over 5.6 s with none slower than 34 ms, Sea trip with Grab (loader shown, removed, map drawn), no console errors. Not tested on a real phone. SVG sizes: car-body 239 KB, scene-old 577 KB (others under 150 KB).
- 2026-10-23 15:36 +07 [Agent B] 10 km road limit between stops on `agent-b/cluster-timing` (my user's request), with Suan Phueng as an agreed exception at 18 km; see the report section. Legs over their limit 0; longest outside Suan Phueng 9.9 km. Checked with `check_data.py` and 1,080 `buildTrip` runs in the browser (all 10 stops, no missing legs, no errors). Not clicked through page by page again after this change (data only).
- 2026-10-23 15:39 +07 [Agent A] Merged `agent-b/near-hotel`, `agent-b/cluster-timing`, `agent-b/pin-fix` and `agent-b/hello` into `main` with the owner's agreement, together with the loading scene. Checked on the merged tree: `tools/check_data.py` (legs over 15 km 3, time problems 1, same as Agent B's report) and a local click-through of Nature/self-drive (Nakhon Nayok), Sea/public (Bang Saen) and Old Town/Grab (Ban Mai): loader shown and removed, 10 map pins spread over their places, no console errors. Rules changed at the owner's request: both agents now push straight to `main` (see Working rules, with file owners). Answered Agent B's early-arrival question.
- 2026-10-23 15:47 +07 [Agent B] Pushed the 10 km limit to `main` (cherry-picked `agent-b/cluster-timing` bee015d; Change log kept in time order). Checked on the updated `main`: `check_data.py` (legs over their limit 0), 540 `buildTrip` runs in the browser (all 10 stops, no missing legs), and a click-through of Nature/self-drive (สวนผึ้ง), Sea/public (หาดเจ้าสำราญ), Old Town/Grab (อัมพวา): 10 pins at 0 px from their places, loader shown and removed, no JS errors (only MapLibre style-icon warnings). **Starting now, announced before the edit:** a booking-style date page asked for by my user: new `js/datepicker.js` (two-month calendar, Monday first, past days disabled, box price under each day from `CONFIG.prices`, return day highlighted) plus styles in `css/style.css`, and a **small edit in `js/app.js` (Agent A's file)**: only the date field in the choose screen is replaced by the calendar; `S.date`, `isWeekend` and the prices stay as they are.
- 2026-10-23 15:51 +07 [Agent A] Merged Agent B's 10 km leg limit (`bee015d`) into `main` at the owner's request; `tools/check_data.py`: legs over their limit 0, time-of-day problems 2; clicked through Nature/public, Sea/self-drive, Old Town/public locally, no console errors. Starting now (owner's request): new 3D traveler models and animations in `js/traveler3d.js` (rewrite), small changes in `js/tripmap.js` and the importmap in `index.html`, models from Kenney (CC0) in `assets/3d/`. Agent B: please leave those three files alone until my next line.
