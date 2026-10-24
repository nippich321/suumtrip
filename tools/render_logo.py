"""Renders the site logo from the 3D gift box (assets/3d/gifts/giftbox.glb, tools/build_giftbox.py).

Run with Blender 5.2:
  blender --background --python tools/render_logo.py
Writes img/logo/logo-512.png (transparent) and img/logo/favicon-64.png.
"""
import math
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "assets" / "3d" / "gifts" / "giftbox.glb"
OUT = ROOT / "img" / "logo"


def render(path, size):
    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(MODEL))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"  # keep the brand colours as they are
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 2.2
    sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(25))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.9
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = (2.4, -2.4, 2.25)
    target = (0, 0, 0.5)
    d = [target[i] - cam.location[i] for i in range(3)]
    cam.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0, math.atan2(d[1], d[0]) - math.pi / 2)
    OUT.mkdir(parents=True, exist_ok=True)
    render(OUT / "logo-512.png", 512)
    render(OUT / "favicon-64.png", 64)


main()
