"""Build the puppet assets from the cut-out T-pose images.

For every character this writes
  assets/cN_body.webp  - everything except the arms; the strip the arms covered is
                         filled in by vertical interpolation (hair / torso behind the sleeve)
  assets/cN_arms.webp  - only the two arms (drawn on top, rotated at shoulder / elbow)
and assets/rig.js with joint positions (source pixel coordinates, 1024x1536).

Run: python3 tools/cutout.py && python3 tools/prep.py
"""
import json
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# "l" / "r" = screen left / screen right (not the character's own left/right)
# arm: cut = x where the arm is split from the torso, cy = arm centre line,
#      bands = [(x, half_height)...] piecewise-linear from the fingertips to the shoulder
CHARS = [
    dict(
        id="whale", name="クジラ", tag="WHALE MAID", color="#3b62d6",
        neck=(508, 400), waist=600, pelvis=(502, 900), face=(478, 300), hem=1045,
        l=dict(sh=(355, 488), el=(230, 488), wr=(112, 488), tip=(15, 485),
               hip=(440, 920), knee=(430, 1150), ank=(431, 1330)),
        r=dict(sh=(665, 488), el=(790, 488), wr=(908, 488), tip=(1005, 485),
               hip=(565, 920), knee=(573, 1150), ank=(568, 1330)),
        arm=dict(cut=352, cy=488, bands=[(0, 30), (92, 30), (100, 50), (135, 50), (140, 43), (352, 43)]),
        tail=dict(root=(705, 1060), tip=(875, 760), minx=790, miny=1040),
    ),
    dict(
        id="penguin", name="ペンギン", tag="PENGUIN HOODIE", color="#f2b21b",
        neck=(512, 385), waist=650, pelvis=(510, 800), face=(505, 268), hem=860,
        l=dict(sh=(365, 455), el=(238, 452), wr=(115, 446), tip=(15, 440),
               hip=(435, 820), knee=(432, 1000), ank=(406, 1215)),
        r=dict(sh=(660, 455), el=(786, 452), wr=(909, 446), tip=(1012, 440),
               hip=(585, 820), knee=(584, 1000), ank=(607, 1215)),
        arm=dict(cut=365, cy=450, bands=[(0, 66), (110, 64), (120, 62), (300, 64), (365, 74)]),
    ),
    dict(
        id="cat", name="ネコ", tag="RED CAT", color="#d8263a",
        neck=(512, 340), waist=590, pelvis=(512, 810), face=(500, 240), hem=862,
        l=dict(sh=(372, 392), el=(230, 392), wr=(88, 395), tip=(12, 395),
               hip=(447, 830), knee=(438, 1050), ank=(436, 1280)),
        r=dict(sh=(652, 392), el=(795, 392), wr=(935, 395), tip=(1012, 395),
               hip=(574, 830), knee=(580, 1050), ank=(581, 1280)),
        arm=dict(cut=372, cy=393, bands=[(0, 27), (286, 27), (292, 58), (372, 58)]),
    ),
    dict(
        id="sailor", name="セーラー", tag="SAILOR GIRL", color="#8fb7ea",
        neck=(512, 350), waist=580, pelvis=(512, 815), face=(500, 250), hem=865,
        l=dict(sh=(388, 400), el=(235, 400), wr=(85, 398), tip=(10, 398),
               hip=(455, 835), knee=(458, 1050), ank=(459, 1310)),
        r=dict(sh=(638, 400), el=(790, 400), wr=(940, 398), tip=(1015, 398),
               hip=(570, 835), knee=(562, 1050), ank=(562, 1310)),
        arm=dict(cut=385, cy=402, bands=[(0, 28), (300, 28), (306, 50), (385, 70)]),
    ),
]


def arm_mask(h, w, cfg, center_x):
    """Boolean mask of both arms, mirrored around the body centre for the right arm."""
    xs = np.arange(w)
    bx = [b[0] for b in cfg["bands"]]
    bh = [b[1] for b in cfg["bands"]]
    mask = np.zeros((h, w), bool)
    ys = np.arange(h)[:, None]
    # left arm: x in [0, cut)
    half_l = np.interp(xs, bx, bh)
    left = (xs[None, :] < cfg["cut"]) & (np.abs(ys - cfg["cy"]) <= half_l[None, :])
    # right arm: mirror of the band table around the body centre
    mx = 2 * center_x - xs
    half_r = np.interp(mx, bx, bh)
    right = (mx[None, :] < cfg["cut"]) & (np.abs(ys - cfg["cy"]) <= half_r[None, :])
    mask |= left | right
    # grow a few px vertically so anti-aliased arm edges leave with the arm
    grown = mask.copy()
    for d in range(1, 4):
        grown[d:] |= mask[:-d]
        grown[:-d] |= mask[d:]
    return grown


def fill_behind(rgba, mask):
    """Remove masked pixels and fill each vertical gap by interpolating the pixels above/below."""
    out = rgba.astype(np.float32).copy()
    prem = out.copy()
    prem[..., :3] *= prem[..., 3:4] / 255.0
    h, w = mask.shape
    for x in range(w):
        col = mask[:, x]
        if not col.any():
            continue
        ys = np.nonzero(col)[0]
        # split into runs
        runs = np.split(ys, np.nonzero(np.diff(ys) > 1)[0] + 1)
        for run in runs:
            a, b = run[0] - 2, run[-1] + 2
            a, b = max(a, 0), min(b, h - 1)
            top, bot = prem[a, x], prem[b, x]
            if top[3] < 128 or bot[3] < 128:
                # gap opens onto the background (bare arm) -> just clear it
                prem[a + 2:b - 1, x] = 0
                continue
            t = np.linspace(0, 1, b - a + 1)[:, None]
            seg = top * (1 - t) + bot * t
            prem[a:b + 1, x] = seg
    alpha = prem[..., 3:4]
    col = np.where(alpha > 0, prem[..., :3] * 255.0 / np.maximum(alpha, 1e-3), 0)
    out = np.concatenate([col, alpha], -1)
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    rig = []
    for i, c in enumerate(CHARS, 1):
        im = np.asarray(Image.open(os.path.join(ROOT, "build", f"cut_{i}.png")).convert("RGBA"))
        h, w, _ = im.shape
        cx = (c["l"]["sh"][0] + c["r"]["sh"][0]) / 2
        m = arm_mask(h, w, c["arm"], cx) & (im[..., 3] > 0)
        arms = im.copy()
        arms[..., 3] = np.where(m, im[..., 3], 0)
        body = fill_behind(im, m)
        # drop thin slivers (sleeve outlines / armpit wedges) left beside the removed arms
        cfg = c["arm"]
        reach = max(b[1] for b in cfg["bands"]) + 30
        zone = np.zeros((h, w), bool)
        y0, y1 = int(cfg["cy"] - reach), int(cfg["cy"] + reach)
        cut = cfg["cut"] + 12
        zone[y0:y1, :cut] = True
        zone[y0:y1, int(2 * cx - cut):] = True
        solid = body[..., 3] > 20
        opened = ndimage.binary_opening(solid, structure=np.ones((7, 7)))
        body[..., 3] = np.where(zone & solid & ~opened, 0, body[..., 3])
        Image.fromarray(body, "RGBA").save(os.path.join(ROOT, "assets", f"c{i}_body.webp"), quality=92, method=6)
        Image.fromarray(arms, "RGBA").save(os.path.join(ROOT, "assets", f"c{i}_arms.webp"), quality=92, method=6)
        entry = {k: v for k, v in c.items() if k != "arm"}
        entry.update(body=f"assets/c{i}_body.webp", arms=f"assets/c{i}_arms.webp", size=[w, h], armCut=c["arm"]["cut"])
        rig.append(entry)
        print("prepared", c["id"])
    with open(os.path.join(ROOT, "assets", "rig.js"), "w") as f:
        f.write("// generated by tools/prep.py — joint positions in source pixels (screen-left = l)\n")
        f.write("window.RIG = " + json.dumps(rig, ensure_ascii=False, indent=1) + ";\n")


if __name__ == "__main__":
    main()
