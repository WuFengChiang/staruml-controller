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


def view_of(diagram_id, model_id, label):
    """Return the view geometry for one element on a diagram.

    Geometry comes from GET /api/diagrams/:id/views. The similarly named
    GET /api/elements/:id/views answers a different question — which diagrams
    show this element — and carries no left/top/width/height at all. Reading
    the wrong one reports every coordinate as absent, which looks exactly like
    a positioning bug that is not there.
    """
    res = api("GET", "/api/diagrams/%s/views" % enc(diagram_id))
    if not res.get("success"):
        check(label, False, res.get("error"))
        return {}
    hits = [v for v in (res.get("data") or []) if v.get("modelId") == model_id]
    if not hits:
        check(label, False, "no view on the diagram for that element")
        return {}
    return hits[0]


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
    v = view_of(DID, c1["_id"], "view left/top match the request")
    check("view left/top match the request",
          v.get("left") == 680 and v.get("top") == 420,
          {"left": v.get("left"), "top": v.get("top"),
           "width": v.get("width"), "height": v.get("height")})
    # x2/y2 were left out, so the default size must survive rather than being
    # stretched to meet an absolute corner.
    check("the default size survives an x1/y1-only request",
          v.get("width") == 100 and v.get("height") == 80,
          {"width": v.get("width"), "height": v.get("height")})

c2 = need("create a second class at (900,600)",
          api("POST", "/api/class/classes",
              {"diagramId": DID, "name": "Second", "x1": 900, "y1": 600}))
if c2:
    v2 = view_of(DID, c2["_id"], "the second element does not stack on the first")
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

# An empty list satisfies "holds no subtypes" without proving anything, and in a
# scratch project that list starts empty. So create a realization first: it is a
# UMLDependency by inheritance, and under the old loose matching it appeared in
# the dependency list. It must now show up under realizations and nowhere else.
if c1 and c2:
    real = api("POST", "/api/class/realizations",
               {"diagramId": DID, "sourceId": c1["_id"], "targetId": c2["_id"]})
    rdata = need("create a realization", real)
    if rdata:
        deps = api("GET", "/api/class/dependencies")
        check("dependency list answers", deps.get("success"), deps.get("error"))
        drows = deps.get("data") or []
        dep_types = sorted({e.get("_type") for e in drows})
        check("the realization is absent from the dependency list",
              rdata["_id"] not in {e.get("_id") for e in drows},
              {"types_seen": dep_types})
        check("dependency list holds no realization subtypes",
              all(t == "UMLDependency" for t in dep_types), dep_types)

        reals = api("GET", "/api/class/realizations")
        check("realization list answers", reals.get("success"), reals.get("error"))
        check("the realization is listed under realizations",
              rdata["_id"] in {e.get("_id") for e in (reals.get("data") or [])},
              reals.get("data"))

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

print("\n=== Retyping an attribute that already exists ===")
# Reported as a dead end: nothing could change an existing UMLAttribute's type,
# so the only route was delete-and-recreate. PUT /api/elements/:id takes typeId
# now; whether StarUML keeps it on an element it did not just build is a question
# only the live engine answers.
if c1 and c2:
    at = need("create an attribute",
              api("POST", "/api/elements/%s/children" % enc(c1["_id"]),
                  {"type": "UMLAttribute", "name": "payer"}))
    if at:
        w = api("PUT", "/api/elements/%s" % enc(at["_id"]), {"typeId": c2["_id"]})
        check("PUT accepts typeId on an attribute that already exists",
              w.get("success"), w.get("error"))
        back = api("GET", "/api/elements/%s/children?field=attributes" % enc(c1["_id"]))
        check("the attribute list answers", back.get("success"), back.get("error"))
        hit = [a for a in (back.get("data") or []) if a.get("_id") == at["_id"]]
        check("the attribute is listed back", len(hit) == 1, back.get("data"))
        if hit:
            check("StarUML kept the new type after a round trip",
                  hit[0].get("typeId") == c2["_id"], hit[0])

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
# Order matters. POST /api/seq/diagrams requires parentId and it must be a
# UMLInteraction, so the interaction is created first and its id is passed in.
# Creating the diagram first and then picking the last interaction off the list
# fails outright here, and in a project that already holds interactions it would
# silently attach the lifelines to somebody else's.
it = need("create interaction", api("POST", "/api/seq/interactions", {"name": "GapInt"}))
if it and c1:
    INT = it["_id"]
    sd = need("create sequence diagram",
              api("POST", "/api/seq/diagrams", {"name": "GapSeq", "parentId": INT}))
    if sd:
        ll = api("POST", "/api/seq/interactions/%s/lifelines" % enc(INT),
                 {"name": "ui", "diagramId": sd["_id"], "representTypeId": c1["_id"]})
        d3 = need("create lifeline with representTypeId", ll)
        if d3:
            back = api("GET", "/api/seq/lifelines/%s" % enc(d3["_id"]))
            check("the lifeline reads back", back.get("success"), back.get("error"))
            b = back.get("data") or {}
            check("StarUML kept the represent type after a round trip",
                  b.get("representTypeId") == c1["_id"], b)
            check("the classifier name comes back with it",
                  b.get("representTypeName") == "Placed", b.get("representTypeName"))

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
                    # The ceiling moves with the diagram's contents, so assert the
                    # shape of the report and that it agrees with the view, never a
                    # fixed number.
                    entry = (clamped or [{}])[0]
                    check("a moved y is reported in `clamped`",
                          bool(clamped) and entry.get("field") == "y",
                          {"clamped": clamped, "actual_y": got})
                    check("the report carries what was asked for and what was used",
                          entry.get("requested") == 900 and entry.get("actual") == got,
                          {"entry": entry, "view_y": got})
            else:
                check("second message created", False, m2.get("error"))


# ============================================================
# Gaps reported from a live modelling session (A/B/C list)
#
# These call the same endpoints the reporting side calls, and then do what the
# reporting side does to accept a fix: save the project and read the field back
# out of the .mdj with json.load. A value that is only correct in memory is not
# a fix — it disappears at the next save.
# ============================================================

SAVE_PATH = "/tmp/staruml_gapcheck_%d.mdj" % os.getpid()
_saved_doc = None


def save_and_load():
    """Save the open project and return the parsed .mdj, or None."""
    global _saved_doc
    res = api("POST", "/api/project/save", {"path": SAVE_PATH})
    if not res.get("success"):
        check("project saves to %s" % SAVE_PATH, False, res.get("error"))
        return None
    try:
        with open(SAVE_PATH) as fh:
            _saved_doc = json.load(fh)
    except Exception as e:
        check("the saved .mdj parses", False, str(e))
        return None
    return _saved_doc


def find_node(doc, _id):
    """Depth-first search for the element with this _id in a parsed .mdj."""
    stack = [doc]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            if node.get("_id") == _id:
                return node
            stack.extend(node.values())
        elif isinstance(node, list):
            stack.extend(node)
    return None


print("\n=== A-3: a constraint is created where it can actually live ===")
CONSTRAINT_ID = None
if c1:
    made = api("POST", "/api/elements/%s/children" % enc(c1["_id"]),
               {"type": "UMLConstraint", "name": "xorGroup", "specification": "{xor}"})
    cdata = need("create a UMLConstraint with no field given", made)
    if cdata:
        CONSTRAINT_ID = cdata["_id"]
        check("the response says which field it used",
              cdata.get("field") == "ownedElements", cdata)
        back = api("GET", "/api/elements/%s/children?field=ownedElements" % enc(c1["_id"]))
        hit = [x for x in (back.get("data") or []) if x.get("_id") == CONSTRAINT_ID]
        check("the constraint reads back out of the model", len(hit) == 1, back.get("data"))
        if hit:
            check("with the specification StarUML draws on the canvas",
                  hit[0].get("specification") == "{xor}", hit[0])

    bad = api("POST", "/api/elements/%s/children" % enc(c1["_id"]),
              {"type": "UMLConstraint", "name": "nope", "field": "constraints"})
    check("the old default field is refused instead of writing nowhere",
          bad.get("success") is False and "not a collection" in str(bad.get("error")), bad)

print("\n=== B-2 / B-3: specification and constrainedElements survive a save ===")
if CONSTRAINT_ID and c1 and c2:
    w = api("PUT", "/api/elements/%s" % enc(CONSTRAINT_ID),
            {"specification": "{xor} exactly one of these applies",
             "constrainedElementIds": [c1["_id"], c2["_id"]]})
    check("both constraint fields are accepted", w.get("success"), w.get("error"))
    check("and the response reports no ignored write",
          w.get("ignored") is None and w.get("clamped") is None,
          {"ignored": w.get("ignored"), "clamped": w.get("clamped")})

    rb = api("GET", "/api/elements/%s" % enc(CONSTRAINT_ID))
    b = rb.get("data") or {}
    check("the constraint reads back with both fields",
          b.get("specification") == "{xor} exactly one of these applies" and
          b.get("constrainedElementIds") == [c1["_id"], c2["_id"]], b)

    doc = save_and_load()
    if doc:
        node = find_node(doc, CONSTRAINT_ID)
        check("the constraint is in the saved .mdj", node is not None, SAVE_PATH)
        if node:
            check("specification survived the save",
                  node.get("specification") == "{xor} exactly one of these applies", node)
            refs = [r.get("$ref") for r in (node.get("constrainedElements") or [])
                    if isinstance(r, dict)]
            check("constrainedElements survived the save as references",
                  refs == [c1["_id"], c2["_id"]], node.get("constrainedElements"))

print("\n=== B-1: a message names the operation it invokes ===")
# Reuses the interaction, lifelines and message built for gap 4 above.
try:
    _msg_id = (m1.get("data") or {}).get("_id")
except NameError:
    _msg_id = None
_op_id = None
if c1:
    _ops = api("GET", "/api/class/classes/%s/operations" % enc(c1["_id"])).get("data") or []
    _op_id = _ops[0]["_id"] if _ops else None

if _msg_id and _op_id:
    w = api("PUT", "/api/seq/messages/%s" % enc(_msg_id),
            {"signature": _op_id, "arguments": "orderId"})
    check("signature and arguments are accepted", w.get("success"), w.get("error"))
    check("no field was silently dropped",
          w.get("ignored") is None, w.get("ignored"))
    rb = api("GET", "/api/seq/messages/%s" % enc(_msg_id)).get("data") or {}
    check("the message reads back pointing at the operation",
          rb.get("signatureId") == _op_id and rb.get("arguments") == "orderId", rb)

    if c2:
        refused = api("PUT", "/api/seq/messages/%s" % enc(_msg_id), {"signature": c2["_id"]})
        check("a class is refused as a signature",
              refused.get("success") is False and "UMLOperation" in str(refused.get("error")), refused)

    doc = save_and_load()
    if doc:
        node = find_node(doc, _msg_id)
        check("the message is in the saved .mdj", node is not None, SAVE_PATH)
        if node:
            sig = node.get("signature")
            check("signature survived the save as a reference",
                  isinstance(sig, dict) and sig.get("$ref") == _op_id, sig)
            check("arguments survived the save", node.get("arguments") == "orderId", node.get("arguments"))
else:
    notes.append("skipped B-1: no message or operation from the earlier sections")

print("\n=== C-1: an update may clear a name ===")
if c1 and c2:
    a2 = api("POST", "/api/class/associations",
             {"diagramId": DID, "sourceId": c1["_id"], "targetId": c2["_id"], "name": "temporary"})
    adata = a2.get("data")
    if adata:
        w = api("PUT", "/api/elements/%s" % enc(adata["_id"]), {"name": ""})
        check("a generated relation name can be cleared", w.get("success"), w.get("error"))
        rb = api("GET", "/api/class/associations/%s" % enc(adata["_id"])).get("data") or {}
        check("and it reads back empty", rb.get("name") == "", rb.get("name"))

print("\n=== C-2: `type` writes the same property `typeName` does ===")
if c1 and c2:
    at2 = api("POST", "/api/elements/%s/children" % enc(c1["_id"]),
              {"type": "UMLAttribute", "name": "total"}).get("data")
    if at2:
        w = api("PUT", "/api/elements/%s" % enc(at2["_id"]), {"type": "Money"})
        check("PUT /api/elements accepts `type`", w.get("success"), w.get("error"))
        rb = api("GET", "/api/elements/%s" % enc(at2["_id"])).get("data") or {}
        check("and the read side reports type and typeName as the same value",
              rb.get("type") == "Money" and rb.get("typeName") == "Money", rb)
        both = api("PUT", "/api/elements/%s" % enc(at2["_id"]), {"type": "A", "typeName": "B"})
        check("giving both at once is refused",
              both.get("success") is False and "mutually exclusive" in str(both.get("error")), both)

print("\n=== C-3: a classifier can be created with no diagram ===")
_pkgs = api("GET", "/api/class/packages").get("data") or []
if _pkgs:
    made = api("POST", "/api/elements/%s/children" % enc(_pkgs[0]["_id"]),
               {"type": "UMLClass", "name": "ModelOnlyClass"})
    mdata = need("create a UMLClass as a model element only", made)
    if mdata:
        views = api("GET", "/api/elements/%s/views" % enc(mdata["_id"])).get("data") or []
        check("it exists with no view on any diagram", len(views) == 0, views)
        listed = api("GET", "/api/class/classes").get("data") or []
        check("and it is listed as a class",
              mdata["_id"] in {x.get("_id") for x in listed}, len(listed))
else:
    notes.append("skipped C-3: no package in the scratch project")

print("\n=== A-1: an association end moves without a rebuild ===")
if c1 and c2:
    c3 = api("POST", "/api/class/classes",
             {"diagramId": DID, "name": "MovedTarget", "x1": 1100, "y1": 420}).get("data")
    a3 = api("POST", "/api/class/associations",
             {"diagramId": DID, "sourceId": c1["_id"], "targetId": c2["_id"], "name": "moves"}).get("data")
    if c3 and a3:
        before_views = api("GET", "/api/elements/%s/views" % enc(a3["_id"])).get("data") or []
        w = api("PUT", "/api/class/associations/%s" % enc(a3["_id"]),
                {"end2": {"reference": c3["_id"]}})
        check("end2.reference is accepted", w.get("success"), w.get("error"))
        check("and the engine kept it, rather than reporting an ignored write",
              not any(i.get("field", "").endswith("end2.reference")
                      for i in (w.get("ignored") or [])), w.get("ignored"))

        rb = api("GET", "/api/class/associations/%s" % enc(a3["_id"])).get("data") or {}
        check("the association reads back attached to the new class",
              (rb.get("end2") or {}).get("reference") == c3["_id"], rb.get("end2"))
        check("the association kept its id — no delete-and-rebuild",
              rb.get("_id") == a3["_id"], rb.get("_id"))
        after_views = api("GET", "/api/elements/%s/views" % enc(a3["_id"])).get("data") or []
        # An association on a canvas is one UMLAssociationView plus three
        # EdgeLabelViews, and the labels only reach the index getViewsOf walks
        # once the diagram has been drawn. `before` is read immediately after the
        # create, so it sees 1 and the run after the move sees 4 — the earlier
        # version of this check bound the two counts together and failed on that.
        # What a delete-and-rebuild would destroy is the edge view itself, so
        # that is what to assert.
        after_types = [v.get("viewType") for v in after_views]
        check("and its views were not destroyed",
              len(after_views) >= len(before_views) and
              "UMLAssociationView" in after_types,
              {"before": len(before_views), "after": len(after_views),
               "types": after_types})

        doc = save_and_load()
        if doc:
            node = find_node(doc, a3["_id"])
            check("the association is in the saved .mdj", node is not None, SAVE_PATH)
            if node:
                end2 = node.get("end2") or {}
                ref = end2.get("reference") or {}
                check("end2.reference survived the save",
                      isinstance(ref, dict) and ref.get("$ref") == c3["_id"], end2)

        pkgs = api("GET", "/api/class/packages").get("data") or []
        if pkgs:
            refused = api("PUT", "/api/class/associations/%s" % enc(a3["_id"]),
                          {"end1": {"reference": pkgs[0]["_id"]}})
            check("an end cannot be pointed at a package",
                  refused.get("success") is False and "UMLClassifier" in str(refused.get("error")),
                  refused)

print("\n=== A-2: an edge label takes left/top ===")
# The label views live under the association's edge view as subviews.
_label = None
_edge_view_id = None
if c1 and c2:
    a4 = api("POST", "/api/class/associations",
             {"diagramId": DID, "sourceId": c1["_id"], "targetId": c2["_id"], "name": "labelled"}).get("data")
    if a4:
        # GET /api/elements/:id/views reports the view id as `viewId`, not `_id`,
        # and one row per diagram — pick the row for the diagram we built on.
        evs = api("GET", "/api/elements/%s/views" % enc(a4["_id"])).get("data") or []
        mine_ev = [v for v in evs if v.get("diagramId") == DID] or evs
        if mine_ev:
            _edge_view_id = mine_ev[0].get("viewId")
        if _edge_view_id:
            # GET /api/views/:id/subviews reports each subview through
            # serializeViewInfo, so `_id`, `alpha` and `role` are the real keys.
            subs = api("GET", "/api/views/%s/subviews" % enc(_edge_view_id)).get("data") or []
            labels = [s for s in subs if s.get("role") == "nameLabel"] or \
                     [s for s in subs if s.get("alpha") is not None]
            _label = labels[0] if labels else None
        if not _label:
            notes.append("A-2 setup: edge view id %s, subviews seen: %s"
                         % (_edge_view_id, [s.get("_type") for s in
                            (api("GET", "/api/views/%s/subviews" % enc(_edge_view_id)).get("data") or [])]))

if _label:
    LID = _label["_id"]
    want_left, want_top = 900, 40
    w = api("PUT", "/api/views/%s" % enc(LID), {"left": want_left, "top": want_top})
    check("left/top on an edge label are accepted", w.get("success"), w.get("error"))
    check("and the write is not reported as ignored",
          not any(i.get("field") in ("left", "top") for i in (w.get("ignored") or [])),
          w.get("ignored"))
    rb = api("GET", "/api/views/%s/subviews" % enc(_edge_view_id)).get("data") or []
    hit = [s for s in rb if s.get("_id") == LID]
    if hit:
        got = hit[0]
        # StarUML floors twice while arranging, so allow a pixel either way.
        check("the label sits within a pixel of where it was asked, with no export step",
              abs((got.get("left") or 0) - want_left) <= 1 and abs((got.get("top") or 0) - want_top) <= 1,
              {"left": got.get("left"), "top": got.get("top")})
        check("and the polar pair the engine stores was written too",
              got.get("distance") is not None and got.get("alpha") is not None, got)
    doc = save_and_load()
    if doc:
        node = find_node(doc, LID)
        check("the label is in the saved .mdj", node is not None, SAVE_PATH)
        if node:
            check("left/top survived the save, not just alpha/distance",
                  abs((node.get("left") or 0) - want_left) <= 1 and
                  abs((node.get("top") or 0) - want_top) <= 1,
                  {"left": node.get("left"), "top": node.get("top"),
                   "alpha": node.get("alpha"), "distance": node.get("distance")})
else:
    notes.append("skipped A-2: no edge label view found under the association")

print("\n=== A-4: undo says whether it undid anything ===")
u = api("POST", "/api/undo")
check("undo reports the stack it worked on",
      u.get("success") is True and isinstance((u.get("data") or {}).get("stackSizeBefore"), int), u)
if u.get("success"):
    check("and the stack actually shrank",
          u["data"]["stackSizeAfter"] < u["data"]["stackSizeBefore"], u.get("data"))
    rr = api("POST", "/api/redo")
    check("redo puts it back", rr.get("success"), rr.get("error"))

print("\n=== C-4: moving a message re-sorts the interaction's message list ===")
# Only UMLSequenceDiagram.drawDiagram() re-sorts interaction.messages, and that
# runs on a draw. The write now draws before it answers; this is the check that
# says so. Build two messages, then move the second above the first.
try:
    _int_id, _sd_id2, _l1, _l2 = INT, sd["_id"], l1, l2
except (NameError, TypeError):
    _int_id = _sd_id2 = _l1 = _l2 = None

if _int_id and _l1 and _l2:
    early = api("POST", "/api/seq/interactions/%s/messages" % enc(_int_id),
                {"source": _l1["_id"], "target": _l2["_id"], "name": "reorder_a",
                 "diagramId": _sd_id2, "y": 300}).get("data")
    later = api("POST", "/api/seq/interactions/%s/messages" % enc(_int_id),
                {"source": _l1["_id"], "target": _l2["_id"], "name": "reorder_b",
                 "diagramId": _sd_id2, "y": 340}).get("data")
    if early and later:
        check("a created message reports its place in the list",
              isinstance(early.get("messageIndex"), int), early)
        # Move reorder_b above reorder_a. StarUML caps how far a message may move,
        # so assert the relative order rather than a coordinate.
        moved = api("PUT", "/api/seq/messages/%s" % enc(later["_id"]),
                    {"y": (early.get("view") or {}).get("y", 300) - 40})
        check("the move is accepted", moved.get("success"), moved.get("error"))
        after_b = (moved.get("data") or {}).get("messageIndex")
        after_a = (api("GET", "/api/seq/messages/%s" % enc(early["_id"]))
                   .get("data") or {}).get("messageIndex")
        if isinstance(after_a, int) and isinstance(after_b, int):
            if (moved.get("data") or {}).get("view", {}).get("y", 0) < (early.get("view") or {}).get("y", 0):
                check("the message that is now higher comes first in the list",
                      after_b < after_a, {"moved": after_b, "other": after_a})
            else:
                notes.append("message y was clamped back below the other one; "
                             "list order not asserted (moved=%s other=%s)" % (after_b, after_a))
        else:
            check("both messages report a messageIndex", False,
                  {"moved": after_b, "other": after_a})
else:
    notes.append("skipped the message reorder check: no interaction or lifelines")

print("\n=== C-4: layout is refused on a sequence diagram ===")
try:
    _sd_id = sd["_id"]
except (NameError, TypeError):
    _sd_id = None
if _sd_id:
    lay = api("POST", "/api/diagrams/%s/layout" % enc(_sd_id), {})
    check("layout on a UMLSequenceDiagram is refused",
          lay.get("success") is False and "destroy its arrangement" in str(lay.get("error")), lay)
cls_lay = api("POST", "/api/diagrams/%s/layout" % enc(DID), {})
check("a class diagram still lays out", cls_lay.get("success"), cls_lay.get("error"))

print("")
for n in notes:
    print("note: " + n)
print("saved snapshots for inspection: %s" % SAVE_PATH)
print("\n%d passed, %d failed" % (passed, failed))
sys.exit(0 if failed == 0 else 1)
