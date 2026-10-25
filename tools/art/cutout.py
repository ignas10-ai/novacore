# Chroma key (#00FF00) -> skaidrus WebP @1x/@2x. python -I tools/art/cutout.py <raw.png> <out-vardas> <aukštis@1x>
import sys
import numpy as np
from PIL import Image
src, name, h1 = sys.argv[1], sys.argv[2], int(sys.argv[3])
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
green = g - np.maximum(r, b)                      # kiek pikselis "žalesnis" už kitus kanalus
alpha = 1 - np.clip((green - 40) / (140 - 40), 0, 1)  # <40 = personažas, >140 = fonas, tarpe minkštas kraštas
g2 = np.minimum(g, np.maximum(r, b) + 8)          # despill: žalia ne daugiau nei kiti kanalai
rgba = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
im = Image.fromarray(rgba, 'RGBA')
im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())
for s, suf in ((1, ''), (2, '@2x')):
    hh = h1 * s
    out = im.resize((round(im.width * hh / im.height), hh), Image.LANCZOS)
    path = f'src/art/{name}{suf}.webp'
    for q in (86, 80, 72, 64):
        out.save(path, 'WEBP', quality=q, method=6, alpha_quality=90)
        import os
        if os.path.getsize(path) <= 150_000: break
    print(path, out.size, os.path.getsize(path) // 1024, 'KB q', q)
