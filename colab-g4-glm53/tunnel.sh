#!/usr/bin/env bash
# Resilient SSH local port-forward from local machine -> Colab G4 Maya server (:8090)
# Usage:
#   ./tunnel.sh [SESSION=glm53] [LOCAL_PORT=18100] [--bg]
#   ./tunnel.sh [--session glm53] [--port 18100] [--bg]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SESSION="glm53"
LOCAL_PORT="18100"
MODE="fg"
POS_IDX=0

while [ $# -gt 0 ]; do
  case "$1" in
    --bg) MODE="--bg"; shift ;;
    fg) MODE="fg"; shift ;;
    --session|-s)
      [ $# -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
      SESSION="$2"; shift 2
      ;;
    --port|-p)
      [ $# -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
      LOCAL_PORT="$2"; shift 2
      ;;
    -h|--help)
      sed -n '2,6p' "$0"
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

REMOTE_PORT="${REMOTE_PORT:-8090}"
KEY="${COLAB_SSH_KEY:-$HOME/.ssh/id_ed25519_colab}"
COLAB_BIN="${COLAB_BIN:-$HOME/.local/bin/colab}"
PIDFILE="/tmp/colab-tunnel-${SESSION}-${LOCAL_PORT}.pid"
LOGFILE="/tmp/colab-tunnel-${SESSION}-${LOCAL_PORT}.log"
METAFILE="/tmp/colab-tunnel-${SESSION}-${LOCAL_PORT}.env"

if [ -f "$METAFILE" ]; then
  # Preserve explicit env overrides from caller if already set
  _TIER_OVERRIDE="${MODEL_TIER:-}"
  _CTX_OVERRIDE="${MODEL_CTX:-}"
  _NAME_OVERRIDE="${MODEL_NAME:-}"
  # shellcheck disable=SC1090
  source "$METAFILE"
  [ -n "$_TIER_OVERRIDE" ] && MODEL_TIER="$_TIER_OVERRIDE"
  [ -n "$_CTX_OVERRIDE" ] && MODEL_CTX="$_CTX_OVERRIDE"
  [ -n "$_NAME_OVERRIDE" ] && MODEL_NAME="$_NAME_OVERRIDE"
fi

if ! command -v "$COLAB_BIN" >/dev/null 2>&1 && [ ! -x "$COLAB_BIN" ]; then
  echo "[tunnel] Error: colab CLI not found at '$COLAB_BIN'." >&2
  exit 1
fi

if [ ! -f "$KEY" ]; then
  echo "[tunnel] SSH key $KEY not found. Generating ed25519 key..."
  mkdir -p "$(dirname "$KEY")"
  ssh-keygen -t ed25519 -N "" -C "colab-cli" -f "$KEY"
fi

MODELS_JSON=""
probe_models() {
  local resp http_code
  resp="$(curl -sS -m 2 -w $'\n%{http_code}' "http://127.0.0.1:${LOCAL_PORT}/v1/models" 2>/dev/null || true)"
  http_code="${resp##*$'\n'}"
  if [ "$http_code" = "200" ]; then
    MODELS_JSON="${resp%$'\n'*}"
    return 0
  fi
  return 1
}

detect_model_name() {
  if [ -n "${MODEL_NAME:-}" ]; then
    printf '%s' "$MODEL_NAME"
    return 0
  fi
  if [ -n "${MODEL_TIER:-}" ]; then
    printf 'glm-5.3-flash-uncensored-%sbpw' "$MODEL_TIER"
    return 0
  fi
  if [ -n "$MODELS_JSON" ] && command -v python3 >/dev/null 2>&1; then
    local parsed
    parsed="$(python3 -c '
import json, sys
try:
    data = json.loads(sys.stdin.read())
    items = data.get("data") or []
    if items and isinstance(items[0], dict) and items[0].get("id"):
        print(items[0]["id"])
except Exception:
    pass
' <<<"$MODELS_JSON" 2>/dev/null || true)"
    if [ -n "$parsed" ]; then
      printf '%s' "$parsed"
      return 0
    fi
  fi
  printf 'glm-5.3-flash-uncensored-2.51bpw'
}

format_ctx() {
  local raw="${1:-}"
  case "$raw" in
    131072) printf '131K (131072)' ;;
    262144) printf '262K (262144)' ;;
    "")     printf '131K / 262K (server active)' ;;
    *)      printf '%s' "$raw" ;;
  esac
}

print_ready_summary() {
  local tunnel_mode_desc="$1"
  local model_name tier_display ctx_display stop_cmd

  model_name="$(detect_model_name)"
  tier_display="${MODEL_TIER:-}"
  if [ -z "$tier_display" ]; then
    if [[ "$model_name" =~ ([0-9]+\.[0-9]+)bpw ]]; then
      tier_display="${BASH_REMATCH[1]}"
    else
      tier_display="auto"
    fi
  fi
  ctx_display="$(format_ctx "${MODEL_CTX:-}")"

  if [ "$PWD" = "$SCRIPT_DIR" ]; then
    stop_cmd="./stop.sh"
  else
    stop_cmd="${SCRIPT_DIR}/stop.sh"
  fi
  if [ "$SESSION" != "glm53" ] || [ "$LOCAL_PORT" != "18100" ]; then
    stop_cmd="${stop_cmd} ${SESSION} ${LOCAL_PORT}"
  fi

  cat <<EOF

========================================================================
  GLM-5.3-Flash Uncensored — READY (200 OK)
========================================================================
  Status:             ONLINE (Colab session: ${SESSION}, ~10.05 CU/hr)
  GPU:                NVIDIA RTX PRO 6000 Blackwell (96 GB)
  Tier / Context:     ${tier_display} bpw EXL3 / ${ctx_display}
  Tunnel Mode:        ${tunnel_mode_desc}
  Local Host / IP:    127.0.0.1
  Local Port:         ${LOCAL_PORT}
  Model Name:         ${model_name}
  OpenAI Base URL:    http://127.0.0.1:${LOCAL_PORT}/v1
  Anthropic Base URL: http://127.0.0.1:${LOCAL_PORT}
  Web UI:             http://127.0.0.1:${LOCAL_PORT}/
  API Key:            sk-local (any non-empty string)

  OpenAI env:
    export OPENAI_BASE_URL="http://127.0.0.1:${LOCAL_PORT}/v1"
    export OPENAI_API_KEY="sk-local"
    export OPENAI_MODEL="${model_name}"

  Claude Code:
    ANTHROPIC_BASE_URL="http://127.0.0.1:${LOCAL_PORT}" \\
    ANTHROPIC_AUTH_TOKEN="sk-local" \\
    ANTHROPIC_MODEL="${model_name}" \\
    claude

  Quick curl check:
    curl -s http://127.0.0.1:${LOCAL_PORT}/v1/models | head -c 200; echo

  Stop & end Colab billing when done:
    ${stop_cmd}
========================================================================

EOF
}

SSH_PID=""
cleanup() {
  echo ""
  echo "[tunnel] Stopped."
  if [ -n "$SSH_PID" ] && kill -0 "$SSH_PID" 2>/dev/null; then
    kill "$SSH_PID" 2>/dev/null || true
    wait "$SSH_PID" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  exit 0
}

run_loop() {
  local printed_summary=0
  trap cleanup INT TERM
  while true; do
    echo "[tunnel] Connecting 127.0.0.1:${LOCAL_PORT} -> Colab(${SESSION}):${REMOTE_PORT} ..."
    ssh -N \
      -L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
      -i "$KEY" \
      -o "ProxyCommand=${COLAB_BIN} ssh --proxy-mode -s ${SESSION} -i ${KEY}" \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=20 \
      -o ServerAliveCountMax=3 \
      -o ConnectTimeout=20 \
      root@colab < /dev/null &
    SSH_PID=$!

    for _ in $(seq 1 60); do
      if ! kill -0 "$SSH_PID" 2>/dev/null; then
        break
      fi
      if probe_models; then
        if [ "$printed_summary" -eq 0 ] && [ "${TUNNEL_QUIET_SUMMARY:-0}" != "1" ]; then
          print_ready_summary "foreground (Ctrl+C to close tunnel; Colab VM stays running)"
          printed_summary=1
        elif [ "$printed_summary" -eq 1 ]; then
          echo "[tunnel] Reconnected at $(date '+%H:%M:%S'): http://127.0.0.1:${LOCAL_PORT}/v1 (200 OK)"
        fi
        break
      fi
      sleep 1
    done

    wait "$SSH_PID" || true
    SSH_PID=""
    echo "[tunnel] Disconnected at $(date '+%H:%M:%S'). Reconnecting in 3s (Ctrl+C to stop)..."
    sleep 3
  done
}

if [ "$MODE" = "--bg" ]; then
  if [ -f "$PIDFILE" ]; then
    existing_pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
      if probe_models; then
        print_ready_summary "background (already running, PID ${existing_pid}, log: ${LOGFILE})"
      else
        echo "[tunnel] Already running (PID ${existing_pid}) on 127.0.0.1:${LOCAL_PORT}, waiting for 200 OK (log: ${LOGFILE})"
      fi
      exit 0
    fi
    rm -f "$PIDFILE"
  fi

  TUNNEL_QUIET_SUMMARY=1 nohup "${SCRIPT_DIR}/tunnel.sh" "$SESSION" "$LOCAL_PORT" fg > "$LOGFILE" 2>&1 < /dev/null &
  bg_pid=$!
  echo "$bg_pid" > "$PIDFILE"

  for _ in $(seq 1 30); do
    if ! kill -0 "$bg_pid" 2>/dev/null; then
      echo "[tunnel] Background tunnel exited unexpectedly. Log ($LOGFILE):" >&2
      cat "$LOGFILE" >&2 || true
      rm -f "$PIDFILE"
      exit 1
    fi
    if probe_models; then
      print_ready_summary "background (PID ${bg_pid}, log: ${LOGFILE})"
      exit 0
    fi
    sleep 1
  done

  echo "[tunnel] Started in background (PID ${bg_pid}), still waiting for /v1/models 200 OK."
  echo "[tunnel] Check log: $LOGFILE"
else
  run_loop
fi
