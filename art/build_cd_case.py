"""Build a hinged jewel case in a fresh Blender scene; retain legacy assets.

Run: blender --background --factory-startup --python art/build_cd_case.py
World convention after GLB export: X horizontal, Y up (0..3.7), Z front.
"""
import bpy
import math
from pathlib import Path
from shutil import copyfile

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.name = 'Career_CD_Jewel_Case'
scene['modelKind'] = 'cd-jewel-case'

def material(name, color, roughness=.3, metalness=0, transmission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metalness
    bsdf.inputs['Transmission Weight'].default_value = transmission
    bsdf.inputs['IOR'].default_value = 1.49
    return mat

plastic = material('CD_Clear_Plastic', (.94, .97, .98), .12, 0, .88)
rim = material('CD_Clear_Rim', (.75, .82, .83), .2, .08, .5)
tray = material('CD_Graphite_Tray', (.94, .97, .98), .16, 0, .8)
silver = material('CD_Disc_Silver', (.76, .81, .83), .22, .88)
hub = material('CD_Disc_Hub', (.38, .44, .47), .22, .55)
ink = material('CD_Print', (.19, .25, .28), .5)
label = material('CD_Spine_Label', (.91, .89, .83), .65)
accent = material('CD_Index', (.76, .47, .2), .3, .25)

def tag(obj, part):
    obj['cdPart'] = part
    obj['assemblyPart'] = part
    obj['modelKind'] = 'cd-jewel-case'
    return obj

def box(name, position, size, mat, part, bevel=.012):
    x, y, z = position
    w, h, d = size
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Moulded edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Face normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj['wallThickness'] = min(size)
    return tag(obj, part)

def ring(name, x, y, z, outer, inner, thickness, mat, part, segments=128):
    vertices, faces = [], []
    for depth in [z-thickness/2, z+thickness/2]:
        for radius in [outer, inner]:
            for i in range(segments):
                a = i * 2 * math.pi / segments
                vertices.append((x+radius*math.cos(a), -depth, y+radius*math.sin(a)))
    for i in range(segments):
        j = (i+1) % segments
        faces += [(i, j, segments+j, segments+i),
                  (2*segments+i, 3*segments+i, 3*segments+j, 2*segments+j),
                  (i, 2*segments+i, 2*segments+j, j),
                  (segments+i, segments+j, 3*segments+j, 3*segments+i)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [tuple(reversed(face)) for face in faces])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = face.index % 4 >= 2
    return tag(obj, part)

# Shared wall and glazing gauges; cavity depth is independent of wall thickness.
WALL = .035
GLAZING = .025
LID_DEPTH = .18
# 142:125 aspect, slim case. The tray and disc stay on the back when opened.
box('back_panel', (0, 1.85, -.12), (4.2, 3.7, GLAZING), plastic, 'back')
box('tray', (.12, 1.83, -.045), (3.71, 3.5, .065), tray, 'tray')
for y in [.055, 3.645]:
    box('back_top_bottom_rim', (0, y, -.0475), (4.2, WALL, .13), rim, 'back')
for x in [-2.045, 2.045]:
    box('back_side_rim', (x, 1.85, -.0475), (WALL, 3.59, .13), rim, 'back')
box('spine', (-2.045, 1.85, .025), (WALL, 3.59, .285), rim, 'spine', .002)
for y in [.055, 3.645]:
    box('spine_end_wall', (-1.88125, y, .1025), (.3625, WALL, LID_DEPTH), rim, 'spine', .002)
box('spine_insert', (-1.89, 1.85, .145), (.22, 3.22, .008), label, 'spine', .002)
box('spine_glazing', (-1.88125, 1.85, .183), (.3625, 3.625, GLAZING), plastic, 'spine', .001)
box('spine_index', (-1.89, 3.34, .153), (.22, .2, .01), accent, 'spine', .002)
def hinge_cylinder(name, y, length, radius, mat, part):
    # Blender Z maps to runtime Y: barrels and pin share the actual hinge axis.
    bore = .018 if name != 'hinge_pin' else 0
    if bore:
        vertices, faces = [], []
        segments = 12
        for end in [y-length/2, y+length/2]:
            for r in [radius, bore]:
                for i in range(segments):
                    a = i * 2 * math.pi / segments
                    vertices.append((-1.78+r*math.cos(a), -(.14+r*math.sin(a)), end))
        for i in range(segments):
            j = (i+1) % segments
            faces += [(i, segments+i, segments+j, j),
                      (2*segments+i, 2*segments+j, 3*segments+j, 3*segments+i),
                      (i, j, 2*segments+j, 2*segments+i),
                      (segments+i, 3*segments+i, 3*segments+j, segments+j)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], [tuple(reversed(face)) for face in faces])
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=radius, depth=length,
                                          location=(-1.78, -.14, y))
        obj = bpy.context.object
        obj.name = name
    obj['hingeAxis'] = [-1.78, .14]
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = (face.index % 4 >= 2) if bore else len(face.vertices) == 4
    return tag(obj, part)

for y in [.13, 3.57]:
    # Interleaved, separated collars replace overlapping rectangular blocks.
    for offset in [-.04, .04]:
        hinge_cylinder('fixed_hinge_collar', y + offset, .025, .023, rim, 'spine')
    hinge_cylinder('lid_hinge_collar', y, .045, .023, rim, 'lid')
    hinge_cylinder('hinge_pin', y, .115, .015, rim, 'spine')
    box('lid_hinge_arm', (-1.705, y, .14), (.15, .045, WALL), rim, 'lid', .004)

# Separate front panel and retaining edges, all rotate on the same left hinge.
# Recess the glazing below the rim's front face (.2025). The former .19
# centre put both front faces at .2025, causing depth fighting at the seam.
# Only a narrow seating overlap is needed to seal the retaining edges.
box('lid_window', (.1925, 1.85, .183), (3.674, 3.559, GLAZING), plastic, 'lid', .001)
for y in [.055, 3.645]:
    box('lid_top_bottom_edge', (.195, y, .1025), (3.79, WALL, LID_DEPTH), rim, 'lid', .004)
box('lid_right_edge', (2.045, 1.85, .1025), (WALL, 3.59, LID_DEPTH), rim, 'lid', .004)
box('lid_hinge_edge', (-1.66, 1.85, .175), (WALL, 3.59, .035), rim, 'lid', .004)
for y in [.3, 3.4]:
    box('booklet_clip', (.06, y, .13), (.55, .065, .04), rim, 'lid', .005)

# A true annular disc with centre hole and separate transparent hub.
cx, cy = .16, 1.78
ring('tray_disc_seat', cx, cy, -.003, 1.635, 1.59, WALL, tray, 'tray')
ring('compact_disc', cx, cy, .065, 1.55, .235, .037, silver, 'disc')
ring('transparent_hub', cx, cy, .066, .39, .235, .038, hub, 'disc', 96)
ring('outer_disc_edge', cx, cy, .071, 1.55, 1.515, .039, hub, 'disc')
ring('centre_press_ring', cx, cy, .104, .19, .13, .027, tray, 'tray', 64)
# Eight continuous radial spring petals with a gently raised retaining lip.
# The gaps allow flex; rounded tapered tips replace the tall square pegs.
for i in range(8):
    centre = i * 2 * math.pi / 8
    vertices, faces = [], []
    stations = [(.16, .26, .116), (.20, .23, .13), (.24, .16, .13)]
    samples = 7
    for bottom in [True, False]:
        for radius, half_width, top in stations:
            for sample in range(samples):
                a = centre + (sample/(samples-1)*2-1)*half_width
                z = top - (.022 if bottom else 0)
                vertices.append((cx+radius*math.cos(a), -z, cy+radius*math.sin(a)))
    layer = len(stations)*samples
    for station in range(len(stations)-1):
        for sample in range(samples-1):
            p = station*samples+sample
            q = p+samples
            faces += [(p, p+1, q+1, q), (layer+p, layer+q, layer+q+1, layer+p+1)]
    perimeter = list(range(samples)) + [station*samples+samples-1 for station in range(1,len(stations))] + list(range(layer-2,layer-samples-1,-1)) + [station*samples for station in range(len(stations)-2,0,-1)]
    for index, p in enumerate(perimeter):
        q = perimeter[(index+1)%len(perimeter)]
        faces.append((p, q, layer+q, layer+p))
    mesh = bpy.data.meshes.new('spring_petal')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('hub_spring_petal', mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(tray)
    bpy.context.view_layer.objects.active = obj
    bevel = obj.modifiers.new('Rounded spring edges', 'BEVEL')
    bevel.width = .004
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    normals = obj.modifiers.new('Spring face normals', 'WEIGHTED_NORMAL')
    bpy.ops.object.modifier_apply(modifier=normals.name)
    tag(obj, 'tray')
for radius in [.44, .47, 1.37, 1.4]:
    ring('disc_concentric_track', cx, cy, .087, radius+.003, radius, .0015, hub, 'disc')

# Subtle segmented interference accents, no external bitmap or font dependency.
colors = [( .41, .67, .69), (.58, .52, .7), (.75, .6, .36), (.52, .68, .53)]
for i, color in enumerate(colors):
    mat = material('CD_Spectrum_'+str(i), color, .26, .75)
    vertices, faces = [], []
    start = .28+i*math.pi/2
    for n in range(25):
        a = start+n*.64/24
        for radius in [1.43, 1.475]:
            vertices.append((cx+radius*math.cos(a), -.087, cy+radius*math.sin(a)))
    for n in range(24):
        faces.append((2*n, 2*n+2, 2*n+3, 2*n+1))
    mesh = bpy.data.meshes.new('interference_band')
    mesh.from_pydata(vertices, [], [tuple(reversed(face)) for face in faces])
    mesh.update()
    obj = bpy.data.objects.new('interference_band', mesh)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    tag(obj, 'disc')

def text(body, x, y, size):
    curve = bpy.data.curves.new(body, 'FONT')
    curve.body = body
    curve.size = size
    curve.extrude = .0003
    obj = bpy.data.objects.new(body, curve)
    scene.collection.objects.link(obj)
    obj.location = (x, -.09, y)
    obj.rotation_euler = (math.pi/2, 0, 0)
    curve.materials.append(ink)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    tag(obj, 'disc')

text('CAREER / ARCHIVE', -.67, 2.58, .14)
text('12 MONTHS  /  RESEARCH & DEVELOPMENT', -.78, .93, .072)
text('CD', 1.1, 1.69, .16)
scene['hingeX'] = -1.78
scene['hingeZ'] = .14
# One mesh per surface/physical part keeps the instanced shelf inexpensive.
collections = {}
for obj in list(scene.objects):
    if obj.type == 'MESH':
        key = (obj['cdPart'], obj.data.materials[0].name)
        collections.setdefault(key, []).append(obj)
for (part, surface), objects in collections.items():
    components = [{ 'name': obj.name, 'wall': obj.get('wallThickness', 0) } for obj in objects]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = part+'_'+surface
    obj['components'] = components
    tag(obj, part)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/cd-jewel-case.blend'))
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/assets/cd-jewel-case.glb'),
                         export_format='GLB', export_extras=True,
                         export_cameras=False, export_lights=False)
copyfile(ROOT/'public/assets/cd-jewel-case.glb', ROOT/'public/assets/cd-jewel-case-assembly.glb')
print('CD jewel case source and GLB assets created; legacy assets untouched.')
