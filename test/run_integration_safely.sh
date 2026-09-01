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
# Ask for a child field the parent cannot have, on an id that does not exist.
# Each build answers differently, so one request tells all three apart:
#   this build   the unknown-field check moved after the parent lookup, so the
#                missing parent is reported first
#   previous     the field was checked against a fixed whitelist before anything
#                else, so it complains about the field
#   older still  the route did not exist and the router falls through
#
# Do not use /api/status for this. The version there comes from package.json, and
# package.json only changes when someone bumps it — editing handlers moves no
# version number at all.
PROBE="$(api GET "/api/elements/probe-not-a-real-id/children?field=ownedElements" | jq_get "d.get('error','')")"
case "$PROBE" in
    *"Parent element not found"*) echo "   build under test is loaded." ;;
    *"Unknown child field"*)
        echo "ABORT: StarUML is running the previous build (subtype fixes only)."
        echo "       Quit StarUML (Cmd+Q), reopen it, start the server, then rerun."
        exit 1 ;;
    *"Not found: GET"*)
        echo "ABORT: StarUML is running a build older than both."
        echo "       Quit StarUML (Cmd+Q), reopen it, start the server, then rerun."
        exit 1 ;;
    *) echo "ABORT: unexpected probe response: $PROBE"; exit 1 ;;
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
