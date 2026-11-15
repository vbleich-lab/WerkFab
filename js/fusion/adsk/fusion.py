# adsk.fusion – design, components, sketches, features and bodies, mapped onto WerkFab features.
# Coordinates and lengths are centimetres here (as in the original interface); WerkFab gets millimetres.
import math

from . import core
from .core import (Base, _List, _call, ObjectCollection, Point3D, Vector3D, Line3D, Circle3D, Plane, Cylinder,
                   Surface, BoundingBox3D, Matrix3D, ValueInput, Event, _convert_expr, _eval_app, _units_kind,
                   _to_internal, _to_app, _LEN_MM)

MM = 10.0  # mm per cm


def _mm(v):
    return v * MM


def _cm(v):
    return v / MM


def _vec(a):
    return [float(a[0]), float(a[1]), float(a[2])]


def _sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _add(a, b):
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def _mul(a, s):
    return [a[0] * s, a[1] * s, a[2] * s]


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def _norm(a):
    n = math.sqrt(_dot(a, a))
    return [a[0] / n, a[1] / n, a[2] / n] if n > 1e-15 else [0.0, 0.0, 1.0]


def _rot(v, axis, ang):
    k = _norm(axis)
    c, s = math.cos(ang), math.sin(ang)
    return _add(_add(_mul(v, c), _mul(_cross(k, v), s)), _mul(k, _dot(k, v) * (1 - c)))


def _r(v):
    return round(v, 6) + 0.0


def _p3(a_mm):
    return Point3D(_cm(a_mm[0]), _cm(a_mm[1]), _cm(a_mm[2]))


def _pt_mm(p):
    """A point given to the interface (Point3D, sketch point, vertex, construction point) → [x, y, z] in mm."""
    if isinstance(p, Point3D):
        return [_mm(p.x), _mm(p.y), _mm(p.z)]
    g = getattr(p, 'worldGeometry', None) or getattr(p, 'geometry', None)
    if isinstance(g, Point3D):
        return [_mm(g.x), _mm(g.y), _mm(g.z)]
    raise RuntimeError('Ein Punkt wird erwartet')


def _app(v, kind='length'):
    if isinstance(v, ValueInput):
        return v._app(kind)
    if isinstance(v, (int, float)):
        return round(_to_app(float(v), kind), 9)
    raise RuntimeError('Ein Wert (ValueInput) wird erwartet')


def _num(v, kind='length'):
    a = _app(v, kind)
    return _eval_app(a[1:]) if isinstance(a, str) else float(a)


def _items(x):
    if x is None:
        return []
    if isinstance(x, (list, tuple)):
        return list(x)
    if isinstance(x, _List):
        return list(x)
    return [x]


# ---------------------------------------------------------------- enums
class FeatureOperations(object):
    JoinFeatureOperation = 0
    CutFeatureOperation = 1
    IntersectFeatureOperation = 2
    NewBodyFeatureOperation = 3
    NewComponentFeatureOperation = 4


_OPS = {0: 'join', 1: 'cut', 2: 'intersect', 3: 'new', 4: 'new'}


class ExtentDirections(object):
    PositiveExtentDirection = 0
    NegativeExtentDirection = 1
    SymmetricExtentDirection = 2


class PatternDistanceType(object):
    ExtentPatternDistanceType = 0
    SpacingPatternDistanceType = 1


class PatternComputeOptions(object):
    OptimizedPatternCompute = 0
    IdenticalPatternCompute = 1
    AdjustPatternCompute = 2


class DesignTypes(object):
    DirectDesignType = 0
    ParametricDesignType = 1


class MeshRefinementSettings(object):
    MeshRefinementHigh = 0
    MeshRefinementMedium = 1
    MeshRefinementLow = 2
    MeshRefinementCustom = 3


class ChamferTypes(object):
    EqualDistanceType = 0
    TwoDistancesType = 1
    DistanceAndAngleType = 2


class HoleEdgePositions(object):
    EdgeStartPointPosition = 0
    EdgeMidPointPosition = 1
    EdgeEndPointPosition = 2


class FeatureHealthStates(object):
    HealthyFeatureHealthState = 0
    WarningFeatureHealthState = 1
    ErrorFeatureHealthState = 2
    SuppressedFeatureHealthState = 3
    UnknownFeatureHealthState = 4


class SurfaceTypes(object):
    PlaneSurfaceType = 0
    CylinderSurfaceType = 1
    ConeSurfaceType = 2
    SphereSurfaceType = 3
    TorusSurfaceType = 4
    EllipticalCylinderSurfaceType = 5
    EllipticalConeSurfaceType = 6
    NurbsSurfaceType = 7


class Curve3DTypes(object):
    Line3DCurveType = 0
    Arc3DCurveType = 1
    Circle3DCurveType = 2
    Ellipse3DCurveType = 3
    EllipticalArc3DCurveType = 4
    InfiniteLine3DCurveType = 5
    NurbsCurve3DCurveType = 6


# ---------------------------------------------------------------- reference geometry
class ConstructionPlane(Base):
    def __init__(self, name, o, x, n, comp=None):
        self.name = name
        self._o, self._x, self._n = _vec(o), _norm(x), _norm(n)
        self.isVisible = True
        self._comp = comp

    @property
    def geometry(self):
        return Plane(_p3(self._o), Vector3D(*self._n), Vector3D(*self._x))

    @property
    def component(self):
        return self._comp

    def deleteMe(self):
        return True

    def _plane(self):
        return {'o': [_r(v) for v in self._o], 'x': [_r(v) for v in self._x], 'n': [_r(v) for v in self._n]}


class ConstructionAxis(Base):
    def __init__(self, name, o, d):
        self.name = name
        self._o, self._d = _vec(o), _norm(d)
        self.isVisible = True

    @property
    def geometry(self):
        return core.Line3D(_p3(self._o), _p3(_add(self._o, self._d)))

    def _axis(self):
        return self._o, self._d


class ConstructionPoint(Base):
    def __init__(self, name, p):
        self.name = name
        self._p = _vec(p)

    @property
    def geometry(self):
        return _p3(self._p)


def _plane_of(entity):
    """origin, x direction and normal (mm) of a plane-like entity."""
    if isinstance(entity, ConstructionPlane):
        return entity._o, entity._x, entity._n
    if isinstance(entity, BRepFace):
        if entity._info.get('type') != 'plane':
            raise RuntimeError('Die Fläche ist nicht eben')
        pl = _call('facePlane', point=entity._info['point'], normal=entity._info['normal'])
        return pl['o'], pl['x'], pl['n']
    if isinstance(entity, Sketch):
        b = entity._basis
        return b['o'], b['x'], b['n']
    if isinstance(entity, Plane):
        o = [_mm(entity.origin.x), _mm(entity.origin.y), _mm(entity.origin.z)]
        n = _norm([entity.normal.x, entity.normal.y, entity.normal.z])
        u = entity.uDirection
        x = _norm([u.x, u.y, u.z]) if u is not None else (_norm(_cross([0, 0, 1], n)) if abs(n[2]) < 0.9 else [1.0, 0.0, 0.0])
        return o, x, n
    raise RuntimeError('Eine Ebene (Konstruktionsebene oder ebene Fläche) wird erwartet')


def _axis_of(entity):
    """point and direction (mm) of a linear entity."""
    if isinstance(entity, ConstructionAxis):
        return entity._axis()
    if isinstance(entity, SketchLine):
        a, b = entity._world()
        return a, _norm(_sub(b, a))
    if isinstance(entity, BRepEdge):
        if entity._info.get('type') == 'line':
            a, b = entity._info['start'], entity._info['end']
            return a, _norm(_sub(b, a))
        if entity._info.get('type') == 'circle':
            return entity._info['center'], entity._info['axis']
        raise RuntimeError('Die Kante ist weder gerade noch kreisförmig')
    if isinstance(entity, BRepFace) and entity._info.get('type') == 'cylinder':
        return entity._info['center'], entity._info['axis']
    raise RuntimeError('Eine Achse (Konstruktionsachse, Skizzenlinie, gerade Kante) wird erwartet')


_MAIN = {'x': [1.0, 0.0, 0.0], 'y': [0.0, 1.0, 0.0], 'z': [0.0, 0.0, 1.0]}


def _main_axis(d):
    for k, v in _MAIN.items():
        c = _dot(v, d)
        if abs(abs(c) - 1) < 1e-6:
            return k, (1 if c > 0 else -1)
    raise RuntimeError('Die Richtung muss parallel zur X-, Y- oder Z-Achse liegen')


class ConstructionPlaneInput(Base):
    def __init__(self, comp):
        self._comp = comp
        self._def = None

    def setByOffset(self, planarEntity, offset):
        o, x, n = _plane_of(planarEntity)
        d = _num(offset)
        self._def = (_add(o, _mul(n, d)), x, n)
        return True

    def setByAngle(self, linearEntity, angle, planarEntity):
        o, x, n = _plane_of(planarEntity)
        p, d = _axis_of(linearEntity)
        a = _num(angle, 'angle') * math.pi / 180
        self._def = (p, _rot(x, d, a), _rot(n, d, a))
        return True

    def setByPlane(self, plane):
        self._def = _plane_of(plane)
        return True

    def setByThreePoints(self, a, b, c):
        pa, pb, pc = _pt_mm(a), _pt_mm(b), _pt_mm(c)
        n = _norm(_cross(_sub(pb, pa), _sub(pc, pa)))
        self._def = (pa, _norm(_sub(pb, pa)), n)
        return True

    def setByTwoPlanes(self, p1, p2):
        o1, x1, n1 = _plane_of(p1)
        o2, _, _ = _plane_of(p2)
        self._def = (_mul(_add(o1, o2), 0.5), x1, n1)
        return True

    def setByDistanceOnPath(self, *a):
        raise RuntimeError('Ebene entlang eines Pfades wird hier nicht unterstützt')


class ConstructionPlanes(_List):
    def __init__(self, comp):
        _List.__init__(self)
        self._comp = comp

    def createInput(self, occurrenceForCreation=None):
        return ConstructionPlaneInput(self._comp)

    def add(self, input):
        if input._def is None:
            raise RuntimeError('Die Konstruktionsebene ist nicht festgelegt')
        o, x, n = input._def
        p = ConstructionPlane('Plane%d' % (len(self._items) + 1), o, x, n, self._comp)
        self._items.append(p)
        return p


class ConstructionAxisInput(Base):
    def __init__(self):
        self._def = None

    def setByTwoPoints(self, a, b):
        pa, pb = _pt_mm(a), _pt_mm(b)
        self._def = (pa, _sub(pb, pa))
        return True

    def setByLine(self, line):
        self._def = _axis_of(line)
        return True

    def setByCircularFace(self, face):
        self._def = _axis_of(face)
        return True


class ConstructionAxes(_List):
    def createInput(self, occurrenceForCreation=None):
        return ConstructionAxisInput()

    def add(self, input):
        a = ConstructionAxis('Axis%d' % (len(self._items) + 1), input._def[0], input._def[1])
        self._items.append(a)
        return a


class ConstructionPointInput(Base):
    def __init__(self):
        self._p = None

    def setByPoint(self, p):
        self._p = _pt_mm(p)
        return True


class ConstructionPoints(_List):
    def createInput(self, occurrenceForCreation=None):
        return ConstructionPointInput()

    def add(self, input):
        p = ConstructionPoint('Point%d' % (len(self._items) + 1), input._p)
        self._items.append(p)
        return p


# ---------------------------------------------------------------- sketches
_open_sketches = []


def _flush_all():
    for s in _open_sketches:
        s._flush()


core._flushers.append(_flush_all)


class SketchPoint(Base):
    def __init__(self, sketch, u, v, circle=None):
        self._sk = sketch
        self._u, self._v = float(u), float(v)
        self._circle = circle
        self._ent = None
        self.isFixed = False
        self.isReference = False

    @property
    def geometry(self):
        return Point3D(_cm(self._u), _cm(self._v), 0)

    @property
    def worldGeometry(self):
        return _p3(self._sk._world(self._u, self._v))

    @property
    def parentSketch(self):
        return self._sk

    def move(self, v):
        raise RuntimeError('Skizzenpunkte lassen sich hier nicht verschieben')

    def deleteMe(self):
        if self._ent is not None:
            self._sk._remove(self._ent)
        return True

    def _hole_id(self):
        """id of a circle whose centre marks this point (holes are placed at circle centres)."""
        if self._circle is not None:
            return self._circle['id']
        if self._ent is None:
            self._ent = self._sk._add({'type': 'circle', 'cx': _r(self._u), 'cy': _r(self._v), 'r': 0.5, 'cons': True})
        return self._ent['id']


def _sp(sketch, p):
    """sketch coordinates (mm) of a point given in sketch space (Point3D) or as a sketch point."""
    if isinstance(p, SketchPoint):
        if p._sk is not sketch:
            w = p._sk._world(p._u, p._v)
            return sketch._local(w)
        return p._u, p._v
    if isinstance(p, Point3D):
        return _mm(p.x), _mm(p.y)
    if isinstance(p, core.Point2D):
        return _mm(p.x), _mm(p.y)
    raise RuntimeError('Ein Punkt (Point3D oder Skizzenpunkt) wird erwartet')


class SketchEntity(Base):
    def __init__(self, sketch, ent):
        self._sk = sketch
        self._e = ent

    @property
    def parentSketch(self):
        return self._sk

    @property
    def isConstruction(self):
        return bool(self._e.get('cons'))

    @isConstruction.setter
    def isConstruction(self, v):
        if v:
            self._e['cons'] = True
        else:
            self._e.pop('cons', None)
        self._sk._dirty = True

    @property
    def isFixed(self):
        return False

    @isFixed.setter
    def isFixed(self, v):
        pass

    @property
    def isReference(self):
        return False

    def deleteMe(self):
        return self._sk._remove(self._e)


class SketchLine(SketchEntity):
    def __init__(self, sketch, ent, a=None, b=None):
        SketchEntity.__init__(self, sketch, ent)
        pts = ent['pts'] if ent['type'] == 'poly' else None
        a = a if a is not None else pts[0]
        b = b if b is not None else pts[1]
        self._a, self._b = (float(a[0]), float(a[1])), (float(b[0]), float(b[1]))
        self.startSketchPoint = SketchPoint(sketch, *self._a)
        self.endSketchPoint = SketchPoint(sketch, *self._b)

    @property
    def length(self):
        return _cm(math.hypot(self._b[0] - self._a[0], self._b[1] - self._a[1]))

    @property
    def geometry(self):
        return Line3D(Point3D(_cm(self._a[0]), _cm(self._a[1]), 0), Point3D(_cm(self._b[0]), _cm(self._b[1]), 0))

    @property
    def worldGeometry(self):
        a, b = self._world()
        return Line3D(_p3(a), _p3(b))

    def _world(self):
        return self._sk._world(*self._a), self._sk._world(*self._b)


class SketchCircle(SketchEntity):
    def __init__(self, sketch, ent):
        SketchEntity.__init__(self, sketch, ent)
        self.centerSketchPoint = SketchPoint(sketch, ent['cx'], ent['cy'], circle=ent)

    @property
    def radius(self):
        return _cm(self._e['r'])

    @radius.setter
    def radius(self, v):
        self._e['r'] = _r(_mm(v))
        self._sk._dirty = True

    @property
    def area(self):
        return math.pi * self.radius ** 2

    @property
    def length(self):
        return 2 * math.pi * self.radius

    @property
    def geometry(self):
        return Circle3D(self.centerSketchPoint.geometry, Vector3D(0, 0, 1), self.radius)


class SketchArc(SketchEntity):
    def __init__(self, sketch, ent, center, r):
        SketchEntity.__init__(self, sketch, ent)
        self.startSketchPoint = SketchPoint(sketch, *ent['pts'][0])
        self.endSketchPoint = SketchPoint(sketch, *ent['pts'][2])
        self.centerSketchPoint = SketchPoint(sketch, *center)
        self._rad = r

    @property
    def radius(self):
        return _cm(self._rad)


class SketchSpline(SketchEntity):
    pass


class SketchEllipse(SketchEntity):
    pass


class SketchLineList(_List):
    pass


def _circle3(a, b, c):
    ax, ay = a
    bx, by = b
    cx, cy = c
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(d) < 1e-12:
        raise RuntimeError('Die drei Punkte liegen auf einer Geraden')
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    return (ux, uy), math.hypot(ax - ux, ay - uy)


class SketchLines(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch

    def _all(self):
        return [x for x in self._sk._objs if isinstance(x, SketchLine)]

    def addByTwoPoints(self, startPoint, endPoint):
        a, b = _sp(self._sk, startPoint), _sp(self._sk, endPoint)
        e = self._sk._add({'type': 'poly', 'closed': False, 'pts': [[_r(a[0]), _r(a[1])], [_r(b[0]), _r(b[1])]]})
        ln = SketchLine(self._sk, e)
        if isinstance(startPoint, SketchPoint):
            ln.startSketchPoint = startPoint
        if isinstance(endPoint, SketchPoint):
            ln.endSketchPoint = endPoint
        self._sk._objs.append(ln)
        return ln

    def _rect_lines(self, e, corners):
        out = SketchLineList()
        for i in range(4):
            ln = SketchLine(self._sk, e, corners[i], corners[(i + 1) % 4])
            self._sk._objs.append(ln)
            out._items.append(ln)
        return out

    def addTwoPointRectangle(self, pointOne, pointTwo):
        a, b = _sp(self._sk, pointOne), _sp(self._sk, pointTwo)
        x0, y0, x1, y1 = min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])
        if x1 - x0 < 1e-9 or y1 - y0 < 1e-9:
            raise RuntimeError('Das Rechteck hat keine Fläche')
        e = self._sk._add({'type': 'rect', 'x': _r(x0), 'y': _r(y0), 'w': _r(x1 - x0), 'h': _r(y1 - y0)})
        return self._rect_lines(e, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

    def addCenterPointRectangle(self, centerPoint, cornerPoint):
        c, k = _sp(self._sk, centerPoint), _sp(self._sk, cornerPoint)
        dx, dy = abs(k[0] - c[0]), abs(k[1] - c[1])
        return self.addTwoPointRectangle(Point3D(_cm(c[0] - dx), _cm(c[1] - dy), 0), Point3D(_cm(c[0] + dx), _cm(c[1] + dy), 0))

    def addThreePointRectangle(self, pointOne, pointTwo, pointThree):
        a, b, c = _sp(self._sk, pointOne), _sp(self._sk, pointTwo), _sp(self._sk, pointThree)
        ux, uy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(ux, uy)
        if L < 1e-9:
            raise RuntimeError('Das Rechteck hat keine Fläche')
        nx, ny = -uy / L, ux / L
        h = (c[0] - b[0]) * nx + (c[1] - b[1]) * ny
        pts = [a, b, (b[0] + nx * h, b[1] + ny * h), (a[0] + nx * h, a[1] + ny * h)]
        e = self._sk._add({'type': 'poly', 'closed': True, 'pts': [[_r(p[0]), _r(p[1])] for p in pts]})
        return self._rect_lines(e, pts)

    def addEdgePolygon(self, *a):
        raise RuntimeError('addEdgePolygon wird hier nicht unterstützt')

    def addScribedPolygon(self, centerPoint, edgeCount, angle, radius, isInscribed=True):
        c = _sp(self._sk, centerPoint)
        n = int(edgeCount)
        r = _mm(radius)
        if not isInscribed:
            r = r / math.cos(math.pi / n)
        pts = [(c[0] + r * math.cos(angle + 2 * math.pi * k / n), c[1] + r * math.sin(angle + 2 * math.pi * k / n)) for k in range(n)]
        e = self._sk._add({'type': 'poly', 'closed': True, 'pts': [[_r(p[0]), _r(p[1])] for p in pts]})
        out = SketchLineList()
        for i in range(n):
            ln = SketchLine(self._sk, e, pts[i], pts[(i + 1) % n])
            self._sk._objs.append(ln)
            out._items.append(ln)
        return out


class SketchCircles(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch

    def _all(self):
        return [x for x in self._sk._objs if isinstance(x, SketchCircle)]

    def addByCenterRadius(self, centerPoint, radius):
        c = _sp(self._sk, centerPoint)
        r = _mm(radius)
        if r <= 0:
            raise RuntimeError('Der Radius muss größer 0 sein')
        e = self._sk._add({'type': 'circle', 'cx': _r(c[0]), 'cy': _r(c[1]), 'r': _r(r)})
        o = SketchCircle(self._sk, e)
        self._sk._objs.append(o)
        return o

    def addByTwoPoints(self, pointOne, pointTwo):
        a, b = _sp(self._sk, pointOne), _sp(self._sk, pointTwo)
        c = Point3D(_cm((a[0] + b[0]) / 2), _cm((a[1] + b[1]) / 2), 0)
        return self.addByCenterRadius(c, _cm(math.hypot(b[0] - a[0], b[1] - a[1]) / 2))

    def addByThreePoints(self, pointOne, pointTwo, pointThree):
        (cx, cy), r = _circle3(_sp(self._sk, pointOne), _sp(self._sk, pointTwo), _sp(self._sk, pointThree))
        return self.addByCenterRadius(Point3D(_cm(cx), _cm(cy), 0), _cm(r))


class SketchArcs(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch

    def _all(self):
        return [x for x in self._sk._objs if isinstance(x, SketchArc)]

    def _arc(self, a, m, b):
        c, r = _circle3(a, m, b)
        e = self._sk._add({'type': 'poly', 'curve': 'arc', 'closed': False, 'pts': [[_r(a[0]), _r(a[1])], [_r(m[0]), _r(m[1])], [_r(b[0]), _r(b[1])]]})
        o = SketchArc(self._sk, e, c, r)
        self._sk._objs.append(o)
        return o

    def addByThreePoints(self, startPoint, point, endPoint):
        return self._arc(_sp(self._sk, startPoint), _sp(self._sk, point), _sp(self._sk, endPoint))

    def addByCenterStartSweep(self, centerPoint, startPoint, sweepAngle):
        c, s = _sp(self._sk, centerPoint), _sp(self._sk, startPoint)
        r = math.hypot(s[0] - c[0], s[1] - c[1])
        a0 = math.atan2(s[1] - c[1], s[0] - c[0])
        if abs(sweepAngle) >= 2 * math.pi - 1e-9:
            return self._sk.sketchCurves.sketchCircles.addByCenterRadius(Point3D(_cm(c[0]), _cm(c[1]), 0), _cm(r))
        am, a1 = a0 + sweepAngle / 2, a0 + sweepAngle
        return self._arc(s, (c[0] + r * math.cos(am), c[1] + r * math.sin(am)), (c[0] + r * math.cos(a1), c[1] + r * math.sin(a1)))

    def addByCenterStartEnd(self, centerPoint, startPoint, endPoint, normal=None):
        c, s, e = _sp(self._sk, centerPoint), _sp(self._sk, startPoint), _sp(self._sk, endPoint)
        a0 = math.atan2(s[1] - c[1], s[0] - c[0])
        a1 = math.atan2(e[1] - c[1], e[0] - c[0])
        sweep = (a1 - a0) % (2 * math.pi)
        return self.addByCenterStartSweep(centerPoint, startPoint, sweep or 2 * math.pi)

    def addFillet(self, *a):
        raise RuntimeError('addFillet wird hier nicht unterstützt – den Bogen mit addByThreePoints zeichnen')


class SketchFittedSplines(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch

    def add(self, fitPoints):
        pts = [_sp(self._sk, p) for p in _items(fitPoints)]
        if len(pts) < 2:
            raise RuntimeError('Ein Spline braucht mindestens zwei Punkte')
        closed = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1e-6
        if closed:
            pts = pts[:-1]
        e = self._sk._add({'type': 'poly', 'curve': 'spline', 'closed': closed, 'pts': [[_r(p[0]), _r(p[1])] for p in pts]})
        o = SketchSpline(self._sk, e)
        self._sk._objs.append(o)
        return o


class SketchEllipses(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch

    def add(self, centerPoint, majorAxisPoint, point):
        c, m, p = _sp(self._sk, centerPoint), _sp(self._sk, majorAxisPoint), _sp(self._sk, point)
        rx = math.hypot(m[0] - c[0], m[1] - c[1])
        rot = math.degrees(math.atan2(m[1] - c[1], m[0] - c[0]))
        ux, uy = (m[0] - c[0]) / rx, (m[1] - c[1]) / rx
        dx, dy = p[0] - c[0], p[1] - c[1]
        u, v = dx * ux + dy * uy, -dx * uy + dy * ux
        ry = abs(v) / math.sqrt(max(1e-12, 1 - (u / rx) ** 2)) if abs(u) < rx else abs(v)
        e = self._sk._add({'type': 'ellipse', 'cx': _r(c[0]), 'cy': _r(c[1]), 'rx': _r(rx), 'ry': _r(ry), 'rot': _r(rot)})
        o = SketchEllipse(self._sk, e)
        self._sk._objs.append(o)
        return o


class SketchCurves(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch
        self.sketchLines = SketchLines(sketch)
        self.sketchCircles = SketchCircles(sketch)
        self.sketchArcs = SketchArcs(sketch)
        self.sketchFittedSplines = SketchFittedSplines(sketch)
        self.sketchEllipses = SketchEllipses(sketch)

    def _all(self):
        return [x for x in self._sk._objs if isinstance(x, SketchEntity)]


class SketchPoints(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch

    def _all(self):
        return [self._sk._origin_point] + self._sk._points

    def add(self, point):
        u, v = _sp(self._sk, point)
        p = SketchPoint(self._sk, u, v)
        self._sk._points.append(p)
        return p


class _Ignored(Base):
    """Dimensions and constraints are accepted but do not drive the geometry here."""

    def __init__(self, sketch, what):
        self._sk = sketch
        self._what = what

    def __getattr__(self, name):
        if name.startswith('add'):
            def f(*a, **k):
                self._sk._note_ignored(self._what)
                return _Dummy()
            return f
        raise AttributeError(name)

    @property
    def count(self):
        return 0

    def item(self, i):
        return None

    def __iter__(self):
        return iter([])


class _Dummy(Base):
    def __init__(self):
        self.parameter = _DummyParam()
        self.value = 0.0

    def deleteMe(self):
        return True


class _DummyParam(Base):
    def __init__(self):
        self.value = 0.0
        self.expression = ''


class SketchTexts(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch

    def createInput2(self, formattedText, height):
        return _TextInput(formattedText, height)

    def createInput(self, formattedText, height, position):
        t = _TextInput(formattedText, height)
        t._pos = position
        return t

    def add(self, input):
        u, v = _sp(self._sk, input._pos) if input._pos is not None else (0.0, 0.0)
        e = self._sk._add({'type': 'text', 'x': _r(u), 'y': _r(v), 'text': str(input.text), 'size': _r(_mm(input.height)), 'font': 'sans'})
        return SketchEntity(self._sk, e)


class _TextInput(Base):
    def __init__(self, text, height):
        self.text = text
        self.height = height
        self._pos = None
        self.fontName = ''

    def setAsMultiLine(self, cornerPoint, diagonalPoint, *a):
        self._pos = cornerPoint
        return True


class Profile(Base):
    def __init__(self, sketch, info):
        self._sk = sketch
        self._ids = info['ids']
        self._info = info

    @property
    def parentSketch(self):
        return self._sk

    def areaProperties(self, accuracy=0):
        return _AreaProps(self)

    @property
    def boundingBox(self):
        a, b = self._info.get('min', [0, 0]), self._info.get('max', [0, 0])
        return BoundingBox3D(_p3(self._sk._world(a[0], a[1])), _p3(self._sk._world(b[0], b[1])))

    @property
    def profileLoops(self):
        return _List([_Loop(True)] + [_Loop(False) for _ in self._ids[1:]])


class _Loop(Base):
    def __init__(self, outer):
        self.isOuter = outer


class _AreaProps(Base):
    def __init__(self, prof):
        self.area = prof._info['area'] / 100.0
        c = prof._info['centroid']
        self.centroid = _p3(prof._sk._world(c[0], c[1]))
        self.perimeter = prof._info.get('perimeter', 0) / MM


class Profiles(_List):
    def __init__(self, sketch):
        _List.__init__(self)
        self._sk = sketch

    def _all(self):
        return [Profile(self._sk, p) for p in _call('profiles', sketch=self._sk._fid)]


class Sketch(Base):
    def __init__(self, comp, fid, o, x, n, name):
        self._comp = comp
        self._fid = fid
        n = _norm(n)
        x = _norm(_sub(x, _mul(n, _dot(x, n))))
        self._basis = {'o': _vec(o), 'x': x, 'y': _cross(n, x), 'n': n}
        self._ents = []
        self._objs = []
        self._points = []
        self._dirty = False
        self._n = 0
        self._name = name
        self._ignored = set()
        self._origin_point = SketchPoint(self, 0.0, 0.0)
        self.sketchCurves = SketchCurves(self)
        self.sketchPoints = SketchPoints(self)
        self.sketchTexts = SketchTexts(self)
        self.sketchDimensions = _Ignored(self, 'Bemaßungen')
        self.geometricConstraints = _Ignored(self, 'Abhängigkeiten')
        self.isComputeDeferred = False
        _open_sketches.append(self)

    # ---- plumbing
    def _add(self, e):
        self._n += 1
        e['id'] = 'e%d' % self._n
        self._ents.append(e)
        self._dirty = True
        return e

    def _remove(self, e):
        if e in self._ents:
            self._ents.remove(e)
            self._objs = [o for o in self._objs if getattr(o, '_e', None) is not e]
            self._dirty = True
            return True
        return False

    def _flush(self):
        if self._dirty:
            self._dirty = False
            _call('updateFeature', id=self._fid, patch={'entities': self._ents})

    def _world(self, u, v):
        b = self._basis
        return _add(b['o'], _add(_mul(b['x'], u), _mul(b['y'], v)))

    def _local(self, w):
        b = self._basis
        d = _sub(w, b['o'])
        return _dot(d, b['x']), _dot(d, b['y'])

    def _note_ignored(self, what):
        if what not in self._ignored:
            self._ignored.add(what)
            _call('log', text='Hinweis: %s in der Skizze „%s“ werden übernommen, steuern die Geometrie hier aber nicht.' % (what, self._name), level=1)

    # ---- interface
    @property
    def name(self):
        return self._name

    @name.setter
    def name(self, v):
        self._name = str(v)
        _call('updateFeature', id=self._fid, patch={'name': self._name})

    @property
    def profiles(self):
        return Profiles(self)

    @property
    def origin(self):
        return _p3(self._basis['o'])

    @property
    def xDirection(self):
        return Vector3D(*self._basis['x'])

    @property
    def yDirection(self):
        return Vector3D(*self._basis['y'])

    @property
    def referencePlane(self):
        b = self._basis
        return ConstructionPlane(self._name, b['o'], b['x'], b['n'])

    @property
    def transform(self):
        b = self._basis
        m = Matrix3D()
        m._m = [b['x'][0], b['y'][0], b['n'][0], _cm(b['o'][0]), b['x'][1], b['y'][1], b['n'][1], _cm(b['o'][1]),
                b['x'][2], b['y'][2], b['n'][2], _cm(b['o'][2]), 0, 0, 0, 1.0]
        return m

    @property
    def parentComponent(self):
        return self._comp

    @property
    def isVisible(self):
        return True

    @isVisible.setter
    def isVisible(self, v):
        _call('updateFeature', id=self._fid, patch={'hidden': not v})

    def modelToSketchSpace(self, p):
        b = self._basis
        w = [_mm(p.x), _mm(p.y), _mm(p.z)]
        d = _sub(w, b['o'])
        return Point3D(_cm(_dot(d, b['x'])), _cm(_dot(d, b['y'])), _cm(_dot(d, b['n'])))

    def sketchToModelSpace(self, p):
        b = self._basis
        w = _add(self._world(_mm(p.x), _mm(p.y)), _mul(b['n'], _mm(p.z)))
        return _p3(w)

    def project(self, entity):
        raise RuntimeError('Projizieren in die Skizze wird hier nicht unterstützt')

    def deleteMe(self):
        if self in _open_sketches:
            _open_sketches.remove(self)
        _call('deleteFeature', id=self._fid)
        return True


class Sketches(_List):
    def __init__(self, comp):
        _List.__init__(self)
        self._comp = comp

    def add(self, planarEntity, occurrenceForCreation=None):
        o, x, n = _plane_of(planarEntity)
        name = 'Sketch%d' % (len(self._items) + 1)
        sk_x = _norm(_sub(x, _mul(_norm(n), _dot(x, _norm(n)))))
        plane = {'o': [_r(v) for v in o], 'x': [_r(v) for v in sk_x], 'n': [_r(v) for v in _norm(n)]}
        fid = _call('addFeature', feature={'type': 'sketch', 'name': name, 'plane': plane, 'entities': []})['id']
        s = Sketch(self._comp, fid, o, x, n, name)
        self._items.append(s)
        return s

    def addWithoutEdges(self, planarEntity, occurrenceForCreation=None):
        return self.add(planarEntity)

    def itemByName(self, name):
        for s in self._items:
            if s.name == name:
                return s
        return None


# ---------------------------------------------------------------- bodies, faces, edges
class BRepVertex(Base):
    def __init__(self, p):
        self._p = p

    @property
    def geometry(self):
        return _p3(self._p)


class BRepFace(Base):
    def __init__(self, body, info):
        self.body = body
        self._info = info

    @property
    def area(self):
        return self._info.get('area', 0) / 100.0

    @property
    def centroid(self):
        return _p3(self._info['point'])

    @property
    def pointOnFace(self):
        return _p3(self._info['point'])

    @property
    def tempId(self):
        return self._info['i']

    @property
    def geometry(self):
        t = self._info.get('type')
        if t == 'plane':
            return Plane(_p3(self._info['point']), Vector3D(*self._info['normal']))
        if t == 'cylinder':
            return Cylinder(_p3(self._info['center']), Vector3D(*self._info['axis']), _cm(self._info['radius']))
        s = Surface({'cone': 2, 'sphere': 3, 'torus': 4}.get(t, 7))
        return s

    @property
    def edges(self):
        return _List()

    @property
    def isParamReversed(self):
        return False


class BRepEdge(Base):
    def __init__(self, body, info):
        self.body = body
        self._info = info

    @property
    def length(self):
        return _cm(self._info.get('length', 0))

    @property
    def pointOnEdge(self):
        return _p3(self._info['mid'])

    @property
    def tempId(self):
        return self._info['i']

    @property
    def startVertex(self):
        return BRepVertex(self._info.get('start', self._info['mid']))

    @property
    def endVertex(self):
        return BRepVertex(self._info.get('end', self._info['mid']))

    @property
    def geometry(self):
        t = self._info.get('type')
        if t == 'circle':
            return Circle3D(_p3(self._info['center']), Vector3D(*self._info['axis']), _cm(self._info['radius']))
        return Line3D(_p3(self._info.get('start', self._info['mid'])), _p3(self._info.get('end', self._info['mid'])))

    @property
    def isDegenerate(self):
        return False


class PhysicalProperties(Base):
    def __init__(self, info):
        self.volume = info.get('volume', 0) / 1000.0
        self.area = info.get('area', 0) / 100.0
        self.density = info.get('density', 0)
        self.mass = self.volume * self.density / 1000.0 if self.density else 0.0
        c = info.get('com')
        self.centerOfMass = _p3(c) if c else None


class BRepBody(Base):
    def __init__(self, info):
        self._id = info['id']
        self._info = info

    def _fresh(self):
        for b in _call('model')['bodies']:
            if b['id'] == self._id:
                self._info = b
                return b
        raise RuntimeError('Der Körper „%s“ gibt es nicht mehr' % self._id)

    @property
    def entityToken(self):
        return self._id

    @property
    def name(self):
        return self._fresh().get('name', self._id)

    @name.setter
    def name(self, v):
        _call('setBodyName', id=self._id, name=str(v))

    @property
    def volume(self):
        return self._fresh().get('volume', 0) / 1000.0

    @property
    def area(self):
        return self._fresh().get('area', 0) / 100.0

    @property
    def isSolid(self):
        return 'volume' in self._fresh()

    @property
    def boundingBox(self):
        b = self._fresh()
        return BoundingBox3D(_p3(b.get('min', [0, 0, 0])), _p3(b.get('max', [0, 0, 0])))

    @property
    def faces(self):
        return _List([BRepFace(self, f) for f in _call('faces', body=self._id)])

    @property
    def edges(self):
        return _List([BRepEdge(self, e) for e in _call('edges', body=self._id)])

    @property
    def vertices(self):
        seen, out = set(), []
        for e in _call('edges', body=self._id):
            for k in ('start', 'end'):
                p = e.get(k)
                if p:
                    key = tuple(round(v, 4) for v in p)
                    if key not in seen:
                        seen.add(key)
                        out.append(BRepVertex(p))
        return _List(out)

    @property
    def physicalProperties(self):
        return PhysicalProperties(_call('bodyProps', body=self._id))

    def getPhysicalProperties(self, accuracy=0):
        return self.physicalProperties

    @property
    def isVisible(self):
        return True

    @isVisible.setter
    def isVisible(self, v):
        _call('setBodyVisible', id=self._id, visible=bool(v))

    @property
    def parentComponent(self):
        return Design._get().rootComponent

    def deleteMe(self):
        raise RuntimeError('Körper löschen wird hier nicht unterstützt – das erzeugende Feature löschen')

    def __eq__(self, other):
        return isinstance(other, BRepBody) and other._id == self._id

    def __hash__(self):
        return hash(self._id)


class BRepBodies(_List):
    def __init__(self, ids=None):
        _List.__init__(self)
        self._ids = ids

    def _all(self):
        bs = _call('model')['bodies']
        if self._ids is not None:
            bs = [b for b in bs if self._ids(b['id'])]
        return [BRepBody(b) for b in bs]

    def itemByName(self, name):
        for b in self._all():
            if b._info.get('name') == name:
                return b
        return None


# ---------------------------------------------------------------- features
class Feature(Base):
    def __init__(self, fid, name, extra=None):
        self._fid = fid
        self._name = name
        self._extra = extra or {}

    @property
    def entityToken(self):
        return self._fid

    @property
    def name(self):
        return self._name

    @name.setter
    def name(self, v):
        self._name = str(v)
        _call('updateFeature', id=self._fid, patch={'name': self._name})

    @property
    def bodies(self):
        fid = self._fid
        return BRepBodies(lambda i: i == fid or i.startswith(fid + '#') or i.startswith(fid + '_'))

    @property
    def healthState(self):
        err = _call('model')['errors'].get(self._fid)
        return FeatureHealthStates.ErrorFeatureHealthState if err else FeatureHealthStates.HealthyFeatureHealthState

    @property
    def errorOrWarningMessage(self):
        return _call('model')['errors'].get(self._fid, '')

    @property
    def isSuppressed(self):
        return False

    @isSuppressed.setter
    def isSuppressed(self, v):
        _call('updateFeature', id=self._fid, patch={'suppressed': bool(v) or None})

    @property
    def timelineObject(self):
        return _TimelineObject(self._fid)

    def deleteMe(self):
        _call('deleteFeature', id=self._fid)
        return True

    def _faces_on(self, o, n, d):
        """planar faces of the resulting bodies in the plane o + n·d with the normal ±n."""
        out = []
        for b in BRepBodies()._all():
            for f in _call('faces', body=b._id):
                if f.get('type') != 'plane':
                    continue
                if abs(abs(_dot(f['normal'], n)) - 1) > 1e-6:
                    continue
                if abs(_dot(_sub(f['point'], o), n) - d) < 1e-4:
                    out.append(BRepFace(b, f))
        return out


class _TimelineObject(Base):
    def __init__(self, fid):
        self._fid = fid

    def rollTo(self, rollBefore):
        return True

    @property
    def isSuppressed(self):
        return False


def _check(fid):
    err = _call('model')['errors'].get(fid)
    if err:
        _call('log', text='Feature %s: %s' % (fid, err), level=2)
    return err


def _hide_sketch(sk):
    _call('updateFeature', id=sk._fid, patch={'hidden': True})


def _profiles_of(profiles):
    items = _items(profiles)
    if not items:
        raise RuntimeError('Kein Profil angegeben')
    sk = items[0]._sk if isinstance(items[0], Profile) else None
    ids = []
    for p in items:
        if not isinstance(p, Profile):
            raise RuntimeError('Nur Skizzenprofile können extrudiert werden')
        if p._sk is not sk:
            raise RuntimeError('Alle Profile müssen aus derselben Skizze stammen')
        ids.extend(p._ids)
    return sk, ids


class DistanceExtentDefinition(Base):
    def __init__(self, distance):
        self.distance = distance

    @staticmethod
    def create(distance):
        return DistanceExtentDefinition(distance)


class ThroughAllExtentDefinition(Base):
    @staticmethod
    def create():
        return ThroughAllExtentDefinition()


class AllExtentDefinition(ThroughAllExtentDefinition):
    pass


class ToEntityExtentDefinition(Base):
    @staticmethod
    def create(*a):
        raise RuntimeError('„Bis Objekt“ wird hier nicht unterstützt – einen Abstand angeben')


class FromEntityStartDefinition(Base):
    @staticmethod
    def create(*a):
        raise RuntimeError('Ein anderer Start als die Skizzenebene wird hier nicht unterstützt')


class OffsetStartDefinition(FromEntityStartDefinition):
    pass


class ProfilePlaneStartDefinition(Base):
    @staticmethod
    def create():
        return ProfilePlaneStartDefinition()


def _through_len():
    m = _call('model')
    lo, hi = m.get('min'), m.get('max')
    if not lo:
        return 1000.0
    return max(10.0, math.sqrt(sum((hi[i] - lo[i]) ** 2 for i in range(3))) * 2 + 10)


class ExtrudeFeatureInput(Base):
    def __init__(self, profile, operation):
        self.profile = profile
        self.operation = operation
        self.isSolid = True
        self.participantBodies = []
        self.taperAngle = ValueInput.createByReal(0)
        self.startExtent = None
        self.creationOccurrence = None
        self.targetBaseFeature = None
        self._ext = {'extent': 'one', 'distance': 10.0}

    def setDistanceExtent(self, isSymmetric, distance):
        self._ext = {'extent': 'sym' if isSymmetric else 'one', 'distance': _app(distance)}
        if isSymmetric:
            d = self._ext['distance']
            self._ext['distance'] = ('=2*(' + d[1:] + ')') if isinstance(d, str) else d * 2
        return True

    def setSymmetricExtent(self, distance, isFullLength, taperAngle=None):
        d = _app(distance)
        self._ext = {'extent': 'sym', 'distance': d if isFullLength else (('=2*(' + d[1:] + ')') if isinstance(d, str) else d * 2)}
        if taperAngle is not None:
            self.taperAngle = taperAngle
        return True

    def _side(self, ext, direction):
        if isinstance(ext, ThroughAllExtentDefinition):
            d = _through_len()
        elif isinstance(ext, DistanceExtentDefinition):
            d = _app(ext.distance)
        else:
            raise RuntimeError('Ausdehnung nicht unterstützt')
        if direction == ExtentDirections.NegativeExtentDirection:
            d = ('=-(' + d[1:] + ')') if isinstance(d, str) else -d
        return d

    def setOneSideExtent(self, extent, direction=0, taperAngle=None):
        if direction == ExtentDirections.SymmetricExtentDirection:
            d = _through_len() if isinstance(extent, ThroughAllExtentDefinition) else _app(extent.distance)
            self._ext = {'extent': 'sym', 'distance': d}
        else:
            self._ext = {'extent': 'one', 'distance': self._side(extent, direction)}
        if taperAngle is not None:
            self.taperAngle = taperAngle
        return True

    def setTwoSidesExtent(self, sideOneExtent, sideTwoExtent, sideOneTaperAngle=None, sideTwoTaperAngle=None):
        self._ext = {'extent': 'two', 'distance': self._side(sideOneExtent, 0), 'distance2': self._side(sideTwoExtent, 0)}
        if sideOneTaperAngle is not None:
            self.taperAngle = sideOneTaperAngle
        return True

    def setAllExtent(self, direction=0):
        if direction == ExtentDirections.SymmetricExtentDirection:
            self._ext = {'extent': 'sym', 'distance': _through_len()}
        else:
            self._ext = {'extent': 'one', 'distance': self._side(ThroughAllExtentDefinition(), direction)}
        return True

    def setThinExtrude(self, *a):
        raise RuntimeError('Dünne Extrusion wird hier nicht unterstützt')


class ExtrudeFeature(Feature):
    def __init__(self, fid, name, sk, dist):
        Feature.__init__(self, fid, name)
        self._sk = sk
        self._d = dist

    def _end(self):
        d = self._d
        if isinstance(d, str):
            d = _eval_app(d[1:])
        return d

    @property
    def endFaces(self):
        b = self._sk._basis
        return _List(self._faces_on(b['o'], b['n'], self._end()))

    @property
    def startFaces(self):
        b = self._sk._basis
        return _List(self._faces_on(b['o'], b['n'], 0.0))

    @property
    def sideFaces(self):
        b = self._sk._basis
        ends = {(x.body._id, x._info['i']) for x in self._faces_on(b['o'], b['n'], self._end()) + self._faces_on(b['o'], b['n'], 0.0)}
        return _List([f for bd in self.bodies for f in bd.faces if (f.body._id, f._info['i']) not in ends])

    @property
    def extentOne(self):
        return DistanceExtentDefinition(_ModelParam(self._d))


class _ModelParam(Base):
    def __init__(self, v):
        self.value = _cm(v) if isinstance(v, (int, float)) else 0.0
        self.expression = str(v)


class ExtrudeFeatures(_List):
    def __init__(self, comp):
        _List.__init__(self)
        self._comp = comp

    def createInput(self, profile, operation):
        return ExtrudeFeatureInput(profile, operation)

    def addSimple(self, profile, distance, operation):
        i = self.createInput(profile, operation)
        i.setDistanceExtent(False, distance)
        return self.add(i)

    def add(self, input):
        sk, ids = _profiles_of(input.profile)
        f = {'type': 'extrude', 'name': 'Extrude%d' % (len(self._items) + 1), 'sketch': sk._fid, 'profiles': ids, 'op': _OPS.get(input.operation, 'new')}
        f.update(input._ext)
        tp = _app(input.taperAngle, 'angle') if input.taperAngle is not None else 0
        if tp:
            f['taper'] = tp
        bodies = _items(input.participantBodies)
        if len(bodies) == 1 and f['op'] != 'new':
            f['target'] = bodies[0]._id
        fid = _call('addFeature', feature=f)['id']
        _hide_sketch(sk)
        e = ExtrudeFeature(fid, f['name'], sk, f['distance'])
        self._items.append(e)
        _check(fid)
        return e


class RevolveFeatureInput(Base):
    def __init__(self, profile, axis, operation):
        self.profile, self.axis, self.operation = profile, axis, operation
        self.participantBodies = []
        self.isSolid = True
        self._angle = 360.0

    def setAngleExtent(self, isSymmetric, angle):
        self._angle = _app(angle, 'angle')
        self._sym = isSymmetric
        return True

    def setTorusExtent(self, *a):
        raise RuntimeError('Torus-Ausdehnung wird hier nicht unterstützt')


class RevolveFeatures(_List):
    def createInput(self, profile, axis, operation):
        return RevolveFeatureInput(profile, axis, operation)

    def add(self, input):
        sk, ids = _profiles_of(input.profile)
        ax = input.axis
        if isinstance(ax, SketchLine) and ax._sk is sk:
            axis = ax._e['id']
        else:
            p, d = _axis_of(ax)
            b = sk._basis
            if abs(_dot(d, b['n'])) > 1e-6 or abs(_dot(_sub(p, b['o']), b['n'])) > 1e-4:
                raise RuntimeError('Die Drehachse muss in der Skizzenebene liegen')
            u, v = sk._local(p)
            if abs(abs(_dot(d, b['x'])) - 1) < 1e-6 and abs(v) < 1e-4:
                axis = 'x'
            elif abs(abs(_dot(d, b['y'])) - 1) < 1e-6 and abs(u) < 1e-4:
                axis = 'y'
            else:
                q = _sub(p, _mul(d, 1000.0))
                r = _add(p, _mul(d, 1000.0))
                qa, ra = sk._local(q), sk._local(r)
                e = sk._add({'type': 'poly', 'closed': False, 'cons': True, 'pts': [[_r(qa[0]), _r(qa[1])], [_r(ra[0]), _r(ra[1])]]})
                axis = e['id']
        f = {'type': 'revolve', 'name': 'Revolve%d' % (len(self._items) + 1), 'sketch': sk._fid, 'profiles': ids, 'axis': axis, 'angle': input._angle, 'op': _OPS.get(input.operation, 'new')}
        bodies = _items(input.participantBodies)
        if len(bodies) == 1 and f['op'] != 'new':
            f['target'] = bodies[0]._id
        fid = _call('addFeature', feature=f)['id']
        _hide_sketch(sk)
        r = Feature(fid, f['name'])
        self._items.append(r)
        _check(fid)
        return r


def _refs(entities):
    edges, faces = [], []
    for x in _items(entities):
        if isinstance(x, BRepEdge):
            edges.append([_r(v) for v in x._info['mid']])
        elif isinstance(x, BRepFace):
            faces.append([_r(v) for v in x._info['point']])
        elif isinstance(x, BRepBody):
            for e in x.edges:
                edges.append([_r(v) for v in e._info['mid']])
        else:
            raise RuntimeError('Kanten oder Flächen eines Körpers werden erwartet')
    return edges, faces


class _EdgeSets(_List):
    def __init__(self, owner):
        _List.__init__(self)
        self._o = owner

    def addConstantRadiusEdgeSet(self, edges, radius, isTangentChain=True):
        self._items.append({'refs': edges, 'size': radius, 'kind': 'equal'})
        return True

    def addEqualDistanceChamferEdgeSet(self, edges, distance, isTangentChain=True):
        self._items.append({'refs': edges, 'size': distance, 'kind': 'equal'})
        return True

    def addTwoDistancesChamferEdgeSet(self, edges, distanceOne, distanceTwo, isFlipped=False, isTangentChain=True):
        self._items.append({'refs': edges, 'size': distanceOne, 'size2': distanceTwo, 'kind': 'two', 'flip': isFlipped})
        return True

    def addDistanceAndAngleChamferEdgeSet(self, edges, distance, angle, isFlipped=False, isTangentChain=True):
        self._items.append({'refs': edges, 'size': distance, 'angle': angle, 'kind': 'angle', 'flip': isFlipped})
        return True

    def addVariableRadiusEdgeSet(self, edges, startRadius, endRadius, isTangentChain=True):
        self._items.append({'refs': edges, 'size': startRadius, 'size2': endRadius, 'kind': 'variable'})
        return True

    def addChordLengthEdgeSet(self, *a):
        raise RuntimeError('Sehnenlänge wird hier nicht unterstützt')


class FilletFeatureInput(Base):
    def __init__(self):
        self.edgeSetInputs = _EdgeSets(self)
        self.isRollingBallCorner = True
        self.isG2 = False

    def addConstantRadiusEdgeSet(self, edges, radius, isTangentChain=True):
        return self.edgeSetInputs.addConstantRadiusEdgeSet(edges, radius, isTangentChain)


class FilletFeatures(_List):
    def createInput(self):
        return FilletFeatureInput()

    def add(self, input):
        last = None
        for s in input.edgeSetInputs:
            edges, faces = _refs(s['refs'])
            f = {'type': 'fillet', 'name': 'Fillet%d' % (len(self._items) + 1), 'radius': _app(s['size']), 'edges': edges}
            if faces:
                f['faces'] = faces
            if s['kind'] == 'variable':
                f['variable'] = True
                f['radius2'] = _app(s['size2'])
            fid = _call('addFeature', feature=f)['id']
            last = Feature(fid, f['name'])
            self._items.append(last)
            _check(fid)
        if last is None:
            raise RuntimeError('Keine Kanten für die Verrundung angegeben')
        return last


class ChamferFeatureInput(Base):
    def __init__(self, edges=None, isTangentChain=True):
        self.chamferEdgeSets = _EdgeSets(self)
        self._edges = edges
        self.isFlipped = False
        self.chamferType = ChamferTypes.EqualDistanceType

    def setToEqualDistance(self, distance):
        self.chamferEdgeSets._items = [{'refs': self._edges, 'size': distance, 'kind': 'equal'}]
        return True

    def setToTwoDistances(self, distanceOne, distanceTwo):
        self.chamferEdgeSets._items = [{'refs': self._edges, 'size': distanceOne, 'size2': distanceTwo, 'kind': 'two', 'flip': self.isFlipped}]
        return True

    def setToDistanceAndAngle(self, distance, angle):
        self.chamferEdgeSets._items = [{'refs': self._edges, 'size': distance, 'angle': angle, 'kind': 'angle', 'flip': self.isFlipped}]
        return True


class ChamferFeatures(_List):
    def createInput(self, edges, isTangentChain=True):
        return ChamferFeatureInput(edges, isTangentChain)

    def createInput2(self):
        return ChamferFeatureInput()

    def add(self, input):
        last = None
        for s in input.chamferEdgeSets:
            edges, faces = _refs(s['refs'])
            f = {'type': 'chamfer', 'name': 'Chamfer%d' % (len(self._items) + 1), 'distance': _app(s['size']), 'edges': edges}
            if faces:
                f['faces'] = faces
            if s['kind'] == 'two':
                f['chamferKind'] = 'two'
                f['distance2'] = _app(s['size2'])
            elif s['kind'] == 'angle':
                f['chamferKind'] = 'angle'
                f['angle'] = _app(s['angle'], 'angle')
            if s.get('flip'):
                f['flip'] = True
            fid = _call('addFeature', feature=f)['id']
            last = Feature(fid, f['name'])
            self._items.append(last)
            _check(fid)
        if last is None:
            raise RuntimeError('Keine Kanten für die Fase angegeben')
        return last


class HoleFeatureInput(Base):
    def __init__(self, kind, **kw):
        self._f = {'kind': kind}
        self._f.update(kw)
        self._pts = []
        self.tipAngle = ValueInput.createByString('118 deg')
        self.isDefaultDirection = True
        self.participantBodies = []

    def setPositionBySketchPoint(self, sketchPoint):
        self._pts = [sketchPoint]
        return True

    def setPositionBySketchPoints(self, sketchPoints):
        self._pts = _items(sketchPoints)
        return True

    def setPositionByPoint(self, *a):
        raise RuntimeError('Bohrung an einem Punkt einer Fläche: bitte Skizzenpunkte verwenden')

    def setPositionAtCenter(self, *a):
        raise RuntimeError('Bohrung in der Mitte einer Kante: bitte Skizzenpunkte verwenden')

    def setPositionByPlaneAndOffsets(self, *a):
        raise RuntimeError('Bohrung mit Abständen zu Kanten: bitte Skizzenpunkte verwenden')

    def setDistanceExtent(self, distance):
        self._f['through'] = False
        self._f['depth'] = _app(distance)
        return True

    def setAllExtent(self, direction=0):
        self._f['through'] = True
        return True

    def setOneSideToExtent(self, *a):
        raise RuntimeError('„Bis Objekt“ wird hier nicht unterstützt – eine Tiefe angeben')


class HoleFeatures(_List):
    def createSimpleInput(self, holeDiameter):
        return HoleFeatureInput('simple', dia=_app(holeDiameter))

    def createCounterboreInput(self, holeDiameter, counterboreDiameter, counterboreDepth):
        return HoleFeatureInput('cbore', dia=_app(holeDiameter), cbDia=_app(counterboreDiameter), cbDepth=_app(counterboreDepth))

    def createCountersinkInput(self, holeDiameter, countersinkDiameter, countersinkAngle):
        return HoleFeatureInput('csink', dia=_app(holeDiameter), csDia=_app(countersinkDiameter), csAngle=_app(countersinkAngle, 'angle'))

    def add(self, input):
        pts = input._pts
        if not pts:
            raise RuntimeError('Die Bohrung braucht mindestens einen Skizzenpunkt')
        sk = pts[0]._sk if isinstance(pts[0], SketchPoint) else None
        if sk is None or any(not isinstance(p, SketchPoint) or p._sk is not sk for p in pts):
            raise RuntimeError('Alle Bohrungspunkte müssen Punkte derselben Skizze sein')
        ids = [p._hole_id() for p in pts]
        f = {'type': 'hole', 'name': 'Hole%d' % (len(self._items) + 1), 'sketch': sk._fid, 'points': ids, 'through': False, 'depth': 10.0}
        f.update(input._f)
        if not f.get('through'):
            f['tip'] = True
        fid = _call('addFeature', feature=f)['id']
        _hide_sketch(sk)
        h = Feature(fid, f['name'])
        self._items.append(h)
        _check(fid)
        return h


class ShellFeatureInput(Base):
    def __init__(self, entities, isTangentChain=True):
        self._ents = entities
        self.insideThickness = None
        self.outsideThickness = None
        self.isTangentChain = isTangentChain


class ShellFeatures(_List):
    def createInput(self, inputEntities, isTangentChain=True):
        return ShellFeatureInput(inputEntities, isTangentChain)

    def add(self, input):
        _, faces = _refs([x for x in _items(input._ents) if isinstance(x, BRepFace)])
        if not faces:
            raise RuntimeError('Die Schale braucht mindestens eine Fläche, die offen bleibt')
        t = input.insideThickness if input.insideThickness is not None else input.outsideThickness
        if t is None:
            raise RuntimeError('Wandstärke fehlt (insideThickness)')
        f = {'type': 'shell', 'name': 'Shell%d' % (len(self._items) + 1), 'thickness': _app(t), 'faces': faces}
        fid = _call('addFeature', feature=f)['id']
        s = Feature(fid, f['name'])
        self._items.append(s)
        _check(fid)
        return s


class CombineFeatureInput(Base):
    def __init__(self, target, tools):
        self.targetBody = target
        self.toolBodies = tools
        self.operation = FeatureOperations.JoinFeatureOperation
        self.isKeepToolBodies = False
        self.isNewComponent = False


class CombineFeatures(_List):
    def createInput(self, targetBody, toolBodies):
        return CombineFeatureInput(targetBody, toolBodies)

    def add(self, input):
        last = None
        op = {0: 'join', 1: 'cut', 2: 'intersect'}.get(input.operation, 'join')
        for t in _items(input.toolBodies):
            f = {'type': 'combine', 'name': 'Combine%d' % (len(self._items) + 1), 'body': input.targetBody._id, 'tool': t._id, 'op': op}
            if input.isKeepToolBodies:
                f['keep'] = True
            fid = _call('addFeature', feature=f)['id']
            last = Feature(fid, f['name'])
            self._items.append(last)
            _check(fid)
        if last is None:
            raise RuntimeError('Kein Werkzeugkörper angegeben')
        return last


def _mirror_plane(entity):
    o, _, n = _plane_of(entity)
    k, s = _main_axis(n)
    name = {'z': 'XY', 'y': 'XZ', 'x': 'YZ'}[k]
    return name, _dot(o, _MAIN[k])


def _sources(entities):
    out = []
    for x in _items(entities):
        if isinstance(x, BRepBody):
            out.append({'source': 'body', 'body': x._id})
        elif isinstance(x, Feature):
            out.append({'target': x._fid})
        else:
            raise RuntimeError('Körper oder Features werden erwartet')
    return out


class MirrorFeatureInput(Base):
    def __init__(self, entities, plane):
        self.inputEntities = entities
        self.mirrorPlane = plane
        self.isCombine = False
        self.patternComputeOption = 0


class MirrorFeatures(_List):
    def createInput(self, inputEntities, mirrorPlane):
        return MirrorFeatureInput(inputEntities, mirrorPlane)

    def add(self, input):
        plane, off = _mirror_plane(input.mirrorPlane)
        last = None
        for s in _sources(input.inputEntities):
            f = {'type': 'mirror', 'name': 'Mirror%d' % (len(self._items) + 1), 'plane': plane, 'offset': _r(off)}
            f.update(s)
            if input.isCombine and s.get('source') == 'body':
                f['joinBodies'] = True
            fid = _call('addFeature', feature=f)['id']
            last = Feature(fid, f['name'])
            self._items.append(last)
            _check(fid)
        return last


class RectangularPatternFeatureInput(Base):
    def __init__(self, entities, d1, q1, s1, kind):
        self.inputEntities = entities
        self._d1, self._q1, self._s1 = d1, q1, s1
        self.patternDistanceType = kind
        self._d2 = None
        self._q2, self._s2 = None, None
        self.isSymmetricInDirectionOne = False
        self.isSymmetricInDirectionTwo = False
        self.patternComputeOption = 0

    def setDirectionTwo(self, directionTwoEntity, quantityTwo, distanceTwo):
        self._d2, self._q2, self._s2 = directionTwoEntity, quantityTwo, distanceTwo
        return True


class RectangularPatternFeatures(_List):
    def createInput(self, inputEntities, directionOneEntity, quantityOne, distanceOne, patternDistanceType=0):
        return RectangularPatternFeatureInput(inputEntities, directionOneEntity, quantityOne, distanceOne, patternDistanceType)

    def add(self, input):
        def dirn(ent, q, s):
            _, d = _axis_of(ent)
            k, sign = _main_axis(d)
            n = max(1, int(round(_num(q, 'none'))))
            dist = _num(s)
            sp = dist if input.patternDistanceType == PatternDistanceType.SpacingPatternDistanceType else (dist / (n - 1) if n > 1 else 0.0)
            return k, n, _r(sp * sign)
        k1, n1, s1 = dirn(input._d1, input._q1, input._s1)
        base = {'kind': 'rect', 'dir1': k1, 'n1': n1, 's1': s1, 'n2': 1, 's2': 0}
        if input._d2 is not None:
            k2, n2, s2 = dirn(input._d2, input._q2, input._s2)
            base.update({'dir2': k2, 'n2': n2, 's2': s2})
        else:
            base['dir2'] = 'y' if k1 != 'y' else 'x'
        last = None
        for s in _sources(input.inputEntities):
            f = {'type': 'pattern', 'name': 'RectangularPattern%d' % (len(self._items) + 1)}
            f.update(base)
            f.update(s)
            fid = _call('addFeature', feature=f)['id']
            last = Feature(fid, f['name'])
            self._items.append(last)
            _check(fid)
        return last


class CircularPatternFeatureInput(Base):
    def __init__(self, entities, axis):
        self.inputEntities = entities
        self.axis = axis
        self.quantity = ValueInput.createByReal(2)
        self.totalAngle = ValueInput.createByString('360 deg')
        self.isSymmetric = False
        self.patternComputeOption = 0


class CircularPatternFeatures(_List):
    def createInput(self, inputEntities, axis):
        return CircularPatternFeatureInput(inputEntities, axis)

    def add(self, input):
        p, d = _axis_of(input.axis)
        k, sign = _main_axis(d)
        n = max(1, int(round(_num(input.quantity, 'none'))))
        ang = _num(input.totalAngle, 'angle') * sign
        base = {'kind': 'circ', 'n': n, 'angle': _r(ang), 'axis': k, 'cx': _r(p[0]), 'cy': _r(p[1]), 'cz': _r(p[2])}
        last = None
        for s in _sources(input.inputEntities):
            f = {'type': 'pattern', 'name': 'CircularPattern%d' % (len(self._items) + 1)}
            f.update(base)
            f.update(s)
            fid = _call('addFeature', feature=f)['id']
            last = Feature(fid, f['name'])
            self._items.append(last)
            _check(fid)
        return last


class _Unsupported(_List):
    def __init__(self, what):
        _List.__init__(self)
        self._what = what

    def __getattr__(self, name):
        if name.startswith('create') or name.startswith('add'):
            def f(*a, **k):
                raise RuntimeError('%s wird von Skripten hier nicht unterstützt' % self._what)
            return f
        raise AttributeError(name)


class Features(Base):
    def __init__(self, comp):
        self.extrudeFeatures = ExtrudeFeatures(comp)
        self.revolveFeatures = RevolveFeatures()
        self.filletFeatures = FilletFeatures()
        self.chamferFeatures = ChamferFeatures()
        self.holeFeatures = HoleFeatures()
        self.shellFeatures = ShellFeatures()
        self.combineFeatures = CombineFeatures()
        self.mirrorFeatures = MirrorFeatures()
        self.rectangularPatternFeatures = RectangularPatternFeatures()
        self.circularPatternFeatures = CircularPatternFeatures()
        self.sweepFeatures = _Unsupported('Sweep')
        self.loftFeatures = _Unsupported('Erhebung')
        self.threadFeatures = _Unsupported('Gewinde')
        self.draftFeatures = _Unsupported('Formschräge')
        self.moveFeatures = _Unsupported('Verschieben')
        self.splitBodyFeatures = _Unsupported('Körper teilen')
        self.removeFeatures = _Unsupported('Entfernen')
        self.scaleFeatures = _Unsupported('Skalieren')
        self.coilFeatures = _Unsupported('Feder')
        self.ribFeatures = _Unsupported('Rippe')
        self.webFeatures = _Unsupported('Steg')
        self.boundaryFillFeatures = _Unsupported('Begrenzungsfüllung')
        self.thickenFeatures = _Unsupported('Aufdicken')
        self.patchFeatures = _Unsupported('Flicken')
        self.offsetFacesFeatures = _Unsupported('Fläche versetzen')
        self.pathPatternFeatures = _Unsupported('Muster entlang Pfad')
        self.baseFeatures = _Unsupported('Basis-Feature')


# ---------------------------------------------------------------- parameters
class Parameter(Base):
    def __init__(self, info):
        self._info = info

    @property
    def name(self):
        return self._info['name']

    @property
    def expression(self):
        return self._info.get('expr', '')

    @expression.setter
    def expression(self, v):
        expr, _ = _convert_expr(v, 'length')
        _call('setParam', name=self.name, expr=expr)
        self._info['expr'] = expr

    @property
    def value(self):
        for p in _call('params'):
            if p['name'] == self.name:
                return _to_internal(p.get('value', 0), _units_kind(self.unit) if self.unit else 'length')
        return 0.0

    @value.setter
    def value(self, v):
        kind = _units_kind(self.unit) if self.unit else 'length'
        _call('setParam', name=self.name, expr=repr(round(_to_app(float(v), kind), 9)))

    @property
    def unit(self):
        return self._info.get('unit', 'mm')

    @property
    def comment(self):
        return self._info.get('comment', '')

    @comment.setter
    def comment(self, v):
        _call('setParam', name=self.name, expr=self.expression, comment=str(v))

    @property
    def isFavorite(self):
        return False

    @isFavorite.setter
    def isFavorite(self, v):
        pass

    def deleteMe(self):
        _call('deleteParam', name=self.name)
        return True


class UserParameter(Parameter):
    pass


class UserParameters(_List):
    def _all(self):
        return [UserParameter(p) for p in _call('params')]

    def itemByName(self, name):
        for p in self._all():
            if p.name == name:
                return p
        return None

    def add(self, name, value, units, comment=''):
        kind = _units_kind(units)
        if isinstance(value, ValueInput) and value.valueType == core.ValueTypes.RealValueType:
            expr = repr(round(_to_app(value.realValue, kind if kind != 'none' else 'none'), 9))
        elif isinstance(value, ValueInput):
            expr, _ = _convert_expr(value.stringValue, kind)
        else:
            expr = repr(float(value))
        _call('setParam', name=str(name), expr=expr, comment=str(comment or ''), unit=str(units or ''))
        return self.itemByName(name)


class FusionUnitsManager(Base):
    defaultLengthUnits = 'mm'
    distanceDisplayUnits = 0
    internalUnits = 'cm'

    def evaluateExpression(self, expression, units='mm'):
        kind = _units_kind(units)
        expr, _ = _convert_expr(expression, kind if kind != 'none' else 'length')
        return _to_internal(_eval_app(expr), kind if kind != 'none' else 'length')

    def convert(self, valueInInputUnits, inputUnits, outputUnits):
        a, b = (inputUnits or '').lower(), (outputUnits or '').lower()
        if a in _LEN_MM and b in _LEN_MM:
            return valueInInputUnits * _LEN_MM[a] / _LEN_MM[b]
        if a in ('deg', 'rad') and b in ('deg', 'rad'):
            v = math.radians(valueInInputUnits) if a == 'deg' else valueInInputUnits
            return math.degrees(v) if b == 'deg' else v
        return -1

    def formatInternalValue(self, internalValue, displayUnits='mm', showUnits=True):
        kind = _units_kind(displayUnits)
        u = (displayUnits or 'mm').lower()
        if kind == 'angle':
            v, s = math.degrees(internalValue), ' deg'
        elif u in _LEN_MM:
            v, s = internalValue * MM / _LEN_MM[u], ' ' + u
        else:
            v, s = internalValue, ''
        return ('%g' % round(v, 6)) + (s if showUnits else '')

    def isValidExpression(self, expression, units='mm'):
        try:
            self.evaluateExpression(expression, units)
            return True
        except Exception:
            return False

    def standardizeExpression(self, expression, units='mm'):
        return str(expression)


# ---------------------------------------------------------------- export
class _ExportOptions(Base):
    def __init__(self, fmt, geometry, filename):
        self._fmt = fmt
        self.geometry = geometry
        self.filename = filename
        self.isBinaryFormat = True
        self.meshRefinement = MeshRefinementSettings.MeshRefinementMedium
        self.sendToPrintUtility = False
        self.isOneFilePerBody = False


class ExportManager(Base):
    def createSTLExportOptions(self, geometry, filename=''):
        return _ExportOptions('stl', geometry, filename)

    def createSTEPExportOptions(self, filename, geometry=None):
        return _ExportOptions('step', geometry, filename)

    def createIGESExportOptions(self, filename, geometry=None):
        return _ExportOptions('iges', geometry, filename)

    def createOBJExportOptions(self, geometry, filename=''):
        return _ExportOptions('obj', geometry, filename)

    def create3MFExportOptions(self, geometry, filename=''):
        return _ExportOptions('3mf', geometry, filename)

    def createFusionArchiveExportOptions(self, *a):
        raise RuntimeError('Dieses Archivformat gibt es hier nicht – STEP verwenden')

    def createSATExportOptions(self, *a):
        raise RuntimeError('SAT wird hier nicht unterstützt – STEP verwenden')

    def createSMTExportOptions(self, *a):
        raise RuntimeError('SMT wird hier nicht unterstützt – STEP verwenden')

    def execute(self, options):
        g = options.geometry
        body = g._id if isinstance(g, BRepBody) else None
        _call('export', format=options._fmt, file=str(options.filename or ''), body=body, binary=bool(options.isBinaryFormat))
        return True


# ---------------------------------------------------------------- component and design
class Occurrences(_List):
    def addNewComponent(self, transform=None):
        raise RuntimeError('Weitere Komponenten werden von Skripten hier nicht unterstützt – Körper verwenden')

    def addExistingComponent(self, *a):
        raise RuntimeError('Weitere Komponenten werden von Skripten hier nicht unterstützt')


class Component(Base):
    def __init__(self, design):
        self._design = design
        self.sketches = Sketches(self)
        self.features = Features(self)
        self.constructionPlanes = ConstructionPlanes(self)
        self.constructionAxes = ConstructionAxes()
        self.constructionPoints = ConstructionPoints()
        self.occurrences = Occurrences()
        self.allOccurrences = Occurrences()
        self.xYConstructionPlane = ConstructionPlane('XY', [0, 0, 0], [1, 0, 0], [0, 0, 1], self)
        self.xZConstructionPlane = ConstructionPlane('XZ', [0, 0, 0], [1, 0, 0], [0, 1, 0], self)
        self.yZConstructionPlane = ConstructionPlane('YZ', [0, 0, 0], [0, 0, -1], [1, 0, 0], self)
        self.xConstructionAxis = ConstructionAxis('X', [0, 0, 0], [1, 0, 0])
        self.yConstructionAxis = ConstructionAxis('Y', [0, 0, 0], [0, 1, 0])
        self.zConstructionAxis = ConstructionAxis('Z', [0, 0, 0], [0, 0, 1])
        self.originConstructionPoint = ConstructionPoint('Origin', [0, 0, 0])
        self.isOriginFolderLightBulbOn = True
        self.description = ''
        self.partNumber = ''

    @property
    def name(self):
        return _call('docName')

    @name.setter
    def name(self, v):
        _call('setDocName', name=str(v))

    @property
    def bRepBodies(self):
        return BRepBodies()

    @property
    def extrudeFeatures(self):
        return self.features.extrudeFeatures

    @property
    def parentDesign(self):
        return self._design

    @property
    def material(self):
        return None

    def getPhysicalProperties(self, accuracy=0):
        tot = {'volume': 0.0, 'area': 0.0}
        for b in BRepBodies()._all():
            tot['volume'] += b._info.get('volume', 0)
            tot['area'] += b._info.get('area', 0)
        return PhysicalProperties(tot)

    @property
    def physicalProperties(self):
        return self.getPhysicalProperties()

    @property
    def boundingBox(self):
        m = _call('model')
        return BoundingBox3D(_p3(m.get('min') or [0, 0, 0]), _p3(m.get('max') or [0, 0, 0]))


class Timeline(_List):
    def _all(self):
        return [_TimelineObject(f['id']) for f in _call('project')['features']]

    @property
    def markerPosition(self):
        return len(self._all())

    def moveToEnd(self):
        return True


class Design(Base):
    _instance = None

    def __init__(self):
        self.rootComponent = Component(self)
        self.userParameters = UserParameters()
        self.unitsManager = FusionUnitsManager()
        self.fusionUnitsManager = self.unitsManager
        self.exportManager = ExportManager()
        self.timeline = Timeline()
        self.designType = DesignTypes.ParametricDesignType
        self.productType = 'DesignProductType'

    @staticmethod
    def _get():
        if Design._instance is None:
            Design._instance = Design()
        return Design._instance

    @staticmethod
    def _reset():
        Design._instance = None
        del _open_sketches[:]

    @property
    def activeComponent(self):
        return self.rootComponent

    @property
    def allComponents(self):
        return _List([self.rootComponent])

    @property
    def allParameters(self):
        return self.userParameters

    @property
    def parentDocument(self):
        from .core import Application
        return Application.get().activeDocument

    def activateRootComponent(self):
        return True

    def computeAll(self):
        _call('model')
        return True
