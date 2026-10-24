"""Screen recorder for the demo video: drives Microsoft Edge with Playwright and saves every
painted frame (Chrome DevTools screencast, JPEG) with its timestamp, so the clip keeps the
page's real timing at full 1920x1080 quality.

Used by tools/video/shoot.py. Frames go to <out>/NNNNN.jpg plus <out>/frames.txt
(name and seconds since the start).
"""
import asyncio
import base64
import time
from pathlib import Path

from playwright.async_api import async_playwright

W, H = 1920, 1080


class Recorder:
    def __init__(self, page, out):
        self.page, self.out = page, Path(out)
        self.out.mkdir(parents=True, exist_ok=True)
        self.frames, self.t0, self.cdp = [], None, None

    async def start(self):
        self.cdp = await self.page.context.new_cdp_session(self.page)
        self.cdp.on("Page.screencastFrame", self._frame)
        self.t0 = time.perf_counter()
        await self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})

    def _frame(self, ev):
        name = f"{len(self.frames):05d}.jpg"
        (self.out / name).write_bytes(base64.b64decode(ev["data"]))
        self.frames.append((name, time.perf_counter() - self.t0))
        asyncio.ensure_future(self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]}))

    async def stop(self):
        await self.cdp.send("Page.stopScreencast")
        end = time.perf_counter() - self.t0
        with (self.out / "frames.txt").open("w", encoding="utf-8") as f:
            for name, t in self.frames:
                f.write(f"{name} {t:.4f}\n")
            f.write(f"END {end:.4f}\n")
        return len(self.frames), end


async def browser(p, headless=True):
    b = await p.chromium.launch(channel="msedge", headless=headless, args=[
        "--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-webgl",
        "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"])
    ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, locale="th-TH")
    return b, ctx
