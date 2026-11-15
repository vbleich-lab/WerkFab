# adsk.core – application, user interface, geometry helpers, values, collections, events and commands.
import json
import math
import re

import _werkfab


# ---------------------------------------------------------------- host bridge
_flushers = []


def _call(_op, **kw):
    if _op not in ('log', 'message', 'input', 'confirm'):
        for f in list(_flushers):
            f()
    r = _werkfab.call(_op, json.dumps(kw))
    out = json.loads(r) if r else None
    if isinstance(out, dict) and out.get('__error__'):
        raise RuntimeError(out['__error__'])
    return out


# ---------------------------------------------------------------- units
_LEN_MM = {'mm': 1.0, 'cm': 10.0, 'm': 1000.0, 'in': 25.4, 'inch': 25.4, 'ft': 304.8, 'um': 0.001}
_ANG_DEG = {'deg': 1.0, '°': 1.0, 'rad': 180.0 / math.pi}
_FUNCS = {k: getattr(math, k) for k in ('sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'floor', 'ceil', 'log', 'exp', 'pi')}
_FUNCS.update({'abs': abs, 'round': round, 'min': min, 'max': max, 'PI': math.pi})
_NUM_UNIT = re.compile(r'(?<![A-Za-z_0-9.])(\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?\s*(mm|cm|um|inch|in|ft|m|deg|rad|°)?(?![A-Za-z_])')


def _units_kind(units):
    u = (units or '').strip().lower()
    if u in _ANG_DEG:
        return 'angle'
    if u in _LEN_MM or u == '':
        return 'length' if u else 'none'
    return 'none'


def _params_mm():
    try:
        return {p['name']: p.get('value', 0) for p in _call('params')}
    except Exception:
        return {}


def _convert_expr(s, kind):
    """Expression in the original units → (expression in WerkFab units, uses parameters)."""
    s = str(s).strip().replace('^', '**')

    def rep(m):
        unit = m.group(2)
        txt = m.group(0)
        val = float(txt[:len(txt) - len(unit)].strip() if unit else txt.strip())
        if unit in _LEN_MM:
            val *= _LEN_MM[unit]
        elif unit in _ANG_DEG:
            val *= _ANG_DEG[unit]
        return repr(round(val, 9))
    out = _NUM_UNIT.sub(rep, s)
    names = set(re.findall(r'[A-Za-z_][A-Za-z0-9_]*', out)) - set(_FUNCS) - {'e'}
    return out, bool(names)


def _eval_app(expr):
    scope = dict(_FUNCS)
    scope.update(_params_mm())
    return float(eval(expr, {'__builtins__': {}}, scope))


def _to_internal(app_value, kind):
    if kind == 'length':
        return app_value / 10.0
    if kind == 'angle':
        return math.radians(app_value)
    return app_value


def _to_app(internal, kind):
    if kind == 'length':
        return internal * 10.0
    if kind == 'angle':
        return math.degrees(internal)
    return internal


# ---------------------------------------------------------------- base
class Base(object):
    @classmethod
    def cast(cls, obj):
        return obj if isinstance(obj, cls) else None

    @property
    def objectType(self):
        return 'adsk::' + type(self).__module__.split('.')[-1] + '::' + type(self).__name__

    @property
    def isValid(self):
        return True

    @property
    def classType(self):
        return type(self).objectType


class _List(Base):
    def __init__(self, items=None):
        self._items = list(items or [])

    def _all(self):
        return self._items

    def item(self, index):
        a = self._all()
        return a[index] if 0 <= index < len(a) else None

    @property
    def count(self):
        return len(self._all())

    def __len__(self):
        return len(self._all())

    def __iter__(self):
        return iter(list(self._all()))

    def __getitem__(self, i):
        return self._all()[i]

    def itemById(self, id):
        for x in self._all():
            if getattr(x, 'id', None) == id:
                return x
        return None


class ObjectCollection(_List):
    @staticmethod
    def create():
        return ObjectCollection()

    @staticmethod
    def createWithArray(items):
        return ObjectCollection(items)

    def add(self, item):
        if item in self._items:
            return False
        self._items.append(item)
        return True

    def removeByIndex(self, i):
        if 0 <= i < len(self._items):
            del self._items[i]
            return True
        return False

    def removeByItem(self, item):
        if item in self._items:
            self._items.remove(item)
            return True
        return False

    def clear(self):
        self._items = []
        return True

    def find(self, item, startIndex=0):
        try:
            return self._items.index(item, startIndex)
        except ValueError:
            return -1

    def contains(self, item):
        return item in self._items


# ---------------------------------------------------------------- geometry (internal units: cm)
class Point2D(Base):
    def __init__(self, x=0.0, y=0.0):
        self.x, self.y = float(x), float(y)

    @staticmethod
    def create(x=0.0, y=0.0):
        return Point2D(x, y)

    def copy(self):
        return Point2D(self.x, self.y)

    def distanceTo(self, p):
        return math.hypot(p.x - self.x, p.y - self.y)

    def asArray(self):
        return [self.x, self.y]


class Point3D(Base):
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x, self.y, self.z = float(x), float(y), float(z)

    @staticmethod
    def create(x=0.0, y=0.0, z=0.0):
        return Point3D(x, y, z)

    def copy(self):
        return Point3D(self.x, self.y, self.z)

    def asArray(self):
        return [self.x, self.y, self.z]

    def setWithArray(self, a):
        self.x, self.y, self.z = [float(v) for v in a[:3]]
        return True

    def distanceTo(self, p):
        return math.sqrt((p.x - self.x) ** 2 + (p.y - self.y) ** 2 + (p.z - self.z) ** 2)

    def isEqualTo(self, p):
        return self.distanceTo(p) < 1e-9

    def isEqualToByTolerance(self, p, tol):
        return self.distanceTo(p) <= tol

    def translateBy(self, v):
        self.x += v.x
        self.y += v.y
        self.z += v.z
        return True

    def vectorTo(self, p):
        return Vector3D(p.x - self.x, p.y - self.y, p.z - self.z)

    def asVector(self):
        return Vector3D(self.x, self.y, self.z)

    def transformBy(self, m):
        a = m._m
        x, y, z = self.x, self.y, self.z
        self.x = a[0] * x + a[1] * y + a[2] * z + a[3]
        self.y = a[4] * x + a[5] * y + a[6] * z + a[7]
        self.z = a[8] * x + a[9] * y + a[10] * z + a[11]
        return True

    def __repr__(self):
        return 'Point3D(%g, %g, %g)' % (self.x, self.y, self.z)


class Vector3D(Base):
    def __init__(self, x=0.0, y=0.0, z=0.0):
        self.x, self.y, self.z = float(x), float(y), float(z)

    @staticmethod
    def create(x=0.0, y=0.0, z=0.0):
        return Vector3D(x, y, z)

    def copy(self):
        return Vector3D(self.x, self.y, self.z)

    def asArray(self):
        return [self.x, self.y, self.z]

    @property
    def length(self):
        return math.sqrt(self.x ** 2 + self.y ** 2 + self.z ** 2)

    def normalize(self):
        n = self.length
        if n < 1e-15:
            return False
        self.x, self.y, self.z = self.x / n, self.y / n, self.z / n
        return True

    def scaleBy(self, s):
        self.x *= s
        self.y *= s
        self.z *= s
        return True

    def add(self, v):
        self.x += v.x
        self.y += v.y
        self.z += v.z
        return True

    def subtract(self, v):
        self.x -= v.x
        self.y -= v.y
        self.z -= v.z
        return True

    def dotProduct(self, v):
        return self.x * v.x + self.y * v.y + self.z * v.z

    def crossProduct(self, v):
        return Vector3D(self.y * v.z - self.z * v.y, self.z * v.x - self.x * v.z, self.x * v.y - self.y * v.x)

    def angleTo(self, v):
        d = self.length * v.length
        return math.acos(max(-1.0, min(1.0, self.dotProduct(v) / d))) if d > 1e-15 else 0.0

    def isParallelTo(self, v):
        return self.crossProduct(v).length < 1e-9 * max(1.0, self.length * v.length)

    def isPerpendicularTo(self, v):
        return abs(self.dotProduct(v)) < 1e-9 * max(1.0, self.length * v.length)

    def isEqualTo(self, v):
        return abs(self.x - v.x) + abs(self.y - v.y) + abs(self.z - v.z) < 1e-9

    def asPoint(self):
        return Point3D(self.x, self.y, self.z)

    def transformBy(self, m):
        a = m._m
        x, y, z = self.x, self.y, self.z
        self.x = a[0] * x + a[1] * y + a[2] * z
        self.y = a[4] * x + a[5] * y + a[6] * z
        self.z = a[8] * x + a[9] * y + a[10] * z
        return True

    def __repr__(self):
        return 'Vector3D(%g, %g, %g)' % (self.x, self.y, self.z)


class Vector2D(Base):
    def __init__(self, x=0.0, y=0.0):
        self.x, self.y = float(x), float(y)

    @staticmethod
    def create(x=0.0, y=0.0):
        return Vector2D(x, y)

    @property
    def length(self):
        return math.hypot(self.x, self.y)


class Matrix3D(Base):
    def __init__(self):
        self._m = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]

    @staticmethod
    def create():
        return Matrix3D()

    @property
    def translation(self):
        return Vector3D(self._m[3], self._m[7], self._m[11])

    @translation.setter
    def translation(self, v):
        self._m[3], self._m[7], self._m[11] = v.x, v.y, v.z

    def getCell(self, r, c):
        return self._m[r * 4 + c]

    def setCell(self, r, c, v):
        self._m[r * 4 + c] = float(v)
        return True

    def asArray(self):
        return list(self._m)

    def setToIdentity(self):
        self.__init__()
        return True

    def setToRotation(self, angle, axis, origin):
        a = axis.copy()
        a.normalize()
        c, s, t = math.cos(angle), math.sin(angle), 1 - math.cos(angle)
        x, y, z = a.x, a.y, a.z
        r = [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
             t * x * y + s * z, t * y * y + c, t * y * z - s * x,
             t * x * z - s * y, t * y * z + s * x, t * z * z + c]
        o = origin
        tx = o.x - (r[0] * o.x + r[1] * o.y + r[2] * o.z)
        ty = o.y - (r[3] * o.x + r[4] * o.y + r[5] * o.z)
        tz = o.z - (r[6] * o.x + r[7] * o.y + r[8] * o.z)
        self._m = [r[0], r[1], r[2], tx, r[3], r[4], r[5], ty, r[6], r[7], r[8], tz, 0, 0, 0, 1.0]
        return True


class BoundingBox3D(Base):
    def __init__(self, a=None, b=None):
        self.minPoint = a or Point3D()
        self.maxPoint = b or Point3D()

    @staticmethod
    def create(minPoint, maxPoint):
        return BoundingBox3D(minPoint.copy(), maxPoint.copy())

    def contains(self, p):
        return all(getattr(self.minPoint, k) - 1e-9 <= getattr(p, k) <= getattr(self.maxPoint, k) + 1e-9 for k in 'xyz')


class Plane(Base):
    def __init__(self, origin=None, normal=None, u=None):
        self.origin = origin or Point3D()
        self.normal = normal or Vector3D(0, 0, 1)
        self.uDirection = u
        self.vDirection = None

    @staticmethod
    def create(origin, normal):
        return Plane(origin.copy(), normal.copy())

    def isParallelToPlane(self, p):
        return self.normal.isParallelTo(p.normal)


class Line3D(Base):
    def __init__(self, a, b):
        self.startPoint, self.endPoint = a, b

    @staticmethod
    def create(a, b):
        return Line3D(a.copy(), b.copy())


class Circle3D(Base):
    def __init__(self, c, n, r):
        self.center, self.normal, self.radius = c, n, r


class Cylinder(Base):
    def __init__(self, origin, axis, radius):
        self.origin, self.axis, self.radius = origin, axis, radius


class Surface(Base):
    def __init__(self, kind):
        self.surfaceType = kind


# ---------------------------------------------------------------- values
class ValueTypes(object):
    RealValueType = 0
    StringValueType = 1
    ObjectValueType = 2
    BooleanValueType = 3


class ValueInput(Base):
    def __init__(self, kind, value):
        self.valueType = kind
        self._v = value

    @staticmethod
    def createByReal(value):
        return ValueInput(ValueTypes.RealValueType, float(value))

    @staticmethod
    def createByString(value):
        return ValueInput(ValueTypes.StringValueType, str(value))

    @staticmethod
    def createByObject(value):
        return ValueInput(ValueTypes.ObjectValueType, value)

    @staticmethod
    def createByBoolean(value):
        return ValueInput(ValueTypes.BooleanValueType, bool(value))

    @property
    def realValue(self):
        return self._v if self.valueType == ValueTypes.RealValueType else 0.0

    @property
    def stringValue(self):
        return self._v if self.valueType == ValueTypes.StringValueType else ''

    @property
    def objectValue(self):
        return self._v if self.valueType == ValueTypes.ObjectValueType else None

    @property
    def booleanValue(self):
        return bool(self._v)

    def _app(self, kind='length'):
        """The value for a WerkFab feature field: a number (mm or degrees) or an expression "=…"."""
        if self.valueType == ValueTypes.RealValueType:
            return round(_to_app(self._v, kind), 9)
        if self.valueType == ValueTypes.StringValueType:
            expr, named = _convert_expr(self._v, kind)
            if named:
                return '=' + expr
            return round(_eval_app(expr), 9)
        if self.valueType == ValueTypes.BooleanValueType:
            return self._v
        raise RuntimeError('ValueInput.createByObject wird hier nicht unterstützt')

    def _num(self, kind='length'):
        v = self._app(kind)
        return _eval_app(v[1:]) if isinstance(v, str) else float(v)


# ---------------------------------------------------------------- events
class EventHandler(Base):
    def notify(self, args):
        pass


class CommandCreatedEventHandler(EventHandler):
    pass


class CommandEventHandler(EventHandler):
    pass


class InputChangedEventHandler(EventHandler):
    pass


class ValidateInputsEventHandler(EventHandler):
    pass


class SelectionEventHandler(EventHandler):
    pass


class ApplicationEventHandler(EventHandler):
    pass


class DocumentEventHandler(EventHandler):
    pass


class WorkspaceEventHandler(EventHandler):
    pass


class UserInterfaceGeneralEventHandler(EventHandler):
    pass


class CustomEventHandler(EventHandler):
    pass


class Event(Base):
    def __init__(self, name=''):
        self.name = name
        self._handlers = []

    def add(self, handler):
        if handler not in self._handlers:
            self._handlers.append(handler)
        return True

    def remove(self, handler):
        if handler in self._handlers:
            self._handlers.remove(handler)
            return True
        return False

    def _fire(self, args):
        for h in list(self._handlers):
            h.notify(args) if hasattr(h, 'notify') else h(args)


class EventArgs(Base):
    def __init__(self, firingEvent=None):
        self.firingEvent = firingEvent


class CommandCreatedEventArgs(EventArgs):
    def __init__(self, command):
        EventArgs.__init__(self)
        self.command = command


class CommandEventArgs(EventArgs):
    def __init__(self, command):
        EventArgs.__init__(self)
        self.command = command
        self.executeFailed = False
        self.executeFailedMessage = ''
        self.isValidResult = False
        self.terminationReason = 0


class InputChangedEventArgs(EventArgs):
    def __init__(self, inp, inputs):
        EventArgs.__init__(self)
        self.input = inp
        self.inputs = inputs


class ValidateInputsEventArgs(EventArgs):
    def __init__(self, inputs):
        EventArgs.__init__(self)
        self.inputs = inputs
        self.areInputsValid = True


# ---------------------------------------------------------------- enums
class DialogResults(object):
    DialogError = -1
    DialogOK = 0
    DialogCancel = 1
    DialogYes = 2
    DialogNo = 3


class MessageBoxButtonTypes(object):
    OKButtonType = 0
    OKCancelButtonType = 1
    RetryCancelButtonType = 2
    YesNoButtonType = 3
    YesNoCancelButtonType = 4


class MessageBoxIconTypes(object):
    NoIconIconType = 0
    QuestionIconType = 1
    InformationIconType = 2
    WarningIconType = 3
    CriticalIconType = 4


class DropDownStyles(object):
    TextListDropDownStyle = 0
    LabeledIconDropDownStyle = 1
    CheckBoxDropDownStyle = 2


class DocumentTypes(object):
    FusionDesignDocumentType = 0
    FusionDrawingDocumentType = 1


class LogLevels(object):
    InfoLogLevel = 0
    WarningLogLevel = 1
    ErrorLogLevel = 2


class LogTypes(object):
    ConsoleLogType = 0
    FileLogType = 1


class CommandCreatedEventArgsTerminationReasons(object):
    UnknownTerminationReason = 0
    CompletedTerminationReason = 1
    CancelledTerminationReason = 2


class SelectionCommandInput(Base):
    pass


# ---------------------------------------------------------------- command inputs
class CommandInput(Base):
    _kind = 'none'

    def __init__(self, inputs, id, name):
        self.id, self.name = id, name
        self.isVisible = True
        self.isEnabled = True
        self.tooltip = ''
        self.tooltipDescription = ''
        self.parentCommandInput = None
        self._inputs = inputs

    @property
    def parentCommand(self):
        return self._inputs.command

    @property
    def commandInputs(self):
        return self._inputs

    def deleteMe(self):
        return self._inputs._remove(self)

    def _field(self):
        return None

    def _set(self, v):
        pass


class ValueCommandInput(CommandInput):
    def __init__(self, inputs, id, name, unitType, initialValue):
        CommandInput.__init__(self, inputs, id, name)
        self.unitType = unitType or ''
        self._kindu = _units_kind(self.unitType)
        self.minimumValue = None
        self.maximumValue = None
        self.isMinimumValueInclusive = True
        self.isMaximumValueInclusive = True
        self._app_value = initialValue._num(self._kindu) if isinstance(initialValue, ValueInput) else 0.0

    def _disp(self):
        u = self.unitType.lower()
        if self._kindu == 'length' and u in _LEN_MM:
            return self._app_value / _LEN_MM[u], u
        return self._app_value, ('°' if self._kindu == 'angle' else self.unitType)

    @property
    def value(self):
        return _to_internal(self._app_value, self._kindu)

    @value.setter
    def value(self, v):
        self._app_value = _to_app(float(v), self._kindu)

    @property
    def expression(self):
        v, u = self._disp()
        return ('%g %s' % (v, u)).strip()

    @expression.setter
    def expression(self, s):
        self._app_value = ValueInput.createByString(s)._num(self._kindu)

    @property
    def isValidExpression(self):
        return True

    def _field(self):
        v, u = self._disp()
        return {'key': self.id, 'label': self.name, 'value': round(v, 9), 'unit': u}

    def _set(self, v):
        u = self.unitType.lower()
        v = float(v)
        self._app_value = v * _LEN_MM[u] if self._kindu == 'length' and u in _LEN_MM else v


class FloatSpinnerCommandInput(ValueCommandInput):
    def __init__(self, inputs, id, name, unitType, mn, mx, step, initial):
        ValueCommandInput.__init__(self, inputs, id, name, unitType, ValueInput.createByReal(initial))
        self.minimumValue, self.maximumValue, self.spinStep = mn, mx, step


class IntegerSpinnerCommandInput(CommandInput):
    def __init__(self, inputs, id, name, mn, mx, step, initial):
        CommandInput.__init__(self, inputs, id, name)
        self.minimumValue, self.maximumValue, self.spinStep = mn, mx, step
        self.value = int(initial)

    def _field(self):
        return {'key': self.id, 'label': self.name, 'value': self.value}

    def _set(self, v):
        self.value = int(round(float(v)))
        if self.minimumValue is not None:
            self.value = max(int(self.minimumValue), self.value)
        if self.maximumValue is not None:
            self.value = min(int(self.maximumValue), self.value)


class SliderCommandInput(CommandInput):
    def __init__(self, inputs, id, name, mn, mx, initial, integer):
        CommandInput.__init__(self, inputs, id, name)
        self.minimumValue, self.maximumValue = mn, mx
        self.valueOne = initial
        self.valueTwo = initial
        self._int = integer

    def _field(self):
        return {'key': self.id, 'label': self.name, 'value': self.valueOne}

    def _set(self, v):
        v = float(v)
        self.valueOne = int(round(v)) if self._int else v


class BoolValueCommandInput(CommandInput):
    def __init__(self, inputs, id, name, isCheckBox, initial):
        CommandInput.__init__(self, inputs, id, name)
        self.isCheckBox = isCheckBox
        self.value = bool(initial)

    def _field(self):
        return {'key': self.id, 'label': self.name, 'value': self.value, 'check': True}

    def _set(self, v):
        self.value = bool(v)


class StringValueCommandInput(CommandInput):
    def __init__(self, inputs, id, name, initial):
        CommandInput.__init__(self, inputs, id, name)
        self.value = str(initial or '')
        self.isPassword = False
        self.isReadOnly = False

    def _field(self):
        return {'key': self.id, 'label': self.name, 'value': self.value, 'text': True}

    def _set(self, v):
        self.value = str(v)


class TextBoxCommandInput(CommandInput):
    def __init__(self, inputs, id, name, text, rows, readOnly):
        CommandInput.__init__(self, inputs, id, name)
        self.formattedText = text or ''
        self.numRows = rows
        self.isReadOnly = readOnly

    @property
    def text(self):
        return re.sub(r'<[^>]+>', '', self.formattedText)

    @text.setter
    def text(self, v):
        self.formattedText = str(v)

    def _field(self):
        if self.isReadOnly:
            return {'key': self.id, 'hint': self.text}
        return {'key': self.id, 'label': self.name, 'value': self.text, 'text': True}

    def _set(self, v):
        self.formattedText = str(v)


class ListItem(Base):
    def __init__(self, name, selected, index):
        self.name, self.isSelected, self.index = name, selected, index
        self.icon = ''

    def deleteMe(self):
        return True


class ListItems(_List):
    def __init__(self, owner):
        _List.__init__(self)
        self._owner = owner

    def add(self, name, isSelected=False, icon='', beforeIndex=-1):
        it = ListItem(name, bool(isSelected), len(self._items))
        if isSelected and not self._owner._multi:
            for x in self._items:
                x.isSelected = False
        self._items.append(it)
        return it

    def addSeparator(self, beforeIndex=-1):
        return None

    def clear(self):
        self._items = []
        return True


class DropDownCommandInput(CommandInput):
    def __init__(self, inputs, id, name, style=0, multi=False):
        CommandInput.__init__(self, inputs, id, name)
        self.dropDownStyle = style
        self._multi = multi or style == DropDownStyles.CheckBoxDropDownStyle
        self.listItems = ListItems(self)
        self.maxVisibleItems = 10

    @property
    def selectedItem(self):
        for x in self.listItems:
            if x.isSelected:
                return x
        return self.listItems.item(0)

    def _field(self):
        names = [x.name for x in self.listItems]
        if self._multi:
            return [{'key': self.id + '\u0001' + str(i), 'label': '%s: %s' % (self.name, x.name), 'value': x.isSelected, 'check': True} for i, x in enumerate(self.listItems)]
        sel = self.selectedItem
        return {'key': self.id, 'label': self.name, 'value': sel.name if sel else '', 'options': [[n, n] for n in names]}

    def _set(self, v):
        for x in self.listItems:
            x.isSelected = x.name == v


class RadioButtonGroupCommandInput(DropDownCommandInput):
    pass


class ButtonRowCommandInput(DropDownCommandInput):
    pass


class GroupCommandInput(CommandInput):
    def __init__(self, inputs, id, name):
        CommandInput.__init__(self, inputs, id, name)
        self.children = CommandInputs(inputs.command, self)
        self.isExpanded = True
        self.isEnabledCheckBoxDisplayed = False


class TabCommandInput(GroupCommandInput):
    pass


class UnsupportedCommandInput(CommandInput):
    def __init__(self, inputs, id, name, what):
        CommandInput.__init__(self, inputs, id, name)
        self._what = what
        self.selectionCount = 0
        self.value = 0.0

    def selection(self, i):
        return None

    def addSelectionFilter(self, f):
        return True

    def setSelectionLimits(self, a, b=0):
        return True

    def clearSelection(self):
        return True

    def _field(self):
        return {'key': self.id, 'hint': '%s: %s' % (self.name, self._what)}


class CommandInputs(_List):
    def __init__(self, command, parent=None):
        _List.__init__(self)
        self.command = command
        self._parent = parent

    def _add(self, inp):
        inp.parentCommandInput = self._parent
        self._items.append(inp)
        return inp

    def _remove(self, inp):
        if inp in self._items:
            self._items.remove(inp)
            return True
        return False

    def itemById(self, id):
        for x in self._items:
            if x.id == id:
                return x
            ch = getattr(x, 'children', None)
            if ch is not None:
                r = ch.itemById(id)
                if r is not None:
                    return r
        return None

    def _flat(self):
        for x in self._items:
            yield x
            ch = getattr(x, 'children', None)
            if ch is not None:
                for y in ch._flat():
                    yield y

    def addValueInput(self, id, name, unitType, initialValue):
        return self._add(ValueCommandInput(self, id, name, unitType, initialValue))

    def addDistanceValueCommandInput(self, id, name, initialValue):
        return self._add(ValueCommandInput(self, id, name, 'cm', initialValue))

    def addAngleValueCommandInput(self, id, name, initialValue):
        return self._add(ValueCommandInput(self, id, name, 'deg', initialValue))

    def addBoolValueInput(self, id, name, isCheckBox, resourceFolder='', initialValue=False):
        return self._add(BoolValueCommandInput(self, id, name, isCheckBox, initialValue))

    def addStringValueInput(self, id, name, initialValue=''):
        return self._add(StringValueCommandInput(self, id, name, initialValue))

    def addTextBoxCommandInput(self, id, name, formattedText, numRows=1, isReadOnly=True):
        return self._add(TextBoxCommandInput(self, id, name, formattedText, numRows, isReadOnly))

    def addIntegerSpinnerCommandInput(self, id, name, min, max, spinStep, initialValue):
        return self._add(IntegerSpinnerCommandInput(self, id, name, min, max, spinStep, initialValue))

    def addFloatSpinnerCommandInput(self, id, name, unitType, min, max, spinStep, initialValue):
        return self._add(FloatSpinnerCommandInput(self, id, name, unitType, min, max, spinStep, initialValue))

    def addIntegerSliderCommandInput(self, id, name, min, max, hasTwoSliders=False):
        return self._add(SliderCommandInput(self, id, name, min, max, min, True))

    def addFloatSliderCommandInput(self, id, name, unitType, min, max, hasTwoSliders=False):
        return self._add(SliderCommandInput(self, id, name, min, max, min, False))

    def addDropDownCommandInput(self, id, name, dropDownStyle=0):
        return self._add(DropDownCommandInput(self, id, name, dropDownStyle))

    def addRadioButtonGroupCommandInput(self, id, name=''):
        return self._add(RadioButtonGroupCommandInput(self, id, name))

    def addButtonRowCommandInput(self, id, name, isMultiSelectEnabled=False):
        return self._add(ButtonRowCommandInput(self, id, name, 0, isMultiSelectEnabled))

    def addGroupCommandInput(self, id, name):
        return self._add(GroupCommandInput(self, id, name))

    def addTabCommandInput(self, id, name, resourceFolder=''):
        return self._add(TabCommandInput(self, id, name))

    def addSelectionInput(self, id, name, commandPrompt=''):
        return self._add(UnsupportedCommandInput(self, id, name, 'Auswahl im Modell wird von Skripten hier nicht unterstützt'))

    def addImageCommandInput(self, id, name, imageFile):
        return self._add(UnsupportedCommandInput(self, id, name, ''))

    def addSeparatorCommandInput(self, id):
        return self._add(UnsupportedCommandInput(self, id, '', ''))


# ---------------------------------------------------------------- commands
class Command(Base):
    def __init__(self, definition):
        self.parentCommandDefinition = definition
        self.commandInputs = CommandInputs(self)
        self.execute = Event('execute')
        self.executePreview = Event('executePreview')
        self.inputChanged = Event('inputChanged')
        self.validateInputs = Event('validateInputs')
        self.destroy = Event('destroy')
        self.activate = Event('activate')
        self.deactivate = Event('deactivate')
        self.select = Event('select')
        self.preSelect = Event('preSelect')
        self.unselect = Event('unselect')
        self.keyDown = Event('keyDown')
        self.mouseClick = Event('mouseClick')
        self.okButtonText = 'OK'
        self.cancelButtonText = ''
        self.isOKButtonVisible = True
        self.isRepeatable = False
        self.isExecutedWhenPreEmpted = True
        self.isPositionDependent = False
        self.helpFile = ''

    def setDialogInitialSize(self, w, h):
        return True

    def setDialogMinimumSize(self, w, h):
        return True

    def setDialogSize(self, w, h):
        return True

    def doExecute(self, terminate=True):
        return True

    def _fields(self):
        out = []
        for x in self.commandInputs._flat():
            if not x.isVisible:
                continue
            f = x._field()
            if isinstance(f, list):
                out.extend(f)
            elif f:
                out.append(f)
        return out

    def _apply(self, values):
        multi = {}
        for k, v in values.items():
            if '\u0001' in k:
                key, idx = k.split('\u0001')
                multi.setdefault(key, {})[int(idx)] = v
                continue
            x = self.commandInputs.itemById(k)
            if x is not None:
                x._set(v)
        for key, sel in multi.items():
            x = self.commandInputs.itemById(key)
            for i, it in enumerate(x.listItems):
                if i in sel:
                    it.isSelected = bool(sel[i])


class ControlDefinition(Base):
    def __init__(self, name):
        self.name = name
        self.isEnabled = True
        self.isVisible = True
        self.tooltip = ''


class CommandDefinition(Base):
    def __init__(self, defs, id, name, tooltip='', resourceFolder=''):
        self._defs = defs
        self.id, self.name, self.tooltip = id, name, tooltip
        self.resourceFolder = resourceFolder
        self.toolClipFilename = ''
        self.commandCreated = Event('commandCreated')
        self.controlDefinition = ControlDefinition(name)

    def execute(self, input=None):
        import _wf_runtime
        _wf_runtime.run_command(self)
        return True

    def deleteMe(self):
        return self._defs._remove(self)


class CommandDefinitions(_List):
    def addButtonDefinition(self, id, name, tooltip='', resourceFolder=''):
        if self.itemById(id) is not None:
            raise RuntimeError('Eine Befehlsdefinition mit der Kennung "%s" gibt es schon' % id)
        d = CommandDefinition(self, id, name, tooltip, resourceFolder)
        self._items.append(d)
        return d

    def addCheckBoxDefinition(self, id, name, tooltip='', isChecked=False):
        return self.addButtonDefinition(id, name, tooltip)

    def addListDefinition(self, id, name, listControlDisplayType=0, resourceFolder=''):
        return self.addButtonDefinition(id, name, '')

    def _remove(self, d):
        if d in self._items:
            self._items.remove(d)
            import _wf_runtime
            _wf_runtime.drop_command(d.id)
            return True
        return False


class ToolbarControl(Base):
    def __init__(self, controls, definition, id):
        self._controls = controls
        self.commandDefinition = definition
        self.id = id
        self.isPromoted = False
        self.isPromotedByDefault = False
        self.isVisible = True

    def deleteMe(self):
        return self._controls._remove(self)


class ToolbarDropDown(Base):
    def __init__(self, controls, id, name):
        self._controls = controls
        self.id, self.name = id, name
        self.controls = ToolbarControls(controls._panel)
        self.isVisible = True

    def deleteMe(self):
        return self._controls._remove(self)


class ToolbarControls(_List):
    def __init__(self, panel):
        _List.__init__(self)
        self._panel = panel

    def addCommand(self, commandDefinition, positionID='', isBefore=False):
        import _wf_runtime
        c = ToolbarControl(self, commandDefinition, commandDefinition.id)
        self._items.append(c)
        _wf_runtime.add_button(commandDefinition, self._panel.id if self._panel else '')
        return c

    def addDropDown(self, text, resourceFolder='', id='', positionID='', isBefore=False):
        d = ToolbarDropDown(self, id or text, text)
        self._items.append(d)
        return d

    def addSeparator(self, id='', positionID='', isBefore=False):
        return None

    def _remove(self, c):
        if c in self._items:
            self._items.remove(c)
            import _wf_runtime
            if isinstance(c, ToolbarControl):
                _wf_runtime.drop_button(c.id)
            return True
        return False


class ToolbarPanel(Base):
    def __init__(self, id, name=''):
        self.id, self.name = id, name or id
        self.controls = ToolbarControls(self)
        self.isVisible = True

    def deleteMe(self):
        return True


class ToolbarPanels(_List):
    def itemById(self, id):
        for p in self._items:
            if p.id == id:
                return p
        p = ToolbarPanel(id)
        self._items.append(p)
        return p

    def add(self, id, name, positionID='', isBefore=False):
        p = ToolbarPanel(id, name)
        self._items.append(p)
        return p


class ToolbarTab(Base):
    def __init__(self, id, panels):
        self.id = id
        self.name = id
        self.toolbarPanels = panels


class ToolbarTabs(_List):
    def __init__(self, panels):
        _List.__init__(self)
        self._panels = panels

    def itemById(self, id):
        return ToolbarTab(id, self._panels)

    def add(self, id, name):
        return ToolbarTab(id, self._panels)


class Workspace(Base):
    def __init__(self, id, panels):
        self.id = id
        self.name = id
        self.toolbarPanels = panels
        self.toolbarTabs = ToolbarTabs(panels)
        self.isActive = True

    def activate(self):
        return True


class Workspaces(_List):
    def __init__(self, panels):
        _List.__init__(self)
        self._panels = panels

    def itemById(self, id):
        return Workspace(id, self._panels)


class Palette(Base):
    def __init__(self, id, name):
        self.id, self.name = id, name
        self.isVisible = True

    def writeText(self, text):
        _call('log', text=str(text))
        return True

    def sendInfoToHTML(self, action, data):
        return ''


class Palettes(_List):
    def itemById(self, id):
        if id == 'TextCommands':
            return Palette(id, 'Text Commands')
        return None

    def add(self, *a, **k):
        raise RuntimeError('HTML-Paletten werden von Skripten hier nicht unterstützt')


class Selections(_List):
    def add(self, entity):
        return False

    def clear(self):
        return True


class Toolbars(_List):
    def itemById(self, id):
        return ToolbarPanel(id)


class UserInterface(Base):
    def __init__(self):
        self.commandDefinitions = CommandDefinitions()
        self.allToolbarPanels = ToolbarPanels()
        self.workspaces = Workspaces(self.allToolbarPanels)
        self.allToolbarTabs = ToolbarTabs(self.allToolbarPanels)
        self.toolbars = Toolbars()
        self.palettes = Palettes()
        self.activeSelections = Selections()
        self.commandCreated = Event('commandCreated')
        self.commandStarting = Event('commandStarting')
        self.commandTerminated = Event('commandTerminated')
        self.activeSelectionChanged = Event('activeSelectionChanged')
        self.workspaceActivated = Event('workspaceActivated')
        self.isTabbedToolbarUI = True

    @property
    def activeWorkspace(self):
        return Workspace('FusionSolidEnvironment', self.allToolbarPanels)

    @property
    def activeCommand(self):
        return 'SelectCommand'

    def messageBox(self, text, title='', buttons=0, icon=0):
        t = str(text)
        if buttons in (MessageBoxButtonTypes.OKCancelButtonType, MessageBoxButtonTypes.YesNoButtonType, MessageBoxButtonTypes.YesNoCancelButtonType, MessageBoxButtonTypes.RetryCancelButtonType):
            ok = _call('confirm', text=t, title=str(title))
            if buttons in (MessageBoxButtonTypes.YesNoButtonType, MessageBoxButtonTypes.YesNoCancelButtonType):
                return DialogResults.DialogYes if ok else DialogResults.DialogNo
            return DialogResults.DialogOK if ok else DialogResults.DialogCancel
        _call('message', text=t, title=str(title))
        return DialogResults.DialogOK

    def inputBox(self, prompt, title='', defaultValue=''):
        r = _call('input', text=str(prompt), title=str(title), value=str(defaultValue))
        if r is None:
            return ['', True]
        return [r, False]

    def selectEntity(self, prompt, filter):
        raise RuntimeError('Auswahl im Modell („selectEntity“) wird von Skripten hier nicht unterstützt')

    def terminateActiveCommand(self):
        return True


# ---------------------------------------------------------------- application
class Viewport(Base):
    def fit(self):
        _call('fit')
        return True

    def refresh(self):
        return True

    def saveAsImageFile(self, filename, width=0, height=0):
        raise RuntimeError('Bilder speichern wird von Skripten hier nicht unterstützt')

    @property
    def camera(self):
        raise RuntimeError('Kamera wird von Skripten hier nicht unterstützt')


class Document(Base):
    def __init__(self, app):
        self._app = app
        self.isModified = True
        self.isSaved = False

    @property
    def name(self):
        return _call('docName')

    @property
    def design(self):
        return self._app.activeProduct

    @property
    def products(self):
        return _List([self._app.activeProduct])

    def activate(self):
        return True

    def close(self, saveChanges=False):
        return True

    def save(self, description=''):
        return True


class Documents(_List):
    def __init__(self, app):
        _List.__init__(self)
        self._app = app

    def _all(self):
        return [self._app.activeDocument]

    def add(self, documentType=0, visible=True, options=None):
        if not _call('newDocument'):
            raise RuntimeError('Neues Design abgebrochen')
        return self._app.activeDocument


class Application(Base):
    _instance = None

    def __init__(self):
        self.userInterface = UserInterface()
        self.activeViewport = Viewport()
        self.documents = Documents(self)
        self.startupCompleted = Event('startupCompleted')
        self.documentOpened = Event('documentOpened')
        self.documentActivated = Event('documentActivated')
        self.documentSaving = Event('documentSaving')
        self.onlineStatusChanged = Event('onlineStatusChanged')
        self.isStartupComplete = True
        self.version = '2.0.0-werkfab'
        self.currentUser = None

    @staticmethod
    def get():
        if Application._instance is None:
            Application._instance = Application()
        return Application._instance

    @property
    def activeProduct(self):
        from . import fusion
        return fusion.Design._get()

    @property
    def activeDocument(self):
        return Document(self)

    @property
    def activeEditObject(self):
        return self.activeProduct.rootComponent

    def log(self, message, level=0, type=0):
        _call('log', text=str(message), level=level)
        return True

    def registerCustomEvent(self, id):
        return Event(id)

    def unregisterCustomEvent(self, id):
        return True

    def fireCustomEvent(self, id, info=''):
        return False

    def executeTextCommand(self, cmd):
        raise RuntimeError('Textbefehle werden von Skripten hier nicht unterstützt')
