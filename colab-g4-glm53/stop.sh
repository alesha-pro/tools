#!/usr/bin/env bash
# Safely tear down local SSH tunnel, clean session credentials/state, AND stop the billable Colab G4 session.
# Usage:
#   ./stop.sh [SESSION=glm53] [LOCAL_PORT=18100]
#   ./stop.sh [--session glm53] [--port 18100]
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLAB_BIN="${COLAB_BIN:-$HOME/.local/bin/colab}"
STATE_DIR="${COLAB_STATE_DIR:-$HOME/.local/state/colab-g4-glm53}"

SESSION="glm53"
LOCAL_PORT="18100"
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
    -h|--help)
      sed -n '2,5p' "$0"
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

if [[ ! "$SESSION" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$ ]]; then
  echo "[stop] Error: invalid session name '$SESSION'." >&2
  exit 1
fi
if [[ ! "$LOCAL_PORT" =~ ^[0-9]+$ ]] || [ "$LOCAL_PORT" -lt 1024 ] || [ "$LOCAL_PORT" -gt 65535 ]; then
  echo "[stop] Error: invalid port '$LOCAL_PORT' (expected integer 1024..65535)." >&2
  exit 1
fi

PIDFILE="${STATE_DIR}/tunnel-${SESSION}-${LOCAL_PORT}.pid"
SSH_PIDFILE="${STATE_DIR}/tunnel-${SESSION}-${LOCAL_PORT}.ssh.pid"
METAFILE="${STATE_DIR}/tunnel-${SESSION}-${LOCAL_PORT}.env"
TOKEN_FILE="${STATE_DIR}/session-${SESSION}.token"
KNOWN_HOSTS_FILE="${STATE_DIR}/known_hosts.${SESSION}"
ENDPOINT_FILE="${STATE_DIR}/session-${SESSION}.endpoint"

kill_verified_pidfile() {
  local pf="$1" expected_substr="$2" label="$3"
  [ -f "$pf" ] && [ ! -L "$pf" ] && [ -O "$pf" ] || { rm -f "$pf" 2>/dev/null || true; return 0; }
  local pid cmdline
  pid="$(tr -d '\r\n' < "$pf" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && [ "$pid" -ne "$$" ] && kill -0 "$pid" 2>/dev/null; then
    cmdline="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if [[ "$cmdline" == *"$expected_substr"* ]]; then
      echo "[stop] Stopping ${label} PID ${pid}..."
      kill "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pf"
}

# Stop tunnel supervisor first so it cannot attempt a reconnect while stopping ssh/VM
kill_verified_pidfile "$PIDFILE" "tunnel.sh" "tunnel supervisor"
kill_verified_pidfile "$SSH_PIDFILE" "127.0.0.1:${LOCAL_PORT}:127.0.0.1:" "SSH forward"

# Narrow fallback for any lingering ssh port-forward owned by our UID for this exact session & port
escaped_session="$(printf '%s' "$SESSION" | sed -E 's/[][(){}.^$+*?|\\]/\\&/g')"
pkill -u "$(id -u)" -f "127\\.0\\.0\\.1:${LOCAL_PORT}:127\\.0\\.0\\.1:.*-s[[:space:]]+'?${escaped_session}'?([[:space:]]|$)" 2>/dev/null || true

rm -f "$METAFILE" "$TOKEN_FILE" "$KNOWN_HOSTS_FILE" "$ENDPOINT_FILE"

if command -v "$COLAB_BIN" >/dev/null 2>&1; then
  COLAB_BIN_RESOLVED="$(command -v "$COLAB_BIN")"
elif [ -x "$COLAB_BIN" ]; then
  COLAB_BIN_RESOLVED="$COLAB_BIN"
else
  echo "[stop] Warning: colab CLI not found at '$COLAB_BIN'; local tunnel and credentials cleaned up only." >&2
  exit 1
fi

echo "[stop] Stopping Colab session '${SESSION}' (from ${SCRIPT_DIR})..."
"$COLAB_BIN_RESOLVED" stop -s "$SESSION" || true

echo ""
echo "=== Active sessions ==="
"$COLAB_BIN_RESOLVED" sessions || true
echo "=== Compute unit usage ==="
"$COLAB_BIN_RESOLVED" usage || true
