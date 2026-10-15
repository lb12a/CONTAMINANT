"""Post-processing for generated images: background removal (rembg isnet-anime), trim, resize, WebP export.

Reads a JSON job list from the file given with --jobs: [{"src": "...png", "dst": "...webp", "kind": "token", "box": 512}, ...]
Prints one JSON line per finished job: {"dst": ..., "w": ..., "h": ...}
Also: `post.py --sheet out.png title img1 img2 ...` builds a labelled contact sheet for picking candidates.
"""

import json
import sys

from PIL import Image, ImageDraw, ImageFilter

CUTOUT = {"token", "prop", "item", "objective"}


def background_holes(img):
    """Alpha mask that clears large flat regions in the generation background colour, including pockets
    enclosed by the figure (between spider legs, under arms) that rembg keeps."""
    import numpy as np
    from scipy import ndimage

    a = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w, _ = a.shape
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    dist = np.abs(a - bg).sum(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    near = (dist < 30) & (sat < 22)
    labels, n = ndimage.label(near)
    if n == 0:
        return None
    sizes = ndimage.sum(near, labels, range(1, n + 1))
    keep = np.zeros(n + 1, dtype=bool)
    keep[1:] = sizes > (h * w) * 0.002
    hole = keep[labels]
    # grow slightly so the anti-aliased rim of the hole goes too
    hole = ndimage.binary_dilation(hole, iterations=1)
    alpha = np.where(hole, 0, 255).astype(np.uint8)
    return Image.fromarray(alpha, "L")


def cutout(session, img):
    from rembg import remove
    from PIL import ImageChops

    out = remove(img, session=session, post_process_mask=True)
    holes = background_holes(img)
    if holes is not None:
        out.putalpha(ImageChops.multiply(out.getchannel("A"), holes))
    # tidy the matte: drop faint halo pixels, keep the thick outline crisp
    a = out.getchannel("A").point(lambda v: 0 if v < 24 else (255 if v > 232 else v))
    out.putalpha(a)
    return out


def main_figure(img):
    """Drops detached extra figures (the model sometimes paints a character sheet): keeps the largest
    opaque component and everything whose bounding box touches it (floating heads, hands, props)."""
    import numpy as np
    from scipy import ndimage

    a = np.asarray(img.getchannel("A"))
    mask = a > 40
    labels, n = ndimage.label(mask)
    if n <= 1:
        return img
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    boxes = ndimage.find_objects(labels)
    my, mx = boxes[main - 1]
    padx = int((mx.stop - mx.start) * 0.08)
    pady = int((my.stop - my.start) * 0.08)
    keep = np.zeros(n + 1, dtype=bool)
    for i, (sy, sx) in enumerate(boxes, start=1):
        if sx.start <= mx.stop + padx and sx.stop >= mx.start - padx and sy.start <= my.stop + pady and sy.stop >= my.start - pady:
            keep[i] = True
    # soft edge pixels below the threshold belong to whatever they touch: keep them where kept parts are
    kept = ndimage.binary_dilation(keep[labels], iterations=3)
    out = np.where(kept, a, 0).astype(np.uint8)
    img = img.copy()
    img.putalpha(Image.fromarray(out, "L"))
    return img


def trim(img, pad_ratio=0.03):
    bbox = img.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        return img
    img = img.crop(bbox)
    pad = int(max(img.size) * pad_ratio)
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad))
    return canvas


def fit(img, box):
    scale = min(box / img.width, box / img.height)
    if scale < 1:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    return img


def run_jobs(jobs):
    session = None
    if any(j["kind"] in CUTOUT and not j["src"].endswith(".cut.png") for j in jobs):
        from rembg import new_session

        session = new_session("isnet-anime")
    for j in jobs:
        img = Image.open(j["src"]).convert("RGBA")
        if j["kind"] in CUTOUT:
            has_alpha = img.getchannel("A").getextrema()[0] < 250
            img = img if has_alpha else cutout(session, img)
            if j.get("cropX"):
                x0, x1 = j["cropX"]
                img = img.crop((int(img.width * x0), 0, int(img.width * x1), img.height))
            if j["kind"] == "token":
                img = main_figure(img)
            img = trim(img)
            img = fit(img, j.get("box", 512))
            img.save(j["dst"], "WEBP", quality=90, method=6)
        else:
            img = img.convert("RGB")
            if j.get("box"):
                img = fit(img, j["box"])
            img.save(j["dst"], "WEBP", quality=86, method=6)
        print(json.dumps({"dst": j["dst"], "w": img.width, "h": img.height}), flush=True)


def sheet(out, title, files):
    cell = 300
    cols = min(6, max(1, len(files)))
    rows = (len(files) + cols - 1) // cols
    W, H = cols * cell, rows * (cell + 22) + 30
    canvas = Image.new("RGB", (W, H), (40, 36, 44))
    d = ImageDraw.Draw(canvas)
    d.text((8, 8), title, fill=(230, 220, 200))
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGBA")
        im.thumbnail((cell - 10, cell - 10))
        x = (i % cols) * cell + (cell - im.width) // 2
        y = 30 + (i // cols) * (cell + 22) + (cell - im.height) // 2
        bg = Image.new("RGBA", im.size, (70, 64, 76, 255))
        bg.alpha_composite(im)
        canvas.paste(bg.convert("RGB"), (x, y))
        name = f.replace("\\", "/").split("/")[-1]
        d.text(((i % cols) * cell + 6, 30 + (i // cols) * (cell + 22) + cell + 2), name[:44], fill=(200, 190, 170))
    canvas.save(out)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--sheet":
        sheet(sys.argv[2], sys.argv[3], sys.argv[4:])
    elif len(sys.argv) > 2 and sys.argv[1] == "--jobs":
        with open(sys.argv[2], encoding="utf8") as f:
            run_jobs(json.load(f))
    else:
        run_jobs(json.load(sys.stdin))
