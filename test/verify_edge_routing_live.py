#!/usr/bin/env python3
"""
Check line style, edge waypoints and routing against a live StarUML.

The offline mock reproduces the two engine rules that matter here (a self-link
is forced back to rectilinear, and a waypoint inside an end box is dropped) but
it does not run EdgeView.arrange. So it cannot show that the engine keeps the
middle points of a route it was handed, which is the assumption the whole
routing endpoint rests on. Only a live run shows that.

Safety: this script parks the open project in a copy, switches to an empty one
before writing anything, and reopens the original from a finally block. It never
writes to the project that was open. The order is the one
run_integration_safely.sh uses, and for the same reason: project:new raises a
modal save dialog when the repository is dirty, and a modal blocks the HTTP
server this script is talking to.

Run: python3 test/verify_edge_routing_live.py [port]
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

PORT = sys.argv[1] if len(sys.argv) > 1 else "12345"
BASE = "http://localhost:%s" % PORT
PRE_MDJ = "/tmp/staruml_route_pre_%d.mdj" % os.getpid()
WORK_MDJ = "/tmp/staruml_route_work_%d.mdj" % os.getpid()

passed = 0
failed = 0


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {"success": False, "error": "HTTP %s" % e.code}
    except Exception as e:
        return {"success": False, "error": str(e)}


def enc(s):
    return urllib.parse.quote(s, safe="")


def check(label, cond, detail=None):
    global passed, failed
    if cond:
        passed += 1
        print("OK   " + label)
    else:
        failed += 1
        print("FAIL " + label + ("  -> " + json.dumps(detail, ensure_ascii=False) if detail is not None else ""))


def points_of(view_id):
    r = call("GET", "/api/diagrams/%s/views" % enc(DIAGRAM))
    for v in r.get("data") or []:
        if v.get("_id") == view_id:
            return v.get("points")
    return None


def view_of(view_id):
    r = call("GET", "/api/diagrams/%s/views" % enc(DIAGRAM))
    for v in r.get("data") or []:
        if v.get("_id") == view_id:
            return v
    return None


def inside(p, box, margin=0):
    return (box["left"] - margin <= p["x"] <= box["left"] + box["width"] + margin and
            box["top"] - margin <= p["y"] <= box["top"] + box["height"] + margin)


print("== 1. Server and build ==")
status = call("GET", "/api/status")
if not status.get("success"):
    print("ABORT: no answer from %s. Start the server (Tools > StarUML Controller)." % BASE)
    sys.exit(1)
ORIGINAL = (status.get("data") or {}).get("project", {}).get("filename") or ""
print("   current project: %s" % (ORIGINAL or "<none>"))

# The field whitelist is checked before findById, so a made-up id probes whether
# the route exists without touching anything.
probe = call("PUT", "/api/views/probe-not-a-real-id/points", {"points": [{"x": 0, "y": 0}, {"x": 1, "y": 1}]})
if "Not found: PUT" in (probe.get("error") or ""):
    print("ABORT: StarUML is running a build without PUT /api/views/:id/points.")
    print("       Quit StarUML (Cmd+Q), reopen it, start the server, then rerun.")
    sys.exit(1)
if "View not found" not in (probe.get("error") or ""):
    print("ABORT: unexpected probe answer: %s" % probe.get("error"))
    sys.exit(1)
print("   build under test is loaded.")

print("== 2. Parking the open project ==")
saved = call("POST", "/api/project/save", {"path": PRE_MDJ})
if not saved.get("success"):
    print("ABORT: could not park the open project; refusing to risk a modal dialog.")
    print(json.dumps(saved, ensure_ascii=False)[:400])
    sys.exit(1)
print("   copy of what was open: %s" % PRE_MDJ)
print("   NOTE: unsaved changes went into that copy, not into the original file.")

created = call("POST", "/api/project/new", {})
if not created.get("success"):
    print("ABORT: could not create an empty project.")
    print(json.dumps(created, ensure_ascii=False)[:400])
    sys.exit(1)
call("POST", "/api/project/save", {"path": WORK_MDJ})
now = (call("GET", "/api/status").get("data") or {}).get("project", {}).get("filename") or ""
if ORIGINAL and now == ORIGINAL:
    print("ABORT: still on the original project. Refusing to write to it.")
    sys.exit(1)
print("   working project: %s" % (now or "<unsaved>"))

DIAGRAM = None
try:
    print("== 3. Fixture: three boxes in a row, one edge across them ==")
    d = call("POST", "/api/diagrams", {"type": "UMLClassDiagram", "name": "RouteCheck"})
    DIAGRAM = d["data"]["_id"]
    call("POST", "/api/diagrams/%s/open" % enc(DIAGRAM), {})

    def box(name, x1, y1, x2, y2):
        r = call("POST", "/api/diagrams/%s/elements" % enc(DIAGRAM),
                 {"type": "UMLClass", "name": name, "x1": x1, "y1": y1, "x2": x2, "y2": y2})
        return r["data"]["_id"], r["data"]["modelId"]

    a_vid, a_mid = box("A", 40, 300, 190, 380)
    b_vid, b_mid = box("B", 640, 300, 790, 380)
    # Dead centre between them, so a straight A-to-B line runs through it.
    blk_vid, blk_mid = box("Blocker", 360, 290, 470, 390)

    rel = call("POST", "/api/diagrams/%s/relations" % enc(DIAGRAM),
               {"type": "UMLAssociation", "sourceId": a_mid, "targetId": b_mid})
    edge = rel["data"]["_id"]
    check("fixture built", bool(DIAGRAM and a_vid and b_vid and blk_vid and edge),
          {"diagram": DIAGRAM, "edge": edge})

    print("== 4. Line style on the open diagram ==")
    for value, label in ((0, "rectilinear"), (2, "rounded rectilinear"), (3, "curve"), (1, "oblique")):
        r = call("PUT", "/api/views/%s/style" % enc(edge), {"lineStyle": value})
        stored = (r.get("data") or {}).get("lineStyle")
        check("lineStyle %d (%s) is stored and read back" % (value, label),
              r.get("success") and stored == value, {"sent": value, "stored": stored, "ignored": r.get("ignored")})

    r = call("PUT", "/api/views/%s/style" % enc(edge), {"lineStyle": 99})
    check("99 is refused with the allowed values",
          r.get("success") is False and "LS_RECTILINEAR" in (r.get("error") or ""), r.get("error"))

    r = call("PUT", "/api/views/%s/style" % enc(a_vid), {"lineStyle": 1})
    check("lineStyle on a class box is refused",
          r.get("success") is False and "edge views" in (r.get("error") or ""), r.get("error"))

    print("== 5. Line style on a diagram nobody has open ==")
    d2 = call("POST", "/api/diagrams", {"type": "UMLClassDiagram", "name": "Offscreen"})
    off_diagram = d2["data"]["_id"]
    call("POST", "/api/diagrams/%s/open" % enc(off_diagram), {})
    o1 = call("POST", "/api/diagrams/%s/elements" % enc(off_diagram),
              {"type": "UMLClass", "name": "P", "x1": 40, "y1": 40, "x2": 160, "y2": 100})
    o2 = call("POST", "/api/diagrams/%s/elements" % enc(off_diagram),
              {"type": "UMLClass", "name": "Q", "x1": 400, "y1": 40, "x2": 520, "y2": 100})
    orel = call("POST", "/api/diagrams/%s/relations" % enc(off_diagram),
                {"type": "UMLAssociation", "sourceId": o1["data"]["modelId"], "targetId": o2["data"]["modelId"]})
    off_edge = orel["data"]["_id"]
    # Switch away, so the edge is on a diagram the main editor is not showing.
    call("POST", "/api/diagrams/%s/open" % enc(DIAGRAM), {})
    r = call("PUT", "/api/views/%s/style" % enc(off_edge), {"lineStyle": 0})
    check("an edge on a diagram that is not open still takes a line style",
          r.get("success") and (r.get("data") or {}).get("lineStyle") == 0,
          {"stored": (r.get("data") or {}).get("lineStyle"), "ignored": r.get("ignored"), "clamped": r.get("clamped")})

    print("== 6. A self-link reports what the engine actually kept ==")
    selfrel = call("POST", "/api/diagrams/%s/relations" % enc(DIAGRAM),
                   {"type": "UMLAssociation", "sourceId": a_mid, "targetId": a_mid})
    self_edge = (selfrel.get("data") or {}).get("_id")
    if self_edge:
        r = call("PUT", "/api/views/%s/style" % enc(self_edge), {"lineStyle": 1})
        ignored = r.get("ignored") or []
        check("oblique on a self-link is reported as ignored, not as updated",
              r.get("success") and any(i.get("field") == "lineStyle" for i in ignored), r)
        check("and the stored value is the rectilinear the engine forced",
              (r.get("data") or {}).get("lineStyle") == 0, (r.get("data") or {}).get("lineStyle"))
    else:
        print("   SKIP: this build would not create a self-association")

    print("== 7. Waypoints survive an arrange ==")
    call("PUT", "/api/views/%s/style" % enc(edge), {"lineStyle": 1})
    wanted = [{"x": 115, "y": 340}, {"x": 115, "y": 520}, {"x": 715, "y": 520}, {"x": 715, "y": 340}]
    r = call("PUT", "/api/views/%s/points" % enc(edge), {"points": wanted})
    stored = (r.get("data") or {}).get("points") or []
    check("a four-point route is accepted", r.get("success"), r.get("error"))
    check("the engine kept both middle points through its own arrange",
          len(stored) == 4, {"stored": stored})
    if len(stored) == 4:
        check("and kept their coordinates, only snapping the two ends",
              stored[1]["x"] == 115 and stored[1]["y"] == 520 and
              stored[2]["x"] == 715 and stored[2]["y"] == 520, stored)
        check("the ends were snapped to the box borders, not left where they were sent",
              stored[0] != wanted[0] or stored[3] != wanted[3],
              {"sent_ends": [wanted[0], wanted[3]], "stored_ends": [stored[0], stored[-1]]})

    print("== 8. Moving a box: clears by default, keeps when asked ==")
    r = call("PUT", "/api/views/%s" % enc(a_vid), {"top": 305})
    after = points_of(edge) or []
    check("a move clears the route, the way it always has", len(after) == 2, {"points": after})

    call("PUT", "/api/views/%s/points" % enc(edge), {"points": wanted})
    r = call("PUT", "/api/views/%s" % enc(a_vid), {"top": 300, "keepEdgeWaypoints": True})
    after = points_of(edge) or []
    check("keepEdgeWaypoints leaves the waypoints in place", len(after) == 4, {"points": after})

    print("== 9. Routing goes around the box in the way ==")
    r = call("POST", "/api/views/%s/route" % enc(edge), {})
    routed = (r.get("data") or {}).get("points") or []
    check("routing succeeds and names the number of views avoided",
          r.get("success") and "Routed edge around" in (r.get("message") or ""), r.get("error") or r.get("message"))
    check("the route is not a straight line", len(routed) > 2, routed)
    blocker = view_of(blk_vid)
    check("no point of the route sits inside the blocking box",
          blocker is not None and all(not inside(p, blocker) for p in routed),
          {"routed": routed, "blocker": blocker})

    # The claim this endpoint rests on: a redraw does not undo the route.
    call("POST", "/api/diagrams/%s/open" % enc(off_diagram), {})
    call("POST", "/api/diagrams/%s/open" % enc(DIAGRAM), {})
    after = points_of(edge) or []
    check("the route survives a repaint of the diagram",
          len(after) == len(routed), {"before": routed, "after": after})

    # The route is already at right angles, so convObliqueToRectilinear has
    # nothing to convert and the point count should hold exactly.
    r = call("PUT", "/api/views/%s/style" % enc(edge), {"lineStyle": 0})
    after = points_of(edge) or []
    check("switching to rectilinear afterwards keeps the route point for point",
          len(after) == len(routed), {"before": routed, "after": after})

    print("== 10. The route is one undoable operation ==")
    call("PUT", "/api/views/%s/style" % enc(edge), {"lineStyle": 1})
    call("PUT", "/api/views/%s/points" % enc(edge), {"points": wanted})
    before_route = points_of(edge) or []
    call("POST", "/api/views/%s/route" % enc(edge), {})
    r = call("POST", "/api/undo")
    after_undo = points_of(edge) or []
    check("undo puts the previous route back in one step",
          r.get("success") and len(after_undo) == len(before_route),
          {"before": before_route, "after_undo": after_undo})

    r = call("POST", "/api/views/%s/route" % enc(edge), {"grid": 0})
    check("a zero grid is refused", r.get("success") is False, r)

finally:
    print("== Restoring ==")
    call("POST", "/api/project/save", {"path": WORK_MDJ})
    if ORIGINAL:
        out = call("POST", "/api/project/open", {"path": ORIGINAL})
        if out.get("success"):
            print("   reopened: %s" % ORIGINAL)
            try:
                os.remove(WORK_MDJ)
            except OSError:
                pass
            print("   pre-run copy kept at %s" % PRE_MDJ)
        else:
            print("   WARNING: could not reopen %s" % ORIGINAL)
            print("   StarUML still has %s open. The pre-run copy is at %s. Neither is deleted." % (WORK_MDJ, PRE_MDJ))
    else:
        print("   no original to reopen; StarUML still has %s open" % WORK_MDJ)

print("\n%d passed, %d failed" % (passed, failed))
sys.exit(0 if failed == 0 else 1)
