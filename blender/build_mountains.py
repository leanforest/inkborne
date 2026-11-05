# 切块面山峰 + 片状岸石
# 截面 = 多个半平面求交（得到平的崖壁）；高度方向叠加台阶式“岩层”内收（得到平台、断崖）；
# 主峰旁拼 1~2 根副峰；顶点色烘焙：R=凹陷度(皴/缝)  G=朝上程度(平台苔点)  B=相对高度
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import bmesh
from mathutils import Vector, noise as mnoise

LO = '--lo' in sys.argv     # 远景低模：网格密度减半，只导出山峰
reset()
ROCKMAT = mat('mountain', '#7fa6d6')


def pillar(name, H, R, seed, kind='peak', z0=-0.08, rows=None, cols=None, global_H=None, tilt=(0, 0), style=None, lean_amt=0.25):
    # 面数预算：主峰 90x84；岸石只需 40x44（崖面本来就是平面）
    if rows is None:
        rows, cols = (90, 84) if kind in ('peak', 'mesa') else (40, 44)
        if LO:
            rows, cols = rows // 2, cols // 2
    rnd = random.Random(seed)
    K = rnd.randint(7, 11)
    planes = []
    for i in range(K):
        phi = 2 * math.pi * i / K + rnd.uniform(-0.25, 0.25)
        planes.append((phi, rnd.uniform(0.78, 1.12), rnd.uniform(0.7, 1.45)))   # 方向, 基础距离, 收分速度
    steps = []
    nsteps = {'peak': rnd.randint(3, 6), 'mesa': rnd.randint(2, 4), 'rock': rnd.randint(2, 4), 'slab': rnd.randint(3, 5), 'spike': rnd.randint(2, 4)}[kind]
    for _ in range(nsteps):
        # 每道岩层只让其中几面崖壁内收 → 局部平台与断崖，而不是一整圈“年轮”
        affected = set(rnd.sample(range(K), rnd.randint(1, max(1, K // 3))))
        steps.append((rnd.uniform(0.12, 0.85), rnd.uniform(0.06, 0.16), affected))
    style = style or rnd.choice(['column', 'column', 'dome', 'spire'])
    la = rnd.uniform(0, 6.28)
    lean = Vector((math.cos(la), math.sin(la))) * (lean_amt * rnd.uniform(0.5, 1.0))
    ox, oy = rnd.uniform(0, 100), rnd.uniform(0, 100)

    def prof(t):
        t = min(t, 1.0)
        if kind == 'peak':
            n, m = {'column': (3.2, 0.42), 'dome': (2.2, 0.5), 'spire': (1.6, 0.62)}[style]
            p = max(0.0, 1 - t ** n) ** m
        elif kind == 'mesa':
            p = 1 - 0.28 * t
        elif kind == 'rock':
            p = max(0.0, 1 - t ** 2.5) ** 0.5          # 圆钝的卧石（不再是平顶圆桶）
        elif kind == 'spike':
            p = max(0.0, 1 - t ** 1.8) ** 0.7          # 石笋
        else:  # slab：平顶竖岩片
            p = max(0.0, 1 - t ** 7) ** 0.25
        return p

    def step_drop(t, idx):
        d = 0.0
        for h, dr, aff in steps:
            if idx in aff:
                d += dr * (0.5 + 0.5 * math.tanh((t - h) / 0.01))
        return d

    verts = []
    tvals = []
    for i in range(rows + 1):
        t = z0 + (1 - z0) * i / rows
        tt = max(t, 0)
        pr = prof(tt)
        cx = lean.x * tt * tt * R + (mnoise.noise(Vector((ox, tt * 1.5, 0))) * 0.25 * R) * tt
        cy = lean.y * tt * tt * R + (mnoise.noise(Vector((0, tt * 1.5, oy))) * 0.25 * R) * tt
        for j in range(cols):
            th = 2 * math.pi * j / cols
            r = 1e9
            for pi_, (phi, b, tau) in enumerate(planes):
                c = math.cos(th - phi)
                if c > 0.05:
                    wob = 1 + 0.14 * mnoise.noise(Vector((pi_ * 3.1 + ox, tt * 2.2, 0.5)))
                    d = max(0.0, b * wob * (pr ** tau) - step_drop(tt, pi_) * pr ** 0.5)
                    r = min(r, d / c)
            r = min(r, 1.6 * pr)
            # 竖向裂缝 + 细碎起伏
            groove = abs(mnoise.noise(Vector((math.cos(th) * 3 + ox, math.sin(th) * 3 + oy, tt * 1.2))))
            rough = mnoise.noise(Vector((math.cos(th) * 6 + ox, math.sin(th) * 6, tt * 9)))
            r *= 1 - 0.022 * (1 - min(1, groove * 3)) + 0.012 * rough   # 竖槽磨浅，远看不再像蜡泪
            if kind == 'mesa' and t >= 0.999:
                r *= 0.0
            x = cx + math.cos(th) * r * R
            y = cy + math.sin(th) * r * R
            verts.append((x, y, t * H))
            tvals.append(t)
    faces = []
    for i in range(rows):
        for j in range(cols):
            a, b = i * cols + j, i * cols + (j + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    ob = mesh_obj(name, verts, faces, ROCKMAT)
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=H * 0.0015)
    bm.to_mesh(me)
    bm.free()
    if tilt != (0, 0):
        ob.rotation_euler = (tilt[0], tilt[1], 0)
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return ob


def bake_colors(ob, H):
    """R=凹陷度  G=朝上（平台）  B=相对高度"""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    conc = [0.0] * len(bm.verts)
    for v in bm.verts:
        if not v.link_edges:
            continue
        acc, el = 0.0, 0.0
        for e in v.link_edges:
            o = e.other_vert(v)
            dv = o.co - v.co
            acc += dv.dot(v.normal)
            el += dv.length
        el /= len(v.link_edges)
        conc[v.index] = acc / len(v.link_edges) / max(el, 1e-5)
    for _ in range(2):   # 平滑
        new = conc[:]
        for v in bm.verts:
            if v.link_edges:
                new[v.index] = 0.5 * conc[v.index] + 0.5 * sum(conc[e.other_vert(v).index] for e in v.link_edges) / len(v.link_edges)
        conc = new
    zs = [v.co.z for v in bm.verts]
    bm.free()
    if not me.color_attributes.get('Color'):
        me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    ca = me.color_attributes['Color']
    me.color_attributes.active_color = ca
    for v in me.vertices:
        c = max(0.0, min(1.0, 0.5 + conc[v.index] * 3.0))
        up = max(0.0, min(1.0, (v.normal.z - 0.45) / 0.4))
        h = max(0.0, min(1.0, zs[v.index] / H))
        ca.data[v.index].color = (c, up, h, 1.0)


def edge_split(ob, deg=38):
    md = ob.modifiers.new('es', 'EDGE_SPLIT')
    md.split_angle = math.radians(deg)
    for p in ob.data.polygons:
        p.use_smooth = True


def make_variant(name, kind, H, R, seed, subs=0, tilt=(0, 0), style=None, lean_amt=0.25, twin=False, sub_kind='peak', stack=False):
    rnd = random.Random(seed * 7 + 1)
    parts = [pillar(name + '_main', H, R, seed, kind, tilt=tilt, style=style, lean_amt=lean_amt)]
    for k in range(subs):
        a = rnd.uniform(0, 6.28)
        if twin and k == 0:          # 双峰并立：一根几乎等高的副峰紧贴主峰
            d, hh, rr = R * rnd.uniform(0.6, 0.8), H * rnd.uniform(0.82, 0.95), R * rnd.uniform(0.7, 0.85)
        else:
            d, hh, rr = R * rnd.uniform(0.55, 0.95), H * rnd.uniform(0.45, 0.75), R * rnd.uniform(0.45, 0.7)
        sub = pillar(f'{name}_sub{k}', hh, rr, seed + 100 + k, sub_kind, style=style if twin else None, lean_amt=lean_amt,
                     tilt=((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5)) if stack else (0, 0)))
        z = H * rnd.uniform(0.35, 0.6) if stack and k == 0 else 0     # 叠石：小石压在大石上
        sub.location = (math.cos(a) * d * (0.4 if stack and k == 0 else 1), math.sin(a) * d * (0.4 if stack and k == 0 else 1), z)
        bpy.context.view_layer.objects.active = sub
        sub.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    ob = join_objs([o for o in bpy.context.scene.objects if o.name.startswith(name + '_')], name)
    bake_colors(ob, H)
    edge_split(ob)
    return ob


# ───────── 山峰：8 个尖峰变体 + 2 个平顶台峰（统一按 H=100 建，three.js 里再缩放）
variants = []
PEAK_STYLES = [   # (造型, 倾斜度, 双峰)
    ('column', 0.25, False), ('spire', 0.65, False), ('dome', 0.2, False), ('column', 0.55, True),
    ('spire', 0.3, True), ('dome', 0.5, False), ('column', 0.7, False), ('spire', 0.2, False)]
for i in range(8):
    rnd = random.Random(i)
    st, la, tw = PEAK_STYLES[i]
    ob = make_variant(f'peak_{i}', 'peak', 100, rnd.uniform(17, 24), 11 + i * 17, subs=rnd.choice([1, 2, 2]) + (1 if tw else 0),
                      style=st, lean_amt=la, twin=tw)
    variants.append(ob)
for i in range(2):
    ob = make_variant(f'mesa_{i}', 'mesa', 100, 30, 501 + i * 13, subs=1)
    variants.append(ob)

# 预览：排成一排
for k, ob in enumerate(variants):
    ob.location = ((k - 4.5) * 60, 0, 0)
export_glb('mountains_lo.glb' if LO else 'mountains.glb', vertex_color=True)
if LO:
    sys.exit(0)
preview('mountains_row.png', target=(0, 0, 45), dist=520, elev=6, azim=0, res=(1400, 520), lens=50, color_type='VERTEX')

# ───────── 岸石：8 个变体（块石 / 竖岩片），统一按 H=10 建
for ob in variants:
    bpy.data.objects.remove(ob, do_unlink=True)
rocks = []
ROCK_KINDS = ['slab', 'spike', 'stack', 'slab', 'rock', 'spike', 'stack', 'rock']   # 岩片 / 石笋 / 叠石 / 卧石
for i in range(8):
    rnd = random.Random(900 + i)
    kind = ROCK_KINDS[i]
    if kind == 'stack':
        ob = make_variant(f'rock_{i}', 'rock', 7, rnd.uniform(5, 6.5), 900 + i * 31, subs=2, sub_kind='rock', stack=True,
                          tilt=(rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2)))
    else:
        R = {'rock': rnd.uniform(5, 7), 'slab': rnd.uniform(3.5, 5), 'spike': rnd.uniform(2.2, 3)}[kind]
        H = {'rock': 7, 'slab': 10, 'spike': 13}[kind]
        ob = make_variant(f'rock_{i}', kind, H, R, 900 + i * 31, subs=rnd.choice([0, 1, 2]), sub_kind='spike' if kind == 'spike' else 'peak',
                          tilt=(rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3)))
    if kind == 'slab':
        ob.scale = (1.5, 0.65, 1)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    rocks.append(ob)
for k, ob in enumerate(rocks):
    ob.location = ((k - 3.5) * 16, 0, 0)
export_glb('rocks.glb', vertex_color=True)
preview('rocks_row.png', target=(0, 0, 4), dist=150, elev=12, azim=0, res=(1400, 520), lens=50, color_type='VERTEX')
