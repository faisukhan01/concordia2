#!/usr/bin/env python3
"""
Build the Concordia College app icon.

Output: orange squircle background + WHITE Concordia "C+checkmark" logomark
        (no text), matching the screenshot the user provided.

The logomark is drawn as an SVG (then rasterized via cairosvg if available,
otherwise via PIL vector paths) so it's crisp at every size.

Design (per VLM analysis of the screenshot + the official Concordia logo):
  • A thick, uniform circular "C" (open on the right).
  • From the top end of the C, a horizontal bar extends to the right.
  • From the end of that bar, two strokes branch:
      – one diagonal upward-right (the checkmark),
      – one horizontal right (the foot of the "4").
  • All strokes are bold, geometric, white on a solid brand-orange tile.
  • Squircle (iOS-style rounded-square) alpha mask on the final tile.
"""

from PIL import Image, ImageDraw, ImageFilter
import os
import math

# ── Brand constants ────────────────────────────────────────────────
BRAND_ORANGE = (242, 101, 34, 255)   # #F26522
WHITE        = (255, 255, 255, 255)
TRANSPARENT  = (0, 0, 0, 0)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_WEB = os.path.join(ROOT, "public")
OUT_MOB = os.path.join(ROOT, "mobile-app", "assets", "images")
OUT_MIP = os.path.join(ROOT, "mobile-app", "android", "app", "src", "main", "res")

# (size_px, path) — full squircle icons (orange bg + white mark)
TARGETS = [
    (1024, f"{OUT_WEB}/app-icon-1024.png"),
    (512,  f"{OUT_WEB}/app-icon-512.png"),
    (512,  f"{OUT_WEB}/app-icon-512-clean.png"),
    (512,  f"{OUT_WEB}/app-icon.png"),
    (1024, f"{OUT_MOB}/app-icon.png"),
    (1024, f"{OUT_MOB}/app-icon-1024.png"),
    (192,  f"{OUT_MIP}/mipmap-xxxhdpi/ic_launcher.png"),
    (192,  f"{OUT_MIP}/mipmap-xxxhdpi/ic_launcher_round.png"),
    (144,  f"{OUT_MIP}/mipmap-xxhdpi/ic_launcher.png"),
    (144,  f"{OUT_MIP}/mipmap-xxhdpi/ic_launcher_round.png"),
    (96,   f"{OUT_MIP}/mipmap-xhdpi/ic_launcher.png"),
    (96,   f"{OUT_MIP}/mipmap-xhdpi/ic_launcher_round.png"),
    (72,   f"{OUT_MIP}/mipmap-hdpi/ic_launcher.png"),
    (72,   f"{OUT_MIP}/mipmap-hdpi/ic_launcher_round.png"),
    (48,   f"{OUT_MIP}/mipmap-mdpi/ic_launcher.png"),
    (48,   f"{OUT_MIP}/mipmap-mdpi/ic_launcher_round.png"),
]

# Adaptive-icon layers (foreground = white mark on transparent for safe zone;
# background = solid orange).  (dpi, foreground/background px)
ADAPTIVE = [
    ("mdpi",   108),
    ("hdpi",   162),
    ("xhdpi",  216),
    ("xxhdpi", 324),
    ("xxxhdpi",432),
]


# ── Squircle mask ──────────────────────────────────────────────────
def squircle_mask(size: int, radius_frac: float = 0.22) -> Image.Image:
    img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(img)
    r = int(size * radius_frac)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return img


# ── Logo drawing ───────────────────────────────────────────────────
def draw_logo_mask(size: int) -> Image.Image:
    """
    Draw the white Concordia logomark as an 'L' (alpha) mask on a
    `size`×`size` transparent canvas. The mask is white where the logo
    should appear, transparent elsewhere.

    The logo is built from three primitives, all drawn with the same
    stroke width so the mark reads as one continuous shape:
      1. A thick circular arc covering ~270° (the "C"), open on the right.
      2. A horizontal bar from the top end of the C, extending right.
      3. A diagonal stroke from the bar's right end going up-right
         (the checkmark / "4" leg).
      4. A short horizontal foot from the diagonal's midpoint going right.
    """
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    d = ImageDraw.Draw(img)

    cx = cy = size / 2.0
    # Outer radius of the C, and stroke width — tuned so the logo occupies
    # ~62% of the tile (matches the screenshot proportion).
    R = size * 0.30          # outer radius
    r = R * 0.62             # inner radius (stroke width = R - r)
    stroke = R - r

    # ── 1. The "C" arc (open on the right) ──
    # PIL's arc uses angles measured clockwise from 3 o'clock (east).
    # We want the C to open to the right, so we sweep from ~70° (top-right)
    # all the way around to ~290° (bottom-right), going counter-clockwise
    # through 180° (west). That's a 220° arc covering the left side.
    bbox_outer = [cx - R, cy - R, cx + R, cy + R]
    bbox_inner = [cx - r, cy - r, cx + r, cy + r]

    # Build the C as a "pie slice annulus" so the stroke ends are squared.
    # Easier: draw two filled pies (outer minus inner) bounded by the
    # angular range of the C.
    # Top end angle (where the horizontal bar starts):
    top_angle_deg = -68    # up and slightly right of vertical
    bot_angle_deg = 68     # down and slightly right of vertical

    def polar(cx, cy, rad, deg):
        rad_ = math.radians(deg)
        return (cx + rad * math.cos(rad_), cy + rad * math.sin(rad_))

    # Polygon for the C: outer arc from bot→top (going CCW through 180°),
    # then inner arc from top→bot (going CW). That carves the open right side.
    arc_steps = 64
    outer_pts = []
    inner_pts = []
    # Sweep the OUTER arc from top_angle to bot_angle going CCW (through 180°).
    # That means decreasing angle from top_angle, wrapping through 180, to bot_angle.
    # Easier: iterate angle from top_angle to (360 + bot_angle)? No — we want
    # the LONG way around (through 180° west). So go from top_angle DOWN through
    # 0, -90, -180, ... actually let's just iterate from top_angle to bot_angle
    # the "long" way: from top_angle → 180 → bot_angle.
    # Since top_angle = -68 and bot_angle = 68, the long way is to increase
    # from -68 to 68 going through 180 (i.e. angle += 360, so -68 → 292 → 68).
    # Simplest: iterate t from 0..1, angle = lerp(top_angle, bot_angle + 360, t)
    # — but that goes through 0° (east). We want through 180°.
    # So angle = lerp(top_angle, bot_angle - 360, t) → goes from -68 down to
    # -292, which passes through -180 (west). ✓
    for i in range(arc_steps + 1):
        t = i / arc_steps
        ang = top_angle_deg + (bot_angle_deg - 360 - top_angle_deg) * t
        outer_pts.append(polar(cx, cy, R, ang))
        inner_pts.append(polar(cx, cy, r, ang))
    # Outer arc forward, then inner arc reversed → polygon ring.
    c_poly = outer_pts + inner_pts[::-1]
    d.polygon(c_poly, fill=WHITE)

    # ── 2. Horizontal bar from the top end of the C, going right ──
    top_end = polar(cx, cy, (R + r) / 2, top_angle_deg)
    bar_len = R * 1.10
    bar_end = (top_end[0] + bar_len, top_end[1])
    # Draw as a thick line (rounded caps look softer).
    bar_box = [
        top_end[0] - stroke / 2, top_end[1] - stroke / 2,
        bar_end[0] + stroke / 2, top_end[1] + stroke / 2,
    ]
    # Use a rotated rectangle for cleanliness: draw as a polygon.
    d.line([top_end, bar_end], fill=WHITE, width=int(round(stroke)))
    # Round the joint with a circle
    d.ellipse([top_end[0] - stroke / 2, top_end[1] - stroke / 2,
               top_end[0] + stroke / 2, top_end[1] + stroke / 2], fill=WHITE)

    # ── 3. Diagonal "checkmark" stroke going UP-RIGHT from bar_end ──
    diag_len = R * 0.85
    diag_angle_deg = -42    # up-right
    diag_end = polar(bar_end[0], bar_end[1], diag_len, diag_angle_deg)
    d.line([bar_end, diag_end], fill=WHITE, width=int(round(stroke)))
    d.ellipse([bar_end[0] - stroke / 2, bar_end[1] - stroke / 2,
               bar_end[0] + stroke / 2, bar_end[1] + stroke / 2], fill=WHITE)

    # ── 4. Short horizontal foot from the diagonal's midpoint, going right ──
    # (gives the "4" silhouette its base)
    mid_t = 0.55
    foot_start = (
        bar_end[0] + (diag_end[0] - bar_end[0]) * mid_t,
        bar_end[1] + (diag_end[1] - bar_end[1]) * mid_t,
    )
    foot_len = R * 0.55
    foot_end = (foot_start[0] + foot_len, foot_start[1])
    d.line([foot_start, foot_end], fill=WHITE, width=int(round(stroke)))
    d.ellipse([foot_start[0] - stroke / 2, foot_start[1] - stroke / 2,
               foot_start[0] + stroke / 2, foot_start[1] + stroke / 2], fill=WHITE)

    # Convert to 'L' mask (alpha channel)
    mask = Image.new("L", (size, size), 0)
    mask.putalpha(0)
    # Use the RGB composite as the mask source (white logo on transparent).
    # Easiest: split the RGBA and grab the alpha.
    return img.split()[-1]  # alpha channel


def build_icon(size: int) -> Image.Image:
    """Return an RGBA `size`×`size` icon: orange squircle + white logo."""
    # 1. Paint a clean orange tile.
    tile = Image.new("RGBA", (size, size), BRAND_ORANGE)

    # 2. Composite the WHITE logo on top using the mask.
    mask = draw_logo_mask(size)
    white_layer = Image.new("RGBA", (size, size), WHITE)
    tile.paste(white_layer, (0, 0), mask)

    # 3. Apply squircle alpha mask.
    out = Image.new("RGBA", (size, size), TRANSPARENT)
    out.paste(tile, (0, 0), squircle_mask(size))
    return out


def build_foreground(size: int) -> Image.Image:
    """Adaptive-icon foreground: white logo on TRANSPARENT canvas.

    Android adaptive icons reserve a ~66dp safe zone in the center of the
    108dp canvas, so the mark is scaled to ~60% and centered.
    """
    # The mark mask is drawn at full size, then pasted centered at 60% scale
    # onto a transparent canvas.
    fg = Image.new("RGBA", (size, size), TRANSPARENT)
    mark_size = int(size * 0.60)
    mask = draw_logo_mask(mark_size)
    white_layer = Image.new("RGBA", (mark_size, mark_size), WHITE)
    offset = (size - mark_size) // 2
    fg.paste(white_layer, (offset, offset), mask)
    return fg


def build_background(size: int) -> Image.Image:
    """Adaptive-icon background: solid brand orange."""
    return Image.new("RGBA", (size, size), BRAND_ORANGE)


def main() -> None:
    cache: dict[int, Image.Image] = {}
    for size, path in TARGETS:
        if size not in cache:
            cache[size] = build_icon(size)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        cache[size].save(path, format="PNG", optimize=True)
        print(f"  ✓ {path}  ({size}×{size})")

    # Adaptive-icon foreground + background for each density.
    for dpi, px in ADAPTIVE:
        d = os.path.join(OUT_MIP, f"mipmap-{dpi}")
        os.makedirs(d, exist_ok=True)
        build_foreground(px).save(os.path.join(d, "ic_launcher_foreground.png"),
                                  format="PNG", optimize=True)
        build_background(px).save(os.path.join(d, "ic_launcher_background.png"),
                                  format="PNG", optimize=True)
        print(f"  ✓ mipmap-{dpi}/ic_launcher_foreground+background  ({px}px)")
    print("Done.")


if __name__ == "__main__":
    main()
