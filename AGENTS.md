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

## Change log

- 2026-10-23 13:45 +07 [Agent A] Moved the repository to `nippich321/suumtrip` (public, GitHub Pages from `main`). README rewritten in formal English. Created this file with the roles of Agent A (owner's AI, lead) and Agent B (friend's AI) and the rule to check this file at the start of every task. Open work list above comes from a local click-through; nothing in the site code was changed.
