# 古建精模：五层塔（pagoda）、四角亭（ting）、石拱桥（bridge）→ structures.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from arch import *     # 导入时已 reset 并建好材质


def snapshot():
    return set(o.name for o in bpy.context.scene.objects)


def collect(before, name):
    objs = [o for o in bpy.context.scene.objects if o.name not in before and o.type == 'MESH']
    return join_objs(objs, name)


# ───────── 五层塔
def pagoda():
    import arch
    arch.LAT[0], arch.LAT[1] = 3, 4      # 远景塔：棂条稀一些
    before = snapshot()
    box('pg_base', (11, 11, 1.2), (0, 0, 0.6), STONE)
    box('pg_lip', (11.3, 11.3, 0.16), (0, 0, 1.2), STONE_D)
    for i in range(4):
        box('pg_step', (3.2, 0.42, 0.24 * (i + 1)), (0, -5.5 - 0.42 * (3 - i) - 0.2, 0.12 * (i + 1)), STONE_D)
    balustrade('pg_rail', 5.3, 5.3, 1.28, h=0.85, gap=0.85, skip_front=1.8)
    z = 1.28
    hs = 3.4
    for k in range(5):
        col_h = 3.4 * 0.93 ** k
        xs = [-hs, -hs / 3, hs / 3, hs]
        floor(f'pg_f{k}', hs, hs, z, col_h, xs, xs, front_doors=(k == 0), col_r=0.2 * 0.93 ** k)
        rz = z + col_h + 0.95
        w = 2 * hs + 2.8
        if k < 4:
            roof(f'pg_r{k}', rz, w, w, 3.2, 0.7, 0.0, t0=0.0, t1=0.42)
            z_next = rz + 3.2 * 0.42 ** 1.7 + 0.05
            hs_next = hs * 0.84
            box(f'pg_bal{k}', (2 * hs_next + 1.2, 2 * hs_next + 1.2, 0.25), (0, 0, z_next + 0.12), STONE_D)
            balustrade(f'pg_br{k}', hs_next + 0.55, hs_next + 0.55, z_next + 0.25, h=0.7, gap=0.7, m=RED, post=0.1)
            z = z_next + 0.25
            hs = hs_next
        else:
            roof('pg_top', rz, w, w, 3.6, 0.85, 0.0)
            top = rz + 3.6
            # 塔刹：覆钵 + 相轮 + 宝珠
            cyl('pg_bowl', 0.7, 0.5, (0, 0, top - 0.1), GOLD, seg=16, r_top=0.45)
            for i in range(7):
                cyl('pg_ring', 0.42 - i * 0.035, 0.12, (0, 0, top + 0.5 + i * 0.32), GOLD, seg=16)
            cyl('pg_mast', 0.07, 2.8, (0, 0, top + 0.4), GOLD, seg=8)
            cyl('pg_pearl', 0.28, 0.5, (0, 0, top + 3.1), GOLD, seg=12, r_top=0.02)
    arch.LAT[0], arch.LAT[1] = 4, 8
    return collect(before, 'pagoda')


# ───────── 四角亭（攒尖顶 + 美人靠）
def ting():
    before = snapshot()
    box('t_base', (6.6, 6.6, 0.7), (0, 0, 0.35), STONE)
    box('t_lip', (6.8, 6.8, 0.12), (0, 0, 0.7), STONE_D)
    for i in range(3):
        box('t_step', (2.2, 0.4, 0.23 * (i + 1)), (0, -3.3 - 0.4 * (2 - i) - 0.2, 0.115 * (i + 1)), STONE_D)
    h = 3.1
    c = 2.4
    for x in (-c, c):
        for y in (-c, c):
            cyl('t_col', 0.17, h, (x, y, 0.76), RED, seg=14)
    for (sx, sy, lx, ly) in [(2 * c + 0.4, 0.26, 0, -c), (2 * c + 0.4, 0.26, 0, c), (0.26, 2 * c + 0.4, -c, 0), (0.26, 2 * c + 0.4, c, 0)]:
        box('t_beam', (sx, sy, 0.32), (lx, ly, 0.76 + h - 0.16), RED)
        box('t_paint', (sx if sx > 1 else 0.3, sy if sy > 1 else 0.3, 0.24), (lx, ly, 0.76 + h + 0.12), BLUE)
        box('t_band', (sx * 0.95 if sx > 1 else 0.32, sy * 0.95 if sy > 1 else 0.32, 0.07), (lx, ly, 0.76 + h + 0.12), GOLD)
        # 挂落（檐下的木格花边）
        if sx > 1:
            for k in range(9):
                box('t_gual', (0.05, 0.06, 0.38), (lx - c + 0.4 + k * (2 * c - 0.8) / 8, ly, 0.76 + h - 0.5), WOOD)
            box('t_gual_b', (2 * c - 0.6, 0.06, 0.05), (lx, ly, 0.76 + h - 0.7), WOOD)
        else:
            for k in range(9):
                box('t_gual', (0.06, 0.05, 0.38), (lx, ly - c + 0.4 + k * (2 * c - 0.8) / 8, 0.76 + h - 0.5), WOOD)
            box('t_gual_b', (0.06, 2 * c - 0.6, 0.05), (lx, ly, 0.76 + h - 0.7), WOOD)
    dougong_row('t_dg', c + 0.05, c + 0.05, 0.76 + h + 0.25, spacing=0.8)
    # 美人靠：三面座凳 + 外倾靠背
    for side in ('l', 'r', 'b'):
        for k in range(1):
            if side == 'b':
                box('t_seat', (2 * c - 0.3, 0.42, 0.08), (0, c - 0.1, 1.2), WOOD)
                for q in range(12):
                    x = -c + 0.3 + q * (2 * c - 0.6) / 11
                    tubes('t_back', [[(x, c - 0.25, 1.24), (x, c + 0.05, 1.75)]], 0.025, WOOD, res=2)
                tubes('t_backrail', [[(-c + 0.2, c + 0.06, 1.76), (c - 0.2, c + 0.06, 1.76)]], 0.05, WOOD, res=4)
            else:
                sx = -1 if side == 'l' else 1
                box('t_seat', (0.42, 2 * c - 0.3, 0.08), (sx * (c - 0.1), 0, 1.2), WOOD)
                for q in range(12):
                    y = -c + 0.3 + q * (2 * c - 0.6) / 11
                    tubes('t_back', [[(sx * (c - 0.25), y, 1.24), (sx * (c + 0.05), y, 1.75)]], 0.025, WOOD, res=2)
                tubes('t_backrail', [[(sx * (c + 0.06), -c + 0.2, 1.76), (sx * (c + 0.06), c - 0.2, 1.76)]], 0.05, WOOD, res=4)
    for sx in (-1, 1):
        lantern('t_lantern', sx * (c + 0.2), -c - 0.25, 0.76 + h - 0.7, r=0.22)
    rz = 0.76 + h + 0.95
    roof('t_roof', rz, 7.6, 7.6, 3.0, 0.95, 0.0)
    cyl('t_fin_base', 0.35, 0.35, (0, 0, rz + 2.95), GOLD, seg=14, r_top=0.25)
    cyl('t_fin', 0.25, 0.9, (0, 0, rz + 3.25), GOLD, seg=14, r_top=0.02)
    return collect(before, 'ting')


# ───────── 石拱桥
def bridge(L=22.0, W=3.8, R=4.2):
    before = snapshot()
    def top(x):
        return 1.4 + 2.6 * math.cos(math.pi * x / L) ** 1.2 if abs(x) < L / 2 else 1.4
    def bot(x):
        return (math.sqrt(R * R - x * x) - 0.6) if abs(x) < R else -1.6
    N = 120
    xs = [-L / 2 + L * i / N for i in range(N + 1)]
    # 两侧桥身墙面（带拱洞）
    for side in (-1, 1):
        y = side * W / 2
        v, f = [], []
        rows = 8
        for i, x in enumerate(xs):
            for r in range(rows + 1):
                z = bot(x) + (top(x) - bot(x)) * r / rows
                v.append((x, y, z))
        for i in range(N):
            for r in range(rows):
                a = i * (rows + 1) + r
                b = a + rows + 1
                f.append((a, a + 1, b + 1, b) if side > 0 else (a, b, b + 1, a + 1))   # 法线朝外（之前两侧都反了，外侧被剔除→看着像闪烁/透明）
        mesh_obj('br_wall', v, f, STONE)
    # 桥面、拱腹
    for (fz, m, flip) in ((top, STONE_D, False), (bot, STONE, True)):
        v, f = [], []
        for x in xs:
            z = fz(x)
            v.append((x, -W / 2, z)); v.append((x, W / 2, z))
        for i in range(N):
            a = 2 * i
            f.append((a, a + 2, a + 3, a + 1) if not flip else (a, a + 1, a + 3, a + 2))
        mesh_obj('br_surf', v, f, m)
    # 桥面石板缝（横向细线）
    seams = []
    for k in range(1, 30):
        x = -L / 2 + L * k / 30
        seams.append([(x, -W / 2 + 0.05, top(x) + 0.035), (x, W / 2 - 0.05, top(x) + 0.035)])
    tubes('br_seams', seams, 0.02, STONE_D, res=2)
    # 拱券石（两侧拱圈）
    for side in (-1, 1):
        arc = [(R * math.cos(a), side * (W / 2 + 0.06), R * math.sin(a) - 0.6) for a in [math.pi * i / 40 for i in range(41)]]
        tubes('br_arch', [arc], 0.22, STONE_D, res=4)
        # 拱券分块线
        for i in range(1, 15):
            a = math.pi * i / 15
            p0 = Vector(((R - 0.18) * math.cos(a), side * (W / 2 + 0.25), (R - 0.18) * math.sin(a) - 0.6))
            p1 = Vector(((R + 0.18) * math.cos(a), side * (W / 2 + 0.25), (R + 0.18) * math.sin(a) - 0.6))
            tubes('br_vous', [[tuple(p0), tuple(p1)]], 0.03, STONE_D, res=2)
    # 栏杆：望柱 + 栏板 + 扶手，沿桥面曲线
    for side in (-1, 1):
        y = side * (W / 2 - 0.12)
        posts = []
        n = 14
        for k in range(n + 1):
            x = -L / 2 + 0.6 + (L - 1.2) * k / n
            z = top(x)
            box('br_post', (0.22, 0.22, 1.1), (x, y, z + 0.55), STONE)
            cyl('br_post_cap', 0.13, 0.22, (x, y, z + 1.1), STONE_D, seg=10, r_top=0.04)
            posts.append((x, z))
        for (x0, z0), (x1, z1) in zip(posts, posts[1:]):
            xm, zm = (x0 + x1) / 2, (z0 + z1) / 2
            ang = math.atan2(z1 - z0, x1 - x0)
            pnl = box('br_panel', (math.hypot(x1 - x0, z1 - z0) - 0.24, 0.1, 0.55), (xm, y, zm + 0.42), STONE)
            pnl.rotation_euler.y = -ang
        tubes('br_hand', [[(x, y, z + 0.9) for x, z in posts]], 0.06, STONE_D, res=4)
    # 桥头抱鼓石
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl('br_drum', 0.35, 0.3, (sx * (L / 2 - 0.2), sy * (W / 2 - 0.12), 1.4), STONE_D, seg=16)
    return collect(before, 'bridge')


objs = [pagoda(), ting(), bridge()]
for k, ob in enumerate(objs):
    print(ob.name, 'FACES', len(ob.data.polygons), 'DIMS', tuple(round(v, 2) for v in ob.dimensions))
    ob.location = ((k - 1) * 26, 0, 0)
export_glb('structures.glb')
preview('structures.png', target=(0, 0, 8), dist=95, elev=10, azim=-20, res=(1500, 700), lens=50)
preview('pagoda.png', target=(-26, 0, 13), dist=45, elev=8, azim=-28, res=(800, 900), lens=50)
