#!/usr/bin/env bash
# Hardened SSH local port-forward from local 127.0.0.1 -> Colab G4 Maya server (:8090)
# Usage:
#   ./tunnel.sh [SESSION=glm53] [LOCAL_PORT=18100] [--bg] [--no-auth]
#   ./tunnel.sh [--session glm53] [--port 18100] [--bg] [--no-auth]
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SESSION="glm53"
LOCAL_PORT="18100"
MODE="fg"
AUTH_OVERRIDE=""
POS_IDX=0

while [ $# -gt 0 ]; do
  case "$1" in
    --bg) MODE="--bg"; shift ;;
    fg) MODE="fg"; shift ;;
    --no-auth) AUTH_OVERRIDE="none"; shift ;;
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
STATE_DIR="${COLAB_STATE_DIR:-$HOME/.local/state/colab-g4-glm53}"

validate_inputs() {
  if [[ ! "$SESSION" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$ ]]; then
    echo "[tunnel] Error: invalid session name '$SESSION' (use alphanumeric, '.', '_', '-', max 64 chars)." >&2
    exit 1
  fi
  if [[ ! "$LOCAL_PORT" =~ ^[0-9]+$ ]] || [ "$LOCAL_PORT" -lt 1024 ] || [ "$LOCAL_PORT" -gt 65535 ]; then
    echo "[tunnel] Error: invalid local port '$LOCAL_PORT' (expected integer 1024..65535)." >&2
    exit 1
  fi
  if [[ ! "$REMOTE_PORT" =~ ^[0-9]+$ ]] || [ "$REMOTE_PORT" -lt 1 ] || [ "$REMOTE_PORT" -gt 65535 ]; then
    echo "[tunnel] Error: invalid REMOTE_PORT '$REMOTE_PORT' (expected integer 1..65535)." >&2
    exit 1
  fi
  if [[ "$KEY" == *$'\n'* ]] || [[ "$COLAB_BIN" == *$'\n'* ]]; then
    echo "[tunnel] Error: newline characters are not permitted in paths." >&2
    exit 1
  fi
}

ensure_state_dir() {
  mkdir -p "$(dirname "$STATE_DIR")"
  if [ -L "$STATE_DIR" ]; then
    echo "[tunnel] Security error: STATE_DIR '$STATE_DIR' must not be a symlink." >&2
    exit 1
  fi
  mkdir -p -m 700 "$STATE_DIR"
  if [ ! -d "$STATE_DIR" ] || [ ! -O "$STATE_DIR" ]; then
    echo "[tunnel] Security error: STATE_DIR '$STATE_DIR' is not owned by the current user." >&2
    exit 1
  fi
  chmod 700 "$STATE_DIR"
}

assert_safe_file() {
  local f="$1"
  if [ -L "$f" ]; then
    echo "[tunnel] Security error: refusing to use symlink '$f'." >&2
    exit 1
  fi
  if [ -e "$f" ] && [ ! -O "$f" ]; then
    echo "[tunnel] Security error: '$f' is not owned by the current user." >&2
    exit 1
  fi
}

ssh_proxy_quote() {
  local s="$1"
  s="${s//%/%%}"
  s="${s//\'/\'\\\'\'}"
  printf "'%s'" "$s"
}

validate_inputs
ensure_state_dir

PIDFILE="${STATE_DIR}/tunnel-${SESSION}-${LOCAL_PORT}.pid"
SSH_PIDFILE="${STATE_DIR}/tunnel-${SESSION}-${LOCAL_PORT}.ssh.pid"
LOGFILE="${STATE_DIR}/tunnel-${SESSION}-${LOCAL_PORT}.log"
METAFILE="${STATE_DIR}/tunnel-${SESSION}-${LOCAL_PORT}.env"
TOKEN_FILE="${STATE_DIR}/session-${SESSION}.token"
KNOWN_HOSTS_FILE="${STATE_DIR}/known_hosts.${SESSION}"
ENDPOINT_FILE="${STATE_DIR}/session-${SESSION}.endpoint"

# Parse metadata key=value file strictly without `source` or `eval`
load_metafile() {
  local f="$1" line k v
  [ -f "$f" ] || return 0
  assert_safe_file "$f"
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ""|\#*) continue ;;
    esac
    [[ "$line" == *=* ]] || continue
    k="${line%%=*}"
    v="${line#*=}"
    if [[ "$v" =~ ^\"(.*)\"$ ]]; then
      v="${BASH_REMATCH[1]}"
    elif [[ "$v" =~ ^\'(.*)\'$ ]]; then
      v="${BASH_REMATCH[1]}"
    fi
    if [[ ! "$v" =~ ^[a-zA-Z0-9._:/-]+$ ]]; then
      continue
    fi
    case "$k" in
      MODEL_TIER) [ -z "${_TIER_OVERRIDE}" ] && MODEL_TIER="$v" ;;
      MODEL_CTX)  [ -z "${_CTX_OVERRIDE}" ]  && MODEL_CTX="$v" ;;
      MODEL_NAME) [ -z "${_NAME_OVERRIDE}" ] && MODEL_NAME="$v" ;;
      AUTH_MODE)  [ -z "${_AUTH_OVERRIDE}" ] && AUTH_MODE="$v" ;;
    esac
  done < "$f"
}

_TIER_OVERRIDE="${MODEL_TIER:-}"
_CTX_OVERRIDE="${MODEL_CTX:-}"
_NAME_OVERRIDE="${MODEL_NAME:-}"
_AUTH_OVERRIDE="${AUTH_OVERRIDE:-${COLAB_AUTH_MODE:-}}"
AUTH_MODE="${_AUTH_OVERRIDE:-token}"
load_metafile "$METAFILE"

if command -v "$COLAB_BIN" >/dev/null 2>&1; then
  COLAB_BIN_RESOLVED="$(command -v "$COLAB_BIN")"
elif [ -x "$COLAB_BIN" ]; then
  COLAB_BIN_RESOLVED="$COLAB_BIN"
else
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

ensure_ssh_key() {
  local key_dir
  key_dir="$(dirname "$KEY")"
  if [ -L "$key_dir" ] || [ -L "$KEY" ] || [ -L "${KEY}.pub" ]; then
    echo "[tunnel] Security error: SSH key path '$KEY' (or its parent) must not be a symlink." >&2
    exit 1
  fi
  if [ ! -d "$key_dir" ]; then
    mkdir -p -m 700 "$key_dir"
  elif [ -O "$key_dir" ] && [ "$(basename "$key_dir")" = ".ssh" ]; then
    chmod 700 "$key_dir" 2>/dev/null || true
  fi
  if [ ! -f "$KEY" ]; then
    printf '%s[tunnel]%s SSH key %s not found. Generating dedicated ed25519 key...\n' "$C_CYAN" "$C_RESET" "$KEY"
    ssh-keygen -t ed25519 -N "" -C "colab-cli" -f "$KEY"
  fi
  assert_safe_file "$KEY"
  chmod 600 "$KEY"
  if [ -f "${KEY}.pub" ]; then
    assert_safe_file "${KEY}.pub"
    chmod 644 "${KEY}.pub"
  fi
}

read_api_key() {
  API_KEY=""
  if [ "$AUTH_MODE" = "none" ]; then
    return 0
  fi
  if [ -n "${MAYA_API_KEY:-}" ]; then
    if [[ "$MAYA_API_KEY" =~ ^[a-zA-Z0-9._-]{16,256}$ ]]; then
      API_KEY="$MAYA_API_KEY"
      return 0
    fi
  fi
  if [ -s "$TOKEN_FILE" ]; then
    assert_safe_file "$TOKEN_FILE"
    local tok
    tok="$(tr -d '\r\n' < "$TOKEN_FILE" 2>/dev/null || true)"
    if [[ "$tok" =~ ^[a-zA-Z0-9._-]{16,256}$ ]]; then
      API_KEY="$tok"
    fi
  fi
}

# Verify the Colab session actually exists before connecting so `colab ssh --proxy-mode`
# never auto-allocates an unintended billable session after `stop.sh` or VM expiry.
check_active_session_and_sync_hostkey() {
  local st_rc=0 st_out current_ep="" prev_ep=""
  st_out="$("$COLAB_BIN_RESOLVED" status -s "$SESSION" 2>&1)" || st_rc=$?
  if [ "$st_rc" -ne 0 ] || grep -qiE "not found|no active sessions|does not exist" <<<"$st_out"; then
    return 1
  fi
  if [[ "$st_out" =~ ^\[[^]]+\][[:space:]]+([^[:space:]|]+) ]]; then
    current_ep="${BASH_REMATCH[1]}"
  fi
  assert_safe_file "$KNOWN_HOSTS_FILE"
  assert_safe_file "$ENDPOINT_FILE"
  if [ -f "$ENDPOINT_FILE" ]; then
    prev_ep="$(tr -d '\r\n' < "$ENDPOINT_FILE" 2>/dev/null || true)"
  fi
  if [ -n "$current_ep" ] && [ "$current_ep" != "$prev_ep" ]; then
    rm -f "$KNOWN_HOSTS_FILE"
    printf '%s\n' "$current_ep" > "$ENDPOINT_FILE"
    chmod 600 "$ENDPOINT_FILE"
  fi
  return 0
}

ensure_ssh_key
API_KEY=""
read_api_key

MODELS_JSON=""
probe_models() {
  local resp http_code
  read_api_key
  if [ -n "$API_KEY" ]; then
    resp="$(curl -sS -m 2 --config - -w $'\n%{http_code}' "http://127.0.0.1:${LOCAL_PORT}/v1/models" 2>/dev/null <<EOF || true
header = "Authorization: Bearer ${API_KEY}"
EOF
)"
  else
    resp="$(curl -sS -m 2 -w $'\n%{http_code}' "http://127.0.0.1:${LOCAL_PORT}/v1/models" 2>/dev/null || true)"
  fi
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
  local model_name tier_display ctx_display stop_cmd auth_desc key_expr curl_auth

  read_api_key
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

  if [ -n "$API_KEY" ] && [ -f "$TOKEN_FILE" ]; then
    auth_desc="Bearer token in ${TOKEN_FILE} (0600)"
    key_expr="\$(cat \"${TOKEN_FILE}\")"
    curl_auth="-H \"Authorization: Bearer \$(cat \"${TOKEN_FILE}\")\" "
  elif [ -n "$API_KEY" ]; then
    auth_desc="Bearer token via \$MAYA_API_KEY"
    key_expr="\${MAYA_API_KEY}"
    curl_auth="-H \"Authorization: Bearer \${MAYA_API_KEY}\" "
  else
    auth_desc="disabled (--no-auth; any non-empty key accepted)"
    key_expr="sk-local"
    curl_auth=""
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
  printf '  %s%-19s%s %s\n' "$C_DIM" "Local Bind" "$C_RESET" "127.0.0.1:${LOCAL_PORT} (GatewayPorts=no)"
  printf '  %s%-19s%s %s%s%s\n' "$C_DIM" "Model Name" "$C_RESET" "$C_BOLD" "$model_name" "$C_RESET"
  printf '  %s%-19s%s %shttp://127.0.0.1:%s/v1%s\n' "$C_DIM" "OpenAI Base URL" "$C_RESET" "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '  %s%-19s%s %shttp://127.0.0.1:%s%s\n' "$C_DIM" "Anthropic Base URL" "$C_RESET" "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '  %s%-19s%s %shttp://127.0.0.1:%s/%s\n' "$C_DIM" "Web UI" "$C_RESET" "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '  %s%-19s%s %s\n' "$C_DIM" "API Auth" "$C_RESET" "$auth_desc"
  printf '\n'
  printf '  %sOpenAI env%s\n' "$C_BOLD" "$C_RESET"
  printf '    %sexport OPENAI_BASE_URL="http://127.0.0.1:%s/v1"%s\n' "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '    %sexport OPENAI_API_KEY="%s"%s\n' "$C_CYAN" "$key_expr" "$C_RESET"
  printf '    %sexport OPENAI_MODEL="%s"%s\n' "$C_CYAN" "$model_name" "$C_RESET"
  printf '\n'
  printf '  %sClaude Code%s\n' "$C_BOLD" "$C_RESET"
  printf '    %sANTHROPIC_BASE_URL="http://127.0.0.1:%s" \\%s\n' "$C_CYAN" "$LOCAL_PORT" "$C_RESET"
  printf '    %sANTHROPIC_AUTH_TOKEN="%s" \\%s\n' "$C_CYAN" "$key_expr" "$C_RESET"
  printf '    %sANTHROPIC_MODEL="%s" \\%s\n' "$C_CYAN" "$model_name" "$C_RESET"
  printf '    %sclaude%s\n' "$C_CYAN" "$C_RESET"
  printf '\n'
  printf '  %sQuick curl check%s\n' "$C_BOLD" "$C_RESET"
  printf '    %scurl -s %shttp://127.0.0.1:%s/v1/models | head -c 200; echo%s\n' "$C_DIM" "$curl_auth" "$LOCAL_PORT" "$C_RESET"
  printf '\n'
  printf '  %sStop & end Colab billing when done%s\n' "$C_BOLD" "$C_RESET"
  printf '    %s%s%s\n' "$C_YELLOW$C_BOLD" "$stop_cmd" "$C_RESET"
  printf '%s────────────────────────────────────────────────────────────────────────%s\n\n' "$C_DIM" "$C_RESET"
}

SSH_PID=""
CLEANED_UP=0
cleanup() {
  [ "$CLEANED_UP" -eq 1 ] && return 0
  CLEANED_UP=1
  clear_line
  printf '\n%s[tunnel]%s Stopped.\n' "$C_YELLOW" "$C_RESET"
  if [ -n "$SSH_PID" ] && kill -0 "$SSH_PID" 2>/dev/null; then
    kill "$SSH_PID" 2>/dev/null || true
    wait "$SSH_PID" 2>/dev/null || true
  fi
  rm -f "$SSH_PIDFILE"
  if [ -f "$PIDFILE" ] && [ "$(cat "$PIDFILE" 2>/dev/null || true)" = "$$" ]; then
    rm -f "$PIDFILE"
  fi
}

run_loop() {
  local printed_summary=0
  local wait_label rc proxy_cmd
  proxy_cmd="$(ssh_proxy_quote "$COLAB_BIN_RESOLVED") ssh --proxy-mode -s $(ssh_proxy_quote "$SESSION") -i $(ssh_proxy_quote "$KEY")"

  assert_safe_file "$PIDFILE"
  printf '%s\n' "$$" > "$PIDFILE"
  chmod 600 "$PIDFILE"

  trap 'cleanup; exit 0' INT TERM
  trap cleanup EXIT

  while true; do
    if ! check_active_session_and_sync_hostkey; then
      clear_line
      printf '%s[tunnel]%s Colab session %s%s%s is not active; exiting without re-creating VM.\n' \
        "$C_YELLOW" "$C_RESET" "$C_BOLD" "$SESSION" "$C_RESET" >&2
      return 1
    fi

    if [ "$printed_summary" -eq 0 ] && [ "${TUNNEL_QUIET_SUMMARY:-0}" != "1" ]; then
      wait_label="Opening SSH tunnel to 127.0.0.1:${LOCAL_PORT}..."
    else
      wait_label=""
      printf '%s[tunnel]%s Connecting 127.0.0.1:%s -> Colab(%s):%s ...\n' \
        "$C_CYAN" "$C_RESET" "$LOCAL_PORT" "$SESSION" "$REMOTE_PORT"
    fi

    assert_safe_file "$KNOWN_HOSTS_FILE"
    assert_safe_file "$SSH_PIDFILE"
    ssh -N \
      -F /dev/null \
      -L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
      -i "$KEY" \
      -o IdentitiesOnly=yes \
      -o ForwardAgent=no \
      -o ForwardX11=no \
      -o PermitLocalCommand=no \
      -o GatewayPorts=no \
      -o "ProxyCommand=${proxy_cmd}" \
      -o StrictHostKeyChecking=accept-new \
      -o "UserKnownHostsFile=${KNOWN_HOSTS_FILE}" \
      -o ExitOnForwardFailure=yes \
      -o ServerAliveInterval=20 \
      -o ServerAliveCountMax=3 \
      -o ConnectTimeout=20 \
      root@colab < /dev/null &
    SSH_PID=$!
    printf '%s\n' "$SSH_PID" > "$SSH_PIDFILE"
    chmod 600 "$SSH_PIDFILE"

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
    rm -f "$SSH_PIDFILE"
    printf '%s[tunnel]%s Disconnected at %s. Checking session & reconnecting in 3s (Ctrl+C to stop)...\n' \
      "$C_YELLOW" "$C_RESET" "$(date '+%H:%M:%S')"
    sleep 3
  done
}

is_our_tunnel_pid() {
  local pid="$1" cmdline=""
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  cmdline="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ "$cmdline" == *"tunnel.sh"* && "$cmdline" == *"$SESSION"* ]]
}

if [ "$MODE" = "--bg" ]; then
  assert_safe_file "$PIDFILE"
  assert_safe_file "$LOGFILE"
  if [ -f "$PIDFILE" ]; then
    existing_pid="$(tr -d '\r\n' < "$PIDFILE" 2>/dev/null || true)"
    if is_our_tunnel_pid "$existing_pid"; then
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

  if ! check_active_session_and_sync_hostkey; then
    printf '[tunnel] Error: Colab session '\''%s'\'' is not active. Run ./start.sh first.\n' "$SESSION" >&2
    exit 1
  fi

  : > "$LOGFILE"
  chmod 600 "$LOGFILE"
  bg_args=("$SESSION" "$LOCAL_PORT" fg)
  [ "$AUTH_MODE" = "none" ] && bg_args+=(--no-auth)
  TUNNEL_QUIET_SUMMARY=1 nohup "${SCRIPT_DIR}/tunnel.sh" "${bg_args[@]}" > "$LOGFILE" 2>&1 < /dev/null &
  bg_pid=$!
  printf '%s\n' "$bg_pid" > "$PIDFILE"
  chmod 600 "$PIDFILE"

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
