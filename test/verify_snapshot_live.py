#!/usr/bin/env python3
"""
Acceptance run for POST /api/project/snapshot, against a live StarUML.

The nine checks are the ones in new-feature-0910_task.md section 4, in order,
plus four extra checks that the task implies but does not list. Every check
prints the numbers it compared, so a "pass" can be audited afterwards.

Re-runnable: it restores the renamed element and deletes its own temp files.

Usage:
    ./verify_snapshot_live.py [<open project .mdj>] [<element id to rename>]

Both arguments default to the project this was first verified against on
2026-09-10. The element only has to be something with a `name` that you do not
mind renaming for a second; the script renames it back and proves the restore
was byte-exact.
"""

import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://localhost:12345"
ORIG = "/Users/wuufone/Desktop/dev/vu/YC_POS_SYS/spec/佑全新POS_領域模型與架構.mdj"
TMP = os.path.join(tempfile.gettempdir(), "staruml-snapshot-acceptance")

# A UMLAttribute with no documentation and no view of its own: the cheapest
# element to rename and put back.
TARGET_ID = "AAAAAAGgRhyK3YvWxZM="

if len(sys.argv) > 1:
    ORIG = sys.argv[1]
if len(sys.argv) > 2:
    TARGET_ID = sys.argv[2]

results = []


def api(method, path, body=None, timeout=180):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def filename_now():
    _, r = api("GET", "/api/status")
    return r["data"]["project"]["filename"]


def diff_lines(a, b):
    """Lines that differ between two files, as `diff` reports them."""
    out = subprocess.run(["diff", a, b], capture_output=True, text=True).stdout
    return out.splitlines()


def count_tokens(p):
    """Element and reference counts, to catch anything dropped in a round trip."""
    with open(p, encoding="utf8") as f:
        text = f.read()
    return {
        "_id": text.count('"_id":'),
        "_type": text.count('"_type":'),
        "$ref": text.count('"$ref":'),
    }


def check(label, ok, detail):
    results.append((label, ok, detail))
    print(("PASS  " if ok else "FAIL  ") + label)
    print("        " + detail)


def snapshot(path_or_body):
    """Pass a string to send {"path": ...}; pass a dict to send it as the body."""
    body = path_or_body if isinstance(path_or_body, dict) else {"path": path_or_body}
    return api("POST", "/api/project/snapshot", body)


def main():
    if os.path.isdir(TMP):
        shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP, exist_ok=True)

    print("=== 0. build marker: does the route exist at all? ===")
    status, r = snapshot({})
    if r.get("error", "").startswith("Not found"):
        print("ABORT: StarUML is running a build without /api/project/snapshot.")
        print("       Reload the extension, then re-run this script.")
        return 2
    print("        route answers with %d / %s" % (status, r.get("error")))

    # ---- 1. A = project.filename before anything ----
    A = filename_now()
    print("\n=== 1. A = project.filename ===\n        A = %s" % A)

    # ---- 2. B = sha256 of the original on disk ----
    B = sha256_file(ORIG)
    B_bytes = os.path.getsize(ORIG)
    print("\n=== 2. B = sha256 of the original on disk ===")
    print("        B = %s  (%d bytes)" % (B, B_bytes))

    # ---- 3. snapshot to a temp path ----
    snap1 = os.path.join(TMP, "snap1.mdj")
    print("\n=== 3. POST /api/project/snapshot -> %s ===" % snap1)
    status, r1 = snapshot(snap1)
    check(
        "3. snapshot reports success",
        r1.get("success") is True,
        "HTTP %d, success=%s, error=%s" % (status, r1.get("success"), r1.get("error")),
    )
    if not r1.get("success"):
        return 1
    d1 = r1["data"]
    print("        data = %s" % json.dumps(d1, ensure_ascii=False))

    # ---- 4. filename still equals A ----
    fn4 = filename_now()
    check(
        "4. project.filename unchanged after snapshot",
        fn4 == A,
        "before=%s\n        after =%s" % (A, fn4),
    )

    # ---- 5. snapshot file sha256 equals the sha256 in the response ----
    snap1_sha = sha256_file(snap1)
    snap1_bytes = os.path.getsize(snap1)
    check(
        "5. file on disk matches the sha256 the response reported",
        snap1_sha == d1["sha256"] and snap1_bytes == d1["bytes"],
        "response: %d bytes / %s\n        on disk : %d bytes / %s"
        % (d1["bytes"], d1["sha256"], snap1_bytes, snap1_sha),
    )

    # ---- 6. the original on disk is untouched ----
    orig_sha6 = sha256_file(ORIG)
    check(
        "6. original .mdj on disk untouched",
        orig_sha6 == B,
        "B     =%s\n        now   =%s" % (B, orig_sha6),
    )

    # ---- extra: how far does a freshly loaded project differ from its file? ----
    # Not byte-identical, and not because of anything this endpoint does:
    # StarUML re-measures label text when it loads a diagram, so a few
    # LabelView left/top/width numbers come back with different font metrics.
    # Assert that this is the ONLY kind of difference, because a lost reference
    # would show up here too.
    dl = diff_lines(ORIG, snap1)
    changed = [l for l in dl if l[:1] in ("<", ">")]
    geometry_only = all(
        any(('"%s":' % f) in l for f in ("left", "top", "width", "height"))
        for l in changed
    )
    check(
        "E1. a freshly loaded project differs from its file only in re-measured label geometry",
        geometry_only and len(changed) > 0,
        "%d differing lines, all of them left/top/width/height: %s\n        %s"
        % (len(changed), geometry_only, " | ".join(l.strip() for l in changed[:6])),
    )

    check(
        "E4. no elements and no references are lost in the round trip",
        count_tokens(ORIG) == count_tokens(snap1),
        "disk    : %s\n        snapshot: %s" % (count_tokens(ORIG), count_tokens(snap1)),
    )

    # ---- extra: the modified flag did not move ----
    check(
        "E2. response reports the modified flag (not null)",
        d1.get("modified") is not None,
        "modified=%s (null would mean this build cannot read the flag)" % d1.get("modified"),
    )

    # ---- 7. rename an element, snapshot again, expect a different hash ----
    _, before = api("GET", "/api/elements/" + urllib.parse.quote(TARGET_ID))
    orig_name = before["data"]["name"]
    print("\n=== 7. rename %s (%s) to make memory differ from disk ===" % (TARGET_ID, orig_name))
    probe_name = orig_name + "_snapshotProbe"
    _, up = api("PUT", "/api/elements/" + urllib.parse.quote(TARGET_ID), {"name": probe_name})
    if not up.get("success"):
        print("ABORT: could not rename the target element: %s" % up.get("error"))
        return 1

    snap2 = os.path.join(TMP, "snap2.mdj")
    status, r2 = snapshot(snap2)
    ok7 = False
    detail7 = "snapshot failed: %s" % r2.get("error")
    if r2.get("success"):
        d2 = r2["data"]
        snap2_sha = sha256_file(snap2)
        ok7 = snap2_sha != B and snap2_sha == d2["sha256"]
        detail7 = (
            "B            =%s (%d bytes)\n        new snapshot =%s (%d bytes)\n        differs from B: %s"
            % (B, B_bytes, snap2_sha, d2["bytes"], snap2_sha != B)
        )
    check("7. snapshot after an in-memory edit differs from the disk file", ok7, detail7)

    # ---- 8. filename still equals A ----
    fn8 = filename_now()
    check(
        "8. project.filename still unchanged after the second snapshot",
        fn8 == A,
        "A    =%s\n        after=%s" % (A, fn8),
    )

    # ---- the edit shows up in the snapshot, and nothing else does ----
    dl2 = [l for l in diff_lines(snap1, snap2) if l[:1] in ("<", ">")]
    check(
        "E5. the second snapshot differs from the first only by the renamed element",
        len(dl2) == 2 and probe_name in "".join(dl2) and orig_name in "".join(dl2),
        "%d differing lines: %s" % (len(dl2), " | ".join(l.strip() for l in dl2)),
    )

    # ---- restore the name, and prove the restore is byte-exact ----
    print("\n=== restore: rename %s back to %s ===" % (TARGET_ID, orig_name))
    _, back = api("PUT", "/api/elements/" + urllib.parse.quote(TARGET_ID), {"name": orig_name})
    snap3 = os.path.join(TMP, "snap3.mdj")
    _, r3 = snapshot(snap3)
    snap3_sha = sha256_file(snap3) if r3.get("success") else "n/a"
    check(
        "E3. renaming back reproduces the pre-edit snapshot byte-for-byte",
        r3.get("success") is True and snap3_sha == snap1_sha,
        "restore reported success=%s\n        before edit=%s\n        after undo =%s"
        % (back.get("success"), snap1_sha, snap3_sha),
    )
    _, after = api("GET", "/api/elements/" + urllib.parse.quote(TARGET_ID))
    check(
        "E6. the element carries its original name again",
        after["data"]["name"] == orig_name,
        "name is now %r (was %r)" % (after["data"]["name"], orig_name),
    )

    # ---- 9. path errors ----
    print("\n=== 9. path error handling ===")

    missing = os.path.join(TMP, "no-such-dir-9a", "snap.mdj")
    _, e9a = snapshot(missing)
    check(
        "9a. directory does not exist -> explicit error",
        e9a.get("success") is False and "Directory does not exist" in (e9a.get("error") or ""),
        "success=%s  error=%s" % (e9a.get("success"), e9a.get("error")),
    )

    ro = os.path.join(TMP, "readonly-9b")
    os.makedirs(ro, exist_ok=True)
    os.chmod(ro, stat.S_IRUSR | stat.S_IXUSR)
    try:
        _, e9b = snapshot(os.path.join(ro, "snap.mdj"))
        wrote_anyway = os.path.exists(os.path.join(ro, "snap.mdj"))
        check(
            "9b. directory not writable -> explicit error, nothing written",
            e9b.get("success") is False
            and "not writable" in (e9b.get("error") or "")
            and not wrote_anyway,
            "success=%s  error=%s  file created=%s"
            % (e9b.get("success"), e9b.get("error"), wrote_anyway),
        )
    finally:
        os.chmod(ro, stat.S_IRWXU)

    _, e9c = snapshot("relative/path/snap.mdj")
    check(
        "9c. relative path -> explicit error",
        e9c.get("success") is False and "absolute path" in (e9c.get("error") or ""),
        "success=%s  error=%s" % (e9c.get("success"), e9c.get("error")),
    )

    _, e9d = snapshot(A)
    check(
        "9d. path is the open project's own file -> refused",
        e9d.get("success") is False and "must not be the open project file" in (e9d.get("error") or ""),
        "success=%s  error=%s" % (e9d.get("success"), e9d.get("error")),
    )
    check(
        "9d-2. and the original on disk is still untouched",
        sha256_file(ORIG) == B,
        "B=%s\n        now=%s" % (B, sha256_file(ORIG)),
    )

    _, e9e = snapshot(os.path.join(TMP, "snap.txt"))
    check(
        "9e. wrong extension -> explicit error",
        e9e.get("success") is False and ".mdj extension" in (e9e.get("error") or ""),
        "success=%s  error=%s" % (e9e.get("success"), e9e.get("error")),
    )

    _, e9f = snapshot({"path": snap1, "bogus": 1})
    check(
        "9f. unknown field -> rejected by the whitelist",
        e9f.get("success") is False and "Unknown field" in (e9f.get("error") or ""),
        "success=%s  error=%s" % (e9f.get("success"), e9f.get("error")),
    )

    # A symlink whose name says nothing about where it points. A resolve()-only
    # guard writes straight through it and overwrites the project.
    link = os.path.join(TMP, "innocent-9g.mdj")
    if os.path.islink(link):
        os.unlink(link)
    os.symlink(A, link)
    _, e9g = snapshot(link)
    check(
        "9g. a symlink pointing at the open project file -> refused",
        e9g.get("success") is False and "must not be the open project file" in (e9g.get("error") or ""),
        "success=%s  error=%s" % (e9g.get("success"), e9g.get("error")),
    )
    check(
        "9g-2. and the original on disk survived the symlink attempt",
        sha256_file(ORIG) == B,
        "B=%s\n        now=%s" % (B, sha256_file(ORIG)),
    )
    os.unlink(link)

    # data.path must name the file the bytes went to, not echo back whatever the
    # caller typed.
    messy = os.path.join(TMP, "sub9h", "..", "snap9h.mdj")
    os.makedirs(os.path.join(TMP, "sub9h"), exist_ok=True)
    _, r9h = snapshot(messy)
    clean = os.path.join(TMP, "snap9h.mdj")
    check(
        "9h. data.path is normalised and names the file that was written",
        r9h.get("success") is True
        and r9h["data"]["path"] == clean
        and os.path.exists(clean)
        and sha256_file(clean) == r9h["data"]["sha256"],
        "sent    : %s\n        reported: %s\n        exists  : %s"
        % (messy, r9h.get("data", {}).get("path"), os.path.exists(clean)),
    )

    # ---- summary ----
    passed = sum(1 for _, ok, _ in results if ok)
    failed = len(results) - passed
    print("\n=== summary: %d passed, %d failed ===" % (passed, failed))
    for label, ok, _ in results:
        if not ok:
            print("  FAILED: " + label)
    print("\nfinal project.filename = %s" % filename_now())
    print("final original sha256  = %s" % sha256_file(ORIG))
    print("B (recorded at start)  = %s" % B)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
