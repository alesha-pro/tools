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

IS_TTY=0
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  IS_TTY=1
fi

if [ "$IS_TTY" -eq 1 ]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_CYAN=$'\033[36m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
else
  C_RESET=""
  C_BOLD=""
  C_DIM=""
  C_CYAN=""
  C_GREEN=""
  C_YELLOW=""
fi

clear_line() {
  [ "$IS_TTY" -eq 1 ] && printf '\r\033[K' || true
}

fmt_duration() {
  local s="${1:-0}"
  printf '%02d:%02d' $((s / 60)) $((s % 60))
}

if [ ! -f "$KEY" ]; then
  printf '%s[tunnel]%s SSH key %s not found. Generating ed25519 key...\n' "$C_CYAN" "$C_RESET" "$KEY"
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

wait_for_tunnel() {
  local pid="$1"
  local max_wait="$2"
  local label="$3"
  local t0=$SECONDS
  local last_probe=-1
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local idx=0

  if [ "$IS_TTY" -eq 0 ] && [ -n "$label" ]; then
    printf '%s\n' "$label"
  fi

  while true; do
    local elapsed=$((SECONDS - t0))
    if ! kill -0 "$pid" 2>/dev/null; then
      clear_line
      return 2
    fi
    if [ "$elapsed" -ge "$max_wait" ]; then
      break
    fi
    if [ "$last_probe" -lt 0 ] || [ $((elapsed - last_probe)) -ge 1 ]; then
      last_probe=$elapsed
      if probe_models; then
        clear_line
        return 0
      fi
    fi
    if [ "$IS_TTY" -eq 1 ] && [ -n "$label" ]; then
      printf '\r\033[K  %s%s%s %s %s%s%s' \
        "$C_CYAN" "${frames[$idx]}" "$C_RESET" \
        "$label" \
        "$C_DIM" "$(fmt_duration "$elapsed")" "$C_RESET"
      idx=$(( (idx + 1) % ${#frames[@]} ))
      sleep 0.2
    else
      sleep 1
    fi
  done

  clear_line
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

  printf '\n'
  printf '%s╭──────────────────────────────────────────────────────────────────────╮%s\n' "$C_GREEN" "$C_RESET"
  printf '%s│%s  %s● GLM-5.3-Flash Uncensored — READY (200 OK)%s                         %s│%s\n' \
    "$C_GREEN" "$C_RESET" "$C_GREEN$C_BOLD" "$C_RESET" "$C_GREEN" "$C_RESET"
  printf '%s╰──────────────────────────────────────────────────────────────────────╯%s\n' "$C_GREEN" "$C_RESET"
  printf '  %s%-19s%s %sONLINE%s %s(Colab session: %s, ~10.05 CU/hr)%s\n' \
    "$C_DIM" "Status" "$C_RESET" "$C_GREEN$C_BOLD" "$C_RESET" "$C_DIM" "$SESSION" "$C_RESET"
  printf '  %s%-19s%s %s\n' "$C_DIM" "GPU" "$C_RESET" "NVIDIA RTX PRO 6000 Blackwell (96 GB)"
  printf '  %s%-19s%s %s%s bpw EXL3%s / %s\n' "$C_DIM" "Tier / Context" "$C_RESET" "$C_BOLD" "$tier_display" "$C_RESET" "$ctx_display"
  printf '  %s%-19s%s %s\n' "$C_DIM" "Tunnel Mode" "$C_RESET" "$tunnel_mode_desc"
  printf '  %s%-19s%s %s\n' "$C_DIM" "Local Host / IP" "$C_RESET" "127.0.0.1"
  printf '  %s%-19s%s %s\n' "$C_DIM" "Local Port" "$C_RESET" "$LOCAL_PORT"
  printf '  %s%-19s%s %s%s%s\n' "$C_DIM" "Model Name" "$C_RESET" "$C_BOLD" "$model_name" "$C_RESET"
  printf '  %s%-19s%s %shttp://127.0.0.1:%s/v1%s\n' "$C_DIM" "OpenAI Base URL" "$C_RESET" "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '  %s%-19s%s %shttp://127.0.0.1:%s%s\n' "$C_DIM" "Anthropic Base URL" "$C_RESET" "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '  %s%-19s%s %shttp://127.0.0.1:%s/%s\n' "$C_DIM" "Web UI" "$C_RESET" "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '  %s%-19s%s %s\n' "$C_DIM" "API Key" "$C_RESET" "sk-local (any non-empty string)"
  printf '\n'
  printf '  %sOpenAI env%s\n' "$C_BOLD" "$C_RESET"
  printf '    %sexport OPENAI_BASE_URL="http://127.0.0.1:%s/v1"%s\n' "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '    %sexport OPENAI_API_KEY="sk-local"%s\n' "$C_CYAN" "$C_RESET"
  printf '    %sexport OPENAI_MODEL="%s"%s\n' "$C_CYAN" "$model_name" "$C_RESET"
  printf '\n'
  printf '  %sClaude Code%s\n' "$C_BOLD" "$C_RESET"
  printf '    %sANTHROPIC_BASE_URL="http://127.0.0.1:%s" \\%s\n' "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '    %sANTHROPIC_AUTH_TOKEN="sk-local" \\%s\n' "$C_CYAN" "$C_RESET"
  printf '    %sANTHROPIC_MODEL="%s" \\%s\n' "$C_CYAN" "$model_name" "$C_RESET"
  printf '    %sclaude%s\n' "$C_CYAN" "$C_RESET"
  printf '\n'
  printf '  %sQuick curl check%s\n' "$C_BOLD" "$C_RESET"
  printf '    %scurl -s http://127.0.0.1:%s/v1/models | head -c 200; echo%s\n' "$C_DIM" "$LOCAL_PORT" "$C_RESET"
  printf '\n'
  printf '  %sStop & end Colab billing when done%s\n' "$C_BOLD" "$C_RESET"
  printf '    %s%s%s\n' "$C_YELLOW$C_BOLD" "$stop_cmd" "$C_RESET"
  printf '%s────────────────────────────────────────────────────────────────────────%s\n\n' "$C_DIM" "$C_RESET"
}

SSH_PID=""
cleanup() {
  clear_line
  printf '\n%s[tunnel]%s Stopped.\n' "$C_YELLOW" "$C_RESET"
  if [ -n "$SSH_PID" ] && kill -0 "$SSH_PID" 2>/dev/null; then
    kill "$SSH_PID" 2>/dev/null || true
    wait "$SSH_PID" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  exit 0
}

run_loop() {
  local printed_summary=0
  local wait_label rc
  trap cleanup INT TERM
  while true; do
    if [ "$printed_summary" -eq 0 ] && [ "${TUNNEL_QUIET_SUMMARY:-0}" != "1" ]; then
      wait_label="Opening SSH tunnel to 127.0.0.1:${LOCAL_PORT}..."
    else
      wait_label=""
      printf '%s[tunnel]%s Connecting 127.0.0.1:%s -> Colab(%s):%s ...\n' \
        "$C_CYAN" "$C_RESET" "$LOCAL_PORT" "$SESSION" "$REMOTE_PORT"
    fi

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

    rc=0
    wait_for_tunnel "$SSH_PID" 60 "$wait_label" || rc=$?
    if [ "$rc" -eq 0 ]; then
      if [ "$printed_summary" -eq 0 ] && [ "${TUNNEL_QUIET_SUMMARY:-0}" != "1" ]; then
        print_ready_summary "foreground (Ctrl+C to close tunnel; Colab VM stays running)"
        printed_summary=1
      elif [ "$printed_summary" -eq 1 ]; then
        printf '%s[tunnel]%s Reconnected at %s: http://127.0.0.1:%s/v1 %s(200 OK)%s\n' \
          "$C_GREEN" "$C_RESET" "$(date '+%H:%M:%S')" "$LOCAL_PORT" "$C_GREEN" "$C_RESET"
      fi
    fi

    wait "$SSH_PID" || true
    SSH_PID=""
    printf '%s[tunnel]%s Disconnected at %s. Reconnecting in 3s (Ctrl+C to stop)...\n' \
      "$C_YELLOW" "$C_RESET" "$(date '+%H:%M:%S')"
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
        printf '%s[tunnel]%s Already running (PID %s) on 127.0.0.1:%s, waiting for 200 OK (log: %s)\n' \
          "$C_CYAN" "$C_RESET" "$existing_pid" "$LOCAL_PORT" "$LOGFILE"
      fi
      exit 0
    fi
    rm -f "$PIDFILE"
  fi

  TUNNEL_QUIET_SUMMARY=1 nohup "${SCRIPT_DIR}/tunnel.sh" "$SESSION" "$LOCAL_PORT" fg > "$LOGFILE" 2>&1 < /dev/null &
  bg_pid=$!
  echo "$bg_pid" > "$PIDFILE"

  rc=0
  wait_for_tunnel "$bg_pid" 30 "Opening SSH tunnel to 127.0.0.1:${LOCAL_PORT}..." || rc=$?
  if [ "$rc" -eq 0 ]; then
    print_ready_summary "background (PID ${bg_pid}, log: ${LOGFILE})"
    exit 0
  elif [ "$rc" -eq 2 ]; then
    printf '[tunnel] Background tunnel exited unexpectedly. Log (%s):\n' "$LOGFILE" >&2
    cat "$LOGFILE" >&2 || true
    rm -f "$PIDFILE"
    exit 1
  fi

  printf '%s[tunnel]%s Started in background (PID %s), still waiting for /v1/models 200 OK.\n' \
    "$C_YELLOW" "$C_RESET" "$bg_pid"
  printf '  Check log: %s\n' "$LOGFILE"
else
  run_loop
fi
