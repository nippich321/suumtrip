"""Builds the mystery box (assets/3d/gifts/giftbox.glb) in Blender, as the owner asked.

A coral box with rounded edges, a separate lid (node "lid", so js/giftbox3d.js can pop it
off) and a gold ribbon with a bow, in the site's own colours. Plain materials, no image
texture, so it stays sharp at any size.

Run with Blender 5.2:
  blender --background --python tools/build_giftbox.py -- [render.png]
The optional PNG is a preview render.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "3d" / "gifts" / "giftbox.glb"
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

CORAL = "#ff6b4a"   # --coral in css/style.css
INSIDE = "#c9432b"  # the inside of the box, a darker coral (--coral-dark is #d94a2b)
GOLD = "#ffb020"    # --sun
BASE_H = 0.72       # box height (Blender Z is up)
LID_H = 0.2
LID_OVER = 0.04     # the lid is this much wider than the box on each side
RIBBON_W = 0.16


def linear(hex_colour):
    """sRGB hex to the linear RGBA Blender expects."""
    c = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


def material(name, colour, rough):
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = linear(colour)
    bsdf.inputs["Roughness"].default_value = rough
    return m


def block(name, size, at, mat, bevel=0.03, parent=None):
    """A box of size (x, y, z) whose bottom centre is at `at`, with rounded edges."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(at[0], at[1], at[2] + size[2] / 2))
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    mod = o.modifiers.new("bevel", "BEVEL")
    mod.width = bevel
    mod.segments = 4
    o.data.materials.append(mat)
    smooth(o)
    if parent:
        keep(o, parent)
    return o


def open_box(name, size, mats):
    """The box without its top: walls and a floor, open at the top, inside in the second material."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, size[2] / 2))
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.9], context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    for m in mats:
        o.data.materials.append(m)
    wall = o.modifiers.new("walls", "SOLIDIFY")
    wall.thickness = 0.045
    wall.offset = -1
    wall.material_offset = 1
    wall.material_offset_rim = 0
    bevel = o.modifiers.new("bevel", "BEVEL")
    bevel.width = 0.02
    bevel.segments = 3
    smooth(o)
    return o


def smooth(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))


def keep(child, parent):
    """Parent without moving the child."""
    m = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = m


def ribbon_curve(name, points, at, rot, width, mat, parent, cyclic=True):
    """A flat ribbon along a Bezier path in the curve's XY plane: points are
    (co, handle_left, handle_right) in that plane; the ribbon is `width` wide across it."""
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.extrude = width / 2          # the ribbon's width (across the path)
    data.bevel_depth = 0.011          # its thickness, with soft edges
    data.bevel_resolution = 2
    data.resolution_u = 24
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, (co, hl, hr) in zip(spline.bezier_points, points):
        bp.co, bp.handle_left, bp.handle_right = (*co, 0), (*hl, 0), (*hr, 0)
        bp.handle_left_type = bp.handle_right_type = "FREE"
    spline.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    o.location, o.rotation_euler = at, rot
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.object
    o.data.materials.append(mat)
    smooth(o)
    keep(o, parent)
    return o


def bow(top, mat, lid):
    """A tied bow: two teardrop loops pinched at the knot, a wrapped knot and two tails with
    a V cut, all in flat ribbon."""
    # one loop in its own plane: x outwards from the knot, y up; pinched at the knot (0, 0)
    k = 1.3  # loop size
    teardrop = [((0, 0), (0.13 * k, -0.05 * k), (0.08 * k, 0.15 * k)),
                ((0.34 * k, 0.13 * k), (0.34 * k, 0.27 * k), (0.34 * k, -0.01 * k))]
    for side in (-1, 1):
        # stand the loop up across the box, leaning back a little so it reads in 3D
        ribbon_curve(f"bow-loop-{'l' if side < 0 else 'r'}", teardrop, (0, 0.02, top + 0.05),
                     (math.radians(72), 0, 0 if side > 0 else math.pi), 0.16, mat, lid)
    # the knot: a soft block where the loops meet
    knot = block("bow-knot", (0.15, 0.17, 0.11), (0, 0.01, top - 0.005), mat, bevel=0.045, parent=lid)
    # two tails lying on the lid towards the front, splayed in a V
    for side in (-1, 1):
        tail = [((0, 0), (-0.04, 0.0), (0.06, 0.0)), ((0.2, -0.03), (0.14, -0.01), (0.26, -0.05)),
                ((0.34, -0.1), (0.31, -0.08), (0.37, -0.12))]
        ribbon_curve(f"bow-tail-{'l' if side < 0 else 'r'}", tail, (0, 0, top + 0.012),
                     (0, 0, math.radians(-62 if side > 0 else -118)), 0.12, mat, lid, cyclic=False)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    box_mat = material("box", CORAL, 0.42)
    ribbon_mat = material("ribbon", GOLD, 0.3)

    inside_mat = material("inside", INSIDE, 0.7)
    base = open_box("giftbox", (1, 1, BASE_H), [box_mat, inside_mat])
    # the ribbon down the middle of each outside wall (the inside stays clear when the lid is off)
    for i, (x, y, sx, sy) in enumerate(((0.503, 0, 0.012, RIBBON_W), (-0.503, 0, 0.012, RIBBON_W),
                                        (0, 0.503, RIBBON_W, 0.012), (0, -0.503, RIBBON_W, 0.012))):
        block(f"ribbon-{i}", (sx, sy, BASE_H - 0.01), (x, y, 0.005), ribbon_mat, bevel=0.004, parent=base)

    lid_z = BASE_H - 0.06
    lid_w = 1 + 2 * LID_OVER
    lid = block("lid", (lid_w, lid_w, LID_H), (0, 0, lid_z), box_mat, bevel=0.035, parent=base)
    block("lid-ribbon-x", (lid_w + 0.012, RIBBON_W, LID_H + 0.008), (0, 0, lid_z - 0.004), ribbon_mat, bevel=0.01, parent=lid)
    block("lid-ribbon-y", (RIBBON_W, lid_w + 0.012, LID_H + 0.008), (0, 0, lid_z - 0.004), ribbon_mat, bevel=0.01, parent=lid)

    top = lid_z + LID_H
    bow(top, ribbon_mat, lid)

    # the lid turns about its own centre when it pops off
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.scene.cursor.location = (0, 0, lid_z)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT), export_format="GLB", export_apply=True, export_yup=True)
    print("wrote", OUT)

    if argv:
        scene = bpy.context.scene
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_x, scene.render.resolution_y = 900, 900
        world = bpy.data.worlds.new("w")
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs[0].default_value = linear("#fff7f0")
        scene.world = world
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        sun.data.energy = 3
        sun.rotation_euler = (math.radians(45), math.radians(10), math.radians(30))
        scene.collection.objects.link(sun)
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        cam.data.lens = 60
        scene.collection.objects.link(cam)
        scene.camera = cam
        cam.location = (2.6, -3.2, 2.5)
        target = (0, 0, 0.5)
        d = [target[i] - cam.location[i] for i in range(3)]
        cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
        scene.render.filepath = str(Path(argv[0]).resolve())
        bpy.ops.render.render(write_still=True)
        print("rendered", scene.render.filepath)


main()
