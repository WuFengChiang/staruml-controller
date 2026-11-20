#!/usr/bin/env python3
"""Regenerate test/metamodel-inheritance.json from the installed StarUML.

The offline tests need to know which model type descends from which, to check
that no type lost its only list endpoint when listing moved to exact-type
matching. That relationship lives in StarUML's own metamodel, inside app.asar.
Reading it at test time would tie the tests to a local install, so it is dumped
here once and committed.

Rerun after upgrading StarUML:

    python3 test/dump_metamodel_inheritance.py

Prints what changed so the diff is not a surprise.
"""
import json
import os
import re
import sys

ASAR = "/Applications/StarUML.app/Contents/Resources/app.asar"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metamodel-inheritance.json")


def main():
    if not os.path.exists(ASAR):
        sys.exit("no StarUML at %s — nothing to read" % ASAR)

    with open(ASAR, "rb") as fh:
        data = fh.read().decode("utf-8", "replace")

    # Metamodel entries look like:
    #   "UMLTimeConstraint": { "kind": "class", "super": "UMLIntervalConstraint", ... }
    # A class with no "super" is a root; record it as null so callers can tell
    # "root" apart from "not in the metamodel at all".
    supers = {}
    pattern = r'"(\w+)":\s*\{\s*"kind":\s*"class"(?:\s*,\s*"super":\s*"(\w+)")?'
    for m in re.finditer(pattern, data):
        name, parent = m.group(1), m.group(2)
        if name not in supers or (parent and not supers[name]):
            supers[name] = parent

    if len(supers) < 100:
        sys.exit("only %d classes found — the metamodel format probably changed" % len(supers))

    old = {}
    if os.path.exists(OUT):
        with open(OUT) as fh:
            old = json.load(fh)

    with open(OUT, "w") as fh:
        json.dump(supers, fh, sort_keys=True, indent=1)
        fh.write("\n")

    added = sorted(set(supers) - set(old))
    removed = sorted(set(old) - set(supers))
    changed = sorted(k for k in set(supers) & set(old) if supers[k] != old[k])
    print("%d classes written to %s" % (len(supers), OUT))
    for label, names in (("added", added), ("removed", removed), ("reparented", changed)):
        if names:
            print("  %s (%d): %s" % (label, len(names), ", ".join(names[:12])))


if __name__ == "__main__":
    main()
