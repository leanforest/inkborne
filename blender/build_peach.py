# 精细桃树样板：倾斜老干 + 向两侧平展的枝 + 细枝 + 几千朵五瓣小花（四档粉色）+ 少量嫩叶
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from mathutils import Vector, Quaternion

reset()
rnd = random.Random(7)

BARK = mat('bark_ink', '#3b2b2b')
PINKS = [mat('blossom_deep', '#ef6f97'), mat('blossom_mid', '#f793b2'),
         mat('blossom_light', '#fbbccd'), mat('blossom_white', '#ffe4ec')]
LEAF = mat('leaf_young', '#9ccf6b')
CORE = mat('blossom_core', '#e2a33c')

segments = []          # (polyline, radii, depth)
tips = []              # (pos, dir, depth)


def perturb(d, amt):
    v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * amt
    return (d + v).normalized()


def grow(p, d, length, radius, depth, maxdepth=6):
    pts, rads = [p.copy()], [radius]
    n = 6
    cur = p.copy()
    dd = d.copy()
    for i in range(1, n + 1):
        dd = perturb(dd, 0.28 if depth > 0 else 0.07)
        # 桃树枝：向上又向外平展，末梢略下垂
        dd.z += 0.05 if depth < 3 else -0.03
        dd.normalize()
        cur = cur + dd * (length / n)
        pts.append(cur.copy())
        rads.append(radius * (1 - 0.38 * i / n))
    segments.append((pts, rads, depth))
    if depth >= maxdepth or radius < 0.012:
        tips.append((cur, dd, depth))
        return
    # 子枝：梢头 2~3 根 + 枝中 0~2 根侧枝
    kids = rnd.choice([2, 2, 3]) if depth > 0 else 3
    for k in range(kids):
        axis = perturb(Vector((0, 0, 1)).cross(dd) if abs(dd.z) < 0.95 else Vector((1, 0, 0)), 0.3)
        ang = math.radians(rnd.uniform(22, 48)) * (1 if k % 2 == 0 else -1)
        nd = (Quaternion(dd, rnd.uniform(0, 6.28)) @ (Quaternion(axis.normalized(), ang) @ dd)).normalized()
        if depth == 0:
            nd = Vector((math.cos(k * 2.3 + 0.4), math.sin(k * 2.3 + 0.4), 0.9)).normalized()
        grow(cur, nd, length * rnd.uniform(0.62, 0.8), rads[-1] * 0.78, depth + 1, maxdepth)
    if depth >= 1:
        for k in range(rnd.choice([0, 1, 1, 2])):
            i = rnd.randint(2, n - 1)
            side = perturb(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0.3)), 0.2)
            grow(pts[i], side, length * 0.45, rads[i] * 0.5, depth + 2, maxdepth)


# 主干：向左前方倾斜，像图1临水的那棵
trunk_dir = Vector((-0.45, 0.1, 1)).normalized()
grow(Vector((0, 0, -0.3)), trunk_dir, 2.6, 0.32, 0)

# 枝干网格：按深度分组生成圆管（每点半径不同 → 自然收分）
thick = [x for x in segments if x[2] < 3]; thin = [x for x in segments if x[2] >= 3]
tubes('branches', [x[0] for x in thick], [x[1] for x in thick], BARK, res=6)
tubes('twigs', [x[0] for x in thin], [x[1] for x in thin], BARK, res=2)

# 花：每朵 = 5 片小花瓣（四边形）+ 花心
buckets = {m.name: ([], []) for m in PINKS}
buckets[LEAF.name] = ([], [])
buckets[CORE.name] = ([], [])


def add_flower(pos, normal, size, m):
    verts, faces = buckets[m.name]
    q = normal.to_track_quat('Z', 'Y')
    base = len(verts)
    verts.append(tuple(pos + q @ Vector((0, 0, 0.01))))
    for k in range(5):
        a = 2 * math.pi * k / 5 + rnd.uniform(-0.15, 0.15)
        a1, a2 = a - 0.42, a + 0.42
        ring = [(a - 0.5, 0.5), (a - 0.3, 0.92), (a, 1.0), (a + 0.3, 0.92), (a + 0.5, 0.5)]
        i0 = len(verts)
        for aa, rr in ring:
            verts.append(tuple(pos + q @ Vector((math.cos(aa) * size * rr, math.sin(aa) * size * rr, size * 0.18 * rr))))
        faces.append((base, i0, i0 + 1, i0 + 2))
        faces.append((base, i0 + 2, i0 + 3, i0 + 4))
    cv, cf = buckets[CORE.name]
    c0 = len(cv)
    for k in range(3):
        a = 2 * math.pi * k / 3
        cv.append(tuple(pos + q @ Vector((math.cos(a) * size * 0.15, math.sin(a) * size * 0.15, size * 0.25))))
    cf.append((c0, c0 + 1, c0 + 2))


def add_leaf(pos, d, size):
    verts, faces = buckets[LEAF.name]
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    i0 = len(verts)
    verts.extend([tuple(pos), tuple(pos + d * size * 0.5 + side * size * 0.18), tuple(pos + d * size), tuple(pos + d * size * 0.5 - side * size * 0.18)])
    faces.append((i0, i0 + 1, i0 + 2, i0 + 3))


count = 0
for pts, rads, depth in segments:
    if depth < 2:
        continue
    density = {2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 3}.get(depth, 3)
    for i in range(1, len(pts)):
        for _ in range(density):
            f = rnd.random()
            p = pts[i - 1].lerp(pts[i], f)
            off = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 0.8))).normalized() * rnd.uniform(0.04, 0.28)
            n = (off + Vector((0, 0, 0.6))).normalized()
            m = PINKS[min(3, max(0, int(rnd.triangular(0, 4, 1.4))))]
            add_flower(p + off, n, rnd.uniform(0.1, 0.16), m)
            count += 1
        if rnd.random() < 0.25:
            add_leaf(pts[i], perturb(Vector((0, 0, 0.4)) + (pts[i] - pts[i - 1]).normalized(), 0.6), rnd.uniform(0.16, 0.26))
# 梢头再加一团
for pos, d, depth in tips:
    for _ in range(5):
        off = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized() * rnd.uniform(0.02, 0.3)
        m = PINKS[min(3, max(0, int(rnd.triangular(0, 4, 1.8))))]
        add_flower(pos + off, (off + Vector((0, 0, 0.5))).normalized(), rnd.uniform(0.09, 0.14), m)
        count += 1

for name, (v, f) in buckets.items():
    if v:
        mesh_obj('flowers_' + name, v, f, bpy.data.materials[name])

ob = join_all('peach_tree')
bpy.context.scene.cursor.location = (0, 0, 0)
print('FLOWERS', count, 'FACES', len(ob.data.polygons), 'DIMS', tuple(round(v, 2) for v in ob.dimensions))
export_glb('peach.glb')
zc = ob.dimensions.z * 0.5
preview('peach_front.png', target=(ob.location.x - 1.0, 0, zc), dist=17, elev=8, azim=-20)
preview('peach_detail.png', target=(-2.2, 0.5, zc * 1.5), dist=4.5, elev=15, azim=-30)
