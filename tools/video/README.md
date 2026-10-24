# Demo video (2 minutes, silent; the voice-over is recorded separately)

1. Serve the site: `python -m http.server 5173 --directory .`
2. Record the scenes (the trip and train scenes run the page at 1/10 speed, `SLOW` in shoot.py, and clips.py speeds them back up, so the WebGL scenes play at a full 30 fps) from the live pages (Microsoft Edge via Playwright, every painted frame):
   `python tools/video/shoot.py <shots_dir>` (scenes: chat home booking trip train money gift ota end;
   the slides are `tools/video/slides.html`).
3. Turn each scene's frames into a 30 fps clip (see the commands in docs/HANDOFF.md) and copy them to
   `tools/video/hf/assets/<scene>.mp4`; also copy `img/logo/logo-512.png` and `img/loader/*.svg` there, the Mitr/Anuphan woff2 files from @fontsource 5.1.0 into `assets/fonts/` (names as in the `@font-face` rules), and make `assets/qr.svg` with `node tools/video/qr.mjs`.
4. Compose and render with HyperFrames: `cd tools/video/hf && npx hyperframes@0.8.192 render -o ../../../video/suumtrip-demo-v4-silent.mp4`.
   Timing, wipes and animations are in `tools/video/hf/index.html` (v3: the booking is rebuilt in `compositions/booking.html` from the site's own steps, 0:54 to the end in `compositions/story.html` (also needs `assets/map-end.jpg`, a 1080x1080 crop of the last train frame); footage videos must be top-level or inside untimed wrappers, never inside a timed section); the script is docs/VIDEO_SCRIPT.md.
