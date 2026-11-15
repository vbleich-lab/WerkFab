# Compatibility layer for scripts and add-ins written for the "adsk" Python interface.
# It maps the commonly used part of that interface onto WerkFab features. Internal units follow the
# original convention: lengths in centimetres, angles in radians; WerkFab stores millimetres and degrees.
from . import core, fusion, cam

_auto_terminate = True


def terminate():
    import _wf_runtime
    _wf_runtime.terminate_current()


def autoTerminate(value=True):
    global _auto_terminate
    _auto_terminate = bool(value)
    return True


def doEvents():
    return True
