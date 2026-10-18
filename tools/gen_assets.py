#!/usr/bin/env python3
"""旅館カブ 背景素材ジェネレータ (手続き生成・外部素材/ブランドロゴ不使用)

出力 (assets/):
  tatami.webp        畳フィールド(中央は空き。カード/硬貨/ボタンは一切描かない)
  prop-tl/tr/bl/br   四隅の小物(ビール缶・ポテチ・小皿・浴衣の膝/腕/足)。透過WebP
  paper.webp         使い込んだトランプ紙のテクスチャ(タイル)
  card-back.webp     札の裏面

写真ではなく手続き生成の暫定素材。写真素材に差し替える場合は同名ファイルで置換するだけでよい。
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261019)


def noise(h, w, sy, sx, amp=1.0):
    n = gaussian_filter(rng.standard_normal((h, w)), (sy, sx))
    n /= (n.std() + 1e-9)
    return n * amp


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


# ---------------------------------------------------------------- tatami
def make_tatami(W=900, H=1600):
    """い草の畦(横)＋縦糸の目＋途切れ。写真ではなく手続き生成。"""
    base = np.array([164, 141, 88], dtype=np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    p = 5.2                                    # rib pitch (px)
    ridx = np.floor(yy / p).astype(np.int32)
    rowv = rng.standard_normal(int(H / p) + 3).astype(np.float32)
    row_b = rowv[ridx] * 0.028                  # each rib has its own tone
    # ribs are cut into segments of rush: tone changes along x every ~40-170px
    seg = np.zeros((int(H / p) + 3, W), np.float32)
    for r in range(seg.shape[0]):
        x = -int(rng.integers(0, 120))
        while x < W:
            L = int(rng.integers(40, 170))
            seg[r, max(0, x):max(0, x + L)] = rng.normal(0, 0.02)
            x += L
    seg_b = seg[ridx, xx]
    prof = np.abs(np.sin(np.pi * yy / p)) ** 0.55  # round rib: dark seam between ribs
    rib = 0.76 + 0.24 * prof
    # warp threads (vertical stitches) every ~8px, slight wobble
    warp = (np.sin(xx * (2 * np.pi / 8.0) + np.sin(yy / 37.0) * 0.8) * 0.5 + 0.5) ** 8
    fib = noise(H, W, 0.35, 5, 1.0)             # micro fibres along the rib
    blot = noise(H, W, 70, 90, 1.0)
    lum = 1.0 + row_b + seg_b + 0.03 * fib + 0.04 * blot - 0.045 * warp
    lum = lum * rib / 0.90
    # lamp light: brighter centre, dark corners
    cx, cy = W * 0.5, H * 0.46
    d = np.sqrt(((xx - cx) / (W * 0.75)) ** 2 + ((yy - cy) / (H * 0.7)) ** 2)
    lum *= (1.07 - 0.55 * np.clip(d, 0, 1.4) ** 1.7)
    img = np.stack([base[0] * lum, base[1] * lum * 0.99, base[2] * lum * 0.93], -1)
    shade = np.clip(1.0 - lum, 0, 1)[..., None]
    img += shade * np.array([-14, -4, 4])

    # heri (green cloth border) -- vertical, straight (top-down view)
    hx0, hx1 = int(W * 0.715), int(W * 0.775)
    heri = np.zeros((H, W), bool)
    heri[:, hx0:hx1] = True
    hcol = np.array([52, 76, 52], dtype=np.float32)
    hn = noise(H, W, 0.6, 2.2, 1.0)
    himg = hcol[None, None, :] * (1.0 + 0.07 * hn[..., None]) * (lum[..., None] * 0.95)
    # woven gold diamond motif
    mot = Image.new('L', (W, H), 0)
    md = ImageDraw.Draw(mot)
    step = 46
    cxm = (hx0 + hx1) // 2
    for y in range(-20, H + step, step):
        md.polygon([(cxm, y - 11), (cxm + 11, y), (cxm, y + 11), (cxm - 11, y)], outline=255, width=2)
        md.polygon([(cxm, y - 4), (cxm + 4, y), (cxm, y + 4), (cxm - 4, y)], fill=255)
    mot = np.asarray(mot.filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255.0
    himg = himg * (1 - 0.55 * mot[..., None]) + np.array([150, 134, 74], np.float32) * 0.55 * mot[..., None]
    # border seams + raised edge shading
    edge = np.zeros((H, W), np.float32)
    edge[:, hx0 - 3:hx0 + 1] = 1
    edge[:, hx1:hx1 + 4] = 1
    img = np.where(heri[..., None], himg, img)
    img *= (1 - 0.35 * gaussian_filter(edge, 1.2))[..., None]
    # soft shadow cast beside the heri
    sh = np.zeros((H, W), np.float32)
    sh[:, hx1:hx1 + 22] = np.linspace(0.18, 0, 22)[None, :]
    sh[:, hx0 - 22:hx0] = np.linspace(0, 0.14, 22)[None, :]
    img *= (1 - sh)[..., None]

    # a horizontal mat seam (two mats meet) with a faint ridge
    sy = int(H * 0.655)
    seam = np.zeros((H, W), np.float32)
    seam[sy:sy + 3, :] = 1
    seam = gaussian_filter(seam, 1.4)
    img *= (1 - 0.30 * seam)[..., None]
    hl = np.zeros((H, W), np.float32)
    hl[sy + 4:sy + 6, :] = 1
    img += 14 * gaussian_filter(hl, 1.5)[..., None]

    # film grain
    img += rng.standard_normal((H, W, 1)) * 2.4
    return to_img(img)


# ---------------------------------------------------------------- helpers for props
SS = 2


def canvas(w, h):
    return Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))


def finish(im, w, h):
    return im.resize((w, h), Image.LANCZOS)


def drop_shadow(im, shape_alpha, dx, dy, blur, opacity=0.55, color=(28, 18, 8)):
    """shape_alpha: PIL 'L' image (same size as im)."""
    sh = Image.new('RGBA', im.size, color + (0,))
    a = shape_alpha.filter(ImageFilter.GaussianBlur(blur * SS))
    a = a.point(lambda v: int(v * opacity))
    sh.putalpha(a)
    sh = Image.composite(sh, Image.new('RGBA', im.size, (0, 0, 0, 0)), a)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.alpha_composite(sh, (int(dx * SS), int(dy * SS)))
    out.alpha_composite(im)
    return out


def grad_fill(size, stops, vertical=False):
    """linear gradient image. stops=[(pos,(r,g,b)),...]"""
    w, h = size
    n = h if vertical else w
    xs = np.linspace(0, 1, n)
    pos = [p for p, _ in stops]
    cols = np.array([c for _, c in stops], np.float32)
    arr = np.stack([np.interp(xs, pos, cols[:, i]) for i in range(3)], -1)
    arr = np.repeat(arr[:, None, :], w, 1) if vertical else np.repeat(arr[None, :, :], h, 0)
    return Image.fromarray(arr.astype(np.uint8), 'RGB')


def textured(img_rgb, amp=10, sy=1.0, sx=1.0):
    a = np.asarray(img_rgb, np.float32)
    n = gaussian_filter(rng.standard_normal(a.shape[:2]), (sy, sx))
    n /= n.std() + 1e-9
    return Image.fromarray(np.clip(a + n[..., None] * amp, 0, 255).astype(np.uint8), 'RGB')


def paste_masked(dst, src_rgb, mask):
    rgba = src_rgb.convert('RGBA')
    rgba.putalpha(mask)
    dst.alpha_composite(rgba)


def ellipse_mask(size, box):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return m


# ---------------------------------------------------------------- can (generic, no logo)
def draw_can(w=300, h=380, tilt=0, label=((196, 50, 44), (230, 228, 222))):
    im = canvas(w, h)
    s = SS
    cx = w // 2
    bw = 190                      # body width
    top_y, bot_y = 120, h - 40
    x0, x1 = cx - bw // 2, cx + bw // 2
    body_mask = Image.new('L', im.size, 0)
    bd = ImageDraw.Draw(body_mask)
    bd.rectangle([x0 * s, top_y * s, x1 * s, (bot_y - 20) * s], fill=255)
    bd.ellipse([x0 * s, (bot_y - 44) * s, x1 * s, bot_y * s], fill=255)
    # body shading (cylinder)
    xs = np.linspace(-1, 1, (x1 - x0) * s)
    cyl = 0.46 + 0.54 * np.cos(xs * 1.15) ** 1.6 + 0.35 * np.exp(-((xs + 0.42) / 0.12) ** 2)
    bh = (bot_y - top_y + 10) * s
    body = np.zeros((bh, len(xs), 3), np.float32)
    ys = np.linspace(0, 1, bh)[:, None]
    base = np.where(ys < 0.14, 1, 0)           # silver neck
    sil = np.array([196, 200, 205], np.float32)
    red = np.array(label[0], np.float32)
    wht = np.array(label[1], np.float32)
    colr = np.where(ys < 0.14, 0, 1)
    band_a = np.clip(np.sin(ys * math.pi * 3.0 + 0.5), -1, 1) > 0.15
    body[:] = sil
    lab = np.where(band_a[..., None], red, wht)
    body = np.where(colr[..., None] > 0, lab, body)
    # abstract wave shapes on the label (no text / no brand)
    wave = (np.sin(xs[None, :] * 7 + ys * 9) > 0.82) & (ys > 0.30) & (ys < 0.85)
    body = np.where(wave[..., None], np.array([36, 36, 52], np.float32), body)
    body = body * cyl[None, :, None]
    body_img = Image.fromarray(np.clip(body, 0, 255).astype(np.uint8), 'RGB')
    full = Image.new('RGB', im.size, (0, 0, 0))
    full.paste(body_img, (x0 * s, top_y * s))
    layer = full.convert('RGBA')
    layer.putalpha(body_mask)
    layer = drop_shadow(layer, body_mask, 16, 20, 14, 0.55)
    im.alpha_composite(layer)
    # lid
    d = ImageDraw.Draw(im)
    lid_box = [x0 * s, (top_y - 36) * s, x1 * s, (top_y + 36) * s]
    lid_m = ellipse_mask(im.size, lid_box)
    lg = grad_fill(im.size, [(0, (150, 154, 160)), (0.35, (236, 238, 240)), (0.6, (190, 194, 200)), (1, (126, 130, 138))])
    paste_masked(im, textured(lg, 4), lid_m)
    d.ellipse(lid_box, outline=(110, 114, 120, 255), width=2 * s)
    d.ellipse([(x0 + 12) * s, (top_y - 25) * s, (x1 - 12) * s, (top_y + 25) * s], outline=(150, 154, 160, 255), width=2 * s)
    # opened hole + tab
    hole = [(cx - 52) * s, (top_y - 22) * s, (cx + 40) * s, (top_y + 12) * s]
    d.ellipse(hole, fill=(26, 20, 16, 255), outline=(94, 98, 104, 255), width=2 * s)
    tab = [(cx - 16) * s, (top_y - 6) * s, (cx + 34) * s, (top_y + 22) * s]
    d.rounded_rectangle(tab, radius=10 * s, fill=(206, 210, 216, 255), outline=(120, 124, 130, 255), width=2 * s)
    d.ellipse([(cx + 6) * s, (top_y + 2) * s, (cx + 22) * s, (top_y + 14) * s], fill=(48, 40, 34, 255))
    # rim highlight
    d.arc(lid_box, 200, 290, fill=(255, 255, 255, 190), width=3 * s)
    im = im.rotate(tilt, resample=Image.BICUBIC, center=(w * s // 2, h * s // 2))
    return finish(im, w, h)


# ---------------------------------------------------------------- potato chips
def chip(size=90, rot=0):
    w = h = size + 20
    im = canvas(w, h)
    s = SS
    pts = []
    ph = rng.uniform(0, 6.28)
    for i in range(72):
        t = i / 72 * 2 * math.pi
        r = 1 + 0.07 * math.sin(3 * t + ph) + 0.045 * math.sin(5 * t + 2 * ph) + 0.02 * math.sin(11 * t)
        pts.append((w / 2 * s + math.cos(t) * size / 2 * s * r * 1.08, h / 2 * s + math.sin(t) * size / 2 * s * r * 0.86))
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    g = grad_fill(im.size, [(0, (232, 196, 96)), (0.5, (246, 214, 120)), (1, (214, 168, 70))], vertical=True)
    g = textured(g, 8, 2.0, 2.0)
    a = np.asarray(g, np.float32)
    # fried darker rim
    inner = np.asarray(m.filter(ImageFilter.GaussianBlur(10 * s)), np.float32) / 255.0
    rim = np.clip(1.0 - inner * 1.25, 0, 1)[..., None]
    a = a * (1 - 0.30 * rim) + np.array([150, 90, 30]) * 0.30 * rim
    # blisters
    bl = noise(im.size[1], im.size[0], 6 * s, 6 * s, 1.0)
    a += (bl[..., None] * 9)
    g = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    layer = g.convert('RGBA')
    layer.putalpha(m)
    layer = drop_shadow(layer, m, 4, 6, 3.5, 0.55)
    layer = layer.rotate(rot, resample=Image.BICUBIC)
    return finish(layer, w, h)


def crumb(im, x, y, r=4):
    d = ImageDraw.Draw(im)
    d.ellipse([(x - r) * SS, (y - r * 0.8) * SS, (x + r) * SS, (y + r * 0.8) * SS], fill=(222, 178, 84, 255))


# ---------------------------------------------------------------- foil snack bag (generic)
def draw_bag(w=330, h=300, base=((196, 40, 30), (240, 170, 40))):
    im = canvas(w, h)
    s = SS
    pts = [(10, 70), (90, 10), (250, 26), (318, 140), (296, 290), (150, 280), (30, 220)]
    pts = [(x + rng.uniform(-6, 6), y + rng.uniform(-6, 6)) for x, y in pts]
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).polygon([(x * s, y * s) for x, y in pts], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(14 * s)).point(lambda v: 255 if v > 128 else 0).filter(ImageFilter.GaussianBlur(1.2 * s))
    g = grad_fill(im.size, [(0, base[1]), (0.45, base[0]), (1, (150, 24, 22))], vertical=False)
    arr = np.asarray(g, np.float32)
    # crumpled foil highlights
    cr = noise(im.size[1], im.size[0], 7 * s, 22 * s, 1.0)
    cr2 = noise(im.size[1], im.size[0], 20 * s, 6 * s, 1.0)
    arr = arr * (1 + 0.20 * cr[..., None] + 0.12 * cr2[..., None])
    spec = np.clip(cr * cr2 - 0.5, 0, 2) * 90
    arr += spec[..., None]
    g = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')
    layer = g.convert('RGBA')
    layer.putalpha(m)
    d = ImageDraw.Draw(layer)
    # generic stripe + seal (no brand text)
    d.polygon([(40 * s, 190 * s), (310 * s, 120 * s), (312 * s, 168 * s), (50 * s, 236 * s)], fill=(250, 244, 226, 230))
    d.polygon([(60 * s, 214 * s), (306 * s, 148 * s), (308 * s, 160 * s), (64 * s, 226 * s)], fill=(196, 40, 30, 220))
    layer.putalpha(m)
    layer = drop_shadow(layer, m, 14, 16, 12, 0.55)
    return finish(layer, w, h)


# ---------------------------------------------------------------- cloth (yukata), skin
def cloth_layer(size, mask, base=(30, 36, 70), tone=1.0):
    W, H = size
    g = np.zeros((H, W, 3), np.float32)
    g[:] = base
    n = noise(H, W, 1.0, 1.0, 1.0)
    n2 = noise(H, W, 8, 8, 1.0)
    g = g * (1 + 0.10 * n[..., None] + 0.12 * n2[..., None]) * tone
    # seigaiha-ish pattern: concentric arcs
    pat = Image.new('L', size, 0)
    pd = ImageDraw.Draw(pat)
    R = 34 * SS
    for row in range(-2, H // (R // 2) + 3):
        for col in range(-2, W // (R * 2 // 2) + 3):
            ox = col * R * 2 + (R if row % 2 else 0)
            oy = row * (R // 2)
            for k in (1.0, 0.68, 0.38):
                rr = R * k
                pd.arc([ox - rr, oy - rr, ox + rr, oy + rr], 180, 360, fill=255, width=max(2, SS))
    pat = np.asarray(pat.filter(ImageFilter.GaussianBlur(0.6 * SS)), np.float32) / 255.0
    g = g * (1 - 0.55 * pat[..., None]) + np.array([170, 190, 220]) * 0.55 * pat[..., None] * 0.65
    out = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    out.putalpha(mask)
    return out


def folds(layer, mask, n=5, seed_shift=0):
    W, H = layer.size
    sh = np.zeros((H, W), np.float32)
    d = ImageDraw.Draw(Image.new('L', (1, 1)))
    f = Image.new('L', layer.size, 0)
    fd = ImageDraw.Draw(f)
    for _ in range(n):
        x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
        ang = rng.uniform(0, math.pi)
        L = rng.uniform(0.3, 0.7) * max(W, H)
        fd.line([(x0, y0), (x0 + math.cos(ang) * L, y0 + math.sin(ang) * L)], fill=255, width=int(14 * SS))
    f = np.asarray(f.filter(ImageFilter.GaussianBlur(16 * SS)), np.float32) / 255.0
    a = np.asarray(layer, np.float32).copy()
    a[..., :3] *= (1 - 0.55 * f)[..., None]
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def draw_skin(size, box, kind='ellipse'):
    W, H = size
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - cx + 40) / (box[2] - box[0]) * 2) ** 2 + ((yy - cy + 50) / (box[3] - box[1]) * 2) ** 2)
    lum = 1.05 - 0.55 * np.clip(d, 0, 1.2) ** 1.5
    a = np.zeros((H, W, 3), np.float32)
    a[:] = (206, 150, 118)
    a = a * lum[..., None] * (1 + 0.04 * noise(H, W, 2, 2, 1.0)[..., None])
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    out.putalpha(m)
    return out


# ---------------------------------------------------------------- small dish with peanuts
def draw_dish(w=210, h=210, contents='peanuts'):
    im = canvas(w, h)
    s = SS
    cx = cy = w // 2
    R = w // 2 - 14
    m = ellipse_mask(im.size, [(cx - R) * s, (cy - R) * s, (cx + R) * s, (cy + R) * s])
    g = grad_fill(im.size, [(0, (26, 46, 92)), (0.5, (44, 70, 124)), (1, (18, 30, 64))], vertical=True)
    layer = textured(g, 5, 1.2, 1.2).convert('RGBA')
    layer.putalpha(m)
    layer = drop_shadow(layer, m, 10, 14, 9, 0.55)
    im.alpha_composite(layer)
    d = ImageDraw.Draw(im)
    d.ellipse([(cx - R) * s, (cy - R) * s, (cx + R) * s, (cy + R) * s], outline=(150, 176, 220, 255), width=3 * s)
    r2 = R - 18
    inner = ellipse_mask(im.size, [(cx - r2) * s, (cy - r2) * s, (cx + r2) * s, (cy + r2) * s])
    ig = grad_fill(im.size, [(0, (14, 24, 52)), (1, (30, 48, 88))], vertical=True)
    paste_masked(im, ig, inner)
    for _ in range(7):
        a = rng.uniform(0, 6.28)
        rr = rng.uniform(0, r2 - 20)
        x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
        e = rng.uniform(0, 180)
        nut = Image.new('RGBA', im.size, (0, 0, 0, 0))
        nd = ImageDraw.Draw(nut)
        nd.ellipse([(x - 17) * s, (y - 10) * s, (x + 17) * s, (y + 10) * s], fill=(204, 160, 96, 255), outline=(150, 108, 60, 255), width=2 * s)
        nd.line([(x - 6) * s, (y) * s, (x + 6) * s, y * s], fill=(160, 120, 70, 255), width=2 * s)
        nut = nut.rotate(e, center=(x * s, y * s), resample=Image.BICUBIC)
        im.alpha_composite(nut)
    return finish(im, w, h)


def mute(im, blur=1.1, dark=0.86, desat=0.18):
    """周辺の小物は被写界深度の外にあるイメージ: わずかにボカして暗く、彩度を落とす。"""
    a = np.asarray(im, np.float32).copy()
    rgb = a[..., :3]
    gray = rgb.mean(-1, keepdims=True)
    rgb = rgb * (1 - desat) + gray * desat
    a[..., :3] = rgb * dark
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    al = out.getchannel('A')
    out = out.filter(ImageFilter.GaussianBlur(blur))
    out.putalpha(al.filter(ImageFilter.GaussianBlur(blur * 0.6)))
    return out


# ---------------------------------------------------------------- compose corners
def edge_fade(layer, side, px):
    """no-op placeholder: props are allowed to bleed off the canvas edge."""
    return layer


def compose_tl(W=440, H=560):
    return mute(_compose_tl(W, H))


def _compose_tl(W=440, H=560):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # yukata sleeve top-left
    big = (W * SS, H * SS)
    cm = Image.new('L', big, 0)
    ImageDraw.Draw(cm).polygon([(0, 0), (330 * SS, 0), (300 * SS, 60 * SS), (210 * SS, 108 * SS), (60 * SS, 140 * SS), (0, 170 * SS)], fill=255)
    cl = cloth_layer(big, cm)
    cl = folds(cl, cm, 4)
    cl = drop_shadow(cl, cm, 6, 10, 10, 0.6)
    cl = finish(cl, W, H)
    # forearm
    sk = Image.new('RGBA', big, (0, 0, 0, 0))
    skm = Image.new('L', big, 0)
    ImageDraw.Draw(skm).polygon([(290 * SS, 0), (440 * SS, 0), (430 * SS, 40 * SS), (330 * SS, 74 * SS), (270 * SS, 60 * SS)], fill=255)
    sk = Image.new('RGB', big, (190, 138, 108))
    sk = textured(sk, 5, 3, 3).convert('RGBA')
    sk.putalpha(skm.filter(ImageFilter.GaussianBlur(1.5 * SS)))
    sk = finish(drop_shadow(sk, skm, 4, 8, 6, 0.5), W, H)
    im.alpha_composite(sk)
    im.alpha_composite(cl)
    # bag corner
    bag = draw_bag(300, 250)
    im.alpha_composite(bag.rotate(-8, resample=Image.BICUBIC, expand=True), (-120, 210))
    # can
    can = draw_can(260, 330, tilt=8)
    im.alpha_composite(can, (96, 24))
    # chips + crumbs
    for (x, y, sz, r) in [(150, 372, 70, 18), (236, 404, 64, -25), (96, 452, 56, 40), (300, 318, 52, 70)]:
        im.alpha_composite(chip(sz, r), (x - sz // 2 - 10, y - sz // 2 - 10))
    big_c = canvas(W, H)
    for _ in range(14):
        crumb(big_c, rng.uniform(60, 340), rng.uniform(340, 500), rng.uniform(1.5, 3.5))
    im.alpha_composite(finish(big_c, W, H))
    return im


def compose_tr(W=440, H=560):
    return mute(_compose_tr(W, H))


def _compose_tr(W=440, H=560):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    big = (W * SS, H * SS)
    cm = Image.new('L', big, 0)
    ImageDraw.Draw(cm).polygon([(W * SS, 0), (110 * SS, 0), (150 * SS, 50 * SS), (240 * SS, 94 * SS), (W * SS, 120 * SS)], fill=(255))
    cl = cloth_layer(big, cm, base=(34, 40, 78))
    cl = folds(cl, cm, 4)
    cl = finish(drop_shadow(cl, cm, -4, 10, 9, 0.6), W, H)
    skm = Image.new('L', big, 0)
    ImageDraw.Draw(skm).polygon([(W * SS, 90 * SS), (250 * SS, 80 * SS), (240 * SS, 120 * SS), (320 * SS, 150 * SS), (W * SS, 168 * SS)], fill=255)
    sk = textured(Image.new('RGB', big, (186, 134, 104)), 5, 3, 3).convert('RGBA')
    sk.putalpha(skm.filter(ImageFilter.GaussianBlur(1.5 * SS)))
    sk = finish(drop_shadow(sk, skm, 4, 8, 6, 0.5), W, H)
    im.alpha_composite(sk)
    im.alpha_composite(cl)
    im.alpha_composite(draw_can(250, 320, tilt=-6), (220, 150))
    im.alpha_composite(draw_dish(190, 190), (230, 380))
    return im


def compose_bl(W=440, H=560):
    return mute(_compose_bl(W, H))


def _compose_bl(W=440, H=560):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    big = (W * SS, H * SS)
    im.alpha_composite(draw_can(250, 320, tilt=-10), (24, 60))
    im.alpha_composite(draw_dish(230, 230), (-24, 232))
    # knee (skin) + yukata
    sk = draw_skin(big, [150 * SS, 380 * SS, 440 * SS, 700 * SS])
    sk = finish(drop_shadow(sk, sk.getchannel('A'), 6, -6, 12, 0.45), W, H)
    im.alpha_composite(sk)
    cm = Image.new('L', big, 0)
    ImageDraw.Draw(cm).polygon([(0, 480 * SS), (200 * SS, 480 * SS), (330 * SS, 560 * SS), (W * SS, 540 * SS), (W * SS, H * SS), (0, H * SS)], fill=255)
    cl = cloth_layer(big, cm, base=(26, 32, 66))
    cl = folds(cl, cm, 3)
    cl = finish(drop_shadow(cl, cm, 0, -6, 9, 0.55), W, H)
    im.alpha_composite(cl)
    return im


def compose_br(W=440, H=560):
    return mute(_compose_br(W, H))


def _compose_br(W=440, H=560):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    big = (W * SS, H * SS)
    bag = draw_bag(360, 330, base=((178, 34, 28), (236, 160, 36)))
    im.alpha_composite(bag.rotate(14, resample=Image.BICUBIC, expand=True), (110, 20))
    # sock-clad foot
    fm = Image.new('L', big, 0)
    ImageDraw.Draw(fm).ellipse([-30 * SS, 330 * SS, 290 * SS, 640 * SS], fill=255)
    foot = Image.new('RGB', big, (36, 40, 52))
    foot = textured(foot, 9, 1.4, 1.4)
    a = np.asarray(foot, np.float32)
    knit = (np.sin(np.arange(big[0])[None, :] / 4.0) * np.sin(np.arange(big[1])[:, None] / 3.0)) * 7
    foot = Image.fromarray(np.clip(a + knit[..., None], 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    foot.putalpha(fm)
    foot = finish(drop_shadow(foot, fm, 8, -8, 12, 0.55), W, H)
    im.alpha_composite(foot)
    cm = Image.new('L', big, 0)
    ImageDraw.Draw(cm).polygon([(150 * SS, H * SS), (200 * SS, 470 * SS), (W * SS, 440 * SS), (W * SS, H * SS)], fill=255)
    cl = cloth_layer(big, cm, base=(28, 34, 70))
    cl = folds(cl, cm, 3)
    cl = finish(drop_shadow(cl, cm, -4, -6, 9, 0.55), W, H)
    im.alpha_composite(cl)
    return im


# ---------------------------------------------------------------- card paper / back
def make_paper(W=192, H=272):
    """worn playing-card paper: warm white, fibres, stains, creases, scuffed corners."""
    base = np.array([240, 230, 206], np.float32)
    n_f = noise(H, W, 0.6, 1.8, 1.0)
    n_s = noise(H, W, 14, 14, 1.0)
    n_s2 = noise(H, W, 5, 5, 1.0)
    img = np.zeros((H, W, 3), np.float32)
    img[:] = base
    img *= (1 + 0.012 * n_f + 0.03 * n_s + 0.015 * n_s2)[..., None]
    # yellowed stains
    st = np.clip(n_s - 0.7, 0, 3)
    img[..., 2] -= st * 12
    img[..., 1] -= st * 5
    # creases (soft lines)
    cr = Image.new('L', (W, H), 0)
    cd = ImageDraw.Draw(cr)
    for _ in range(3):
        x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
        ang = rng.uniform(0, math.pi)
        L = rng.uniform(0.35, 0.8) * H
        cd.line([(x0, y0), (x0 + math.cos(ang) * L, y0 + math.sin(ang) * L)], fill=255, width=1)
    cr_a = np.asarray(cr.filter(ImageFilter.GaussianBlur(0.9)), np.float32) / 255.0
    cr_b = np.asarray(cr.filter(ImageFilter.GaussianBlur(0.9)).transform((W, H), Image.AFFINE, (1, 0, 1.6, 0, 1, 1.2)), np.float32) / 255.0
    img *= (1 - 0.18 * cr_a)[..., None]
    img += 22 * cr_b[..., None]
    # edge wear (darker, slightly rougher)
    yy, xx = np.mgrid[0:H, 0:W]
    ed = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy)).astype(np.float32)
    wear = np.exp(-ed / 5.5) * (0.5 + 0.5 * noise(H, W, 3, 3, 1.0))
    img *= (1 - 0.10 * np.clip(wear, 0, 1.2))[..., None]
    # corner scuffs
    for (cx, cy) in [(0, 0), (W, 0), (0, H), (W, H)]:
        dd = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        img *= (1 - 0.14 * np.exp(-dd / 16.0) * (0.6 + 0.4 * n_s2.clip(-1, 1)))[..., None]
    img += rng.standard_normal((H, W, 1)) * 1.6
    return to_img(img)


def make_card_back(W=192, H=272):
    im = Image.new('RGB', (W, H), (236, 224, 200))
    d = ImageDraw.Draw(im)
    m = 12
    d.rectangle([m, m, W - m, H - m], fill=(150, 36, 40))
    d.rectangle([m + 6, m + 6, W - m - 6, H - m - 6], outline=(236, 214, 190), width=2)
    # asanoha-like lattice
    for i in range(-H, W + H, 22):
        d.line([(m + i, m), (m + i + H, H - m)], fill=(196, 84, 78), width=2)
        d.line([(m + i + H, m), (m + i, H - m)], fill=(196, 84, 78), width=2)
    for y in range(m + 18, H - m - 10, 44):
        for x in range(m + 14, W - m - 8, 44):
            d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(232, 205, 176))
    # centre medallion
    cx, cy = W // 2, H // 2
    d.ellipse([cx - 42, cy - 42, cx + 42, cy + 42], fill=(150, 36, 40), outline=(236, 214, 190), width=3)
    d.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], outline=(236, 214, 190), width=2)
    for k in range(8):
        a = k * math.pi / 4
        d.line([(cx, cy), (cx + math.cos(a) * 30, cy + math.sin(a) * 30)], fill=(236, 214, 190), width=2)
    a = np.asarray(im, np.float32)
    n = noise(H, W, 0.7, 0.7, 1.0)
    n2 = noise(H, W, 9, 9, 1.0)
    a = a * (1 + 0.025 * n[..., None] + 0.04 * n2[..., None])
    return to_img(a)


def save(img, name, q=80, lossless=False):
    p = os.path.join(OUT, name)
    img.save(p, 'WEBP', quality=q, method=6, lossless=lossless)
    print(f'{name}: {os.path.getsize(p) / 1024:.0f} KB {img.size}')


if __name__ == '__main__':
    save(make_tatami(), 'tatami.webp', 74)
    save(compose_tl(), 'prop-tl.webp', 82)
    save(compose_tr(), 'prop-tr.webp', 82)
    save(compose_bl(), 'prop-bl.webp', 82)
    save(compose_br(), 'prop-br.webp', 82)
    save(make_paper(), 'paper.webp', 86)
    save(make_card_back(), 'card-back.webp', 86)
