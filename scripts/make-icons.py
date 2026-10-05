"""Render the Control Point badge (yellow tile, dark hexagon + ring) full-bleed.

Geometry is measured from the official badge (public/icon-512.png from PR #14),
in units of the yellow tile's width.
"""
import math
from PIL import Image, ImageDraw

YELLOW = (253, 213, 4, 255)
INK = (9, 9, 11, 255)
OUT = r"C:\Users\mksus\StudioProjects\control-point\public"

HEX_APOTHEM = 91 / 335   # tile centre -> hexagon stroke centre (flat sides)
HEX_STROKE = 28 / 335
RING_R = 43 / 335        # ring stroke-centre radius
RING_STROKE = 28 / 335
CY_OFFSET = 2 / 335      # mark sits a hair below tile centre
CORNER = 0.26            # tile corner radius / tile size


def render(size: int, rounded: bool, mark_scale: float = 1.0) -> Image.Image:
    ss = 8
    S = size * ss
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=CORNER * S, fill=YELLOW)
    else:
        d.rectangle([0, 0, S, S], fill=YELLOW)
    cx, cy = S / 2, S / 2 + CY_OFFSET * S * mark_scale
    k = S * mark_scale
    # Pointy-top hexagon with round joins.
    R = HEX_APOTHEM * k / math.cos(math.pi / 6)
    w = HEX_STROKE * k
    pts = [(cx + R * math.cos(math.radians(-90 + 60 * i)), cy + R * math.sin(math.radians(-90 + 60 * i))) for i in range(6)]
    d.line(pts + [pts[0], pts[1]], fill=INK, width=round(w), joint="curve")
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=INK)
    # Ring.
    ro, ri = (RING_R + RING_STROKE / 2) * k, (RING_R - RING_STROKE / 2) * k
    d.ellipse([cx - ro, cy - ro, cx + ro, cy + ro], fill=INK)
    d.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=YELLOW)
    return im.resize((size, size), Image.LANCZOS)


def save(im: Image.Image, name: str, opaque: bool = False) -> None:
    if opaque:
        bg = Image.new("RGB", im.size, YELLOW[:3])
        bg.paste(im, mask=im.split()[3])
        im = bg
    im.save(f"{OUT}\\{name}", optimize=True)


# In-app logo: full-bleed square; the UI rounds it with CSS.
save(render(512, rounded=False), "logo.png", opaque=True)
# iOS home screen: full-bleed, opaque (iOS applies its own mask).
save(render(180, rounded=False), "apple-touch-icon.png", opaque=True)
# PWA "any" icons and favicon: the rounded tile filling the frame.
save(render(512, rounded=True), "icon-512.png")
save(render(192, rounded=True), "icon-192.png")
save(render(64, rounded=True), "favicon.png")
# Android maskable: full-bleed; the mark already sits inside the 80% safe zone.
save(render(512, rounded=False), "icon-maskable-512.png", opaque=True)
print("ok")
