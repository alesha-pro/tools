#!/usr/bin/env bash
# Safely tear down local SSH tunnel AND stop the billable Colab G4 session.
# Usage:
#   ./stop.sh [SESSION=glm53] [LOCAL_PORT=18100]
#   ./stop.sh [--session glm53] [--port 18100] [--all]
#
#   --all  Also stop any orphan sessions: server-side Colab assignments that
#          have no local name in the colab CLI store (shown as [?] by
#          `colab sessions`). Those cannot be stopped with a bare
#          `colab stop` or `colab stop -s <name>`, so they are re-adopted
#          into the local store and stopped by endpoint.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLAB_BIN="${COLAB_BIN:-$HOME/.local/bin/colab}"

SESSION="glm53"
LOCAL_PORT="18100"
STOP_ALL=0
POS_IDX=0

while [ $# -gt 0 ]; do
  case "$1" in
    --session|-s)
      [ $# -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
      SESSION="$2"; shift 2
      ;;
    --port|-p)
      [ $# -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
      LOCAL_PORT="$2"; shift 2
      ;;
    --all)
      STOP_ALL=1; shift
      ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      if [ "$POS_IDX" -eq 0 ]; then
        SESSION="$1"
      elif [ "$POS_IDX" -eq 1 ]; then
        LOCAL_PORT="$1"
      else
        echo "Unknown arg: $1" >&2
        exit 1
      fi
      POS_IDX=$((POS_IDX + 1))
      shift
      ;;
  esac
done

PIDFILE="/tmp/colab-tunnel-${SESSION}-${LOCAL_PORT}.pid"
METAFILE="/tmp/colab-tunnel-${SESSION}-${LOCAL_PORT}.env"

if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "[stop] Stopping background tunnel PID $PID..."
    kill "$PID" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
fi
rm -f "$METAFILE"

# Kill any lingering ssh port-forward for this local port
pkill -f "127.0.0.1:${LOCAL_PORT}:127.0.0.1:" 2>/dev/null || true
pkill -f "${LOCAL_PORT}:127.0.0.1:" 2>/dev/null || true

if ! command -v "$COLAB_BIN" >/dev/null 2>&1 && [ ! -x "$COLAB_BIN" ]; then
  echo "[stop] Warning: colab CLI not found at '$COLAB_BIN'; local tunnel cleaned up only." >&2
  exit 1
fi

# Adopt a single orphan endpoint into the colab CLI local store (sessions.json),
# merging with existing entries, and print the generated session name.
seed_orphan_session() {
  local endpoint="$1"
  ENDPOINT="$endpoint" python3 -c '
import json, os
endpoint = os.environ["ENDPOINT"]
path = os.path.expanduser("~/.config/colab-cli/sessions.json")
data = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        data = {}
base = "orphan-" + endpoint[-8:]
name = base
i = 2
while name in data:
    name = "%s-%d" % (base, i)
    i += 1
data[name] = {"name": name, "token": "", "url": "", "endpoint": endpoint}
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
print(name)
'
}

# Stop orphan sessions: server-side Colab assignments that have no local name
# in the colab CLI store (shown as [?] by `colab sessions`). Re-adopt each into
# the local store keyed by endpoint, then stop by the generated name.
stop_orphan_sessions() {
  local sessions_output endpoint
  sessions_output="$("$COLAB_BIN" sessions 2>/dev/null || true)"

  if ! printf '%s\n' "$sessions_output" | grep -q '^\[?\] '; then
    echo "[stop] No orphan sessions found."
    return 0
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    echo "[stop] python3 not found; cannot adopt orphan sessions into the colab CLI store." >&2
    return 0
  fi

  local endpoints=()
  while IFS= read -r endpoint; do
    [ -n "$endpoint" ] && endpoints+=("$endpoint")
  done < <(printf '%s\n' "$sessions_output" | sed -n 's/^\[?\] \([^ ]*\).*/\1/p')

  if [ "${#endpoints[@]}" -eq 0 ]; then
    echo "[stop] No orphan sessions found."
    return 0
  fi

  echo "[stop] Stopping ${#endpoints[@]} orphan session(s)..."
  local ok=0
  for endpoint in "${endpoints[@]}"; do
    if ! name="$(seed_orphan_session "$endpoint")"; then
      echo "[stop]   - ${endpoint}: failed to adopt into CLI store; skipping." >&2
      continue
    fi
    echo "[stop]   - ${endpoint} (adopted as '${name}')"
    if "$COLAB_BIN" stop -s "$name" >/dev/null 2>&1; then
      ok=$((ok + 1))
      echo "[stop]   stopped."
    else
      echo "[stop]   - ${endpoint}: stop failed; leaving local store entry in place." >&2
    fi
  done
  echo "[stop] Stopped ${ok}/${#endpoints[@]} orphan session(s)."
}

echo "[stop] Stopping Colab session '${SESSION}' (from ${SCRIPT_DIR})..."
"$COLAB_BIN" stop -s "$SESSION" || true

# Re-adopt any orphan sessions (server-side assignments with no local name in
# the colab CLI store, shown as [?] by `colab sessions`) so they can be stopped.
# These cannot be stopped with a bare `colab stop` or `colab stop -s <name>`.
if [ "$STOP_ALL" -eq 1 ]; then
  stop_orphan_sessions
fi

echo ""
echo "=== Active sessions ==="
"$COLAB_BIN" sessions || true
echo "=== Compute unit usage ==="
"$COLAB_BIN" usage || true
