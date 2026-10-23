"""Builds the coach (รถทัวร์) model assets/3d/cars/bus.glb from Kenney's CC0 van.

Nothing is drawn by hand: the van's own body, wheels and colormap are reused. The body
is stretched where the van has no vertices (between the front doors and the back
doors) so the doors, lights and window frames keep their shape, the roof is raised
for a taller coach, the van's own door window is repeated along both sides as the
coach's window row, and the back axle moves with the back and is doubled, as on the
three-axle coaches that run out of Bangkok.

Run with Blender 5.2:
  blender --background --python tools/build_bus.py -- [render.png]
The optional PNG is a preview render for the owner.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
VAN = ROOT / "assets" / "3d" / "cars" / "van.glb"
OUT = ROOT / "assets" / "3d" / "cars" / "bus.glb"

# Blender axes after the glTF import: -Y is the front, Z is up (body-local units).
STRETCH = 3.0     # extra length, added behind the gap at body y = 0.2
CUT_Y = 0.2
RAISE = 0.35      # extra height, added above the window band (body z = 0.85)
CUT_Z = 0.85
AXLE_GAP = 0.62   # distance between the two back axles
WINDOW_Y = (-0.66, -0.08)  # the door window (glass and frame) on each side
WINDOW_PANE = 0.46
WINDOW_GAP = 0.1

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(VAN))
obj = {o.name: o for o in bpy.data.objects}
body = obj["body"]

for v in body.data.vertices:
    if v.co.y > CUT_Y:
        v.co.y += STRETCH
    if v.co.z > CUT_Z:
        v.co.z += RAISE
body.data.update()


def bright(bm, face, uv, img):
    """The colormap colour under a face is near white: glass."""
    u = sum(l[uv].uv.x for l in face.loops) / len(face.loops)
    v = sum(l[uv].uv.y for l in face.loops) / len(face.loops)
    w, h = img.size
    i = (min(h - 1, int(v % 1 * h)) * w + min(w - 1, int(u % 1 * w))) * 4
    return sum(img.pixels[i:i + 3]) > 2.4


# Repeat the door window along the stretched side: a pane per seat row with the door
# glass's own colormap colour, pressed onto the side panel just outside it.
img = next(n.image for m in body.data.materials for n in m.node_tree.nodes if n.type == "TEX_IMAGE")
bm = bmesh.new()
bm.from_mesh(body.data)
uv = bm.loops.layers.uv.active
tree = BVHTree.FromBMesh(bm)
glass = [f for f in bm.faces if abs(f.normal.x) > 0.8 and WINDOW_Y[0] < f.calc_center_median().y < WINDOW_Y[1]
         and bright(bm, f, uv, img)]
glass_uv = glass[0].loops[0][uv].uv.copy()
z0 = min(v.co.z for f in glass for v in f.verts) + 0.03
z1 = max(v.co.z for f in glass for v in f.verts) - 0.03
side_end = max(v.co.y for v in bm.verts) - 0.55
n = 0
y = WINDOW_Y[1] + 0.1
while y + WINDOW_PANE < side_end:
    for side in (1, -1):
        corners = [(y, z0), (y + WINDOW_PANE, z0), (y + WINDOW_PANE, z1), (y, z1)]
        if side < 0:
            corners.reverse()  # face outwards on both sides
        verts = []
        for cy, cz in corners:
            hit = tree.ray_cast(Vector((side * 3, cy, cz)), Vector((-side, 0, 0)))[0]
            verts.append(bm.verts.new((hit.x + side * 0.006, cy, cz)))
        face = bm.faces.new(verts)
        face.material_index = glass[0].material_index
        face.smooth = False
        for loop in face.loops:
            loop[uv].uv = glass_uv
    y += WINDOW_PANE + WINDOW_GAP
    n += 1
bm.normal_update()
bm.to_mesh(body.data)
bm.free()
print("windows per side:", n)

for side in ("left", "right"):
    back = obj[f"wheel-back-{side}"]
    back.location.y += STRETCH
    extra = back.copy()
    extra.data = back.data
    extra.name = f"wheel-mid-{side}"
    extra.location.y -= AXLE_GAP
    bpy.context.collection.objects.link(extra)

bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", use_selection=False,
                          export_yup=True)  # the 12 KB colormap is embedded
print("wrote", OUT)

if argv:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1200, 700
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.95, 0.92, 0.87, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    scene.collection.objects.link(cam)
    scene.camera = cam
    centre = (0, 1.3, 0.8)
    cam.location = (7.5, -6.0, 4.2)
    d = [centre[i] - cam.location[i] for i in range(3)]
    cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
    scene.render.filepath = str(Path(argv[0]).resolve())
    bpy.ops.render.render(write_still=True)
    print("rendered", scene.render.filepath)
