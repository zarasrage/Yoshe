"""Genera la miniatura circular de cada personaje: images/characters/<id>/thumb.webp.

Recorta de la primera foto grande (photos[0], o photoLarge) un cuadrado de cabeza y
hombros (ver head_box) y lo guarda a 224px en WebP con transparencia (~10KB en vez de
los ~350KB del retrato entero que antes se bajaba para un círculo de 56px).

Uso:  python3 tools/make_thumbs.py            # todos los personajes con foto
      python3 tools/make_thumbs.py hugo-demandes  # solo esos
Requiere Pillow (pip install pillow). Después, agregar thumb:"images/characters/<id>/thumb.webp"
al personaje en data.js.
"""
import re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SIDE = 0.36     # lado del cuadrado, en fracción del alto de la figura (cabeza y hombros)
TOP_PAD = 0.07  # aire sobre la cabeza, en fracción del lado
SIZE = 224      # 56px del elenco x 3 (pantallas 3x) + margen para el hover

def first_photo(char_line):
    m = re.search(r'photos:\["([^"]+)"', char_line) or re.search(r'photoLarge:"([^"]+)"', char_line)
    return m.group(1) if m else None

def head_box(im):
    """Cuadrado de cabeza y hombros. La foto tiene fondo transparente: el alfa da el alto
    de la figura y dónde está la cabeza. La cabeza se busca en una franja vertical
    alrededor del centro de masa del cuerpo (no en todo el ancho), para que una mano
    levantada sobre la cabeza no se lea como la coronilla; el centro horizontal del
    recorte sale de la cabeza misma, no de la figura entera (brazos abiertos, poses
    ladeadas)."""
    a = im.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    l, t, r, b = a.getbbox()
    side = round((b - t) * SIDE)
    hist = [a.crop((x, t, x + 1, b)).histogram()[255] for x in range(im.width)]
    mass_x = sum(x * n for x, n in enumerate(hist)) / sum(hist)
    band = round((r - l) * 0.12)
    head_t = a.crop((round(mass_x) - band, 0, round(mass_x) + band, im.height)).getbbox()[1]
    head = a.crop((0, head_t, im.width, head_t + round(side * 0.4)))
    cols = [x for x in range(im.width) if head.crop((x, 0, x + 1, head.height)).getbbox()]
    runs, start = [], None      # la cabeza es el tramo continuo de columnas más cercano al cuerpo
    for x in range(im.width + 1):
        on = x < im.width and x in set(cols)
        if on and start is None: start = x
        if not on and start is not None: runs.append((start, x - 1)); start = None
    near = min(runs, key=lambda ab: 0 if ab[0] <= mass_x <= ab[1] else min(abs(ab[0]-mass_x), abs(ab[1]-mass_x)))
    cx = (near[0] + near[1]) / 2
    top = max(0, head_t - round(side * TOP_PAD))
    left = round(cx - side / 2)
    return (left, top, left + side, top + side)   # fuera del lienzo queda transparente

def main(only):
    data = (ROOT / "data.js").read_text(encoding="utf8")
    for m in re.finditer(r'^\s*"([a-z0-9-]+)":\s*\{name:.*$', data, re.M):
        cid, src = m.group(1), first_photo(m.group(0))
        if not src or (only and cid not in only):
            continue
        im = Image.open(ROOT / src).convert("RGBA")
        box = head_box(im)
        crop = im.crop(box)
        crop = crop.resize((SIZE, SIZE), Image.LANCZOS)
        out = ROOT / "images" / "characters" / cid / "thumb.webp"
        crop.save(out, "WEBP", quality=86, method=6)
        print(f"{out.relative_to(ROOT)}  {out.stat().st_size // 1024}KB  <- {src}")

if __name__ == "__main__":
    main(set(sys.argv[1:]))
