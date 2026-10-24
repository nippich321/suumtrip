"""Records every scene of the demo video (docs/VIDEO_SCRIPT.md) as frame sequences.

Needs the site served on http://localhost:5173 (python -m http.server 5173 --directory .).
Usage: python tools/video/shoot.py <out_dir> [scene ...]
Scenes: chat home booking trip money gift ota end. Then tools/video/edit.py builds the video.
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rec import Recorder, browser  # noqa: E402

SITE = "http://localhost:5173/"
SLIDES = SITE + "tools/video/slides.html"

# a soft dot that moves to what is clicked (a recording has no mouse pointer)
CURSOR_JS = """
(() => {
  if (document.getElementById('vcur')) return;
  const c = document.createElement('div');
  c.id = 'vcur';
  c.style.cssText = 'position:fixed;left:960px;top:700px;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;'
    + 'background:rgba(34,28,51,.28);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:99999;pointer-events:none;'
    + 'transition:left .55s cubic-bezier(.4,0,.2,1),top .55s cubic-bezier(.4,0,.2,1),transform .15s';
  document.body.appendChild(c);
})()
"""


async def point(page, selector, click=True, pause=350):
    await page.evaluate(CURSOR_JS)
    box = await page.locator(selector).first.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    await page.evaluate(f"(() => {{ const c = document.getElementById('vcur'); c.style.left = '{x}px'; c.style.top = '{y}px'; }})()")
    await page.wait_for_timeout(600)
    if click:
        await page.evaluate("(() => { const c = document.getElementById('vcur'); c.style.transform = 'scale(.75)'; setTimeout(() => c.style.transform = '', 160); })()")
        await page.locator(selector).first.click()
    await page.wait_for_timeout(pause)


async def scene(page, out, name, body):
    rec = Recorder(page, Path(out) / name)
    await rec.start()
    await body()
    n, t = await rec.stop()
    print(f"{name}: {n} frames, {t:.1f} s", flush=True)


async def main(out, only):
    async with async_playwright() as p:
        b, ctx = await browser(p)
        page = await ctx.new_page()
        want = lambda s: not only or s in only  # noqa: E731

        if want("chat"):
            await page.goto(SLIDES + "#chat")
            await page.wait_for_timeout(1500)
            await page.reload()
            await scene(page, out, "chat", lambda: page.wait_for_timeout(13000))

        if want("home") or want("booking") or want("trip"):
            await page.goto(SITE + "#home")
            await page.wait_for_timeout(9000)  # the first-visit loading scene plays and leaves

        if want("home"):
            async def home():
                await page.wait_for_timeout(5000)
                await point(page, ".hero .btn-primary", click=False, pause=4000)
            await scene(page, out, "home", home)

        if want("booking") or want("trip"):
            async def booking():
                await point(page, ".hero .btn-primary", pause=1500)
                await point(page, '[data-cat="old"]', pause=1400)
                await point(page, "#bksum .bk-cta", pause=2200)            # dates
                await point(page, "#bksum .bk-cta", pause=900)              # transport
                await point(page, '[data-tr="pub"]', pause=1200)
                await point(page, "#bksum .bk-cta", pause=900)              # travellers
                await point(page, '[data-step="kids:1"]', pause=700)
                await point(page, '[data-step="kids:-1"]', pause=700)
                await point(page, "#bksum .bk-cta", pause=1200)             # destinations
                await point(page, '[data-veto="amphawa"]', pause=1500)
                await point(page, "#bksum .bk-cta", pause=2000)             # payment
                await point(page, '#bksum [data-act="paid"]', pause=600)
            await scene(page, out, "booking", booking)

            async def trip():
                await page.wait_for_timeout(800)
                await point(page, "#the-box", pause=4200)                   # roulette, lid pops
                await point(page, ".reveal .btn-primary", pause=200)
                await page.wait_for_timeout(9000)                           # loading scene, map draws
            await scene(page, out, "trip", trip)
            # play once unrecorded so the zoomed-out map tiles are cached, then go back to the start
            await page.click("#playbtn")
            await page.wait_for_timeout(11000)
            await page.click("#playbtn")
            await page.locator("#tl .stop").first.click()
            await page.wait_for_timeout(2500)

            async def train():
                await point(page, "#playbtn", pause=11500)                  # the train runs on its rails
            await scene(page, out, "train", train)

        if want("money"):
            await page.goto(SLIDES + "#money")
            await page.wait_for_timeout(1500)
            await page.reload()
            await scene(page, out, "money", lambda: page.wait_for_timeout(20500))

        if want("gift"):
            await page.goto(SITE + "#gift")
            await page.wait_for_timeout(2500)

            async def gift():
                await page.wait_for_timeout(1200)
                await point(page, 'input[name="qty"]', click=False, pause=2500)
                await page.goto(SITE + "#partner")
                await page.wait_for_timeout(2500)
                await point(page, ".list", click=False, pause=5500)
            await scene(page, out, "gift", gift)

        if want("ota"):
            await page.goto(SLIDES + "#ota")
            await page.wait_for_timeout(1500)
            await page.reload()
            await scene(page, out, "ota", lambda: page.wait_for_timeout(12500))

        if want("end"):
            await page.goto(SLIDES + "#end")
            await page.wait_for_timeout(1500)
            await page.reload()
            await scene(page, out, "end", lambda: page.wait_for_timeout(8500))

        await b.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], set(sys.argv[2:])))
