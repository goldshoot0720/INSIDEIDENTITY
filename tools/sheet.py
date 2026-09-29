"""Debug helper: render a cutout on a dark checker with a labelled grid (optionally a crop).

python3 tools/sheet.py N [x0 y0 x1 y1 step] -> build/sheet.png
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
n = int(sys.argv[1])
x0, y0, x1, y1, step = (map(int, sys.argv[2:7]) if len(sys.argv) > 2 else (0, 0, 1024, 1536, 64))
im = Image.open(os.path.join(ROOT, "build", f"cut_{n}.png")).crop((x0, y0, x1, y1))
bg = Image.new("RGBA", im.size, (40, 90, 40, 255))
bg.alpha_composite(im)
scale = min(1.0, 1400 / max(im.size)) if len(sys.argv) <= 2 else max(1.0, 900 / max(im.size))
bg = bg.resize((int(im.width * scale), int(im.height * scale)), Image.NEAREST)
d = ImageDraw.Draw(bg)
for gx in range((x0 // step) * step, x1 + 1, step):
    if gx < x0:
        continue
    X = (gx - x0) * scale
    d.line([(X, 0), (X, bg.height)], fill=(255, 0, 0, 160))
    d.text((X + 2, 2), str(gx), fill=(255, 255, 0, 255))
for gy in range((y0 // step) * step, y1 + 1, step):
    if gy < y0:
        continue
    Y = (gy - y0) * scale
    d.line([(0, Y), (bg.width, Y)], fill=(255, 0, 0, 160))
    d.text((2, Y + 2), str(gy), fill=(0, 255, 255, 255))
bg.save(os.path.join(ROOT, "build", "sheet.png"))
