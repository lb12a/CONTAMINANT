"""Composes the app icon and splash screens from the generated art (no GPU needed).

Vile, the slime reaper, on a glowing toxic hexagon: web/PWA icons, the desktop icon (.png/.ico) and every
Android launcher size (legacy, round and adaptive foreground) plus dark splash screens.

    python -I tools/assetgen/src/appicon.py <repo root>
"""

import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

INK = (14, 10, 18, 255)
SPORE = (140, 255, 90, 255)
BG = (14, 10, 18, 255)


def hexagon(cx, cy, r, rot=-math.pi / 2):
    return [(cx + math.cos(rot + i * math.pi / 3) * r, cy + math.sin(rot + i * math.pi / 3) * r) for i in range(6)]


def radial(size, center, radius, color, alpha):
    """A soft glow: colour fading from `alpha` at the centre to nothing at `radius`."""
    w, h = size
    g = Image.new("L", size, 0)
    d = ImageDraw.Draw(g)
    steps = 60
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = int(alpha * (1 - i / steps) ** 1.6 * 255)
        d.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=a)
    layer = Image.new("RGBA", size, color[:3] + (0,))
    layer.putalpha(g.filter(ImageFilter.GaussianBlur(radius * 0.05)))
    return layer


def bust(token):
    """Upper part of the figure (hood, skull, scythe), trimmed to its pixels."""
    bbox = token.getchannel("A").getbbox()
    t = token.crop(bbox)
    t = t.crop((int(t.width * 0.05), 0, t.width, int(t.height * 0.57)))
    # fade the cut edge into the plate
    a = t.getchannel("A")
    fade = Image.new("L", t.size, 255)
    fd = ImageDraw.Draw(fade)
    start = int(t.height * 0.62)
    for y in range(start, t.height):
        fd.line([(0, y), (t.width, y)], fill=int(255 * (1 - (y - start) / (t.height - start)) ** 1.4))
    t.putalpha(ImageChops.multiply(a, fade))
    return t


def emblem(token, size=1024, transparent=False, scale=1.0):
    """The icon artwork on a `size` canvas. `scale` shrinks it for the adaptive-icon safe zone."""
    S = size
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0) if transparent else BG)
    cx, cy = S / 2, S * 0.52
    r = S * 0.43 * scale
    if not transparent:
        img.alpha_composite(radial((S, S), (cx, cy - r * 0.1), S * 0.62, (60, 30, 80, 255), 0.9))
    img.alpha_composite(radial((S, S), (cx, cy - r * 0.15), r * 1.25, SPORE, 0.55))
    # hex plate
    plate = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    d.polygon(hexagon(cx, cy, r), fill=(24, 30, 26, 255))
    d.polygon(hexagon(cx, cy, r * 0.93), fill=(31, 42, 34, 255))
    img.alpha_composite(plate)
    # the reaper, clipped to the hex
    b = bust(token)
    # the skull sits at about (57 %, 33 %) of the crop: centre it in the hex
    bw = r * 2.2
    bh = b.height * bw / b.width
    b = b.resize((int(bw), int(bh)), Image.LANCZOS)
    fig = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    left = int(cx - 0.57 * bw)
    top = int(cy - r * 0.08 - 0.33 * bh)
    fig.paste(b, (left, top), b)
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.polygon(hexagon(cx, cy, r * 0.93), fill=255)

    fig.putalpha(ImageChops.multiply(fig.getchannel("A"), mask))
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow.putalpha(fig.getchannel("A").point(lambda v: int(v * 0.6)))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(S * 0.012)), (0, int(S * 0.012)))
    img.alpha_composite(fig)
    # thick ink rim with a toxic inner line, and a slime drip from the bottom corner
    rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    pts = hexagon(cx, cy, r)
    rd.line(pts + [pts[0]], fill=INK, width=max(4, int(S * 0.036)), joint="curve")
    inner = hexagon(cx, cy, r * 0.955)
    rd.line(inner + [inner[0]], fill=SPORE, width=max(2, int(S * 0.012)), joint="curve")
    img.alpha_composite(rim)
    return img


def rounded(img, radius_ratio=0.22):
    S = img.width
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=255)
    out = img.copy()
    out.putalpha(ImageChops.multiply(out.getchannel("A"), m))
    return out


def circle(img):
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).ellipse([0, 0, img.width - 1, img.height - 1], fill=255)
    out = img.copy()
    out.putalpha(ImageChops.multiply(out.getchannel("A"), m))
    return out


def splash(backdrop, icon, w, h):
    """Dark splash: the loading backdrop (cover) dimmed, with the emblem in the middle."""
    bg = backdrop.convert("RGBA")
    sc = max(w / bg.width, h / bg.height)
    bg = bg.resize((int(bg.width * sc) + 1, int(bg.height * sc) + 1), Image.LANCZOS)
    bg = bg.crop(((bg.width - w) // 2, (bg.height - h) // 2, (bg.width - w) // 2 + w, (bg.height - h) // 2 + h))
    dim = Image.new("RGBA", (w, h), (14, 10, 18, 150))
    bg.alpha_composite(dim)
    s = int(min(w, h) * 0.42)
    em = icon.resize((s, s), Image.LANCZOS)
    bg.alpha_composite(em, ((w - s) // 2, (h - s) // 2))
    return bg.convert("RGB")


def main(root):
    gen = os.path.join(root, "packages/client/public/assets/gen")
    token = Image.open(os.path.join(gen, "tokens/vile.webp")).convert("RGBA")
    full = emblem(token, 1024)
    square = rounded(full)
    # web / PWA
    icons = os.path.join(root, "packages/client/public/icons")
    for s in (1024, 512, 256, 192):
        square.resize((s, s), Image.LANCZOS).save(os.path.join(icons, f"icon-{s}.png"))
    square.save(os.path.join(icons, "icon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # desktop
    build = os.path.join(root, "apps/desktop/build")
    square.save(os.path.join(build, "icon.png"))
    square.save(os.path.join(build, "icon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # Android launcher
    res = os.path.join(root, "apps/android/android/app/src/main/res")
    if os.path.isdir(res):
        fg = emblem(token, 1024, transparent=True, scale=0.62)
        dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
        for name, k in dens.items():
            d = os.path.join(res, f"mipmap-{name}")
            os.makedirs(d, exist_ok=True)
            legacy = int(48 * k)
            rounded(full, 0.18).resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"))
            circle(full).resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, "ic_launcher_round.png"))
            fg.resize((int(108 * k), int(108 * k)), Image.LANCZOS).save(os.path.join(d, "ic_launcher_foreground.png"))
        with open(os.path.join(res, "values/ic_launcher_background.xml"), "w", encoding="utf8") as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E0A12</color>\n</resources>\n')
        backdrop = Image.open(os.path.join(gen, "backdrops/loading.webp"))
        floating = emblem(token, 1024, transparent=True)
        for folder in os.listdir(res):
            p = os.path.join(res, folder, "splash.png")
            if folder.startswith("drawable") and os.path.exists(p):
                w, h = Image.open(p).size
                splash(backdrop, floating, w, h).save(p)
    print("icons written")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
