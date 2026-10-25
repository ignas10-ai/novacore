# Sprint: profile heads cut from the approved turnaround sheets (3rd figure = pure side view facing right).
# python -I tools/art/sprint-heads.py  (reads tools/art/raw/sheet-r3.png, sheet-b3.png; writes src/art/sprint/<name>-side.webp)
# White background removed by flood fill from the crop border (teeth / eye whites stay), soft 1px edge, the neck cut is
# feathered so the head sits on the canvas-drawn collar. Body/limbs are drawn in code (src/sprint/runner.ts).
import os, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
# name: sheet, side-figure box in the 2752x1536 sheet, neck cut row (inside the box)
JOBS = {"raudonas": ("sheet-r3.png", (1430, 60, 1960, 660), 585), "melynas": ("sheet-b3.png", (1430, 60, 1960, 660), 570)}
os.makedirs("src/art/sprint", exist_ok=True)
for name, (sheet, box, cut) in JOBS.items():
    a = np.asarray(Image.open(f"tools/art/raw/{sheet}").convert("RGB").crop(box)).astype(np.float32)
    white = a.min(axis=2) > 226
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    alpha = (~bg).astype(np.float32)
    alpha = ndimage.gaussian_filter(alpha, 0.8)
    alpha = np.clip((alpha - 0.25) / 0.75, 0, 1)  # pull the soft edge inwards so no white halo survives
    h = a.shape[0]
    rows = np.arange(h)[:, None]
    alpha *= np.clip((cut - rows) / 14, 0, 1)  # feathered neck cut
    rgba = np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA")
    im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
    out = im.resize((round(im.width * 240 / im.height), 240), Image.LANCZOS)
    path = f"src/art/sprint/{name}-side.webp"
    out.save(path, "WEBP", quality=88, method=6, alpha_quality=92)
    print(path, out.size, os.path.getsize(path) // 1024, "KB", "src box", im.size)
