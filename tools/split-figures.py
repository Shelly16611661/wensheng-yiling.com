#!/usr/bin/env python3
"""
split-figures.py ── 把「兩人合照去背圖」拆成她 / 他 兩層,並產生浮雕高度圖與法線圖。

    python3 tools/split-figures.py assets/couple-cutout.png

輸出(全部在 assets/):
    figure-her.png / figure-him.png        兩層去背圖(各自裁到自己的外框)
    figure-her-h.png / figure-him-h.png    高度圖(灰階;愈亮愈凸)→ Three.js displacementMap
    figure-her-n.png / figure-him-n.png    法線圖 → normalMap
    ../js/figures.js                        兩層在原圖中的位置(window.FIGURES)
    tools/out/split-preview.png             檢查用:縫線 / 兩層 / 高度圖

原理:
  1. 若原圖沒有透明通道,先從邊緣 flood-fill 把白底去掉(只去「連到邊界的白」,不會吃掉白褲子)。
  2. 在左右兩人之間找一條「最省力」的縫:背景最便宜、強邊緣其次、實心區最貴(動態規劃,每列一個 x)。
  3. 縫左邊 = 她,右邊 = 他。因為她在前(裙襬蓋住他的腿),把「他」沿縫往她底下延伸 12px,
     之後兩層各自微動時不會露出縫。
  4. 高度圖 = 各層遮罩的距離變換(邊緣 0、中心高),做成陶瓷浮雕。

需要:pip install pillow numpy scipy
可調參數見 argparse --help(縫的搜尋範圍、延伸量、浮雕深度)。
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

def key_background(rgba, tol=26):
    """從四邊 flood-fill 近白背景 → alpha。只清「連到邊界」的背景。"""
    rgb = rgba[..., :3].astype(np.int16)
    h, w = rgb.shape[:2]
    # 背景參考色 = 四角平均
    corners = np.array([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]]).mean(0)
    near = (np.abs(rgb - corners).max(-1) <= tol)
    lab, n = ndi.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # 邊緣柔化:離背景 1px 內依接近白的程度半透明
    dist = ndi.distance_transform_edt(~bg)
    edge = (dist > 0) & (dist <= 1.5)
    whiteness = np.clip((np.abs(rgb - corners).max(-1) - tol) / 40.0, 0, 1)
    alpha = alpha.astype(np.float32)
    alpha[edge] = 255 * np.clip(0.35 + 0.65 * whiteness[edge], 0, 1)
    out = rgba.copy(); out[..., 3] = alpha.astype(np.uint8)
    return out

def estimate_prior(solid, top_x=None, bottom_x=None, guide=None):
    """估計縫該經過的路徑(每列一個 x):
       上端 = 兩顆頭之間最低的凹點;下段(底部 30%)= 兩人之間的空隙中心;中段線性內插。
       guide = [(fx, fy), ...] 正規化座標的手動折線,給了就直接用。"""
    from scipy.signal import find_peaks
    H, W = solid.shape
    if guide:
        pts = sorted((fy * (H - 1), fx * W) for fx, fy in guide)
        ys = [p[0] for p in pts]; xs = [p[1] for p in pts]
        return np.interp(np.arange(H), ys, xs), int(xs[0]), int(xs[-1])
    if top_x is None:
        hp = head_peaks(solid)
        top_x = hp[2] if hp else W // 2
    else:
        top_x = int(top_x * W)
    pts_y, pts_x = [0], [float(top_x)]
    if bottom_x is None:
        last = float(top_x)
        for y in range(int(H * 0.70), H):
            row = solid[y]
            if not row.any(): continue
            d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
            starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
            if len(starts) < 2: continue
            gaps = [((ends[i] + starts[i + 1]) / 2.0, starts[i + 1] - ends[i]) for i in range(len(starts) - 1)]
            gaps = [g for g in gaps if g[1] >= 3 and 0.25 * W <= g[0] <= 0.8 * W]
            if not gaps: continue
            c = min(gaps, key=lambda g: abs(g[0] - last))[0]
            pts_y.append(y); pts_x.append(c); last = c
        if len(pts_y) == 1:  # 找不到空隙 → 直線
            pts_y.append(H - 1); pts_x.append(float(top_x))
        elif pts_y[-1] < H - 1:
            pts_y.append(H - 1); pts_x.append(pts_x[-1])
        bottom_x = int(pts_x[-1])
    else:
        bottom_x = int(bottom_x * W); pts_y.append(H - 1); pts_x.append(float(bottom_x))
    prior = np.interp(np.arange(H), pts_y, pts_x)
    # 平滑一下(空隙中心逐列跳動)
    prior = ndi.uniform_filter1d(prior, size=max(5, int(H * 0.04)), mode='nearest')
    return prior, int(top_x), int(bottom_x)

def head_peaks(solid):
    """回傳(左頭 x, 右頭 x, 兩頭之間凹點 x)或 None。"""
    from scipy.signal import find_peaks
    H, W = solid.shape
    cols = solid.any(0)
    top = np.where(cols, solid.argmax(0), H).astype(np.float32)
    win = max(3, int(W * 0.03)); k = np.ones(win) / win
    top_s = np.convolve(np.pad(top, win // 2, mode='edge'), k, 'valid')[:W]
    peaks, props = find_peaks(-top_s, prominence=H * 0.008, distance=int(W * 0.12))
    if len(peaks) < 2: return None
    order = np.argsort(props['prominences'])[::-1][:2]
    a, b = sorted(peaks[order]); seg = top_s[a:b + 1]
    return int(a), int(b), int(a + seg.argmax()), float(max(top_s[a], top_s[b]))

def find_seam(rgba, prior, corridor_frac, heads=None):
    """動態規劃找上→下的縫。
       cost:兩人之間的空隙≈0 → 強色彩邊緣便宜 → 實心貴;人外側的背景 0.6(別沿著外輪廓跑);
       離先驗走廊愈遠愈貴;上方兩頭之間設硬牆(縫不能繞到任何一顆頭外面)。"""
    a = rgba[..., 3].astype(np.float32) / 255.0
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    mags = []
    for c in range(3):
        gx = ndi.sobel(rgb[..., c], axis=1); gy = ndi.sobel(rgb[..., c], axis=0); mags.append(np.hypot(gx, gy))
    sat = rgb.max(-1) - rgb.min(-1)
    mags.append(1.5 * np.hypot(ndi.sobel(sat, axis=1), ndi.sobel(sat, axis=0)))
    edge = np.max(mags, axis=0)
    edge = edge / (np.percentile(edge[a > 0.5], 96) + 1e-6)
    edge = np.clip(edge, 0, 1)
    cost = a * (1.0 - 0.9 * edge) + 0.015
    h, w = cost.shape
    # 外側背景(該列第一段實心之前 / 最後一段之後)
    solid = a > 0.5
    first = np.where(solid.any(1), solid.argmax(1), w)
    last = np.where(solid.any(1), w - 1 - solid[:, ::-1].argmax(1), -1)
    xs = np.arange(w)[None, :]
    exterior = (xs < first[:, None]) | (xs > last[:, None])
    cost = np.where(exterior, 0.6, cost)
    # 先驗走廊
    tol = max(4.0, w * corridor_frac)
    dx = np.abs(xs - prior[:, None])
    cost = cost + 0.8 * np.clip((dx - tol) / tol, 0, None) ** 2
    # 頭部硬牆
    if heads:
        hl, hr, _, ytop = heads
        ywall = int(min(h, ytop + h * 0.14)); m = int(w * 0.03)
        cost[:ywall, :hl + m] = 9.0; cost[:ywall, hr - m:] = 9.0
    D = np.full((h, w), np.inf, dtype=np.float32); P = np.zeros((h, w), dtype=np.int8)
    D[0] = cost[0]
    for y in range(1, h):
        prev = D[y - 1]
        left = np.concatenate([[np.inf], prev[:-1]]) + 0.35
        right = np.concatenate([prev[1:], [np.inf]]) + 0.35
        stack = np.stack([left, prev, right])
        k = stack.argmin(0)
        D[y] = stack[k, np.arange(w)] + cost[y]
        P[y] = k - 1
    x = int(D[-1].argmin()); seam = np.zeros(h, dtype=np.int32)
    for y in range(h - 1, -1, -1):
        seam[y] = x; x = x + int(P[y, x])
    return seam, float(D[-1].min())

def propagate_colors(rgb, known, target, iters=40):
    """把 known 區的顏色一圈圈往 target 區推(簡易 inpaint)。"""
    rgb = rgb.astype(np.float32).copy()
    filled = known.copy()
    todo = target & ~known
    for _ in range(iters):
        if not todo.any(): break
        ring = ndi.binary_dilation(filled, iterations=1) & todo
        if not ring.any(): break
        # 每個 ring 像素取 3x3 內已填像素的平均
        num = np.zeros_like(rgb); den = np.zeros(rgb.shape[:2], np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0: continue
                sh = np.roll(np.roll(rgb, dy, 0), dx, 1); fm = np.roll(np.roll(filled, dy, 0), dx, 1)
                num += sh * fm[..., None]; den += fm
        rgb[ring] = num[ring] / np.maximum(den[ring], 1)[..., None]
        filled |= ring; todo &= ~ring
    return rgb

def heightmap(mask, depth_px, gamma=0.6, blur=2.0):
    d = ndi.distance_transform_edt(mask)
    hgt = np.clip(d / float(depth_px), 0, 1) ** gamma
    hgt = ndi.gaussian_filter(hgt, blur) * mask
    return hgt

def normalmap(hgt, strength):
    gy, gx = np.gradient(hgt * strength)
    n = np.stack([-gx, -gy, np.ones_like(hgt)], -1)  # y 向下的影像座標 → 法線圖用 OpenGL 慣例(y 朝上)要翻 gy
    n[..., 1] = gy * 1.0  # 影像 y 往下 = 法線 -y,所以此處符號相反
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)

def bbox(mask, pad=2):
    ys, xs = np.where(mask)
    return max(0, xs.min() - pad), max(0, ys.min() - pad), min(mask.shape[1], xs.max() + pad + 1), min(mask.shape[0], ys.max() + pad + 1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', nargs='?', default='assets/couple-cutout.png')
    ap.add_argument('--out', default='assets')
    ap.add_argument('--top-x', type=float, default=None, help='縫在最上方的位置(佔寬度比例,預設自動:兩頭之間)')
    ap.add_argument('--bottom-x', type=float, default=None, help='縫在最下方的位置(預設自動:兩腳之間)')
    ap.add_argument('--corridor', type=float, default=0.12, help='允許縫偏離先驗路徑的寬度(佔寬度比例)')
    ap.add_argument('--guide', type=str, default=None, help='手動先驗折線,正規化座標,例:"0.48,0 0.52,0.4 0.6,0.7 0.55,1"')
    ap.add_argument('--extend', type=int, default=12, help='把「他」延伸到「她」底下的像素數')
    ap.add_argument('--depth', type=float, default=0.085, help='浮雕深度(距離達到圖高的此比例時最凸)')
    ap.add_argument('--front', choices=['her', 'him'], default='her', help='誰在前面(蓋住另一人)')
    ap.add_argument('--map-scale', type=float, default=0.5, help='高度圖 / 法線圖的縮放(不需要全解析度)')
    ap.add_argument('--keep-alpha', action='store_true', help='原圖已有透明就直接用,不重新去背')
    args = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = os.path.join(root, args.src) if not os.path.isabs(args.src) else args.src
    outdir = os.path.join(root, args.out); os.makedirs(outdir, exist_ok=True)
    dbg = os.path.join(root, 'tools', 'out'); os.makedirs(dbg, exist_ok=True)

    im = Image.open(src).convert('RGBA'); rgba = np.array(im)
    had_alpha = (rgba[..., 3] < 250).any()
    if not had_alpha and not args.keep_alpha:
        print('原圖沒有透明背景 → 從邊緣去白底'); rgba = key_background(rgba)
        Image.fromarray(rgba).save(src); print('  已回寫透明版:', os.path.relpath(src, root))
    alpha = rgba[..., 3]
    solid = alpha > 8
    # 裁到外框 + 留邊
    x0, y0, x1, y1 = bbox(solid, pad=6)
    rgba = rgba[y0:y1, x0:x1]; alpha = rgba[..., 3]; solid = alpha > 8
    H, W = alpha.shape
    print(f'工作區 {W}×{H}(原圖裁掉透明邊後)')

    guide = [tuple(float(v) for v in pt.split(',')) for pt in args.guide.split()] if args.guide else None
    prior, tx, bx = estimate_prior(alpha > 128, args.top_x, args.bottom_x, guide)
    print(f'先驗:上端 x={tx}({tx / W:.2f}),下端 x={bx}({bx / W:.2f}),走廊 ±{args.corridor:.2f}')
    heads = head_peaks(alpha > 128)
    if heads: print(f'頭:左 x={heads[0]},右 x={heads[1]},凹點 x={heads[2]}')
    seam, total = find_seam(rgba, prior, args.corridor, heads)
    print(f'縫:x 範圍 {seam.min()}–{seam.max()},總成本 {total:.1f}')
    xs = np.arange(W)[None, :]
    left = solid & (xs < seam[:, None]); right = solid & (xs >= seam[:, None])
    # 縫兩側:小碎片歸回主體(例如她手肘縫隙裡露出的他的衣角,保留在原層即可,不特別處理)
    her, him = (left, right)
    if args.front == 'him': front, back = him, her
    else: front, back = her, him

    # 把後面那人沿縫往前面那人底下延伸,避免微動時露縫
    band = ndi.binary_dilation(back, iterations=args.extend) & front
    back_ext = back | band
    rgb = rgba[..., :3].astype(np.float32)
    rgb_back = propagate_colors(rgb, back, band, iters=args.extend + 4)
    # 延伸區的邊緣稍微柔化
    dist_in = ndi.distance_transform_edt(back_ext)
    a_back = np.where(back_ext, alpha, 0).astype(np.float32)
    a_back[band] = 255 * np.clip(dist_in[band] / 2.0, 0, 1)
    a_front = np.where(front, alpha, 0).astype(np.float32)
    # 前面那人的邊緣也保留原始的半透明邊
    a_front[front & (alpha < 255)] = alpha[front & (alpha < 255)]

    depth_px = args.depth * H
    layers = {}
    for name, mask, a, col in ((('her', front, a_front, rgb) if args.front == 'her' else ('her', back_ext, a_back, rgb_back)),
                               (('him', back_ext, a_back, rgb_back) if args.front == 'her' else ('him', front, a_front, rgb))):
        bx0, by0, bx1, by1 = bbox(mask, pad=3)
        layer = np.zeros((by1 - by0, bx1 - bx0, 4), np.uint8)
        layer[..., :3] = np.clip(col[by0:by1, bx0:bx1], 0, 255).astype(np.uint8)
        layer[..., 3] = np.clip(a[by0:by1, bx0:bx1], 0, 255).astype(np.uint8)
        # 透明區的 RGB 用鄰近顏色填(避免縮圖時出現黑邊)
        m = layer[..., 3] > 0
        fillrgb = propagate_colors(layer[..., :3].astype(np.float32), m, ~m, iters=6)
        layer[..., :3] = np.where(m[..., None], layer[..., :3], np.clip(fillrgb, 0, 255).astype(np.uint8))
        Image.fromarray(layer).save(os.path.join(outdir, f'figure-{name}.png'))
        hm = heightmap(mask[by0:by1, bx0:bx1], depth_px)
        small = (max(1, int(hm.shape[1] * args.map_scale)), max(1, int(hm.shape[0] * args.map_scale)))
        Image.fromarray((hm * 255).astype(np.uint8), 'L').resize(small, Image.LANCZOS).save(os.path.join(outdir, f'figure-{name}-h.png'))
        Image.fromarray(normalmap(hm, strength=depth_px * 0.9)).resize(small, Image.LANCZOS).save(os.path.join(outdir, f'figure-{name}-n.png'))
        # 腳底中心 = 底部 3% 列的遮罩質心 → 3D 旋轉軸
        rows = mask[by0:by1, bx0:bx1]; hh = rows.shape[0]
        bottom = rows[int(hh * 0.96):]
        ys_, xs_ = np.where(bottom)
        pivot = float(xs_.mean()) if len(xs_) else rows.shape[1] / 2
        layers[name] = dict(src=f'assets/figure-{name}.png', height=f'assets/figure-{name}-h.png', normal=f'assets/figure-{name}-n.png',
                            x=int(bx0), y=int(by0), w=int(bx1 - bx0), h=int(by1 - by0), pivot=round(pivot, 1))
        print(f'  {name}: 外框 ({bx0},{by0}) {bx1-bx0}×{by1-by0},腳底 x={pivot:.0f}')

    meta = dict(image=dict(w=int(W), h=int(H)), front=args.front, her=layers['her'], him=layers['him'])
    with open(os.path.join(root, 'js', 'figures.js'), 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/split-figures.py 產生:兩層公仔在原圖中的位置(像素) */\nwindow.FIGURES = ' + json.dumps(meta, ensure_ascii=False, indent=2) + ';\n')

    # 檢查圖:原圖+縫 | 她 | 他 | 高度圖
    prev = Image.new('RGBA', (W * 4, H), (250, 250, 250, 255))
    base = Image.fromarray(rgba).copy(); d = np.array(base)
    for y in range(H): d[y, max(0, seam[y] - 1):seam[y] + 1] = (201, 32, 42, 255)
    prev.paste(Image.fromarray(d), (0, 0), Image.fromarray(d))
    for i, name in enumerate(('her', 'him')):
        L = Image.open(os.path.join(outdir, f'figure-{name}.png')); prev.paste(L, (W * (i + 1) + layers[name]['x'], layers[name]['y']), L)
    hm_prev = Image.new('L', (W, H), 0)
    for name in ('her', 'him'):
        hmi = Image.open(os.path.join(outdir, f'figure-{name}-h.png')).resize((layers[name]['w'], layers[name]['h']), Image.BILINEAR)
        hm_prev.paste(hmi, (layers[name]['x'], layers[name]['y']), Image.fromarray((np.array(hmi) > 0).astype(np.uint8) * 255))
    prev.paste(hm_prev.convert('RGBA'), (W * 3, 0))
    prev.save(os.path.join(dbg, 'split-preview.png'))
    print('檢查圖:', os.path.relpath(os.path.join(dbg, 'split-preview.png'), root))

if __name__ == '__main__':
    main()
