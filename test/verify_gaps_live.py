#!/usr/bin/env python3
"""
Check the seven gap fixes against a LIVE StarUML.

!!! THIS SCRIPT WRITES INTO WHATEVER PROJECT IS CURRENTLY OPEN !!!

Do not run it directly to "see if it parses" — every call below is a real HTTP
request, and StarUML has exactly one open project. Run it through
run_integration_safely.sh, which switches to an empty project first and reopens
the original from an EXIT trap. Use `python3 -m py_compile` for a syntax check.

That warning is here because this happened: this file was run once against a
live model to check it compiled, and created a diagram, two classes, a
subsystem, an operation and an association in a real project. They were tracked
down by name and deleted, and the file on disk was never written, but nothing in
the run said "you are about to modify the open project."

Why it exists: test_all_endpoints.sh only asserts success:true on each response,
so it shows nothing was broken — not that these fixes work. The offline unit
tests cover the controller's own logic, but their mock writes properties
straight through, so they cannot show whether StarUML's engine keeps what was
written. This closes that gap.
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://localhost:%s" % (sys.argv[1] if len(sys.argv) > 1 else "12345")

passed = 0
failed = 0
notes = []


def api(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode())
        except Exception:
            return {"success": False, "error": "HTTP %s" % e.code}
    except Exception as e:
        return {"success": False, "error": str(e)}


def enc(i):
    return urllib.parse.quote(str(i), safe="")


def check(label, cond, detail=None):
    global passed, failed
    if cond:
        passed += 1
        print("OK   " + label)
    else:
        failed += 1
        print("FAIL " + label + ("  -> " + json.dumps(detail, ensure_ascii=False) if detail is not None else ""))


def need(label, res, key="data"):
    """Assert a call succeeded and return its data, or abort the section."""
    if not res.get("success"):
        check(label, False, res.get("error"))
        return None
    return res.get(key)


print("=== Gap 6: status reports the manifest version ===")
# Read the expected version from the manifest rather than hardcoding it, so a
# version bump does not turn this check into a false failure.
import os
_manifest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "package.json")
with open(_manifest) as fh:
    EXPECTED_VERSION = json.load(fh)["version"]

st = api("GET", "/api/status")
check("status answers", st.get("success"), st.get("error"))
check("version matches package.json (%s), not the old hardcoded 1.0.0" % EXPECTED_VERSION,
      st.get("data", {}).get("version") == EXPECTED_VERSION, st.get("data", {}).get("version"))

print("\n=== Setting up a scratch class diagram ===")
d = need("create class diagram", api("POST", "/api/class/diagrams", {"name": "GapCheck"}))
if not d:
    print("\ncannot continue without a diagram")
    sys.exit(1)
DID = d["_id"]
check("class diagram created", True)

print("\n=== Gap 5: an element lands where x1/y1 asked ===")
c1 = need("create class at (680,420)",
          api("POST", "/api/class/classes",
              {"diagramId": DID, "name": "Placed", "x1": 680, "y1": 420}))
if c1:
    views = api("GET", "/api/elements/%s/views" % enc(c1["_id"]))
    vlist = views.get("data") or []
    v = vlist[0] if vlist else {}
    check("view left/top match the request",
          v.get("left") == 680 and v.get("top") == 420,
          {"left": v.get("left"), "top": v.get("top"),
           "width": v.get("width"), "height": v.get("height")})

c2 = need("create a second class at (900,600)",
          api("POST", "/api/class/classes",
              {"diagramId": DID, "name": "Second", "x1": 900, "y1": 600}))
if c2:
    vlist = (api("GET", "/api/elements/%s/views" % enc(c2["_id"])).get("data") or [])
    v2 = vlist[0] if vlist else {}
    check("the second element does not stack on the first",
          v2.get("left") == 900 and v2.get("top") == 600,
          {"left": v2.get("left"), "top": v2.get("top")})

print("\n=== Gap 1: lists return only the declared type ===")
sub = api("POST", "/api/class/packages",
          {"diagramId": DID, "name": "ASubsystem", "type": "UMLSubsystem"})
if sub.get("success"):
    comps = api("GET", "/api/component/components")
    types = sorted({e.get("_type") for e in (comps.get("data") or [])})
    check("component list excludes UMLSubsystem",
          "UMLSubsystem" not in types and "UMLUseCaseSubject" not in types, types)
else:
    notes.append("could not create a UMLSubsystem: " + str(sub.get("error")))

deps = api("GET", "/api/class/dependencies")
dep_types = sorted({e.get("_type") for e in (deps.get("data") or [])})
check("dependency list holds no realization subtypes",
      all(t == "UMLDependency" for t in dep_types) if dep_types else True,
      dep_types)

print("\n=== Gap 2: an operation gets a real return type ===")
if c1:
    op = need("create operation",
              api("POST", "/api/class/classes/%s/operations" % enc(c1["_id"]),
                  {"name": "placeOrder"}))
    if op:
        par = api("POST", "/api/elements/%s/children" % enc(op["_id"]),
                  {"type": "UMLParameter", "name": "result",
                   "direction": "return", "typeId": c1["_id"]})
        d2 = need("create return parameter with a classifier type", par)
        if d2:
            # The engine may accept the reference and then drop it; read it back
            # rather than trusting the create response.
            check("create response reports the reference",
                  d2.get("typeId") == c1["_id"] and d2.get("direction") == "return", d2)
            back = api("GET", "/api/elements/%s/children?field=parameters" % enc(op["_id"]))
            plist = back.get("data") or []
            hit = [p for p in plist if p.get("_id") == d2.get("_id")]
            check("the parameter is listed under the operation", len(hit) == 1, plist)
            if hit:
                check("StarUML kept the type reference after a round trip",
                      hit[0].get("typeId") == c1["_id"] and hit[0].get("direction") == "return",
                      hit[0])

print("\n=== Gap 7: an association end can be addressed by id ===")
if c1 and c2:
    a = need("create association",
             api("POST", "/api/class/associations",
                 {"diagramId": DID, "sourceId": c1["_id"], "targetId": c2["_id"],
                  "name": "links"}))
    if a:
        alist = api("GET", "/api/class/associations").get("data") or []
        mine = [x for x in alist if x.get("_id") == a["_id"]]
        check("association is listed", len(mine) == 1, alist)
        if mine:
            e1 = mine[0].get("end1") or {}
            check("end1 carries its own _id", bool(e1.get("_id")), e1)
            check("_id differs from the referenced classifier",
                  e1.get("_id") and e1.get("_id") != e1.get("reference"), e1)
            if e1.get("_id"):
                w = api("PUT", "/api/elements/%s" % enc(e1["_id"]),
                        {"documentation": "The owning side."})
                check("documentation writes through that id",
                      w.get("success") and w.get("data", {}).get("documentation") == "The owning side.",
                      w.get("error") or w.get("data"))

print("\n=== Gap 3: a lifeline points at a classifier ===")
sd = need("create sequence diagram", api("POST", "/api/seq/diagrams", {"name": "GapSeq"}))
if sd and c1:
    inter = sd.get("_parentId")
    ints = api("GET", "/api/seq/interactions").get("data") or []
    if ints:
        INT = ints[-1]["_id"]
        ll = api("POST", "/api/seq/interactions/%s/lifelines" % enc(INT),
                 {"name": "ui", "diagramId": sd["_id"], "representTypeId": c1["_id"]})
        d3 = need("create lifeline with representTypeId", ll)
        if d3:
            back = api("GET", "/api/seq/lifelines/%s" % enc(d3["_id"]))
            b = back.get("data") or {}
            check("StarUML kept the represent type after a round trip",
                  b.get("representTypeId") == c1["_id"], b)

        print("\n=== Gap 4: a clamped message y is reported ===")
        l1 = api("POST", "/api/seq/interactions/%s/lifelines" % enc(INT),
                 {"name": "a", "diagramId": sd["_id"]}).get("data")
        l2 = api("POST", "/api/seq/interactions/%s/lifelines" % enc(INT),
                 {"name": "b", "diagramId": sd["_id"]}).get("data")
        if l1 and l2:
            m1 = api("POST", "/api/seq/interactions/%s/messages" % enc(INT),
                     {"source": l1["_id"], "target": l2["_id"], "name": "first",
                      "diagramId": sd["_id"], "y": 200})
            check("first message created", m1.get("success"), m1.get("error"))
            m2 = api("POST", "/api/seq/interactions/%s/messages" % enc(INT),
                     {"source": l1["_id"], "target": l2["_id"], "name": "second",
                      "diagramId": sd["_id"], "y": 900})
            if m2.get("success"):
                got = (m2.get("data") or {}).get("view", {}).get("y")
                clamped = m2.get("clamped")
                if got == 900:
                    notes.append("message y 900 was honoured; no clamp to report here")
                    check("y was honoured and reported as such", clamped is None, clamped)
                else:
                    check("a moved y is reported in `clamped`",
                          bool(clamped) and clamped[0].get("field") == "y",
                          {"clamped": clamped, "actual_y": got})
            else:
                check("second message created", False, m2.get("error"))

print("")
for n in notes:
    print("note: " + n)
print("\n%d passed, %d failed" % (passed, failed))
sys.exit(0 if failed == 0 else 1)
