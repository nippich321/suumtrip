# Demo video (2 minutes, silent; the voice-over is recorded separately)

1. Serve the site: `python -m http.server 5173 --directory .`
2. Record the scenes from the live pages (Microsoft Edge via Playwright, every painted frame):
   `python tools/video/shoot.py <shots_dir>` (scenes: chat home booking trip train money gift ota end;
   the slides are `tools/video/slides.html`).
3. Turn each scene's frames into a 30 fps clip (see the commands in docs/HANDOFF.md) and copy them to
   `tools/video/hf/assets/<scene>.mp4`; also copy `img/logo/logo-512.png` there.
4. Compose and render with HyperFrames: `cd tools/video/hf && npx hyperframes@0.8.192 render -o ../../../video/suumtrip-demo-v2-silent.mp4`.
   Timing, wipes and animations are in `tools/video/hf/index.html` (v2 motion cut; footage videos must be top-level or inside untimed wrappers, never inside a timed section); the script is docs/VIDEO_SCRIPT.md.
