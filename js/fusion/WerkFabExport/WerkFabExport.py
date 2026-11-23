# WerkFabExport – writes the timeline of the active Fusion design into a file WerkFab can open.
#
# Run it in Fusion: Utilities → Add-Ins → Scripts and Add-Ins (Shift+S) → WerkFabExport → Run.
# The script reads the design; it changes nothing but the position of the timeline marker (put back at
# the end) and it opens collapsed timeline groups.
#
# What it writes (JSON, all lengths in mm, angles in degrees):
#   steps[]   one entry per timeline item: sketches with their curves, extrusions, revolutions, holes,
#             fillets, chamfers and shells with their dimensions and the picked edges / faces as points.
#             Every step carries volume, number of bodies and centre of mass of the model after it, so
#             the importing program can check its own result against Fusion.
#   snapshots STEP text of the model after a step the format has no description for (or after every
#             step, if asked for) and of the finished model.
import adsk.core
import adsk.fusion
import datetime
import json
import math
import os
import tempfile
import traceback

FORMAT = 'werkfab-fusion-timeline'
VERSION = 1
CM = 10.0                                   # Fusion works in cm, the file is in mm
MAX_SNAPSHOT_BYTES = 80 * 1024 * 1024       # all STEP texts together


class Unsupported(Exception):
    pass


# ------------------------------------------------------------------ small helpers
def rnd(v, n=5):
    return round(float(v), n)


def P(p):
    return [rnd(p.x * CM), rnd(p.y * CM), rnd(p.z * CM)]


def V(v):
    return [rnd(v.x, 9), rnd(v.y, 9), rnd(v.z, 9)]


def deg(rad):
    return rnd(math.degrees(rad), 6)


def short_type(obj):
    try:
        return obj.objectType.split('::')[-1]
    except Exception:
        return ''


def is_type(obj, cls):
    try:
        return obj.objectType == cls.classType()
    except Exception:
        return False


def param(mp, scale=CM):
    # a model parameter: value and the expression typed by the user
    return rnd(mp.value * scale), str(mp.expression)


def angle_param(mp):
    return deg(mp.value), str(mp.expression)


# ------------------------------------------------------------------ curves
def raw_curve(geom):
    # one curve as raw 3D data in cm (sketch space or model space – decided later)
    ev = geom.evaluator
    if is_type(geom, adsk.core.Line3D):
        return {'t': 'line', 'pts': [geom.startPoint, geom.endPoint]}
    if is_type(geom, adsk.core.Circle3D):
        return {'t': 'circle', 'pts': [geom.center], 'r': geom.radius}
    ok, t0, t1 = ev.getParameterExtents()
    if not ok:
        raise Unsupported('curve without parameter range')
    if is_type(geom, adsk.core.Arc3D):
        _, a = ev.getPointAtParameter(t0)
        _, m = ev.getPointAtParameter((t0 + t1) / 2)
        _, b = ev.getPointAtParameter(t1)
        return {'t': 'arc', 'pts': [a, m, b]}
    if is_type(geom, adsk.core.Ellipse3D):
        return {'t': 'ellipse', 'pts': [geom.center], 'major': geom.majorAxis, 'rx': geom.majorRadius, 'ry': geom.minorRadius}
    # splines, elliptical arcs, conics: a fine polyline
    ok, pts = ev.getStrokes(t0, t1, 0.0005)
    if not ok or len(pts) < 2:
        raise Unsupported('curve cannot be sampled')
    return {'t': 'spline', 'pts': list(pts)}


def finish_curves(raws, frame_raw):
    # raw curves → sketch coordinates in mm. Sketch space has z = 0; anything else is model space and is
    # projected onto the sketch frame.
    o, x, y = frame_raw
    in_sketch = all(abs(p.z) < 1e-7 for r in raws for p in r['pts'])

    def uv(p):
        if in_sketch:
            return [rnd(p.x * CM), rnd(p.y * CM)]
        dx, dy, dz = p.x - o.x, p.y - o.y, p.z - o.z
        return [rnd((dx * x.x + dy * x.y + dz * x.z) * CM), rnd((dx * y.x + dy * y.y + dz * y.z) * CM)]

    out = []
    for r in raws:
        c = {'t': r['t']}
        if r.get('cons'):
            c['cons'] = True
        pts = [uv(p) for p in r['pts']]
        if r['t'] == 'circle':
            c['c'] = pts[0]
            c['r'] = rnd(r['r'] * CM)
        elif r['t'] == 'ellipse':
            m = r['major']
            mu, mv = (m.x, m.y) if in_sketch else (m.x * x.x + m.y * x.y + m.z * x.z, m.x * y.x + m.y * y.y + m.z * y.z)
            c['c'] = pts[0]
            c['rx'] = rnd(r['rx'] * CM)
            c['ry'] = rnd(r['ry'] * CM)
            c['rot'] = deg(math.atan2(mv, mu))
        else:
            c['pts'] = pts
        out.append(c)
    return out


def sketch_frame_raw(sk):
    try:
        o, x, y, _z = sk.transform.getAsCoordinateSystem()
        return o, x, y
    except Exception:
        return sk.origin, sk.xDirection, sk.yDirection


def frame_json(frame_raw):
    o, x, y = frame_raw
    n = x.crossProduct(y)
    return {'o': P(o), 'x': V(x), 'y': V(y), 'n': V(n)}


def describe_sketch(step, sk):
    fr = sketch_frame_raw(sk)
    raws = []
    skipped = 0
    for c in sk.sketchCurves:
        try:
            r = raw_curve(c.geometry)
            if c.isConstruction:
                r['cons'] = True
            raws.append(r)
        except Exception:
            skipped += 1
    step['kind'] = 'sketch'
    step['frame'] = frame_json(fr)
    step['curves'] = finish_curves(raws, fr)
    try:
        step['profileCount'] = sk.profiles.count
    except Exception:
        step['profileCount'] = 0
    if skipped:
        step['skippedCurves'] = skipped


# ------------------------------------------------------------------ profiles of a feature
def profiles_of(feature_profile):
    profs = []
    items = [feature_profile]
    if is_type(feature_profile, adsk.core.ObjectCollection):
        items = [feature_profile.item(i) for i in range(feature_profile.count)]
    for it in items:
        if is_type(it, adsk.fusion.Profile):
            profs.append(it)
        else:
            raise Unsupported('profile is a ' + short_type(it))
    if not profs:
        raise Unsupported('no profile')
    sk = profs[0].parentSketch
    for p in profs[1:]:
        if p.parentSketch != sk:
            raise Unsupported('profiles of several sketches')
    return profs, sk


def profile_block(step, feature_profile):
    profs, sk = profiles_of(feature_profile)
    fr = sketch_frame_raw(sk)
    out = []
    for pr in profs:
        loops = []
        for lp in pr.profileLoops:
            raws = [raw_curve(pc.geometry) for pc in lp.profileCurves]
            loops.append({'outer': bool(lp.isOuter), 'curves': finish_curves(raws, fr)})
        out.append(loops)
    step['frame'] = frame_json(fr)
    step['profiles'] = out
    try:
        step['sketch'] = sk.timelineObject.index
        step['all'] = len(profs) == sk.profiles.count
    except Exception:
        step['all'] = False
    return sk, fr


OPS = None


def op_name(operation):
    global OPS
    if OPS is None:
        F = adsk.fusion.FeatureOperations
        OPS = {F.JoinFeatureOperation: 'join', F.CutFeatureOperation: 'cut', F.IntersectFeatureOperation: 'intersect',
               F.NewBodyFeatureOperation: 'new', F.NewComponentFeatureOperation: 'new'}
    return OPS.get(operation, 'new')


def extent_json(ext):
    if is_type(ext, adsk.fusion.DistanceExtentDefinition):
        v, e = param(ext.distance)
        return {'type': 'distance', 'distance': v, 'expr': e}
    if is_type(ext, adsk.fusion.ThroughAllExtentDefinition):
        pos = True
        try:
            pos = bool(ext.isPositiveDirection)
        except Exception:
            pass
        return {'type': 'all', 'positive': pos}
    raise Unsupported('extent ' + short_type(ext))


def describe_extrude(step, f):
    profile_block(step, f.profile)
    step['kind'] = 'extrude'
    step['op'] = op_name(f.operation)
    start = f.startExtent
    if is_type(start, adsk.fusion.OffsetStartDefinition):
        step['startOffset'] = param(start.offset)[0]
    elif not is_type(start, adsk.fusion.ProfilePlaneStartDefinition):
        raise Unsupported('start ' + short_type(start))
    T = adsk.fusion.FeatureExtentTypes
    et = f.extentType
    if et == T.SymmetricFeatureExtentType:
        se = f.symmetricExtent
        v, e = param(se.distance)
        step['extent'] = 'sym'
        step['distance'] = v if se.isFullLength else 2 * v
        step['taper'] = angle_param(se.taperAngle)[0]
        if se.isFullLength:
            step['distanceExpr'] = e
    else:
        one = extent_json(f.extentOne)
        step['one'] = one
        step['taper'] = angle_param(f.taperAngleOne)[0]
        step['extent'] = 'one'
        if et == T.TwoSidesFeatureExtentType:
            step['two'] = extent_json(f.extentTwo)
            step['taper2'] = angle_param(f.taperAngleTwo)[0]
            step['extent'] = 'two'


def axis_line(axis):
    # the axis of a revolution as a point and a direction in model space
    if is_type(axis, adsk.fusion.SketchLine):
        g = axis.worldGeometry
        a, b = g.startPoint, g.endPoint
        return P(a), V(a.vectorTo(b))
    if is_type(axis, adsk.fusion.ConstructionAxis):
        g = axis.geometry
        return P(g.origin), V(g.direction)
    if is_type(axis, adsk.fusion.BRepEdge):
        g = axis.geometry
        if is_type(g, adsk.core.Line3D):
            return P(g.startPoint), V(g.startPoint.vectorTo(g.endPoint))
    raise Unsupported('axis ' + short_type(axis))


def describe_revolve(step, f):
    profile_block(step, f.profile)
    step['kind'] = 'revolve'
    step['op'] = op_name(f.operation)
    o, d = axis_line(f.axis)
    step['axis'] = {'o': o, 'd': d}
    ext = f.extentDefinition
    if not is_type(ext, adsk.fusion.AngleExtentDefinition):
        raise Unsupported('extent ' + short_type(ext))
    a, e = angle_param(ext.angle)
    step['angle'] = a
    step['symmetric'] = bool(ext.isSymmetric)
    if step['symmetric'] and abs(abs(a) - 360) > 1e-6:
        raise Unsupported('symmetric angle')


def describe_hole(step, f):
    step['kind'] = 'hole'
    step['dia'], step['diaExpr'] = param(f.holeDiameter)
    pts = []
    try:
        pd = f.holePositionDefinition
        sps = pd.sketchPoints
        pts = [P(sps.item(i).worldGeometry) for i in range(sps.count)]
    except Exception:
        pts = []
    if not pts:
        pts = [P(f.position)]
    step['points'] = pts
    step['dir'] = V(f.direction)
    ext = f.extentDefinition
    if is_type(ext, adsk.fusion.DistanceExtentDefinition):
        step['depth'] = abs(param(ext.distance)[0])
        step['through'] = False
    elif is_type(ext, adsk.fusion.ThroughAllExtentDefinition):
        step['through'] = True
    else:
        raise Unsupported('extent ' + short_type(ext))
    H = adsk.fusion.HoleTypes
    ht = f.holeType
    if ht == H.CounterboreHoleType:
        step['type'] = 'cbore'
        step['cbDia'] = param(f.counterboreDiameter)[0]
        step['cbDepth'] = param(f.counterboreDepth)[0]
    elif ht == H.CountersinkHoleType:
        step['type'] = 'csink'
        step['csDia'] = param(f.countersinkDiameter)[0]
        step['csAngle'] = angle_param(f.countersinkAngle)[0]
    else:
        step['type'] = 'simple'
    try:
        step['tipAngle'] = angle_param(f.tipAngle)[0]
    except Exception:
        step['tipAngle'] = 118


def edge_mid(e):
    ev = e.evaluator
    _, t0, t1 = ev.getParameterExtents()
    _, p = ev.getPointAtParameter((t0 + t1) / 2)
    return P(p)


def edge_points(coll):
    pts = []
    for i in range(coll.count):
        e = coll.item(i)
        if is_type(e, adsk.fusion.BRepEdge):
            pts.append(edge_mid(e))
        elif is_type(e, adsk.fusion.BRepFace):
            for ed in e.edges:
                pts.append(edge_mid(ed))
        else:
            raise Unsupported('edge set with a ' + short_type(e))
    if not pts:
        raise Unsupported('no edges')
    return pts


def describe_fillet(step, f):
    sets = []
    for es in f.edgeSets:
        if not is_type(es, adsk.fusion.ConstantRadiusFilletEdgeSet):
            raise Unsupported(short_type(es))
        r, e = param(es.radius)
        sets.append({'radius': r, 'expr': e, 'edges': edge_points(es.edges)})
    if not sets:
        raise Unsupported('no edge sets')
    step['kind'] = 'fillet'
    step['sets'] = sets


def describe_chamfer(step, f):
    sets = []
    try:
        edge_sets = list(f.edgeSets)
    except Exception:
        edge_sets = None
    if edge_sets is not None:
        for es in edge_sets:
            t = short_type(es)
            if t == 'EqualDistanceChamferEdgeSet':
                d, e = param(es.distance)
                sets.append({'distance': d, 'expr': e, 'edges': edge_points(es.edges)})
            elif t == 'TwoDistancesChamferEdgeSet':
                d1 = param(es.distanceOne)[0]
                d2 = param(es.distanceTwo)[0]
                if abs(d1 - d2) > 1e-6:
                    raise Unsupported('two distances')
                sets.append({'distance': d1, 'edges': edge_points(es.edges)})
            else:
                raise Unsupported(t)
    else:
        d = f.chamferTypeDefinition
        if short_type(d) != 'EqualDistanceChamferTypeDefinition':
            raise Unsupported(short_type(d))
        v, e = param(d.distance)
        sets.append({'distance': v, 'expr': e, 'edges': edge_points(f.edges)})
    if not sets:
        raise Unsupported('no edge sets')
    step['kind'] = 'chamfer'
    step['sets'] = sets


def describe_shell(step, f):
    faces = []
    ents = f.inputEntities
    for i in range(ents.count):
        e = ents.item(i)
        if is_type(e, adsk.fusion.BRepFace):
            faces.append(P(e.pointOnFace))
        else:
            raise Unsupported('shell of a ' + short_type(e))
    if not faces:
        raise Unsupported('no open face')
    inside = f.insideThickness
    outside = f.outsideThickness
    if outside is not None and abs(outside.value) > 1e-9:
        raise Unsupported('outside thickness')
    if inside is None:
        raise Unsupported('no thickness')
    step['thickness'], step['thicknessExpr'] = param(inside)
    step['faces'] = faces
    step['kind'] = 'shell'


DESCRIBERS = None


def describers():
    global DESCRIBERS
    if DESCRIBERS is None:
        DESCRIBERS = {
            adsk.fusion.ExtrudeFeature.classType(): describe_extrude,
            adsk.fusion.RevolveFeature.classType(): describe_revolve,
            adsk.fusion.HoleFeature.classType(): describe_hole,
            adsk.fusion.FilletFeature.classType(): describe_fillet,
            adsk.fusion.ChamferFeature.classType(): describe_chamfer,
            adsk.fusion.ShellFeature.classType(): describe_shell,
        }
    return DESCRIBERS


# ------------------------------------------------------------------ the state of the model
def solid_bodies(root):
    bodies = [b for b in root.bRepBodies]
    try:
        for occ in root.allOccurrences:
            bodies.extend([b for b in occ.bRepBodies])
    except Exception:
        pass
    return [b for b in bodies if b.isSolid]


def measure(root):
    vol = 0.0
    cx = cy = cz = 0.0
    n = 0
    for b in solid_bodies(root):
        try:
            pp = b.physicalProperties
            v = pp.volume
            c = pp.centerOfMass
        except Exception:
            continue
        vol += v
        cx += c.x * v
        cy += c.y * v
        cz += c.z * v
        n += 1
    out = {'volume': rnd(vol * CM ** 3, 3), 'bodies': n}
    if vol > 1e-12:
        out['centroid'] = [rnd(cx / vol * CM, 4), rnd(cy / vol * CM, 4), rnd(cz / vol * CM, 4)]
    return out


def step_text(design, root):
    path = os.path.join(tempfile.gettempdir(), 'werkfab_fusion_snapshot.step')
    em = design.exportManager
    em.execute(em.createSTEPExportOptions(path, root))
    with open(path, 'r', encoding='utf-8', errors='replace') as fh:
        text = fh.read()
    try:
        os.remove(path)
    except Exception:
        pass
    return text


def in_place(design, ent):
    # features of a component that sits somewhere else in the assembly are not in model coordinates
    root = design.rootComponent
    try:
        comp = ent.parentComponent
    except Exception:
        return True
    if comp == root:
        return True
    occs = root.allOccurrencesByComponent(comp)
    if occs.count != 1:
        return False
    return occs.item(0).transform.isEqualTo(adsk.core.Matrix3D.create())


def user_parameters(design):
    out = []
    lengths = {'mm': 1.0, 'cm': 1.0, 'm': 1.0, 'in': 1.0, 'ft': 1.0}
    for p in design.userParameters:
        try:
            unit = str(p.unit or '')
            item = {'name': str(p.name), 'expr': str(p.expression), 'unit': unit}
            if unit in lengths:
                item['value'] = rnd(p.value * CM)
            elif unit in ('deg', 'rad'):
                item['value'] = deg(p.value)
            elif unit == '':
                item['value'] = rnd(p.value, 8)
            if p.comment:
                item['comment'] = str(p.comment)
            out.append(item)
        except Exception:
            pass
    return out


def expand_groups(tl):
    for _ in range(200):
        again = False
        for i in range(tl.count):
            obj = tl.item(i)
            try:
                if obj.isGroup:
                    g = adsk.fusion.TimelineGroup.cast(obj)
                    if g and g.isCollapsed:
                        g.isCollapsed = False
                        again = True
                        break
            except Exception:
                pass
        if not again:
            return


def export_design(app, design, all_snapshots, progress):
    root = design.rootComponent
    doc = {
        'format': FORMAT, 'version': VERSION, 'units': 'mm',
        'name': str(app.activeDocument.name),
        'exported': datetime.datetime.now().isoformat(timespec='seconds'),
        'fusion': str(app.version),
        'parametric': design.designType == adsk.fusion.DesignTypes.ParametricDesignType,
        'params': user_parameters(design), 'steps': [], 'snapshots': {},
    }
    snap_bytes = 0

    def add_snapshot(key):
        nonlocal snap_bytes
        if snap_bytes > MAX_SNAPSHOT_BYTES:
            return None
        try:
            text = step_text(design, root)
        except Exception:
            return None
        snap_bytes += len(text)
        doc['snapshots'][key] = text
        return key

    if doc['parametric']:
        tl = design.timeline
        expand_groups(tl)
        start_marker = tl.markerPosition
        n = tl.count
        prev = {'volume': 0.0, 'bodies': 0}
        try:
            for i in range(n):
                if progress:
                    progress.progressValue = i
                    progress.message = 'Step %d of %d' % (i + 1, n)
                    adsk.doEvents()
                    if progress.wasCancelled:
                        raise KeyboardInterrupt()
                obj = tl.item(i)
                step = {'index': i, 'name': str(obj.name), 'kind': 'other'}
                try:
                    if obj.isGroup:
                        step['kind'] = 'group'
                        doc['steps'].append(step)
                        continue
                except Exception:
                    pass
                try:
                    if obj.isSuppressed:
                        step['suppressed'] = True
                except Exception:
                    pass
                ent = None
                try:
                    ent = obj.entity
                except Exception:
                    ent = None
                step['type'] = short_type(ent) if ent else ''
                is_sketch = ent is not None and is_type(ent, adsk.fusion.Sketch)
                fn = describers().get(ent.objectType) if ent is not None and not is_sketch else None
                if ent is not None and not step.get('suppressed') and (is_sketch or fn):
                    if not in_place(design, ent):
                        step['why'] = 'component is moved or used several times'
                    elif is_sketch:
                        try:
                            tl.markerPosition = i + 1
                            describe_sketch(step, ent)
                        except Exception as err:
                            step['kind'] = 'other'
                            step['why'] = str(err) or traceback.format_exc(limit=1)
                    else:
                        # the picked edges and faces only exist before the feature: read it there first
                        done = False
                        why = ''
                        for pos in (i, i + 1):
                            trial = dict(step)
                            try:
                                tl.markerPosition = pos
                                fn(trial, ent)
                                step = trial
                                done = True
                                break
                            except Unsupported as err:
                                why = str(err)
                                break
                            except Exception as err:
                                why = str(err) or traceback.format_exc(limit=1)
                        if not done:
                            step['kind'] = 'other'
                            step['why'] = why
                tl.markerPosition = i + 1
                if not step.get('suppressed'):
                    try:
                        step.update(measure(root))
                    except Exception:
                        pass
                    changed = abs(step.get('volume', 0) - prev['volume']) > max(1e-3, 1e-6 * prev['volume']) or step.get('bodies', 0) != prev['bodies']
                    if (step['kind'] == 'other' and changed) or (all_snapshots and changed):
                        key = add_snapshot('s%d' % i)
                        if key:
                            step['snapshot'] = key
                    if 'volume' in step:
                        prev = {'volume': step['volume'], 'bodies': step['bodies']}
                doc['steps'].append(step)
        finally:
            try:
                tl.moveToEnd()
            except Exception:
                pass
            doc['final'] = measure(root)
            key = add_snapshot('final')
            if key:
                doc['final']['snapshot'] = key
            try:
                tl.markerPosition = start_marker
            except Exception:
                pass
    else:
        doc['final'] = measure(root)
        key = add_snapshot('final')
        if key:
            doc['final']['snapshot'] = key
    return doc


def run(context):
    ui = None
    progress = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        if not design:
            try:
                design = adsk.fusion.Design.cast(app.activeDocument.products.itemByProductType('DesignProductType'))
            except Exception:
                design = None
        if not design:
            ui.messageBox('Open a design first.', 'WerkFab export')
            return
        dlg = ui.createFileDialog()
        dlg.title = 'WerkFab export: save the timeline'
        dlg.filter = 'WerkFab timeline of a Fusion design (*.fusion.json)'
        name = ''.join(ch if ch not in '\\/:*?"<>|' else '_' for ch in str(app.activeDocument.name))
        dlg.initialFilename = name + '.fusion.json'
        if dlg.showSave() != adsk.core.DialogResults.DialogOK:
            return
        path = dlg.filename
        if not path.lower().endswith('.json'):
            path += '.fusion.json'
        all_snapshots = False
        if design.designType == adsk.fusion.DesignTypes.ParametricDesignType:
            res = ui.messageBox(
                'Also store the model after EVERY timeline step as STEP?\n\n'
                'Yes: safest – WerkFab can fall back to the exact Fusion shape at any step. Bigger file, takes longer.\n'
                'No: only where a feature cannot be described, and the finished model (recommended).',
                'WerkFab export', adsk.core.MessageBoxButtonTypes.YesNoCancelButtonType, adsk.core.MessageBoxIconTypes.QuestionIconType)
            if res == adsk.core.DialogResults.DialogCancel:
                return
            all_snapshots = res == adsk.core.DialogResults.DialogYes
            progress = ui.createProgressDialog()
            progress.cancelButtonText = 'Cancel'
            progress.isCancelButtonShown = True
            progress.show('WerkFab export', 'Reading the timeline …', 0, max(1, design.timeline.count), 1)
        doc = export_design(app, design, all_snapshots, progress)
        if progress:
            progress.hide()
            progress = None
            adsk.doEvents()  # otherwise the progress window can stay in front of the message below
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
        steps = doc['steps']
        described = len([s for s in steps if s['kind'] not in ('other', 'group')])
        snaps = len([s for s in steps if s.get('snapshot')])
        ui.messageBox(
            'Saved:\n%s\n\n%d timeline steps, %d described as features, %d as STEP state.\n\nOpen the file in WerkFab: Insert → Fusion timeline.'
            % (path, len(steps), described, snaps), 'WerkFab export')
    except KeyboardInterrupt:
        if progress:
            progress.hide()
    except Exception:
        if progress:
            try:
                progress.hide()
            except Exception:
                pass
        if ui:
            ui.messageBox('WerkFab export failed:\n' + traceback.format_exc(), 'WerkFab export')
