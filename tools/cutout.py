"""Remove the flat light background from the T-pose source images.

Usage: python3 tools/cutout.py   (reads src/*.jpg, writes build/cut_N.png)
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# background pockets fully enclosed by the character (hair gaps, between legs),
# picked by hand because pale skin / white cloth look identical to the backdrop
SEEDS = {
    1: [(500, 1232), (406, 82)],
    2: [],
    3: [(338, 228), (677, 227), (407, 280), (609, 280), (416, 330), (605, 330)],
    4: [(400, 243), (396, 341), (632, 341), (353, 498), (677, 495), (692, 546), (628, 596), (510, 1186)],
}


def cutout(path, seeds=()):
    im = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    h, w, _ = im.shape
    mx, mn = im.max(2), im.min(2)
    # background: bright and nearly grey (the sources use a soft white/lilac gradient)
    bgish = (mn > 212) & (mx - mn < 22)
    # opening first so the fill cannot leak through 1-2px gaps (e.g. sock stripes)
    lab, _ = ndimage.label(ndimage.binary_opening(bgish, iterations=2))
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    ids = set(border[border > 0].tolist()) | {int(lab[y, x]) for x, y in seeds if lab[y, x] > 0}
    bg = np.isin(lab, list(ids))
    bg = ndimage.binary_dilation(bg, iterations=2) & bgish

    # estimate local background colour by blurring the bg pixels only
    wsum = ndimage.gaussian_filter(bg.astype(np.float32), 25) + 1e-4
    bgcol = np.stack([ndimage.gaussian_filter(im[..., c] * bg, 25) for c in range(3)], -1) / wsum[..., None]

    # soft alpha on the edge band: how far the pixel is from the local bg colour
    dist = np.sqrt(((im - bgcol) ** 2).sum(-1))
    alpha = np.clip(dist / 60.0, 0, 1)
    fg = ~bg
    band = ndimage.binary_dilation(bg, iterations=2) & ndimage.binary_dilation(fg, iterations=2)
    a = np.where(fg, 1.0, 0.0)
    a = np.where(band, np.minimum(np.maximum(alpha, a * 0), 1.0), a)
    a[bg & ~band] = 0
    # deep inside the character everything is solid
    core = ndimage.binary_erosion(fg, iterations=2)
    a[core] = 1.0

    # un-mix the background from semi transparent edge pixels
    aa = np.maximum(a, 1e-3)[..., None]
    col = np.clip((im - (1 - aa) * bgcol) / aa, 0, 255)
    col = np.where(a[..., None] > 0.999, im, col)

    # drop tiny floating specks
    solid = a > 0.5
    lab2, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab2, range(1, n + 1))
        keep = np.isin(lab2, 1 + np.where(sizes > 400)[0])
        a = np.where(ndimage.binary_dilation(keep, iterations=3), a, 0)

    out = np.dstack([col, a * 255]).astype(np.uint8)
    return out


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    for i in range(1, 5):
        out = cutout(os.path.join(ROOT, "src", f"{i}.jpg"), SEEDS[i])
        Image.fromarray(out, "RGBA").save(os.path.join(ROOT, "build", f"cut_{i}.png"))
        print("cut", i)
