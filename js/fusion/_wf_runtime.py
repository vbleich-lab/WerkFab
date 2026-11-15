# Runs scripts and add-ins: imports them as packages, calls run(context) / stop(context), and connects the
# commands an add-in puts into the toolbar with the dialogs of the app.
import importlib
import json
import sys

import _werkfab
import adsk
import adsk.core
import adsk.fusion

_running = {}      # key → module of a running add-in
_owner = {}        # command id → key of the add-in that made the button
_pending = {}      # command id → Command waiting for its dialog
_current = None
_stop_now = set()


def _ctx(startup=False):
    return {'IsApplicationStartup': bool(startup)}


def flush():
    for f in list(adsk.core._flushers):
        f()


def _purge(pkg):
    for m in [m for m in sys.modules if m == pkg or m.startswith(pkg + '.')]:
        del sys.modules[m]
    importlib.invalidate_caches()


def run(key, pkg, stem, kind, startup=False):
    global _current
    if key in _running:
        stop(key)
    _purge(pkg)
    adsk.fusion.Design._reset()
    adsk._auto_terminate = True
    _current = key
    _stop_now.discard(key)
    try:
        mod = importlib.import_module(pkg + '.' + stem)
        fn = getattr(mod, 'run', None)
        if fn is None:
            raise RuntimeError('Das Skript hat keine Funktion run(context)')
        fn(_ctx(startup))
    finally:
        flush()
        _current = None
    keep = (kind == 'addin' or not adsk._auto_terminate) and key not in _stop_now
    if keep:
        _running[key] = mod
    return json.dumps({'running': keep})


def stop(key):
    global _current
    mod = _running.pop(key, None)
    err = None
    if mod is not None and hasattr(mod, 'stop'):
        _current = key
        try:
            mod.stop(_ctx())
        except Exception as e:  # report, but remove the buttons anyway
            import traceback
            err = traceback.format_exc()
        finally:
            flush()
            _current = None
    for cid in [c for c, k in _owner.items() if k == key]:
        _werkfab.call('dropButton', json.dumps({'id': cid}))
        del _owner[cid]
    ui = adsk.core.Application.get().userInterface
    return json.dumps({'stopped': True, 'error': err})


def terminate_current():
    if _current:
        _stop_now.add(_current)


def add_button(defn, panel):
    _owner[defn.id] = _current or _owner.get(defn.id, '')
    _werkfab.call('addButton', json.dumps({'id': defn.id, 'name': defn.name, 'tooltip': defn.tooltip, 'panel': panel, 'owner': _owner[defn.id]}))


def drop_button(cid):
    _werkfab.call('dropButton', json.dumps({'id': cid}))
    _owner.pop(cid, None)


def drop_command(cid):
    drop_button(cid)


def _definition(cid):
    return adsk.core.Application.get().userInterface.commandDefinitions.itemById(cid)


def run_command(defn):
    _werkfab.call('runCommand', json.dumps({'id': defn.id}))


def created(cid):
    """The dialog for a command: fire commandCreated, return its inputs as dialog fields."""
    global _current
    d = _definition(cid)
    if d is None:
        raise RuntimeError('Den Befehl „%s“ gibt es nicht mehr' % cid)
    adsk.fusion.Design._reset()
    cmd = adsk.core.Command(d)
    _current = _owner.get(cid)
    try:
        d.commandCreated._fire(adsk.core.CommandCreatedEventArgs(cmd))
    finally:
        flush()
        _current = None
    _pending[cid] = cmd
    fields = cmd._fields()
    return json.dumps({'title': d.name, 'fields': fields, 'ok': cmd.okButtonText or 'OK', 'hasExecute': bool(cmd.execute._handlers)})


def execute(cid, values):
    """OK in the dialog (values: JSON of the fields) or cancel (values None)."""
    global _current
    cmd = _pending.pop(cid, None)
    if cmd is None:
        return json.dumps({'ok': False})
    _current = _owner.get(cid)
    res = {'ok': True}
    try:
        if values is not None:
            vals = json.loads(values)
            before = {f['key']: f.get('value') for f in cmd._fields() if 'key' in f}
            cmd._apply(vals)
            for k, v in vals.items():
                if before.get(k) != v:
                    x = cmd.commandInputs.itemById(k.split('\u0001')[0])
                    if x is not None:
                        cmd.inputChanged._fire(adsk.core.InputChangedEventArgs(x, cmd.commandInputs))
            va = adsk.core.ValidateInputsEventArgs(cmd.commandInputs)
            cmd.validateInputs._fire(va)
            if not va.areInputsValid:
                res = {'ok': False, 'invalid': True}
            else:
                args = adsk.core.CommandEventArgs(cmd)
                cmd.execute._fire(args)
                if args.executeFailed:
                    res = {'ok': False, 'failed': args.executeFailedMessage or 'Der Befehl ist fehlgeschlagen'}
        cmd.destroy._fire(adsk.core.CommandEventArgs(cmd))
    finally:
        flush()
        _current = None
    return json.dumps(res)


def running():
    return json.dumps(sorted(_running))
