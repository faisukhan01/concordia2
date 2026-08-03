#!/usr/bin/env python3
"""
Generate app icons from the user-provided thumbnail — SCALED TO FIT so the
white C no longer looks "zoomed in" on the phone.

PROBLEM (v3.2.0):
  The source image (upload/pasted_image_1785747309186.jpg, 159x159) has the
  white C at 75.5% of the frame width. When placed FULL-BLEED on an Android
  adaptive-icon foreground (432x432 for xxxhdpi), the C exceeds the 66% safe
  zone. The launcher mask clips the C's left/right edges, so the icon looks
  "zoomed in" on the phone home screen.

FIX (v3.3.0):
  1. Square the source (center-crop).
  2. Color-correct: blend so the white C stays white and everything else
     becomes brand orange #F26522 (eliminates JPEG-muted orange, ensures a
     seamless blend with the adaptive background layer).
  3. Scale the corrected source to 80% of each target canvas (so the C lands
     at ~60% of the canvas = well within the 66% safe zone) and center it.
  4. Full icons (web, Flutter, legacy Android): brand-orange canvas + C.
  5. Adaptive foreground: TRANSPARENT canvas + C (background layer = solid
     brand orange, so the transparent border shows orange through).

Run:  python3 scripts/use_provided_icon.py
"""

import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = "/home/z/my-project/upload/pasted_image_1785747309186.jpg"

OUT_WEB = os.path.join(ROOT, "public")
OUT_MOB = os.path.join(ROOT, "mobile-app", "assets", "images")
OUT_MIP = os.path.join(ROOT, "mobile-app", "android", "app", "src", "main", "res")

# Brand orange #F26522 + pure white.
BRAND_ORANGE = np.array([242, 101, 34], dtype=np.float32)
WHITE        = np.array([255, 255, 255], dtype=np.float32)

# Source is placed at this fraction of each target canvas.
# 0.80 -> C (75.5% of source) lands at 60.4% of canvas = 91.5% of the 66% safe zone.
# Comfortable orange padding, no clipping.
ICON_SCALE = 0.80


def make_master() -> Image.Image:
    """Load source, square it, color-correct to clean brand-orange + white C."""
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top  = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))  # square

    arr = np.asarray(im, dtype=np.float32)              # (H, W, 3)
    # whiteness: 1.0 for pure white, 0.0 for orange.
    # White pixels have a high min channel (R=G=B=255); orange has low blue.
    min_ch = arr.min(axis=2)                             # (H, W)
    t = np.clip((min_ch - 80.0) / (180.0 - 80.0), 0, 1)  # (H, W)
    t = t[..., None]                                     # (H, W, 1)
    out = WHITE * t + BRAND_ORANGE * (1.0 - t)           # (H, W, 3)
    out = np.clip(out, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGB").convert("RGBA")


def composite(master: Image.Image, size: int, transparent_bg: bool) -> Image.Image:
    """Scale master to ICON_SCALE*size, center it on a canvas."""
    if transparent_bg:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (size, size),
                           (int(BRAND_ORANGE[0]), int(BRAND_ORANGE[1]),
                            int(BRAND_ORANGE[2]), 255))
    inner = int(round(size * ICON_SCALE))
    scaled = master.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    # Paste using the scaled image's own alpha (fully opaque square) so the
    # center ICON_SCALE region gets the master, and the border keeps the canvas.
    canvas.paste(scaled, (off, off), scaled)
    return canvas


# ── Full icons (brand-orange bg + white C, with padding) ──
FULL_ICONS = [
    (1024, os.path.join(OUT_WEB, "app-icon-1024.png")),
    (512,  os.path.join(OUT_WEB, "app-icon-512.png")),
    (512,  os.path.join(OUT_WEB, "app-icon-512-clean.png")),
    (512,  os.path.join(OUT_WEB, "app-icon.png")),
    (1024, os.path.join(OUT_MOB, "app-icon.png")),
    (1024, os.path.join(OUT_MOB, "app-icon-1024.png")),
    # Android legacy + round launcher (per density)
    (192,  os.path.join(OUT_MIP, "mipmap-xxxhdpi/ic_launcher.png")),
    (192,  os.path.join(OUT_MIP, "mipmap-xxxhdpi/ic_launcher_round.png")),
    (144,  os.path.join(OUT_MIP, "mipmap-xxhdpi/ic_launcher.png")),
    (144,  os.path.join(OUT_MIP, "mipmap-xxhdpi/ic_launcher_round.png")),
    (96,   os.path.join(OUT_MIP, "mipmap-xhdpi/ic_launcher.png")),
    (96,   os.path.join(OUT_MIP, "mipmap-xhdpi/ic_launcher_round.png")),
    (72,   os.path.join(OUT_MIP, "mipmap-hdpi/ic_launcher.png")),
    (72,   os.path.join(OUT_MIP, "mipmap-hdpi/ic_launcher_round.png")),
    (48,   os.path.join(OUT_MIP, "mipmap-mdpi/ic_launcher.png")),
    (48,   os.path.join(OUT_MIP, "mipmap-mdpi/ic_launcher_round.png")),
]

# Adaptive-icon layers per density: (dpi, layer_canvas_px)
ADAPTIVE = [
    ("mdpi",    108),
    ("hdpi",    162),
    ("xhdpi",   216),
    ("xxhdpi",  324),
    ("xxxhdpi", 432),
]


def main() -> None:
    master = make_master()
    print(f"master: color-corrected {master.size[0]}x{master.size[1]} "
          f"(brand orange + white C)")

    # Full icons: brand-orange canvas + C (scaled to 80%, centered).
    for size, path in FULL_ICONS:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        icon = composite(master, size, transparent_bg=False)
        icon.save(path, format="PNG", optimize=True)
        print(f"  + {path}  ({size}x{size})")

    # Adaptive layers.
    # FOREGROUND: TRANSPARENT canvas + C (scaled to 80%, centered).
    #   The transparent border lets the solid-orange BACKGROUND layer show
    #   through, so the final masked icon is a clean orange circle + C.
    # BACKGROUND: solid brand orange.
    for dpi, px in ADAPTIVE:
        d = os.path.join(OUT_MIP, f"mipmap-{dpi}")
        os.makedirs(d, exist_ok=True)
        fg = composite(master, px, transparent_bg=True)
        fg.save(os.path.join(d, "ic_launcher_foreground.png"),
                format="PNG", optimize=True)
        bg = Image.new("RGBA", (px, px),
                       (int(BRAND_ORANGE[0]), int(BRAND_ORANGE[1]),
                        int(BRAND_ORANGE[2]), 255))
        bg.save(os.path.join(d, "ic_launcher_background.png"),
                format="PNG", optimize=True)
        print(f"  + mipmap-{dpi}/ic_launcher_foreground+background  ({px}px)")

    print(f"\n[OK] All icons regenerated. C scaled to {int(ICON_SCALE*100)}% of canvas "
          f"(fits within the 66% adaptive safe zone).")


if __name__ == "__main__":
    main()
