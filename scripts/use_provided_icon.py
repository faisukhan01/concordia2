#!/usr/bin/env python3
"""
Use the user-provided app icon image directly as EVERY app icon.

No procedural drawing, no tracing, no vectorization. The user supplied an
exact image (upload/pasted_image_1785747309186.jpg) and asked for it to be
used as the app thumbnail exactly. This script squares it, then scales it
to every required size for web, Flutter assets, and Android launchers
(including adaptive-icon foreground/background).

Run:  python3 scripts/use_provided_icon.py
"""

from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = "/home/z/my-project/upload/pasted_image_1785747309186.jpg"

OUT_WEB = os.path.join(ROOT, "public")
OUT_MOB = os.path.join(ROOT, "mobile-app", "assets", "images")
OUT_MIP = os.path.join(ROOT, "mobile-app", "android", "app", "src", "main", "res")

# Android brand orange (for the adaptive background layer only).
BRAND_ORANGE = (242, 101, 34, 255)


def load_source_square() -> Image.Image:
    """Load the user-provided icon, square it (center-crop), return RGBA."""
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


# ── Full icons (orange bg + white C) — used directly as ic_launcher ──
FULL_ICONS = [
    # (size, path)
    (1024, os.path.join(OUT_WEB, "app-icon-1024.png")),
    (512,  os.path.join(OUT_WEB, "app-icon-512.png")),
    (512,  os.path.join(OUT_WEB, "app-icon-512-clean.png")),
    (512,  os.path.join(OUT_WEB, "app-icon.png")),
    (1024, os.path.join(OUT_MOB, "app-icon.png")),
    (1024, os.path.join(OUT_MOB, "app-icon-1024.png")),
    # Android launcher (legacy + round) — full icon per density
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
    ("mdpi",   108),
    ("hdpi",   162),
    ("xhdpi",  216),
    ("xxhdpi", 324),
    ("xxxhdpi",432),
]


def main() -> None:
    src = load_source_square()
    print(f"source: user-provided icon, squared to {src.size}")

    # Full icons: just upscale/downscale the source image.
    for size, path in FULL_ICONS:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # LANCZOS gives the best quality for both upscaling and downscaling.
        icon = src.resize((size, size), Image.LANCZOS)
        icon.save(path, format="PNG", optimize=True)
        print(f"  ✓ {path}  ({size}×{size})")

    # Adaptive layers.
    # FOREGROUND: the full source image (orange+white) scaled to the canvas.
    #   Android will mask it; since the image already has an orange background,
    #   any masked area blends seamlessly with the orange BACKGROUND layer below.
    # BACKGROUND: solid brand orange (so masked edges show orange, not white).
    for dpi, px in ADAPTIVE:
        d = os.path.join(OUT_MIP, f"mipmap-{dpi}")
        os.makedirs(d, exist_ok=True)
        fg = src.resize((px, px), Image.LANCZOS)
        fg.save(os.path.join(d, "ic_launcher_foreground.png"),
                format="PNG", optimize=True)
        bg = Image.new("RGBA", (px, px), BRAND_ORANGE)
        bg.save(os.path.join(d, "ic_launcher_background.png"),
                format="PNG", optimize=True)
        print(f"  ✓ mipmap-{dpi}/ic_launcher_foreground+background  ({px}px)")

    print("\n✅ All icons set to the user-provided image exactly.")


if __name__ == "__main__":
    main()
