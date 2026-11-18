#!/usr/bin/env python3
"""
Builds responsive WebP versions of the site's own photographs and a manifest the storefront reads.

  python3 scripts/optimize-images.py            # add anything missing
  python3 scripts/optimize-images.py --force    # rebuild everything

For every .jpg/.png under public/products, public/brand and public/demo it writes <name>-<width>.webp at a ladder of
widths below the original plus one at the original size, and records the original's dimensions in
src/lib/imageManifest.json. The original file is never modified and stays the <img src> fallback, so nothing about the
photographs changes: browsers simply download a smaller copy of the same picture when the screen is small.
Requires Pillow (pip install pillow). Re-run it after adding photographs; images without a manifest entry still work, they just
are not resized.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
MANIFEST = ROOT / "src" / "lib" / "imageManifest.json"
FOLDERS = ["products", "brand", "demo"]
LADDER = [400, 800, 1200, 1600, 2000]
QUALITY = 84  # visually lossless for photographs at these sizes
VARIANT = re.compile(r"-\d+\.webp$")

force = "--force" in sys.argv
manifest: dict[str, dict] = {}
made = 0

for folder in FOLDERS:
    for src in sorted((PUBLIC / folder).rglob("*")):
        if src.suffix.lower() not in {".jpg", ".jpeg", ".png"} or VARIANT.search(src.name):
            continue
        with Image.open(src) as im:
            width, height = im.size
            widths = sorted({w for w in LADDER if w < width * 0.95} | {width})
            for w in widths:
                out = src.with_name(f"{src.stem}-{w}.webp")
                if out.exists() and not force:
                    continue
                h = round(height * w / width)
                resized = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") and "transparency" in im.info or im.mode == "RGBA" else "RGB")
                resized = resized.resize((w, h), Image.LANCZOS) if w != width else resized
                resized.save(out, "WEBP", quality=QUALITY, method=6)
                made += 1
        url = "/" + src.relative_to(PUBLIC).as_posix()
        manifest[url] = {"w": width, "h": height, "widths": widths}

MANIFEST.write_text(json.dumps(manifest, indent=0, sort_keys=True) + "\n", encoding="utf-8")
print(f"{len(manifest)} images in the manifest, {made} WebP files written.")
