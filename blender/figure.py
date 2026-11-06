# 人物通用建模库（主角 build_hero.py 与船夫 build_boat.py 共用）
# 做法：躯干 / 衣摆 / 袖子都用“椭圆截面放样”，衣摆带竖向褶皱与镶边，头部是变形球 + 发际线裁出的发壳，
# 五官用射线贴到脸面上。正面朝 -Y，人物自身的左手在 +X。尺寸单位米，身高约 1.77（不含斗笠）。
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from common import *

TAU = 2 * math.pi


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def interp(keys, x):
    """keys: [(x, v0, v1, ...)] 按 x 升序；分段 Catmull-Rom 插值，返回 (v0, v1, ...)"""
    xs = [k[0] for k in keys]
    if x <= xs[0]:
        return keys[0][1:]
    if x >= xs[-1]:
        return keys[-1][1:]
    i = max(j for j in range(len(xs) - 1) if xs[j] <= x)
    t = (x - xs[i]) / (xs[i + 1] - xs[i])
    out = []
    for c in range(1, len(keys[0])):
        p1, p2 = keys[i][c], keys[i + 1][c]
        p0 = keys[i - 1][c] if i > 0 else 2 * p1 - p2
        p3 = keys[i + 2][c] if i + 2 < len(keys) else 2 * p2 - p1
        out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def spline(ctrl, n):
    """控制点 → n 个 Catmull-Rom 采样点"""
    P = [Vector(c) for c in ctrl]
    segs = len(P) - 1
    out = []
    for k in range(n):
        u = k / (n - 1) * segs
        i = min(int(u), segs - 1)
        t = u - i
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, segs)]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


# ───────────────────────── 网格工具 ─────────────────────────
def mesh_multi(name, verts, faces, mats, fmat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
        ob.data.materials.append(m)
    if fmat:
        for p, i in zip(me.polygons, fmat):
            p.material_index = i
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return link(ob)


def recalc(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def smooth_all(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def subsurf(ob, lv=1):
    md = ob.modifiers.new('sub', 'SUBSURF')
    md.levels = lv
    md.render_levels = lv
    return smooth_all(to_mesh(ob))


def thicken(ob, t, offset=-1.0):
    md = ob.modifiers.new('solid', 'SOLIDIFY')
    md.thickness = t
    md.offset = offset
    md.use_even_offset = True
    return smooth_all(to_mesh(ob))


def ring(z, rx, ryf, ryb=None, n=24, cx=0.0, cy=0.0, thetas=None, fold=None):
    """椭圆截面一圈点。θ 从正前方（-Y）起逆时针（俯视）转；前后半径可不同；fold(θ) 给径向起伏（褶皱）"""
    ryb = ryf if ryb is None else ryb
    if thetas is None:
        thetas = [TAU * k / n for k in range(n)]
    pts = []
    for th in thetas:
        c = math.cos(th)
        ry = ryb + (ryf - ryb) * (1 + c) / 2
        f = 1 + (fold(th) if fold else 0.0)
        pts.append(Vector((cx + rx * math.sin(th) * f, cy - ry * c * f, z)))
    return pts


def loft(name, rows, mats, closed=True, cap0=None, cap1=None, fmat_fn=None):
    """rows：自下而上的若干圈点（每圈点数相同，俯视逆时针）→ 法线朝外的网格。
    cap0 / cap1：底 / 顶封口的扇心坐标（None 不封）"""
    n = len(rows[0])
    verts = [p for r in rows for p in r]
    faces, fm = [], []
    m = n if closed else n - 1
    for i in range(len(rows) - 1):
        for j in range(m):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
            fm.append(fmat_fn(i, j) if fmat_fn else 0)
    if cap0 is not None:
        c = len(verts)
        verts.append(Vector(cap0))
        for j in range(m):
            faces.append((c, (j + 1) % n, j))
            fm.append(0)
    if cap1 is not None:
        c = len(verts)
        verts.append(Vector(cap1))
        k = (len(rows) - 1) * n
        for j in range(m):
            faces.append((c, k + j, k + (j + 1) % n))
            fm.append(0)
    return mesh_multi(name, verts, faces, mats, fm)


def ellipsoid(name, r, loc, m, seg=16, rings=10, deform=None, rot=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        p = Vector((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2]))
        if deform:
            p = deform(p, v.co.copy())
        v.co = p
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(m)
    smooth_all(ob)
    link(ob)
    if rot is not None:
        ob.matrix_world = Matrix.Translation(Vector(loc)) @ rot
    else:
        ob.location = loc
    return ob


def band(name, pts, normals, width, thick, mat):
    """沿中心线平铺的扁带（截面扁矩形），normals 为每点所贴的面法线；四条长棱标硬边"""
    N = len(pts)
    verts, faces = [], []
    for i in range(N):
        p, n = Vector(pts[i]), Vector(normals[i]).normalized()
        t = (Vector(pts[min(i + 1, N - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        b = n.cross(t).normalized()
        w = width[i] if isinstance(width, (list, tuple)) else width
        for sb, sn in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
            verts.append(p + b * (sb * w / 2) + n * (sn * thick / 2))
    for i in range(N - 1):
        for j in range(4):
            a, c = i * 4 + j, i * 4 + (j + 1) % 4
            faces.append((a, c, c + 4, a + 4))
    faces.append((3, 2, 1, 0))
    k = (N - 1) * 4
    faces.append((k, k + 1, k + 2, k + 3))
    ob = recalc(mesh_multi(name, verts, faces, mat))
    for e in ob.data.edges:   # 长棱（相邻截面同一角点的连线）设为硬边，宽面保持平滑
        a, b = e.vertices
        if abs(a - b) == 4:
            e.use_edge_sharp = True
    return ob


def bvh_of(ob):
    bpy.context.view_layer.update()
    mw = ob.matrix_world
    return BVHTree.FromPolygons([mw @ v.co for v in ob.data.vertices], [tuple(p.vertices) for p in ob.data.polygons])


def surface_path(bvh, ctrl, n, lift):
    """控制点吸附到表面：返回 (点, 法线)，法线沿路径做一次平滑"""
    pts, nors = [], []
    for p in spline(ctrl, n):
        loc, nor, _, _ = bvh.find_nearest(p)
        pts.append(loc)
        nors.append(nor)
    sm = [(nors[max(i - 1, 0)] + nors[i] * 2 + nors[min(i + 1, n - 1)]).normalized() for i in range(n)]
    return [p + q * lift for p, q in zip(pts, sm)], sm


def frame_on(loc, nor, tilt=0.0):
    """以表面法线为 -Y 轴的局部坐标系（物体正面朝外），可绕法线转 tilt"""
    n = Vector(nor).normalized()
    ex = Vector((1, 0, 0))
    ex = (ex - n * ex.dot(n)).normalized()
    ez = n.cross(ex).normalized()
    ey = -n
    m = Matrix((ex, ey, ez)).transposed().to_4x4()
    return Matrix.Translation(Vector(loc)) @ m @ Matrix.Rotation(tilt, 4, 'Y')


def shifted(fn, d):
    """运行 fn，并把其间新建的物体整体平移 d"""
    before = set(o.name for o in bpy.context.scene.objects)
    fn()
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:
        if o.name not in before:
            o.matrix_world = Matrix.Translation(Vector(d)) @ o.matrix_world


def part(name, builder, joint):
    """builder 里新建的网格合并成一个部件，原点放在关节处（three.js 端绕原点转动）"""
    before = set(o.name for o in bpy.context.scene.objects)
    builder()
    objs = [o for o in bpy.context.scene.objects if o.name not in before and o.type == 'MESH']
    ob = join_objs(objs, name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.scene.cursor.location = joint
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return ob


# ───────────────────────── 身体各部件 ─────────────────────────
# 躯干截面（z, 半宽, 前半深, 后半深）：腰 → 胸 → 肩 → 颈根
TORSO = [
    (0.92, 0.158, 0.118, 0.116),
    (1.00, 0.160, 0.120, 0.117),
    (1.09, 0.166, 0.126, 0.115),
    (1.19, 0.172, 0.131, 0.113),
    (1.28, 0.176, 0.127, 0.111),
    (1.345, 0.178, 0.114, 0.107),
    (1.39, 0.168, 0.099, 0.097),
    (1.425, 0.135, 0.083, 0.085),
    (1.452, 0.094, 0.067, 0.071),
    (1.468, 0.062, 0.056, 0.059),
]


def build_torso(C, collar=True):
    rows = [ring(z, rx, f, b, n=32) for z, rx, f, b in TORSO]
    body = subsurf(recalc(loft('chest', rows, C['robe'], cap1=(0, 0.0, 1.474))), 1)
    if not collar:
        return body
    bvh = bvh_of(body)

    def collar_band(name, ctrl, width, thick, lift, R, mat, zc_off=0.0, n=34):
        pts, nors = surface_path(bvh, ctrl, n, lift)
        out_p, out_n = [], []
        for p, q in zip(pts, nors):
            w = smoothstep(1.405, 1.445, p.z)      # 颈根处改成竖立的立领
            rad = Vector((p.x, p.y, 0)).normalized()
            stand = Vector((rad.x * R, rad.y * R + 0.004, 1.474 + zc_off))
            out_p.append(p.lerp(stand, w))
            out_n.append(q.lerp(rad, w).normalized())
        return band(name, out_p, out_n, width, thick, mat)

    # 交领右衽：白色中衣领在内，青色领缘在外；左襟（+X）压右襟，斜到右腋下
    for s in (1, -1):
        collar_band('collar_in', [(0.0, 0.07, 1.47), (s * 0.05, 0.045, 1.47), (s * 0.06, -0.015, 1.46), (s * 0.036, -0.07, 1.41), (0.0, -0.1, 1.35)],
                    0.05, 0.004, 0.003, 0.059, C['inner'], zc_off=0.008)
    collar_band('collar_r', [(0.0, 0.074, 1.466), (-0.055, 0.045, 1.462), (-0.066, -0.015, 1.45), (-0.04, -0.075, 1.4), (0.0, -0.11, 1.315), (0.03, -0.12, 1.26)],
                0.036, 0.005, 0.007, 0.066, C['trim'])
    collar_band('collar_l', [(0.0, 0.074, 1.466), (0.055, 0.045, 1.462), (0.066, -0.015, 1.45), (0.045, -0.075, 1.4), (0.0, -0.118, 1.31),
                             (-0.06, -0.128, 1.22), (-0.115, -0.112, 1.11), (-0.145, -0.09, 1.0)],
                0.038, 0.005, 0.011, 0.07, C['trim'], n=44)
    return body


def build_sash(C, knot=True):
    rows = []
    for z, bulge in ((0.952, 0.0), (0.968, 0.006), (1.0, 0.009), (1.032, 0.006), (1.048, 0.0)):
        rx, f, b = interp(TORSO, z)
        rows.append(ring(z, rx + 0.01 + bulge, f + 0.01 + bulge, b + 0.01 + bulge, n=32))
    recalc(loft('sash', rows, C['sash'], cap0=(0, 0, 0.952), cap1=(0, 0, 1.048)))
    rows = []
    for z in (1.044, 1.056):   # 腰带上缘一道细边
        rx, f, b = interp(TORSO, z)
        rows.append(ring(z, rx + 0.008, f + 0.008, b + 0.008, n=32))
    recalc(loft('sash_edge', rows, C['trim'], cap0=(0, 0, 1.044), cap1=(0, 0, 1.056)))
    if knot:   # 腰结：左前方一个结 + 两只蝴蝶耳
        k = Vector((0.065, -0.142, 1.0))
        ellipsoid('knot', (0.021, 0.016, 0.022), k, C['sash'])
        for s in (1, -1):
            rot = Matrix.Rotation(s * 0.5, 4, 'Y')
            ellipsoid('bow', (0.03, 0.01, 0.017), k + Vector((s * 0.03, 0.004, 0.006)), C['sash'], rot=rot)
    return Vector((0.065, -0.15, 0.995))


INNER_P = [(0.07, 0.232, 0.198, 0.208), (0.25, 0.232, 0.19, 0.2), (0.45, 0.225, 0.18, 0.19), (0.65, 0.2, 0.158, 0.165), (0.82, 0.178, 0.138, 0.142), (1.0, 0.155, 0.116, 0.116)]
OUTER_P = [(0.22, 0.30, 0.25, 0.27), (0.35, 0.285, 0.235, 0.25), (0.5, 0.262, 0.21, 0.225), (0.68, 0.232, 0.183, 0.193), (0.85, 0.198, 0.155, 0.158), (1.0, 0.168, 0.128, 0.126)]


def skirt_half(name, side, prof, mats, gap_f, gap_b, fold_amp, n=22, trim=0.0, thick=0.01, rows_n=14, scale=1.0):
    """半片衣摆（side=+1 左 / -1 右），前后开口半角随高度变化；trim>0 时前襟与下摆镶边（材质 1）"""
    z0, z1 = prof[0][0], prof[-1][0]
    zs = [z0] + ([z0 + trim] if trim else []) + [lerp(z0 + trim, z1, (k / rows_n) ** 1.15) for k in range(1, rows_n + 1)]
    rows = []
    for z in zs:
        rx, f, b = interp(prof, z)
        rx, f, b = rx * scale, f * scale, b * scale
        gf, gb = gap_f(z), gap_b(z)
        t = (z - z0) / (z1 - z0)
        amp = fold_amp * (1 - t) ** 1.3 + fold_amp * 0.15
        fold = lambda th, amp=amp: amp * (math.sin(7 * th + 0.5) * 0.7 + math.sin(13 * th + 2.0) * 0.3)
        if side > 0:
            a0, a1 = gf, math.pi - gb
        else:
            a0, a1 = math.pi + gb, TAU - gf
        ths = [lerp(a0, a1, k / (n - 1)) for k in range(n)]
        if trim:   # 前襟那一列固定宽度
            d = trim / rx
            if side > 0:
                ths = [a0, a0 + d] + [lerp(a0 + d, a1, k / (n - 2)) for k in range(1, n - 1)]
            else:
                ths = [lerp(a0, a1 - d, k / (n - 2)) for k in range(0, n - 1)] + [a1]
        rows.append(ring(z, rx, f, b, thetas=ths, fold=fold))

    def fm(i, j):
        if not trim:
            return 0
        front_col = (j == 0) if side > 0 else (j == n - 2)
        return 1 if (i == 0 or front_col) else 0
    ob = loft(name, rows, mats, closed=False, fmat_fn=fm)
    return thicken(ob, thick)


SHORT_P = [(0.46, 0.27, 0.22, 0.235), (0.6, 0.25, 0.2, 0.212), (0.75, 0.222, 0.175, 0.185), (0.88, 0.194, 0.152, 0.155), (1.0, 0.168, 0.128, 0.126)]


def build_skirts(C, side, outer=True, inner=True, inner_scale=1.0, outer_scale=1.0, outer_prof=None):
    def gi_f(z): return 0.02 + 0.12 * smoothstep(0.75, 0.08, z)
    def gi_b(z): return 0.02 + 0.08 * smoothstep(0.75, 0.08, z)
    if inner:
        skirt_half('inner_skirt', side, INNER_P, [C['inner']], gi_f, gi_b, 0.022, scale=inner_scale, thick=0.008)
    if outer:
        prof = outer_prof or OUTER_P
        z0 = prof[0][0]
        def go_f(z): return 0.07 + 0.36 * ((1.0 - z) / (1.0 - z0)) ** 1.2 * (1.0 if prof is OUTER_P else 0.5)
        def go_b(z): return 0.02 + 0.1 * smoothstep(0.7, z0, z)
        skirt_half('outer_skirt', side, prof, [C['robe'], C['trim']], go_f, go_b, 0.032, trim=0.034, thick=0.011, scale=outer_scale)


ARM_J = 0.178


def build_arm(C, side, wide=True):
    """手臂 = 肩头圆顶 + 上臂 + 下垂的宽袖（袖口斜开，后侧袖袋更长）+ 手"""
    jx = ARM_J * side
    zt = 1.405
    n = 22
    if wide:
        keys = [(0.0, 0.102, 0.155, 0.048), (0.07, 0.1, 0.153, 0.048), (0.2, 0.094, 0.144, 0.044), (0.38, 0.086, 0.126, 0.036),
                (0.56, 0.077, 0.104, 0.024), (0.74, 0.068, 0.084, 0.011), (0.9, 0.064, 0.072, 0.004), (1.0, 0.064, 0.068, 0.0)]
        zf, zb = 0.885, 0.70
    else:   # 窄袖（船夫）
        keys = [(0.0, 0.056, 0.058, 0.0), (0.07, 0.056, 0.058, 0.0), (0.5, 0.06, 0.063, 0.0), (1.0, 0.064, 0.068, 0.0)]
        zf, zb = 0.93, 0.93
    ths = [TAU * k / n for k in range(n)]
    rows = []
    for s, rx, ry, cy in keys:
        amp = 0.045 * (1 - s) if wide else 0.0
        row = []
        for th in ths:
            ze = lerp(zb, zf, (1 + math.cos(th)) / 2)
            z = lerp(ze, zt, s)
            f = 1 + amp * math.sin(5 * th + 1.0)
            c = math.cos(th)
            row.append(Vector((jx + side * 0.03 * (1 - s) ** 1.4 + rx * math.sin(th) * f, cy - ry * c * f, z)))
        rows.append(row)
    # 肩头：以关节为球心的半球，转动时不露缝
    J = Vector((jx, 0, 1.42))
    for ph in (0.35, 0.7, 1.05, 1.35):   # 肩头：扁圆顶，斜向颈部
        r, z = math.cos(ph), 1.405 + 0.03 * math.sin(ph)
        rows.append(ring(z, 0.064 * r, 0.068 * r, cx=jx - side * 0.012 * (1 - r), thetas=ths))
    ob = loft('sleeve', rows, [C['robe'], C['trim']], cap1=(jx - side * 0.011, 0, 1.405 + 0.031), fmat_fn=lambda i, j: 1 if i == 0 else 0)
    thicken(ob, 0.008)
    # 手：手掌 + 拇指，掌心朝腿
    hz = 0.862 if wide else 0.9
    hx = jx + side * 0.024
    smooth_all(cyl('wrist', 0.026, 0.09, (hx, -0.004, hz + 0.03), C['skin'], seg=12))
    ellipsoid('palm', (0.019, 0.034, 0.05), (hx, -0.006, hz), C['skin'], seg=14, rings=10,
              deform=lambda p, u: Vector((p.x * (1 - 0.25 * max(0, -u.z)), p.y * (1 - 0.2 * max(0, -u.z)), p.z)))
    ellipsoid('thumb', (0.011, 0.011, 0.026), (hx - side * 0.006, -0.036, hz + 0.004), C['skin'], seg=10, rings=6,
              rot=Matrix.Rotation(-0.35, 4, 'X'))
    return J


def build_leg(C, side, boot=True):
    x = 0.09 * side
    keys = [(0.12, 0.044, 0.046), (0.3, 0.05, 0.052), (0.5, 0.058, 0.061), (0.7, 0.07, 0.074), (0.86, 0.083, 0.088), (0.98, 0.086, 0.09)]
    rows = []
    for k in range(13):
        z = lerp(0.12, 0.98, k / 12)
        rx, ry = interp(keys, z)
        rows.append(ring(z, rx, ry, n=16, cx=x, fold=lambda th, z=z: 0.04 * math.sin(4 * th + z * 9)))
    recalc(loft('pants', rows, C['pants'], cap0=(x, 0, 0.12), cap1=(x, 0, 0.98)))
    if boot:   # 靴筒 + 靴面（微翘的靴头）+ 白底
        rows = [ring(z, r, r * 1.05, n=16, cx=x, cy=0.004) for z, r in ((0.04, 0.05), (0.18, 0.052), (0.3, 0.055), (0.32, 0.058))]
        recalc(loft('boot_shaft', rows, C['boot'], cap0=(x, 0.004, 0.04), cap1=(x, 0.004, 0.32)))

        def foot(p, u):
            p = Vector(p)
            if p.z < -0.033:
                p.z = -0.033
            if p.y < -0.06:   # 靴头上翘、收窄
                k = (-0.06 - p.y) / 0.05
                p.z += 0.02 * k * k
                p.x *= 1 - 0.25 * k
            return p
        ellipsoid('foot', (0.047, 0.115, 0.044), (x, -0.045, 0.045), C['boot'], seg=18, rings=12, deform=foot)
        ellipsoid('sole', (0.05, 0.117, 0.01), (x, -0.045, 0.012), C['sole'], seg=18, rings=6)


# ───────────────────────── 头部 ─────────────────────────
HEAD_C = Vector((0, -0.004, 1.645))


def _head_shape(u, inflate=0.0):
    """单位球方向 → 头部表面（相对头心）。u.y<0 为脸。"""
    x, y, z = u
    sx, sy, sz = 0.079, 0.097, 0.112
    if z < 0:
        k = -z
        sx *= 1 - 0.24 * k ** 1.8
        sy *= (1 - 0.36 * k ** 1.3) if y > 0 else (1 - 0.1 * k ** 2)
    elif y > 0:
        sy *= 1 + 0.07 * z
    X, Y, Z = x * sx, y * sy, z * sz
    if y < 0:
        Y *= 1 - 0.12 * (1 - abs(z)) * (-y) ** 4             # 前脸略平
        g = lambda cx, cz, w: math.exp(-(((x - cx) / w) ** 2 + ((z - cz) / w) ** 2))
        Y += 0.004 * (g(0.37, 0.02, 0.17) + g(-0.37, 0.02, 0.17))   # 眼窝
        Y -= 0.003 * (g(0.3, 0.2, 0.2) + g(-0.3, 0.2, 0.2))         # 眉弓
        Y -= 0.004 * g(0.0, -0.88, 0.26)                              # 下巴
        X *= 1 + 0.04 * (g(0.6, -0.18, 0.25) + g(-0.6, -0.18, 0.25))  # 颧骨
    v = Vector((X, Y, Z))
    if inflate:
        v += v.normalized() * inflate
    return v


HAIRLINE = [(0.0, 0.5), (0.55, 0.42), (0.95, 0.2), (1.12, -0.3), (1.35, -0.62), (math.pi + 0.01, -0.62)]


def _hair_margin(u):
    a = abs(math.atan2(u.x, -u.y))
    return u.z - interp(HAIRLINE, a)[0]


def build_head(C, hair_long=True, bun=True):
    c = HEAD_C
    smooth_all(cyl('neck', 0.05, 0.14, (0, 0.01, 1.435), C['skin'], seg=16, r_top=0.047))
    head = ellipsoid('head', (1, 1, 1), c, C['skin'], seg=40, rings=28, deform=lambda p, u: _head_shape(u))
    bvh = bvh_of(head)

    def on_face(x, z, lift=0.0):
        loc, nor, _, _ = bvh.ray_cast(Vector((x, -0.5, z)), Vector((0, 1, 0)))
        return loc + nor * lift, nor

    # 眼：杏仁形，外眼角上挑；上眼线；剑眉
    ez = 1.643
    for s in (1, -1):
        loc, nor = on_face(s * 0.031, ez, 0.0)
        ellipsoid('eye_white', (0.0125, 0.0026, 0.0047), (0, 0, 0), C['eye_w'], seg=14, rings=8).matrix_world = frame_on(loc, nor, -s * 0.16)
        loc2, nor2 = on_face(s * 0.0295, ez - 0.0003, 0.0009)
        ellipsoid('iris', (0.0052, 0.0022, 0.0049), (0, 0, 0), C['eye'], seg=12, rings=8).matrix_world = frame_on(loc2, nor2)
        lid = [on_face(s * (0.016 + 0.033 * k / 6), ez + 0.004 + 0.0045 * math.sin(math.pi * k / 6) + 0.003 * k / 6, 0.0015)[0] for k in range(7)]
        tubes('lid', [lid], [[0.0012, 0.0018, 0.0021, 0.002, 0.0018, 0.0014, 0.001]], C['eye'], res=2)
        brow = [on_face(s * (0.012 + 0.048 * k / 6), 1.666 + 0.009 * k / 6 - 0.006 * (k / 6) ** 3, 0.0015)[0] for k in range(7)]
        tubes('brow', [brow], [[0.0028, 0.0034, 0.0032, 0.0028, 0.0024, 0.0018, 0.0009]], C['hair'], res=2)
    # 鼻：鼻梁 + 鼻头 + 两翼
    loc, nor = on_face(0, 1.628, -0.006)
    ellipsoid('nose', (0.0085, 0.013, 0.026), (0, 0, 0), C['skin'], seg=12, rings=10,
              deform=lambda p, u: Vector((p.x * (0.75 + 0.45 * max(0, -u.z)), p.y * (0.6 + 0.7 * max(0, -u.z)), p.z))).matrix_world = \
        frame_on(loc, nor) @ Matrix.Rotation(-0.25, 4, 'X')
    for s in (1, -1):
        loc, nor = on_face(s * 0.0095, 1.61, -0.002)
        ellipsoid('nostril', (0.0065, 0.006, 0.005), (0, 0, 0), C['skin'], seg=8, rings=6).matrix_world = frame_on(loc, nor)
    # 嘴：唇形 + 唇缝
    loc, nor = on_face(0, 1.586, -0.0012)
    ellipsoid('lip', (0.0145, 0.0035, 0.0048), (0, 0, 0), C['lip'], seg=14, rings=8,
              deform=lambda p, u: Vector((p.x, p.y, p.z * (1 - 0.35 * abs(u.x) ** 2)))).matrix_world = frame_on(loc, nor)
    line = [on_face(0.015 * (k / 4 - 1) * 1.0, 1.586 + 0.0012 * (1 - abs(k / 4 - 1)), 0.0022)[0] for k in range(9)]
    tubes('mouth', [line], [[0.0006, 0.001, 0.0012, 0.0013, 0.0013, 0.0013, 0.0012, 0.001, 0.0006]], C['lip_d'], res=2)

    # 头发：同形放大的发壳，按发际线裁掉脸部，边缘贴回头皮
    me = bpy.data.meshes.new('hair')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1.0)
    lay = bm.verts.layers.float.new('m')
    for v in bm.verts:
        v[lay] = _hair_margin(v.co)
    kill = [f for f in bm.faces if max(v[lay] for v in f.verts) <= 0.0]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    for v in bm.verts:
        u = v.co.copy()
        mg = v[lay]
        if mg < 0:   # 沿经线把顶点推到发际线上
            a = abs(math.atan2(u.x, -u.y))
            zt = max(-0.99, min(0.99, interp(HAIRLINE, a)[0]))
            k = math.sqrt(1 - zt * zt) / max(1e-6, math.hypot(u.x, u.y))
            u = Vector((u.x * k, u.y * k, zt))
            mg = 0.0
        v.co = c + _head_shape(u, inflate=0.0015 + 0.0085 * smoothstep(0.0, 0.3, mg)) + Vector((0, 0.002, 0.003)) * smoothstep(0.0, 0.3, mg)
    bm.to_mesh(me)
    bm.free()
    hair = link(bpy.data.objects.new('hair', me))
    hair.data.materials.append(C['hair'])
    smooth_all(hair)
    thicken(hair, 0.004, offset=-1.0)
    if bun:   # 发髻 + 发冠 + 簪
        b = c + Vector((0, 0.028, 0.118))
        ellipsoid('bun', (0.04, 0.042, 0.034), b + Vector((0, 0, 0.012)), C['hair'], seg=18, rings=12)
        smooth_all(cyl('crown', 0.03, 0.028, b + Vector((0, 0, 0.01)), C['gold'], seg=16, r_top=0.026))
        tubes('pin', [[b + Vector((-0.07, 0.0, 0.032)), b + Vector((0.07, 0.0, 0.032))]], 0.0035, C['gold'], res=2)
        ellipsoid('pin_head', (0.007, 0.007, 0.007), b + Vector((0.072, 0, 0.032)), C['gold'], seg=8, rings=6)
    if hair_long:   # 披发：从后脑垂到肩胛，几缕起伏
        keys = [(1.14, 0.012, 0.124), (1.2, 0.034, 0.126), (1.29, 0.048, 0.122), (1.38, 0.056, 0.11), (1.45, 0.06, 0.09), (1.52, 0.064, 0.074), (1.6, 0.068, 0.082), (1.66, 0.06, 0.07)]
        rows = []
        for k in range(14):
            z = lerp(1.14, 1.66, k / 13)
            w, y = interp(keys, z)
            rows.append(ring(z, w, 0.016, 0.016, n=20, cy=y, fold=lambda th: 0.12 * math.sin(6 * th)))
        recalc(loft('hair_long', rows, C['hair'], cap0=(0, 0.124, 1.13), cap1=(0, 0.07, 1.665)))


def build_hat(C, tilt=0.07, R=0.37):
    """斗笠：微鼓的锥面 + 同心编织纹 + 竹篾辐条 + 卷边 + 顶钮 + 内箍与系绳"""
    prof = [(R, 1.728), (R * 0.89, 1.743), (R * 0.68, 1.782), (R * 0.46, 1.832), (R * 0.24, 1.882), (R * 0.08, 1.916), (0.0, 1.93)]
    prof = [(p[0], p[1]) for p in reversed(prof)]
    rows = []
    N = 26
    for k in range(N + 1):
        r = lerp(R, 0.012, k / N)
        z = interp(prof, r)[0]
        rows.append(ring(z, r, r, n=56))
    objs = [thicken(loft('hat', rows, C['hat'], cap1=(0, 0, interp(prof, 0.0)[0] + 0.002)), 0.008)]
    rim = [(math.cos(a) * (R + 0.002), math.sin(a) * (R + 0.002), 1.727) for a in [TAU * k / 64 for k in range(65)]]
    objs.append(tubes('hat_rim', [rim], 0.0065, C['hat_b'], res=4))
    ribs = []
    for k in range(16):
        a = TAU * k / 16 + 0.1
        ribs.append([(math.cos(a) * r, math.sin(a) * r, interp(prof, r)[0] + 0.0021) for r in [lerp(R - 0.01, 0.04, t / 16) for t in range(17)]])
    for rr in (0.1, 0.17, 0.24, 0.31):   # 同心篾圈
        ribs.append([(math.cos(a) * rr, math.sin(a) * rr, interp(prof, rr)[0] + 0.002) for a in [TAU * k / 48 for k in range(49)]])
    objs.append(tubes('hat_ribs', ribs, 0.0016, C['hat_b'], res=2))
    objs.append(ellipsoid('hat_knob', (0.016, 0.016, 0.012), (0, 0, 1.933), C['hat_b'], seg=12, rings=8))
    rows = [ring(z, r, r, n=24) for z, r in ((1.722, 0.088), (1.76, 0.086), (1.8, 0.08), (1.86, 0.06))]
    objs.append(thicken(loft('hat_frame', rows, C['hat_in']), 0.004))
    piv = Matrix.Translation((0, 0, 1.75)) @ Matrix.Rotation(tilt, 4, 'X') @ Matrix.Translation((0, 0, -1.75))
    for o in objs:
        o.matrix_world = piv @ o.matrix_world
    for s in (1, -1):   # 系绳：从内箍两侧沿下颌到下巴下打结
        pts = spline([(s * 0.083, -0.01, 1.725), (s * 0.072, -0.03, 1.62), (s * 0.045, -0.06, 1.548), (s * 0.006, -0.075, 1.527)], 10)
        tubes('hat_string', [pts], 0.0013, C['hat_b'], res=2)


def build_ribbon(C):
    """发带：从发髻后垂下的两条扁带（单独部件，three.js 里飘动）"""
    for s in (1, -1):
        ctrl = [(s * 0.012, 0.058, 1.79), (s * 0.02, 0.1, 1.7), (s * 0.03, 0.135, 1.55), (s * 0.04, 0.152, 1.38), (s * 0.046, 0.16, 1.24)]
        pts = spline(ctrl, 20)
        nors = [Vector((s * 0.15, 1, 0.1)).normalized()] * len(pts)
        band('ribbon', pts, nors, [lerp(0.02, 0.016, k / 19) for k in range(20)], 0.003, C['ribbon'])


def build_sash_tail(C, k):
    for dx, ln, ph in ((0.0, 0.42, 0.0), (0.03, 0.34, 1.3)):
        n = 16
        pts = [k + Vector((dx + 0.008 * math.sin(t * 5 + ph), -0.006 - 0.012 * t, -ln * t)) for t in [j / (n - 1) for j in range(n)]]
        nors = [Vector((0, -1, 0))] * n
        band('tail', pts, nors, [lerp(0.032, 0.04, j / (n - 1)) for j in range(n)], 0.004, C['sash'])


def palette(prefix='fig', **over):
    base = dict(inner='#f3f1ea', robe='#c8e0d4', trim='#2f6f6a', sash='#b8433a', pants='#3e5a6e', boot='#2b2826', sole='#e8e2d4',
                skin='#f0cfae', hair='#26211e', eye='#1d1b1a', eye_w='#f4efe6', hat_in='#7d6a45', lip='#c97a6c', lip_d='#8a4a44', hat='#d8bd72', hat_b='#8c6a32',
                gold='#c9a24a', ribbon='#3f7f78')
    base.update(over)
    return {k: mat(prefix + '_' + k, v) for k, v in base.items()}
