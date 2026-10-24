"""Turns each recorded scene (frames + timestamps from shoot.py) into a constant 30 fps clip.

Usage: python tools/video/clips.py <shots_dir> <out_dir>   (then copy the clips to tools/video/hf/assets/)
"""
import pathlib
import subprocess
import sys

root, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
for d in sorted(p for p in root.iterdir() if (p / "frames.txt").exists()):
    lines = [line.split() for line in (d / "frames.txt").read_text().splitlines()]
    frames = [(n, float(t)) for n, t in lines if n != "END"]
    end = float(lines[-1][1])
    lst = d / "concat.txt"
    with lst.open("w") as f:
        for i, (n, t) in enumerate(frames):
            nxt = frames[i + 1][1] if i + 1 < len(frames) else end
            f.write(f"file '{n}'\nduration {max(nxt - t, 0.001):.4f}\n")
        f.write(f"file '{frames[-1][0]}'\n")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "17", "-preset", "medium",
                    str(out / f"{d.name}.mp4")], check=True)
    print(d.name, f"{end:.1f} s")
