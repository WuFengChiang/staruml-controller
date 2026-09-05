#!/bin/bash
#
# Run test_all_endpoints.sh without letting it touch the project that is
# currently open.
#
# The integration script saves a snapshot and reopens it at the end, but that
# protection has three holes: it only restores on the last line (so a mid-run
# failure leaves the model dirty), it switches the current project to
# /tmp/test_staruml.mdj partway through, and it rm's the snapshot file while
# StarUML still has it open.
#
# So instead: switch to a brand-new empty project BEFORE the tests start, and
# reopen the original afterwards from an EXIT trap, so it happens even if the
# run dies partway.
#
# Prerequisites: the extension must already be reloaded with the build under
# test, and the controller server started. The script refuses to run otherwise.

set -uo pipefail

BASE="http://localhost:${PORT:-12345}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${REPO:-$(cd "$HERE/.." && pwd)}"
PRE_MDJ="/tmp/staruml_itest_pre_$$.mdj"    # copy of the original, taken before anything changes
WORK_MDJ="/tmp/staruml_itest_work_$$.mdj"  # where the scratch project is parked before reopening

api() {
    local method="$1" path="$2" data="${3:-}"
    if [ -n "$data" ]; then
        curl -s --connect-timeout 5 -X "$method" "$BASE$path" \
            -H 'Content-Type: application/json' -d "$data"
    else
        curl -s --connect-timeout 5 -X "$method" "$BASE$path"
    fi
}

jq_get() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

echo "== 1. Server reachable? =="
STATUS="$(api GET /api/status)"
if [ -z "$STATUS" ]; then
    echo "ABORT: no response from $BASE. Start the server (Tools > StarUML Controller)."
    exit 1
fi
ORIGINAL="$(printf '%s' "$STATUS" | jq_get "d['data'].get('project',{}).get('filename') or ''")"
echo "   current project: ${ORIGINAL:-<none>}"

echo "== 2. Is the build under test loaded? =="
# GET /api/status/capabilities now publishes the body fields each general write
# accepts, read straight from the constants the handlers validate against. That
# makes it the build marker: `specification` on PUT /api/elements/:id appeared
# with the constraint fixes and nothing else adds it.
#
# Do not use /api/status for this. The version there comes from package.json, and
# package.json only changes when someone bumps it — editing handlers moves no
# version number at all.
CAPS="$(api GET /api/status/capabilities)"
PROBE="$(printf '%s' "$CAPS" | jq_get "','.join(d.get('data',{}).get('writableFields',{}).get('PUT /api/elements/:id',[]))")"
case "$PROBE" in
    *specification*) echo "   build under test is loaded." ;;
    "")
        # Either an older build with no writableFields at all, or no server.
        OLD="$(api GET "/api/elements/probe-not-a-real-id/children?field=ownedElements" | jq_get "d.get('error','')")"
        case "$OLD" in
            *"Parent element not found"*)
                echo "ABORT: StarUML is running the previous build (list/type fixes, no constraint or signature fields)." ;;
            *"Unknown child field"*)
                echo "ABORT: StarUML is running the subtype-fixes build." ;;
            *"Not found: GET"*)
                echo "ABORT: StarUML is running a build older than all of those." ;;
            *)
                echo "ABORT: unexpected probe response: $OLD" ;;
        esac
        echo "       Quit StarUML (Cmd+Q), reopen it, start the server, then rerun."
        exit 1 ;;
    *)
        echo "ABORT: capabilities answered, but PUT /api/elements/:id does not take specification."
        echo "       fields seen: $PROBE"
        exit 1 ;;
esac

# The probe above stopped discriminating once a second build published
# `specification`. It cannot tell the twelve gap-report fixes from the four
# answers to run 4's failures, and a build marker that answers confidently
# without discriminating is worse than none.
#
# So narrow it here, while the user's own project is still open: if it has a
# sequence message, ask whether GET reports `messageIndex`. Only builds from
# `e5a403a` onwards attach it on that route. Having no message to ask about is
# not a failure — it just means this run cannot say which of the two it is.
echo "== 2b. Which of the recent builds? =="
case "$(python3 - "$BASE" <<'PY'
import json, sys, urllib.parse, urllib.request
B = sys.argv[1]
def get(p):
    try:
        with urllib.request.urlopen(B + p, timeout=8) as r:
            return json.load(r)
    except Exception:
        return {}
enc = lambda s: urllib.parse.quote(s, safe='')
for it in (get("/api/seq/interactions").get("data") or [])[:15]:
    msgs = get("/api/seq/interactions/%s/messages" % enc(it["_id"])).get("data") or []
    if msgs:
        d = get("/api/seq/messages/%s" % enc(msgs[0]["_id"])).get("data") or {}
        print("has-index" if d.get("messageIndex") is not None else "no-index")
        break
else:
    print("no-messages")
PY
)" in
    has-index)  echo "   GET reports messageIndex: the label-size and GET-index build." ;;
    no-index)   echo "   WARNING: GET does not report messageIndex, so this is the build BEFORE"
                echo "            the fixes for run 4's failures. A-2 will land half a label off"
                echo "            and the message-order check cannot run. Quit StarUML, reopen it,"
                echo "            start the server, then rerun." ;;
    *)          echo "   no sequence message in the open project, so the build cannot be narrowed"
                echo "   past the probe above. Read any A-2 or message-order result with that in mind." ;;
esac

if [ -z "$ORIGINAL" ]; then
    echo "NOTE: no file-backed project open; nothing to restore afterwards."
fi

# Reopen the original no matter how this script exits.
restore() {
    local code=$?
    echo ""
    echo "== Restoring =="
    # Save whatever is open now, so reopening cannot raise an unsaved-changes
    # dialog — a modal would freeze the extension and every later request.
    api POST /api/project/save "{\"path\":\"$WORK_MDJ\"}" > /dev/null 2>&1
    if [ -z "$ORIGINAL" ]; then
        # Nothing to reopen. StarUML is still holding WORK_MDJ, so deleting it
        # would leave the app pointed at a file that no longer exists — the same
        # hole this script exists to avoid.
        echo "   no original to reopen; StarUML still has $WORK_MDJ open (left in place)"
        echo "   done (exit $code)"
        return $code
    fi

    local out ok
    out="$(api POST /api/project/open "{\"path\":\"$ORIGINAL\"}")"
    ok="$(printf '%s' "$out" | jq_get "d.get('success')")"
    if [ "$ok" != "True" ]; then
        echo "   WARNING: could not reopen $ORIGINAL"
        echo "   $out"
        echo "   StarUML still has $WORK_MDJ open. A copy of the original as it was"
        echo "   before this run is at $PRE_MDJ. Neither is deleted."
        return $code
    fi

    echo "   reopened: $ORIGINAL"
    # Safe now: StarUML has the original open, so neither temp file is in use.
    rm -f "$WORK_MDJ"
    echo "   pre-run copy kept at $PRE_MDJ"
    echo "   done (exit $code)"
    return $code
}
trap restore EXIT

echo "== 3. Switching to an empty project =="
# project:new runs StarUML's handleNew, whose first act is
#   if (app.repository.isModified()) showSaveConfirmDialog(...)
# That dialog is modal: it blocks the drawing thread and with it the HTTP
# server, so this request would never return and neither would the EXIT trap's.
# Saving first clears the modified flag, so the dialog cannot appear.
echo "   saving the open project to $PRE_MDJ first (clears the modified flag)"
echo "   NOTE: unsaved changes in the original go into that copy, not back into"
echo "         the original file. The original on disk is left untouched."
SAVED="$(api POST /api/project/save "{\"path\":\"$PRE_MDJ\"}")"
if [ "$(printf '%s' "$SAVED" | jq_get "d.get('success')")" != "True" ]; then
    echo "ABORT: could not park the open project; refusing to risk a modal dialog."
    echo "$SAVED"
    exit 1
fi

NEW="$(api POST /api/project/new '{}')"
if [ "$(printf '%s' "$NEW" | jq_get "d.get('success')")" != "True" ]; then
    echo "ABORT: could not create a new project:"
    echo "$NEW"
    exit 1
fi
api POST /api/project/save "{\"path\":\"$WORK_MDJ\"}" > /dev/null
NOW="$(api GET /api/status | jq_get "d['data'].get('project',{}).get('filename') or ''")"
echo "   working project: ${NOW:-<unsaved>}"
if [ -n "$ORIGINAL" ] && [ "$NOW" = "$ORIGINAL" ]; then
    echo "ABORT: still on the original project. Refusing to run 441 writes against it."
    exit 1
fi

echo "== 4. Checking the gap fixes against the live engine =="
# Runs first: it is quick, and it is the part that says whether the fixes hold
# up against StarUML itself. The 441-call suite only asserts success:true.
python3 "$HERE/verify_gaps_live.py" "${PORT:-12345}"
GAP_RC=$?
echo "== gap checks exit code: $GAP_RC =="

echo "== 5. Running the endpoint suite =="
bash "$REPO/test/test_all_endpoints.sh"
RC=$?
echo "== suite exit code: $RC =="

if [ "$GAP_RC" -ne 0 ]; then
    echo "NOTE: gap checks failed; see section 4 above."
fi
[ "$GAP_RC" -ne 0 ] && exit "$GAP_RC"
exit $RC
