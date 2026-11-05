# 山水意境 · Blender 建模公共工具（后台运行：blender --background --factory-startup --python xxx.py）
# 约定：材质 Base Color 直接写“画面色”数值（不做 sRGB→线性转换），three.js 端按原值读取后套统一水彩着色。
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(ROOT)
ASSETS = os.path.join(PROJECT, 'spike', 'assets')
PREVIEWS = os.path.join(ROOT, 'previews')
os.makedirs(ASSETS, exist_ok=True)
os.makedirs(PREVIEWS, exist_ok=True)


_mats = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mat(name, hexcol):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    r, g, b = hex2rgb(hexcol)
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    m.diffuse_color = (r, g, b, 1)
    _mats[name] = m
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    return link(ob)


def box(name, size, loc, material, rot_z=0.0):
    sx, sy, sz = (s / 2 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
         (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    ob = mesh_obj(name, v, f, material)
    ob.location = loc
    ob.rotation_euler.z = rot_z
    return ob


def cyl(name, r, h, loc, material, seg=12, r_top=None):
    r_top = r if r_top is None else r_top
    v, f = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        v.append((math.cos(a) * r, math.sin(a) * r, 0))
        v.append((math.cos(a) * r_top, math.sin(a) * r_top, h))
    for i in range(seg):
        j = (i + 1) % seg
        f.append((2 * i, 2 * j, 2 * j + 1, 2 * i + 1))
    f.append(tuple(2 * i for i in reversed(range(seg))))
    f.append(tuple(2 * i + 1 for i in range(seg)))
    ob = mesh_obj(name, v, f, material)
    ob.location = loc
    return ob


def tubes(name, polylines, radius, material, res=4):
    """一组折线 → 圆管网格（瓦垄、屋脊、栏杆扶手、枝干都用它）。radius 可以是数或与 polylines 对应的列表"""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 1.0 if isinstance(radius, (list, tuple)) else radius
    cu.bevel_resolution = max(0, res // 2 - 1)
    cu.use_fill_caps = True
    for k, pl in enumerate(polylines):
        sp = cu.splines.new('POLY')
        sp.points.add(len(pl) - 1)
        for i, p in enumerate(pl):
            sp.points[i].co = (p[0], p[1], p[2], 1)
            if isinstance(radius, (list, tuple)):
                rr = radius[k]
                sp.points[i].radius = rr[i] if isinstance(rr, (list, tuple)) else rr
    ob = bpy.data.objects.new(name, cu)
    ob.data.materials.append(material)
    link(ob)
    return to_mesh(ob)


def to_mesh(ob):
    """应用修改器 / 曲线转网格"""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    new = bpy.data.objects.new(ob.name, me)
    new.matrix_world = ob.matrix_world
    link(new)
    bpy.data.objects.remove(ob, do_unlink=True)
    return new


def solidify(ob, t):
    md = ob.modifiers.new('solid', 'SOLIDIFY')
    md.thickness = t
    md.offset = -1
    return to_mesh(ob)


def join_all(name):
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob


def join_objs(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


def export_glb(filename, vertex_color=False):
    path = os.path.join(ASSETS, filename)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False,
                              export_apply=True, export_yup=True, export_materials='EXPORT',
                              export_vertex_color='ACTIVE' if vertex_color else 'MATERIAL',
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    print('EXPORTED', path, os.path.getsize(path))
    return path


def preview(filename, target=(0, 0, 4), dist=26, elev=18, azim=-35, res=(900, 700), lens=50, color_type='MATERIAL'):
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_WORKBENCH'
    except TypeError as e:
        print('engine err', e)
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = color_type
    sh.show_shadows = True
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sc.display.shadow_focus = 0.6
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    world = bpy.data.worlds.new('w') if not sc.world else sc.world
    sc.world = world
    world.color = (0.93, 0.93, 0.92)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = lens
    cam = bpy.data.objects.new('cam', cam_data)
    link(cam)
    e, a = math.radians(elev), math.radians(azim)
    t = Vector(target)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    d = (t - cam.location)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = os.path.join(PREVIEWS, filename)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    print('PREVIEW', sc.render.filepath)
