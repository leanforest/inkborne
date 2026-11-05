# 古建构件库：屋顶曲面（凹曲面+翼角起翘+瓦垄+戗脊）、格扇、栏杆、斗拱、楼层
import math
from common import *

reset()   # 导入本模块即新建空场景，并创建古建材质
LAT = [3, 5]   # 格扇棂条疏密（远景建筑可调稀以省面）

STONE = mat('stone', '#dcd6c8')
STONE_D = mat('stone_dark', '#c4bdae')
RED = mat('column_red', '#9a3326')
WOOD = mat('lattice_wood', '#7c3a2c')
PAPER = mat('window_paper', '#f1e7d2')
WALL = mat('wall_white', '#f2eee6')
TEAL = mat('paint_teal', '#2f8378')
BLUE = mat('paint_blue', '#2d5d8f')
GOLD = mat('paint_gold', '#d0a64a')
ROOF = mat('roof_tile', '#3e4859')
TILE = mat('roof_tile_ridge', '#56627a')
RIDGE = mat('roof_ridge', '#2c3340')
EAVE = mat('eave_board', '#6e2f26')
DARK = mat('interior_dark', '#3b2f2c')
PLAQUE = mat('plaque_ink', '#2c3442')
LANTERN = mat('lantern_red', '#d24c3c')
TASSEL = mat('lantern_tassel', '#c43d30')


# ───────── 屋顶曲面（与 three.js 小样同一套参数化：凹曲面 + 翼角起翘）
def roof_pt(t, th, w, d, h, lift, ridge):
    r = 1 - t
    c, s = math.cos(th), math.sin(th)
    k = 1 / max(abs(c), abs(s))
    corner = abs(math.sin(2 * th)) ** 8
    up = lift * corner * (1 - t) ** 2.5
    out = 1 + 0.07 * corner * (1 - t)
    x = c * k * (r * (w / 2 - ridge) + ridge) * out
    y = s * k * r * (d / 2) * out
    z = h * t ** 1.7 + up
    return (x, y, z)


def theta_of(px, py, w, d):
    return math.atan2(py / (d / 2), px / (w / 2))


def roof(name, base_z, w, d, h, lift, ridge, t0=0.0, t1=1.0, tile_gap=0.34):
    N, M = 12, 132        # 屋面网格：够表现凹曲与起翘即可
    verts, faces = [], []
    for i in range(N + 1):
        t = t0 + (t1 - t0) * i / N
        for j in range(M):
            th = 2 * math.pi * j / M
            x, y, z = roof_pt(t, th, w, d, h, lift, ridge)
            verts.append((x, y, z + base_z))
    for i in range(N):
        for j in range(M):
            a, b = i * M + j, i * M + (j + 1) % M
            faces.append((a, b, b + M, a + M))
    ob = mesh_obj(name, verts, faces, ROOF)
    ob = solidify(ob, 0.16)

    # 瓦垄：沿檐口等距取点，顺坡而上
    lines = []
    per = []
    hw, hd = w / 2, d / 2
    edges = [((-hw, -hd), (hw, -hd)), ((hw, -hd), (hw, hd)), ((hw, hd), (-hw, hd)), ((-hw, hd), (-hw, -hd))]
    for (ax, ay), (bx, by) in edges:
        L = math.hypot(bx - ax, by - ay)
        n = int(L / tile_gap)
        for q in range(1, n):
            f = q / n
            per.append(theta_of(ax + (bx - ax) * f, ay + (by - ay) * f, w, d))
    for th in per:
        pl = []
        steps = 10
        for i in range(steps + 1):
            t = t0 + (t1 - t0) * 0.995 * i / steps
            x, y, z = roof_pt(t, th, w, d, h, lift, ridge)
            pl.append((x, y, z + base_z + 0.07))
        lines.append(pl)
    tubes(name + '_tiles', lines, 0.075, TILE, res=2)

    # 檐口封檐板
    ring = [roof_pt(t0, 2 * math.pi * j / M, w, d, h, lift, ridge) for j in range(M + 1)]
    tubes(name + '_eave', [[(x, y, z + base_z - 0.02) for x, y, z in ring]], 0.12, EAVE, res=4)
    if t0 > 0.0 or t1 < 1.0:
        top = [roof_pt(t1, 2 * math.pi * j / M, w, d, h, lift, ridge) for j in range(M + 1)]
        tubes(name + '_cap', [[(x, y, z + base_z + 0.05) for x, y, z in top]], 0.12, RIDGE, res=4)

    # 戗脊（四条角脊），端头再翘一点
    hips = []
    for th in [math.atan2(1, 1), math.atan2(1, -1), math.atan2(-1, -1), math.atan2(-1, 1)]:
        pl = []
        for i in range(21):
            t = t0 + (t1 - t0) * i / 20
            x, y, z = roof_pt(t, th, w, d, h, lift, ridge)
            pl.append((x, y, z + base_z + 0.16))
        ex, ey, ez = pl[0]
        pl.insert(0, (ex * 1.04, ey * 1.04, ez + 0.35))
        hips.append(pl)
    tubes(name + '_hips', hips, 0.16, RIDGE, res=6)
    return ob


def lattice(name, center, width, height, facing, nx=5, nz=9, bar=0.045, frame=0.09):
    """格扇：背后一层窗纸 + 外框 + 方格棂条。facing='y' 表示面朝 ±y（沿 x 方向展开）"""
    cx, cy, cz = center
    alongx = facing == 'y'
    def B(n, sx, sz, ox, oz, m=WOOD, depth=0.07):
        size = (sx, depth, sz) if alongx else (depth, sx, sz)
        loc = (cx + ox, cy, cz + oz) if alongx else (cx, cy + ox, cz + oz)
        box(n, size, loc, m)
    B(name + '_paper', width, height, 0, 0, PAPER, 0.03)
    B(name + '_ft', width, frame, 0, height / 2)
    B(name + '_fb', width, frame, 0, -height / 2)
    B(name + '_fl', frame, height, -width / 2, 0)
    B(name + '_fr', frame, height, width / 2, 0)
    B(name + '_mid', width, frame * 0.8, 0, -height * 0.18)          # 腰板分隔
    inner_h = height * 0.6
    oz0 = -height * 0.18 + frame
    for i in range(1, nx):
        B(f'{name}_v{i}', bar, height * 0.66, -width / 2 + width * i / nx, height * 0.15)
    for j in range(1, nz):
        B(f'{name}_h{j}', width, bar, 0, oz0 + (height / 2 - oz0) * j / nz)
    # 下部裙板
    B(name + '_skirt', width * 0.92, height * 0.28, 0, -height * 0.34, WOOD, 0.05)


def balustrade(name, hx, hy, z, h=0.95, gap=0.9, m=STONE, post=0.16, skip_front=None):
    pts = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy), (-hx, -hy)]
    rails = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, int(L / gap))
        seg = []
        for q in range(n + 1):
            f = q / n
            x, y = ax + (bx - ax) * f, ay + (by - ay) * f
            if skip_front and ay == -hy and by == -hy and abs(x) < skip_front:
                if seg:
                    rails.append(seg); seg = []
                continue
            box(f'{name}_p', (post, post, h), (x, y, z + h / 2), m)
            seg.append((x, y, z + h))
        if len(seg) > 1:
            rails.append(seg)
    tubes(name + '_rail', [s for s in rails if len(s) > 1], 0.07, m, res=4)
    tubes(name + '_rail2', [[(x, y, z + h * 0.35) for x, y, _ in s] for s in rails if len(s) > 1], 0.04, m, res=4)


def dougong_row(name, hx, hy, z, spacing=0.85):
    """一圈斗拱：三层逐级外挑的小块，青绿与金色相间"""
    pts = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy), (-hx, -hy)]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay)
        n = max(1, int(L / spacing))
        nxv, nyv = (by - ay) / L, -(bx - ax) / L        # 外法线
        for q in range(n):
            f = (q + 0.5) / n
            x, y = ax + (bx - ax) * f, ay + (by - ay) * f
            for k in range(3):
                o = 0.12 + k * 0.17
                sz = 0.22
                box(f'{name}_{k}', (0.34 + k * 0.08, 0.34 + k * 0.08, sz),
                    (x + nxv * o, y + nyv * o, z + k * sz), GOLD if k == 1 else TEAL)


def floor(name, hx, hy, z0, col_h, xs, ys, front_doors=True, col_r=0.24):
    # 柱
    for x in xs:
        for y in (-hy, hy):
            cyl(f'{name}_col', col_r, col_h, (x, y, z0), RED, seg=14)
    for y in ys:
        for x in (-hx, hx):
            cyl(f'{name}_col', col_r, col_h, (x, y, z0), RED, seg=14)
    # 额枋 + 彩画
    for (sx, sy, lx, ly) in [(2 * hx + 0.5, 0.32, 0, -hy), (2 * hx + 0.5, 0.32, 0, hy), (0.32, 2 * hy + 0.5, -hx, 0), (0.32, 2 * hy + 0.5, hx, 0)]:
        box(f'{name}_beam', (sx, sy, 0.42), (lx, ly, z0 + col_h - 0.21), RED)
        box(f'{name}_paint', (sx * 0.98 if sx > 1 else 0.36, sy * 0.98 if sy > 1 else 0.36, 0.3), (lx, ly, z0 + col_h + 0.15), BLUE)
        box(f'{name}_band', (sx * 0.9 if sx > 1 else 0.38, sy * 0.9 if sy > 1 else 0.38, 0.08), (lx, ly, z0 + col_h + 0.15), GOLD)
    # 门窗格扇（每开间填满）
    ph = col_h - 0.75
    pz = z0 + 0.15 + ph / 2
    mid = (len(xs) - 1) // 2
    for y, side in ((-hy, 'f'), (hy, 'b')):
        for bi, (a, b) in enumerate(zip(xs, xs[1:])):
            bw = b - a - 2 * col_r
            n = 4 if (side == 'f' and front_doors) else 3
            if side == 'f' and front_doors and bi == mid:
                # 正中一间：门扇向内敞开，露出幽暗的室内
                box(f'{name}_interior', (bw, 0.05, ph), ((a + b) / 2, y + 0.9, pz), DARK)
                for sgn in (-1, 1):
                    leaf = box(f'{name}_door', (bw / 4, 0.06, ph), ((a + b) / 2 + sgn * (bw / 2 - bw / 8 * 0.7), y + bw / 8 * 0.7, pz), WOOD)
                    leaf.rotation_euler.z = sgn * 1.2
                box(f'{name}_sill', (bw, 0.18, 0.22), ((a + b) / 2, y, z0 + 0.11), WOOD)
                continue
            for k in range(n):
                cx = a + col_r + bw * (k + 0.5) / n
                lattice(f'{name}_{side}{k}', (cx, y, pz), bw / n - 0.04, ph, 'y', nx=LAT[0], nz=LAT[1])
    for x in (-hx, hx):
        for a, b in zip(ys, ys[1:]):
            bw = b - a - 2 * col_r
            for k in range(3):
                cy = a + col_r + bw * (k + 0.5) / 3
                lattice(f'{name}_s{k}', (x, cy, pz), bw / 3 - 0.04, ph, 'x', nx=LAT[0], nz=LAT[1])
    dougong_row(name + '_dg', hx + 0.05, hy + 0.05, z0 + col_h + 0.3)




def plaque(name, x, y, z, w=2.2, h=0.8):
    """匾额：深色底板 + 金边 + 几笔金色字迹"""
    box(name + '_board', (w, 0.08, h), (x, y, z), PLAQUE)
    for (sx, sz, ox, oz) in [(w + 0.1, 0.08, 0, h / 2), (w + 0.1, 0.08, 0, -h / 2), (0.08, h, -w / 2, 0), (0.08, h, w / 2, 0)]:
        box(name + '_frame', (sx, 0.12, sz), (x + ox, y - 0.02, z + oz), GOLD)
    for k in range(3):
        cx = x - w * 0.3 + k * w * 0.3
        box(name + '_c1', (0.32, 0.03, 0.06), (cx, y - 0.05, z + 0.14), GOLD)
        box(name + '_c2', (0.06, 0.03, 0.42), (cx, y - 0.05, z - 0.02), GOLD)
        box(name + '_c3', (0.26, 0.03, 0.05), (cx, y - 0.05, z - 0.2), GOLD)


def lantern(name, x, y, z, r=0.3):
    """宫灯：一段吊绳 + 红色灯身（上下金盖）+ 流苏"""
    tubes(name + '_cord', [[(x, y, z + 0.7), (x, y, z + r * 1.25)]], 0.012, RIDGE, res=2)
    lathe_pts = []
    bm_v, bm_f = [], []
    rows, seg = 10, 16
    for i in range(rows + 1):
        t = i / rows
        rr = r * math.sin(math.pi * (0.1 + 0.8 * t))
        zz = z + r * 1.2 * (t - 0.5) * 2
        for j in range(seg):
            a = 2 * math.pi * j / seg
            bm_v.append((x + math.cos(a) * rr, y + math.sin(a) * rr, zz))
    for i in range(rows):
        for j in range(seg):
            a0, b0 = i * seg + j, i * seg + (j + 1) % seg
            bm_f.append((a0, b0, b0 + seg, a0 + seg))
    ob = mesh_obj(name + '_body', bm_v, bm_f, LANTERN)
    for p in ob.data.polygons:
        p.use_smooth = True
    for zz in (z + r * 1.2, z - r * 1.2):
        cyl(name + '_cap', r * 0.45, 0.08, (x, y, zz - 0.04), GOLD, seg=12)
    tubes(name + '_tassel', [[(x + 0.03 * math.cos(a), y + 0.03 * math.sin(a), z - r * 1.25), (x + 0.05 * math.cos(a), y + 0.05 * math.sin(a), z - r * 1.25 - 0.5)] for a in [k * 0.9 for k in range(7)]], 0.012, TASSEL, res=2)
