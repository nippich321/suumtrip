"""Build the vector (SVG) art for the loading scene from the Higgsfield pictures.

Detailed parts (trees, buildings, beach, car body, dog) are traced to vector
paths with vtracer, so they keep the original look but stay sharp at any size.
Simple parts are drawn here directly: the wheels (with hubcap bolts so the spin
shows), and in the page itself the sky, sun, road and dashes (css/style.css).

The car is split into layers first: body, dog head (the area behind it is
filled with OpenCV inpainting) and wheels, so each part can move on its own.

Usage: python tools/loader_art.py   (reads tools/art/*.png, writes img/loader/*.svg)
Needs: pip install opencv-python-headless numpy vtracer
"""
import os
import pathlib
import re
import tempfile

import cv2
import numpy as np
import vtracer

ROOT = pathlib.Path(__file__).resolve().parent.parent
ART = ROOT / "tools" / "art"
OUT = ROOT / "img" / "loader"
SCENE_H = 672       # all scene pictures are 1584 x 672
ROAD_TOP = 540      # the road below this line is drawn in CSS
TRACE = dict(colormode="color", hierarchical="stacked", mode="spline", filter_speckle=6,
             color_precision=6, layer_difference=18, corner_threshold=60, length_threshold=4.0,
             max_iterations=10, splice_threshold=45, path_precision=1)


def trace(rgba, **opts):
    """Trace an RGBA image (transparent pixels are skipped) and return the <path> elements."""
    fd, png = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    svg = png[:-4] + ".svg"
    cv2.imwrite(png, rgba)
    vtracer.convert_image_to_svg_py(png, svg, **{**TRACE, **opts})
    text = pathlib.Path(svg).read_text(encoding="utf-8")
    os.remove(png)
    os.remove(svg)
    return "\n".join(re.findall(r"<path [^>]*/>", text))


def flood_transparent(bgr, seeds, tol):
    """Make the flat colour region reachable from the seed points transparent."""
    h, w = bgr.shape[:2]
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for x, y in seeds:
        if not mask[y + 1, x + 1]:
            cv2.floodFill(bgr.copy(), mask, (x, y), 0, (tol,) * 3, (tol,) * 3,
                          cv2.FLOODFILL_FIXED_RANGE | cv2.FLOODFILL_MASK_ONLY | (255 << 8))
    alpha = np.where(mask[1:-1, 1:-1] > 0, 0, 255).astype(np.uint8)
    return np.dstack([bgr, alpha])


def loop_svg(paths, width, height, name):
    """One loop = the tile plus its mirror image, so it repeats without a seam."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'viewBox="0 0 {width * 2} {height}"><title>{name}</title>'
            f'<defs><g id="t">{paths}</g></defs>'
            f'<use href="#t" xlink:href="#t"/><use href="#t" xlink:href="#t" transform="matrix(-1 0 0 1 {width * 2} 0)"/></svg>')


def scene(src, name):
    bgr = cv2.imread(str(src))
    h, w = bgr.shape[:2]
    rgba = flood_transparent(bgr, [(x, 3) for x in range(0, w, 40)], 14)
    rgb = bgr[:, :, ::-1].astype(int)
    # clouds and sun are separate layers: clear them from the scene
    white = (rgb.min(axis=2) > 236) & (np.arange(h)[:, None] < 250)
    rgba[white, 3] = 0
    yellow = (rgb[..., 0] > 240) & (rgb[..., 1] > 200) & (rgb[..., 2] < 200) & (np.arange(h)[:, None] < 200)
    if yellow.sum() > 2000:
        ys, xs = np.nonzero(yellow)
        cv2.circle(rgba, (int(xs.mean()), int(ys.mean())), 72, (0, 0, 0, 0), -1)
    # the scene only needs to reach the road; a slightly deeper strip hides the join
    rgba[ROAD_TOP + 4:, :, 3] = 0
    rgba[:, :, 3] = cv2.erode(rgba[:, :, 3], np.ones((2, 2), np.uint8))
    paths = trace(rgba, filter_speckle=8, color_precision=5, layer_difference=24)
    (OUT / f"scene-{name}.svg").write_text(loop_svg(paths, w, h, f"scene {name}"), encoding="utf-8", newline=chr(10))
    return white


def clouds(src):
    bgr = cv2.imread(str(src))
    h, w = bgr.shape[:2]
    rgb = bgr[:, :, ::-1].astype(int)
    white = ((rgb.min(axis=2) > 236) & (np.arange(h)[:, None] < 250)).astype(np.uint8) * 255
    white = cv2.morphologyEx(white, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    rgba = np.dstack([np.full_like(bgr, 255), white])
    paths = trace(rgba, filter_speckle=30)
    paths = re.sub(r'fill="#[0-9A-Fa-f]{6}"', 'fill="#fff"', paths)
    (OUT / "clouds.svg").write_text(loop_svg(paths, w, h, "clouds"), encoding="utf-8", newline=chr(10))


def svg_file(name, viewbox, body, title):
    (OUT / name).write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}"><title>{title}</title>{body}</svg>',
        encoding="utf-8", newline="\n")


def flatten(rgba, k=26):
    """Snap the picture's soft shading to a small flat palette so the trace stays clean."""
    out = rgba.copy()
    vis = out[..., 3] > 0
    px = out[..., :3][vis].astype(np.float32)
    _, labels, centers = cv2.kmeans(px, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 0.5),
                                    2, cv2.KMEANS_PP_CENTERS)
    cv2.setRNGSeed(1)
    out[..., :3][vis] = centers[labels.ravel()].astype(np.uint8)
    return out


def trace_2x(rgba, **opts):
    """Trace at twice the size for smoother curves; the paths are scaled back down."""
    big = cv2.resize(flatten(rgba), None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
    big = cv2.medianBlur(big, 5)
    big[..., 3] = np.where(big[..., 3] > 127, 255, 0)
    return f'<g transform="scale(.5)">{trace(big, **opts)}</g>'


def car(src):
    """Car parts as separate files so the page can move each one on the GPU:
    car-body.svg (dog head removed, gap inpainted), car-head.svg (head and chest,
    clipped to the dog's outline) and car-wheel.svg (drawn here)."""
    bgr = cv2.imread(str(src))
    H, W = bgr.shape[:2]
    rgba = flood_transparent(bgr, [(2, 2), (W - 3, 2), (2, H - 3), (W - 3, H - 3)], 10)
    rgb = bgr[:, :, ::-1].astype(int)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    # wheels: the two big dark tyre blobs
    dark = ((R < 90) & (G < 90) & (B < 100)).astype(np.uint8)
    dark[: H // 2] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(dark)
    wheels = []
    for i in sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:2]:
        x, y, w, h = stats[i, :4]
        wheels.append((x + w / 2, y + h / 2, max(w, h) / 2))
    wheels.sort()
    r = wheels[0][2]

    # drop the picture's own ground shadow (the page draws a soft one) and the wheels
    yy, xx = np.mgrid[0:H, 0:W]
    near_wheel = np.zeros((H, W), bool)
    for cx, cy, _ in wheels:
        near_wheel |= (xx - cx) ** 2 + (yy - cy) ** 2 <= (r - 2) ** 2
    rgba[(yy > 589) & ~near_wheel, 3] = 0

    # dog head and chest: fur-coloured pixels in the window, holes (eyes, nose, mouth) filled
    x0, y0, x1, y1 = 600, 255, 840, 400
    fur = ((R > 200) & (G > 140) & (B < 185) & (R - B > 55)).astype(np.uint8) * 255
    head = np.zeros((H, W), np.uint8)
    head[y0:y1, x0:x1] = fur[y0:y1, x0:x1]
    head = cv2.morphologyEx(head, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(head)
    head = np.where(lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])), 255, 0).astype(np.uint8)
    head = cv2.dilate(head, np.ones((5, 5), np.uint8))
    cnts, _ = cv2.findContours(head, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    head = cv2.drawContours(np.zeros_like(head), cnts, -1, 255, -1)
    outline = cv2.approxPolyDP(max(cnts, key=cv2.contourArea), 1.2, True)[:, 0]

    # body: head removed and the gap behind it inpainted, wheels removed
    hole = cv2.dilate(head, np.ones((9, 9), np.uint8))
    body = np.dstack([cv2.inpaint(bgr, hole, 9, cv2.INPAINT_TELEA), rgba[..., 3]])
    for cx, cy, _ in wheels:
        cv2.circle(body, (round(cx), round(cy)), round(r - 3), (0, 0, 0, 0), -1)

    ys, xs = np.nonzero(rgba[..., 3])
    m = 16
    vx, vy = int(xs.min() - m), int(ys.min() - m)
    vw, vh = int(xs.max() - xs.min() + 2 * m), int(ys.max() - ys.min() + 2 * m)
    vb = f"{vx} {vy} {vw} {vh}"
    svg_file("car-body.svg", vb, trace_2x(body, filter_speckle=24, layer_difference=24), "car")

    # head: trace the untouched picture around the head, then clip it to the dog's outline
    cx0, cy0, cx1, cy1 = x0 - 30, y0 - 30, x1 + 30, y1 + 50
    crop = rgba[cy0:cy1, cx0:cx1].copy()
    pts = " ".join(f"{x},{y}" for x, y in outline)
    svg_file("car-head.svg", vb,
             f'<clipPath id="dog"><polygon points="{pts}"/></clipPath>'
             f'<g clip-path="url(#dog)"><g transform="translate({cx0} {cy0})">{trace_2x(crop, filter_speckle=12)}</g></g>', "dog")

    # wheel: drawn directly, with hubcap bolts so the spin shows
    tyre, hub, bolt = "#37373f", "#d9d7e4", "#a9a7b8"
    hr = r * 0.47
    bolts = "".join(f'<circle cx="{hr * .55 * np.cos(a):.1f}" cy="{hr * .55 * np.sin(a):.1f}" r="{r * .07:.1f}" fill="{bolt}"/>'
                    for a in np.linspace(0, 2 * np.pi, 5, endpoint=False))
    svg_file("car-wheel.svg", f"{-r:.1f} {-r:.1f} {2 * r:.1f} {2 * r:.1f}",
             f'<circle r="{r:.1f}" fill="{tyre}"/><circle r="{hr:.1f}" fill="{hub}"/>{bolts}<circle r="{r * .1:.1f}" fill="{bolt}"/>', "wheel")

    pct = lambda v, o, s: f"{(v - o) / s * 100:.2f}%"
    print("car box", vb)
    for i, (cx, cy, _) in enumerate(wheels):
        print(f"  wheel {i}: left {pct(cx - r, vx, vw)} top {pct(cy - r, vy, vh)} width {2 * r / vw * 100:.2f}%")
    print(f"  head pivot (720,395): {pct(720, vx, vw)} {pct(395, vy, vh)}; wheel bottom {pct(wheels[0][1] + r, vy, vh)}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ("nat", "old", "sea"):
        scene(ART / f"scene-{name}.png", name)
    clouds(ART / "scene-nat.png")
    car(ART / "car-dog.png")
    for f in sorted(OUT.glob("*.svg")):
        print(f"{f.name}: {f.stat().st_size // 1024} KB")
