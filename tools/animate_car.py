"""Turn the generated car + golden retriever picture into a looping sprite sheet.

The picture is split into layers with image processing only (no drawing):
the car body, the two wheels and the dog's head. The area behind the head is
filled with OpenCV inpainting. Each frame then gently moves the layers:
the body bounces, the head nods, ears and fur ripple in the wind and the tongue sways.

Usage: python tools/animate_car.py <car.png> <out.webp> [frames] [width]
"""
import math
import sys
from collections import deque

import cv2
import numpy as np

src, out = sys.argv[1], sys.argv[2]
FRAMES = int(sys.argv[3]) if len(sys.argv) > 3 else 12
WIDTH = int(sys.argv[4]) if len(sys.argv) > 4 else 520

bgr = cv2.imread(src)
H, W = bgr.shape[:2]
rgb = bgr[:, :, ::-1].astype(np.int32)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]

# 1. background -> transparent (flood fill from the borders over the flat backdrop colour)
bg = rgb[5, 5]
near_bg = (np.abs(rgb - bg).sum(axis=2) <= 22).astype(np.uint8)
alpha = np.full((H, W), 255, np.uint8)
seen = np.zeros((H, W), bool)
q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] +
          [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
while q:
    x, y = q.popleft()
    if seen[y, x]:
        continue
    seen[y, x] = True
    if not near_bg[y, x]:
        continue
    alpha[y, x] = 0
    if x > 0: q.append((x - 1, y))
    if x < W - 1: q.append((x + 1, y))
    if y > 0: q.append((x, y - 1))
    if y < H - 1: q.append((x, y + 1))
alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
rgba = np.dstack([bgr, alpha])

# 2. wheels: the two large dark tyre blobs in the lower half
dark = ((R < 90) & (G < 90) & (B < 100)).astype(np.uint8)
dark[: H // 2] = 0
n, lab, stats, cents = cv2.connectedComponentsWithStats(dark)
tyres = sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:2]
wheel_mask = np.zeros((H, W), np.uint8)
for i in tyres:
    x, y, w, h = stats[i, :4]
    cx, cy, r = x + w / 2, y + h / 2, max(w, h) / 2
    cv2.circle(wheel_mask, (round(cx), round(cy)), round(r + 2), 255, -1)
    print(f"wheel at ({cx:.0f},{cy:.0f}) r={r:.0f}")

# 3. dog head: golden / cream / pink fur pixels inside the window area, plus the
#    dark eyes, nose and mouth enclosed by them
box = (600, 255, 840, 400)  # x0, y0, x1, y1 around the head (above the paws), full-res coords
x0, y0, x1, y1 = box
fur = ((R > 200) & (G > 140) & (B < 185) & (R - B > 55)).astype(np.uint8) * 255
head = np.zeros((H, W), np.uint8)
head[y0:y1, x0:x1] = fur[y0:y1, x0:x1]
head = cv2.morphologyEx(head, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
n, lab, stats, _ = cv2.connectedComponentsWithStats(head)
biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
head = np.where(lab == biggest, 255, 0).astype(np.uint8)
cnts, _ = cv2.findContours(head, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
head = cv2.drawContours(np.zeros_like(head), cnts, -1, 255, -1)  # fill holes (eyes, nose, mouth)
# fade the head layer out towards the neck so it blends into the chest that stays put
fade = np.clip((y1 - np.arange(H)) / 30.0, 0, 1)[:, None]
head_alpha = (head.astype(np.float32) / 255 * fade)
tongue = ((R > 230) & (G < 175) & (B > 100) & (B < 175) & (head > 0)).astype(np.float32)
ty = np.where(tongue.any(axis=1))[0]
tongue_top, tongue_bottom = (ty.min(), ty.max()) if len(ty) else (0, 1)
tongue_soft = cv2.GaussianBlur(tongue, (0, 0), 6)
tongue_soft /= max(tongue_soft.max(), 1e-6)

# base layer: remove the head and inpaint what was behind it (window, frame, body)
hole = cv2.dilate((head_alpha > 0.5).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
base_bgr = cv2.inpaint(bgr, hole, 9, cv2.INPAINT_TELEA)
base = np.dstack([base_bgr, alpha])
base[wheel_mask > 0, 3] = 0
wheels = rgba.copy()
wheels[wheel_mask == 0, 3] = 0
head_rgba = rgba.astype(np.float32)
head_rgba[..., 3] = head_alpha * 255

# crop to the visible car (+ margin so the bounce and head never clip)
ys, xs = np.where(alpha > 0)
m = 14
cx0, cy0, cx1, cy1 = max(xs.min() - m, 0), max(ys.min() - m, 0), min(xs.max() + m, W), min(ys.max() + m, H)
scale = WIDTH / (cx1 - cx0)
fh = round((cy1 - cy0) * scale)

face_x = 790     # the face stays still, fur behind it ripples
span = 170
pivot = (720, 395)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
behind = np.clip((face_x - xx) / span, 0, 1) ** 1.4


def over(dst, src):
    a = src[..., 3:4] / 255.0
    dst[..., :3] = src[..., :3] * a + dst[..., :3] * (1 - a)
    dst[..., 3:4] = np.maximum(dst[..., 3:4], src[..., 3:4])
    return dst


sheet = np.zeros((fh, WIDTH * FRAMES, 4), np.uint8)
for f in range(FRAMES):
    t = f / FRAMES
    # head: wind ripple on the fur behind the face + tongue sway, then a small nod
    dx = 4.0 * behind * np.sin(2 * math.pi * (yy / 22.0 - t))
    dy = 1.6 * behind * np.cos(2 * math.pi * (xx / 30.0 - t))
    tl = np.clip((yy - tongue_top) / max(tongue_bottom - tongue_top, 1), 0, 1)
    dx += tongue_soft * tl * 5.0 * np.sin(2 * math.pi * 2 * t)
    warped = cv2.remap(head_rgba, xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    ang = 2.5 * math.sin(2 * math.pi * t)
    rot = cv2.getRotationMatrix2D(pivot, ang, 1.0)
    warped = cv2.warpAffine(warped, rot, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))

    bounce = -2.5 * (0.5 - 0.5 * math.cos(2 * math.pi * 2 * t))  # body up/down twice per loop
    shift = np.float32([[1, 0, 0], [0, 1, bounce]])
    body = cv2.warpAffine(base.astype(np.float32), shift, (W, H), borderValue=(0, 0, 0, 0))
    headf = cv2.warpAffine(warped, shift, (W, H), borderValue=(0, 0, 0, 0))

    frame = np.zeros((H, W, 4), np.float32)
    over(frame, body)
    over(frame, headf)
    over(frame, wheels.astype(np.float32))
    crop = frame[cy0:cy1, cx0:cx1]
    small = cv2.resize(crop, (WIDTH, fh), interpolation=cv2.INTER_AREA)
    sheet[:, f * WIDTH:(f + 1) * WIDTH] = np.clip(small, 0, 255).astype(np.uint8)

cv2.imwrite(out, sheet, [cv2.IMWRITE_WEBP_QUALITY, 88])
cv2.imwrite(out.rsplit('.', 1)[0] + '-frame0.png', sheet[:, :WIDTH])
print(f"{out}: {FRAMES} frames of {WIDTH}x{fh}")
