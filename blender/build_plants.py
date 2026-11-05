# 植物精模：层叠松、垂柳、竹丛、青绿阔叶树（两种色）、红枫
# 每种树生成后合并成一个对象（pine / willow / bamboo / tree_green / tree_teal / maple），导出到 plants.glb
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from mathutils import Vector, Quaternion

reset()
BARK = mat('bark_ink', '#3b2f2b')
BARK_PINE = mat('bark_pine', '#4a3a30')


class Leaves:
    """按材质分桶收集叶片，最后各生成一个网格"""
    def __init__(self):
        self.b = {}

    def quad(self, m, pts):
        v, f = self.b.setdefault(m.name, ([], []))
        i0 = len(v)
        v.extend([tuple(p) for p in pts])
        f.append(tuple(range(i0, i0 + len(pts))))

    def build(self, prefix):
        out = []
        for name, (v, f) in self.b.items():
            if v:
                out.append(mesh_obj(prefix + name, v, f, bpy.data.materials[name]))
        return out


def leaf_pts(pos, d, side, length, width):
    """圆润的笔触叶：叶基收窄、叶腹饱满、叶尖圆钝（8 边形），远看像一笔点染"""
    prof = [(0.0, 0.0), (0.12, 0.62), (0.4, 1.0), (0.72, 0.85), (1.0, 0.0)]
    right = [pos + d * length * t + side * width * w for t, w in prof[1:-1]]
    left = [pos + d * length * t - side * width * w for t, w in reversed(prof[1:-1])]
    return [pos] + right + [pos + d * length] + left


def pad_pts(c, r, tilt, seed_rng, n=10):
    """松针盘：扁平、边缘略带起伏的椭圆盘（国画里一簇簇攒聚的松针）"""
    a0 = seed_rng.uniform(0, 6.28)
    pts = []
    for k in range(n):
        a = a0 + 2 * math.pi * k / n
        rr = r * (1 + 0.18 * math.sin(a * 3 + a0)) * seed_rng.uniform(0.9, 1.08)
        x, y = math.cos(a) * rr, math.sin(a) * rr * 0.78
        z = (x * tilt.x + y * tilt.y) - 0.05 * r * (rr / r) ** 2
        pts.append(c + Vector((x, y, z)))
    return pts


def perturb(rnd, d, amt):
    return (d + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * amt).normalized()


def grow(rnd, segs, tips, p, d, length, radius, depth, P):
    pts, rads = [p.copy()], [radius]
    cur, dd = p.copy(), d.copy()
    n = 5
    for i in range(1, n + 1):
        dd = perturb(rnd, dd, P['wiggle'] if depth > 0 else P['wiggle'] * 0.3)
        dd.z += P['up'] if depth < P['flat_after'] else P['droop']
        dd.normalize()
        cur = cur + dd * (length / n)
        pts.append(cur.copy())
        rads.append(radius * (1 - 0.4 * i / n))
    segs.append((pts, rads, depth))
    if depth >= P['maxdepth'] or radius < P['minr']:
        tips.append((cur, dd, depth))
        return
    kids = P['kids0'] if depth == 0 else rnd.choice(P['kids'])
    for k in range(kids):
        if depth == 0 and P.get('spread0'):
            a = k * 2 * math.pi / kids + rnd.uniform(-0.4, 0.4)
            nd = Vector((math.cos(a), math.sin(a), P['spread0'])).normalized()
        else:
            axis = dd.cross(Vector((0, 0, 1)))
            if axis.length < 1e-3:
                axis = Vector((1, 0, 0))
            ang = math.radians(rnd.uniform(*P['angle']))
            nd = Quaternion(dd, rnd.uniform(0, 6.28)) @ (Quaternion(axis.normalized(), ang) @ dd)
        grow(rnd, segs, tips, cur, nd.normalized(), length * rnd.uniform(*P['shrink']), rads[-1] * 0.75, depth + 1, P)


def new_objects(before):
    return [o for o in bpy.context.scene.objects if o.name not in before and o.type == 'MESH']


# ───────── 青绿阔叶树：分层的扁平叶团（图2）
def broadleaf(name, seed, palette, height=7.0, lean=(0.1, 0.0), clump_r=1.3, leaves_per=420, leaf_len=0.5):
    before = set(o.name for o in bpy.context.scene.objects)
    rnd = random.Random(seed)
    P = dict(wiggle=0.25, up=0.06, droop=0.0, flat_after=2, maxdepth=4, minr=0.02, kids0=3, kids=[2, 2, 3],
             angle=(25, 45), shrink=(0.6, 0.78), spread0=1.1)
    segs, tips = [], []
    grow(rnd, segs, tips, Vector((0, 0, -0.3)), Vector((lean[0], lean[1], 1)).normalized(), height * 0.42, height * 0.035, 0, P)
    thick = [x for x in segs if x[2] < 2]; thin = [x for x in segs if x[2] >= 2]
    tubes(name + '_branches', [x[0] for x in thick], [x[1] for x in thick], BARK, res=6)
    if thin: tubes(name + '_twigs', [x[0] for x in thin], [x[1] for x in thin], BARK, res=2)
    mats = [mat(f'leaf_{name}_{k}', c) for k, c in enumerate(palette)]   # 由深到浅
    L = Leaves()
    for pos, d, depth in tips:
        c = pos + Vector((0, 0, 0.15))
        r = clump_r * rnd.uniform(0.8, 1.2)
        for _ in range(leaves_per):
            u, v = rnd.uniform(0, 6.28), math.acos(rnd.uniform(-0.2, 1))   # 偏上半球
            rr = r * rnd.random() ** 0.4
            off = Vector((math.sin(v) * math.cos(u) * rr, math.sin(v) * math.sin(u) * rr, math.cos(v) * rr * 0.45))
            p = c + off
            t = max(0, min(1, (off.z / (r * 0.45) + 0.3)))                  # 叶团上部更亮
            m = mats[min(len(mats) - 1, int(t * len(mats) + rnd.uniform(-0.5, 0.5)))] if t >= 0 else mats[0]
            dl = perturb(rnd, Vector((math.cos(u), math.sin(u), 0.35)), 0.5)
            side = dl.cross(Vector((0, 0, 1)))
            side = side.normalized() if side.length > 1e-3 else Vector((1, 0, 0))
            L.quad(m, leaf_pts(p, dl, side, leaf_len * rnd.uniform(0.85, 1.15), leaf_len * 0.4))
    L.build(name + '_')
    return join_objs(new_objects(before), name)


# ───────── 层叠松：斜干 + 水平伸展的平顶针叶盘（图2左）
def pine(name, seed, height=8.0):
    before = set(o.name for o in bpy.context.scene.objects)
    rnd = random.Random(seed)
    trunk = []
    p, d = Vector((0, 0, -0.3)), Vector((0.25, 0.1, 1)).normalized()
    for i in range(14):
        trunk.append(p.copy())
        d = perturb(rnd, d, 0.18)
        d.z = max(d.z, 0.6)
        d.normalize()
        p = p + d * height / 13
    tubes(name + '_trunk', [trunk], [[height * 0.03 * (1 - 0.7 * i / 13) for i in range(14)]], BARK_PINE, res=6)
    needles = [mat(f'needle_{name}_{k}', c) for k, c in enumerate(['#2f5f57', '#3f7a69', '#5a9a7e'])]
    L = Leaves()
    branches = []
    levels = 7
    for k in range(levels):
        i = int(4 + (len(trunk) - 5) * k / (levels - 1))
        base = trunk[i]
        a = rnd.uniform(0, 6.28) + k * 2.4
        reach = height * (0.42 - 0.035 * k) * rnd.uniform(0.85, 1.15)
        tip = base + Vector((math.cos(a) * reach, math.sin(a) * reach, rnd.uniform(-0.3, 0.6)))
        mid = base.lerp(tip, 0.5) + Vector((0, 0, rnd.uniform(0.1, 0.5)))
        branches.append(([base, mid, tip], [height * 0.012, height * 0.009, height * 0.005]))
        # 针叶盘：在枝梢周围铺一层扁平的“针簇”
        pad_r = reach * 0.42 + 0.6
        for _ in range(150):
            u = rnd.uniform(0, 6.28)
            rr = pad_r * rnd.random() ** 0.6
            c = tip.lerp(base, rnd.random() * 0.45) + Vector((math.cos(u) * rr, math.sin(u) * rr * 0.85, rnd.uniform(-0.2, 0.28) * (1 - rr / pad_r * 0.6)))
            top = (c.z - tip.z + 0.25) / 0.55
            m = needles[min(2, max(0, int(top * 3)))]
            tilt = Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.12, 0.12)))
            L.quad(m, pad_pts(c, rnd.uniform(0.45, 0.75) * (1 - 0.3 * rr / pad_r), tilt, rnd))
    # 树顶一盘
    top = trunk[-1]
    for _ in range(60):
        u = rnd.uniform(0, 6.28); rr = 1.6 * rnd.random() ** 0.5
        c = top + Vector((math.cos(u) * rr, math.sin(u) * rr, rnd.uniform(-0.1, 0.25)))
        L.quad(needles[rnd.choice([1, 2, 2])], pad_pts(c, rnd.uniform(0.4, 0.65), Vector((rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1))), rnd))
    tubes(name + '_branches', [b[0] for b in branches], [b[1] for b in branches], BARK_PINE, res=4)
    L.build(name + '_')
    return join_objs(new_objects(before), name)


# ───────── 垂柳：短粗干在 2.4 米分杈，五根主枝上扬后外拱，柳丝从枝上方垂下、把枝条整个罩住（图3）
def willow(name, seed, height=7.0):
    before = set(o.name for o in bpy.context.scene.objects)
    rnd = random.Random(seed)
    lm = [mat(f'willow_{k}', c) for k, c in enumerate(['#7fa84c', '#99c25a', '#b5d36e', '#d3e392'])]
    # 主干
    top = Vector((rnd.uniform(-0.25, 0.25), rnd.uniform(-0.25, 0.25), 2.4))
    trunk = [Vector((0, 0, -0.3)), Vector((0.05, 0.02, 0.8)), top * 0.75 + Vector((0, 0, 0.6)), top]
    tubes(name + '_trunk', [trunk], [[0.3, 0.26, 0.22, 0.2]], BARK, res=6)
    limbs, crown = [], []
    nL = 5
    for k in range(nL):
        a = k * 2 * math.pi / nL + rnd.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), math.sin(a), 0))
        peak_r, peak_z = rnd.uniform(1.4, 2.1), rnd.uniform(5.4, 6.4)
        end_r, end_z = rnd.uniform(2.8, 3.6), peak_z - rnd.uniform(0.4, 0.9)
        pts = []
        for q in range(9):
            t = q / 8
            r = peak_r * math.sin(t * math.pi / 2) if t < 0.6 else peak_r + (end_r - peak_r) * (t - 0.6) / 0.4
            z = top.z + (peak_z - top.z) * math.sin(min(1, t / 0.65) * math.pi / 2) - max(0, t - 0.65) / 0.35 * (peak_z - end_z)
            pts.append(top + out * r + Vector((0, 0, z - top.z)))
        limbs.append(pts)
        crown += pts[1:] + pts[3:]          # 从分杈处起就垂柳丝，盖住光秃的 Y 形主枝
        # 每根主枝末段再分出 3 根外拱的细枝
        for q in range(3):
            base = pts[rnd.randint(4, 7)]
            d = (out + Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0.15))).normalized()
            tw = [base + d * (1.2 * u) + Vector((0, 0, 0.3 * math.sin(u * math.pi) - 0.1 * u)) for u in [q2 / 6 for q2 in range(7)]]
            limbs.append(tw)
            crown += tw[1:]
    tubes(name + '_limbs', limbs, [[(0.085 if len(l) == 9 else 0.035) * (1 - 0.6 * q / max(1, len(l) - 1)) for q in range(len(l))] for l in limbs], BARK, res=4)
    L = Leaves()

    def leaf(p, d, m, ln=0.32, wd=0.075):
        side = d.cross(Vector((0, 0, 1)))
        side = side.normalized() * wd if side.length > 1e-3 else Vector((wd, 0, 0))
        L.quad(m, leaf_pts(p, d, side, ln, wd))

    # 树冠顶：沿枝铺一层叶，盖住枝条上沿
    for c in crown:
        for _ in range(18):
            p = c + Vector((rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45), rnd.uniform(0.0, 0.35)))
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), -rnd.uniform(0.2, 0.8))).normalized()
            leaf(p, d, lm[rnd.choice([1, 1, 2, 0])], 0.34, 0.09)
    # 柳丝：从枝上方垂下；越靠外越长
    for _ in range(640):
        a = rnd.choice(crown) + Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(0.1, 0.3)))
        radial = Vector((a.x, a.y, 0))
        rr = radial.length
        outd = radial.normalized() if rr > 1e-3 else Vector((1, 0, 0))
        bottom = max(0.35, a.z - (1.6 + 2.6 * min(1, rr / 3.4)) * rnd.uniform(0.75, 1.1))
        n = max(5, int((a.z - bottom) / 0.2))
        prev = None
        for q in range(n + 1):
            t = q / n
            p = a + outd * (0.35 * math.sin(min(1, t * 3) * math.pi / 2) + 0.15 * t) + Vector((0, 0, 0.12 * math.sin(min(1, t * 4) * math.pi) - (a.z - bottom) * t))
            if prev is not None:
                m = lm[min(3, int(t * 3.2 + rnd.uniform(-0.4, 0.6)))]
                d = (p - prev).normalized()
                for sgn in (-1, 1):
                    dd = (d + Vector((-outd.y, outd.x, 0)) * 0.55 * sgn + outd * 0.25).normalized()
                    leaf(prev.lerp(p, 0.5), dd, m)
            prev = p
    L.build(name + '_')
    return join_objs(new_objects(before), name)


# ───────── 竹丛：分节竹竿 + 下垂的竹叶簇
def bamboo(name, seed, count=11):
    before = set(o.name for o in bpy.context.scene.objects)
    rnd = random.Random(seed)
    culm = mat('bamboo_culm', '#79a35a')
    node = mat('bamboo_node', '#557c3f')
    lm = [mat(f'bamboo_leaf_{k}', c) for k, c in enumerate(['#4f8a4a', '#6ea85a', '#94c472'])]
    L = Leaves()
    culms, rings, twigs = [], [], []
    for i in range(count):
        base = Vector((rnd.gauss(0, 0.7), rnd.gauss(0, 0.7), -0.3))
        h = rnd.uniform(6.5, 9.5)
        lean = Vector((rnd.uniform(-0.12, 0.12) + base.x * 0.05, rnd.uniform(-0.12, 0.12) + base.y * 0.05, 1))
        r = rnd.uniform(0.045, 0.065)
        pts = []
        for k in range(17):
            t = k / 16
            pts.append(base + Vector((lean.x * h * t * t * 1.6, lean.y * h * t * t * 1.6, h * t)))
        culms.append((pts, [r * (1 - 0.5 * k / 16) for k in range(17)]))
        for k in range(1, 16):
            rings.append(([pts[k] - Vector((0, 0, 0.02)), pts[k] + Vector((0, 0, 0.02))], [r * 1.25 * (1 - 0.5 * k / 16)] * 2))
        # 上半段出小枝和叶簇
        for k in range(7, 17):
            p = pts[k]
            for _ in range(3):
                a = rnd.uniform(0, 6.28)
                dl = Vector((math.cos(a), math.sin(a), rnd.uniform(0.0, 0.5))).normalized()
                tip = p + dl * rnd.uniform(0.4, 0.9)
                twigs.append([p, tip])
                # 一簇 5~7 片披针叶，向下散开
                n = rnd.randint(5, 7)
                for q in range(n):
                    th = a + (q - n / 2) * 0.35
                    d2 = Vector((math.cos(th), math.sin(th), -rnd.uniform(0.3, 0.9))).normalized()
                    side = d2.cross(Vector((0, 0, 1)))
                    side = side.normalized() * 0.065 if side.length > 1e-3 else Vector((0.065, 0, 0))
                    m = lm[rnd.choice([0, 1, 1, 2])]
                    L.quad(m, leaf_pts(tip, d2, side, rnd.uniform(0.5, 0.75), 0.065))
    tubes(name + '_culms', [c[0] for c in culms], [c[1] for c in culms], culm, res=6)
    tubes(name + '_rings', [r[0] for r in rings], [r[1] for r in rings], node, res=6)
    tubes(name + '_twigs', twigs, 0.008, node, res=2)
    L.build(name + '_')
    return join_objs(new_objects(before), name)


trees = [
    pine('pine', 3),
    willow('willow', 5),
    bamboo('bamboo', 9),
    broadleaf('tree_green', 21, ['#5f9f58', '#82bb64', '#a6d47a', '#c8e596']),
    broadleaf('tree_teal', 33, ['#3d8a85', '#56a59a', '#7cc2b0', '#a6dccb'], height=6.0, clump_r=1.0),
    broadleaf('maple', 47, ['#c4473f', '#dd6555', '#ee8a70', '#f6b08f'], height=6.5, clump_r=1.0, leaf_len=0.28),
]
for k, ob in enumerate(trees):
    print(ob.name, 'FACES', len(ob.data.polygons), 'DIMS', tuple(round(v, 2) for v in ob.dimensions))
    ob.location = ((k - 2.5) * 12, 0, 0)
export_glb('plants.glb')
preview('plants_row.png', target=(0, 0, 4.5), dist=85, elev=6, azim=0, res=(1600, 560), lens=50)
preview('plants_close.png', target=(-24, 0, 4), dist=26, elev=8, azim=-15, res=(1200, 700), lens=50)
