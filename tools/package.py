"""Copy only the files the website needs into dist/ for uploading.

Usage: python -I tools/package.py
"""
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir()
shutil.copy2(ROOT / "index.html", DIST / "index.html")
for folder in ("css", "js", "data"):
    shutil.copytree(ROOT / folder, DIST / folder)
size = sum(p.stat().st_size for p in DIST.rglob("*") if p.is_file())
print(f"dist/ ready: {size // 1024} KB")
