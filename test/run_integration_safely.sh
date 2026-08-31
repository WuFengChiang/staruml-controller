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
WORK_MDJ="/tmp/staruml_itest_work_$$.mdj"

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
# GET /api/elements/:id/children exists only in the build being tested. On an
# older build the router falls through and reports the route itself as missing.
PROBE="$(api GET /api/elements/probe-not-a-real-id/children | jq_get "d.get('error','')")"
case "$PROBE" in
    *"Parent element not found"*) echo "   new build loaded." ;;
    *"Not found: GET"*)
        echo "ABORT: StarUML is still running the previous build."
        echo "       Reload the extension (Debug > Reload), restart the server, then rerun."
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
    if [ -n "$ORIGINAL" ]; then
        local out
        out="$(api POST /api/project/open "{\"path\":\"$ORIGINAL\"}")"
        local ok
        ok="$(printf '%s' "$out" | jq_get "d.get('success')")"
        if [ "$ok" = "True" ]; then
            echo "   reopened: $ORIGINAL"
        else
            echo "   WARNING: could not reopen $ORIGINAL"
            echo "   $out"
            echo "   The working copy is at $WORK_MDJ — do not overwrite the original from StarUML."
            return $code
        fi
    fi
    rm -f "$WORK_MDJ"
    echo "   done (exit $code)"
    return $code
}
trap restore EXIT

echo "== 3. Switching to an empty project =="
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
