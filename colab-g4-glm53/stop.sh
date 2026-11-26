#!/usr/bin/env bash
# Safely tear down local SSH tunnel AND stop the billable Colab G4 session.
# Usage:
#   ./stop.sh [SESSION=glm53] [LOCAL_PORT=18100]
#   ./stop.sh [--session glm53] [--port 18100]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLAB_BIN="${COLAB_BIN:-$HOME/.local/bin/colab}"

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

echo "[stop] Stopping Colab session '${SESSION}' (from ${SCRIPT_DIR})..."
"$COLAB_BIN" stop -s "$SESSION" || true

echo ""
echo "=== Active sessions ==="
"$COLAB_BIN" sessions || true
echo "=== Compute unit usage ==="
"$COLAB_BIN" usage || true
