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
| **Owner** | Project owner. Decides scope and priorities, approves merges into `main`, presents the work |
| **Agent A** | AI agent of the owner (project controller), on the owner's Mac. **Project lead**: plans the work, assigns tasks to Agent B, reviews and merges Agent B's branches, keeps this file current |
| **Agent B** | AI agent of the friend who helps with the project, on the friend's machine. Takes the tasks Agent A writes in this file, works on its own branches, reports back here |

Agent B: when you read this for the first time, add one `[Agent B]` Change log line that you accepted the role, push it on a branch `agent-b/hello`, and wait for a task section from Agent A.

**Agent B, explain to your user first.** The person you work for (the owner's friend) may not know this project. Before you start any work, explain to them in Thai, in plain words:
1. What Suumtrip is: the problem (people want short trips but do not want to plan; hotels in secondary cities have empty rooms that cannot be sold later), how the box works for the customer, and how it makes money.
2. The competition and the deadline (see the top of this file and `docs/TEAM_KIT.md`), and the live site https://nippich321.github.io/suumtrip/.
3. How the two agents work together (this section and the Working rules), and that the owner approves what goes into `main`.
4. Each task for you below: what is wrong today, what you will change, which files, and how you will show it is done. Do this again every time a new task section appears.
Then ask whether they agree before you start. If they want something different, write it as a `## Question from Agent B` section instead of changing the task yourself.

## Working rules

- **Branches:** Agent A works on `main` or `agent-a/<topic>`. Agent B works only on `agent-b/<topic>` branches created from `origin/main`. Only Agent A merges into `main`, and only with the owner's agreement. Never force-push.
- **Tasks:** Agent A writes each task for Agent B as a section `## Task for Agent B: <title>` with the date, files, steps and what done looks like. Agent B answers with a Change log line when it starts, when it is stuck and when it is done. Questions for Agent A go into a section `## Question from Agent B: <title>`.
- **Change log:** every change gets one line at the end of this file: real clock time from `TZ=Asia/Bangkok date "+%Y-%m-%d %H:%M +07"`, then `[Agent A]` or `[Agent B]`, then what changed, how it was checked, and what is still open.
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

## Change log

- 2026-10-23 13:45 +07 [Agent A] Moved the repository to `nippich321/suumtrip` (public, GitHub Pages from `main`). README rewritten in formal English. Created this file with the roles of Agent A (owner's AI, lead) and Agent B (friend's AI) and the rule to check this file at the start of every task. Open work list above comes from a local click-through; nothing in the site code was changed.
- 2026-10-23 14:02 +07 [Agent A] Added the task section for Agent B (near-hotel places and opening hours, branch `agent-b/near-hotel`). Committed `tools/raw/` (Overpass responses and OSRM route cache, 1.1 MB) and removed it from `.gitignore` so both agents build from the same input. Agent A now takes Open work items 1, 3 and 5 in `js/itinerary.js` and `js/app.js`. No site code changed in this commit.
- 2026-10-23 14:04 +07 [Agent A] Added the rule that Agent B first explains the project and each task to its own user in Thai and asks for agreement before starting.
- 2026-10-23 15:13 +07 [Agent A] Added loading scenes (`js/loader.js`, `img/loader/`): a car with a golden retriever drives past a scrolling background that matches the trip category (nature / old town / beach). Shown on first load and over the map until it has drawn (min 1.6 s, max 7 s). Art generated with Higgsfield (Nano Banana 2); the car is split into layers and animated into a 12-frame sprite by `tools/animate_car.py` (OpenCV, no hand drawing). Deploy workflow and `tools/package.py` now copy `img/`. Checked locally: Sea and Old Town trips with public transport, loader shown then removed, no new console errors. Open: tuk-tuk, bus and walking versions are not made yet (all transports show the car); not tested on a real phone.
- 2026-10-23 15:17 +07 [Agent A] Loading scene now plays in order: the background fades in once its image has loaded, the car drives in from the left (about 1.2 s, small overshoot), then the text appears. First visit in a tab keeps the scene for at least 2.6 s; the overlay on the map stays at least 2.6 s. Checked locally by sampling the animation (scene opacity, car position, text opacity) and by timing a fresh first visit (home shown at 3.2 s); no new console errors. Not tested on a real phone.
