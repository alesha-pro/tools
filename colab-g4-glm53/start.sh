#!/usr/bin/env bash
# Hardened one-command launcher: provisions Google Colab G4 (RTX PRO 6000 Blackwell 96 GB),
# builds pinned Project Maya (v1.1.74 by default) for sm_120, downloads & verifies weights,
# starts an authenticated OpenAI/Anthropic server bound to remote 127.0.0.1:8090,
# and opens an isolated SSH port-forward tunnel to http://127.0.0.1:<PORT>/v1.
#
# Usage:
#   ./start.sh [2.51|3.05|4.05] [--ctx 131072|262144] [--port 18100] [--session glm53]
#              [--maya-ref v1.1.74] [--hf-revision main] [--no-auth] [--bg] [--no-wait]
#
# Examples:
#   ./start.sh                 # Default: 2.51bpw (~102 tok/s), 131K ctx, localhost:18100
#   ./start.sh 3.05            # Balanced quality (~89-95 tok/s), 131K ctx
#   ./start.sh 4.05            # Q4-level quality (~72 tok/s), 131K ctx
#   ./start.sh 2.51 --ctx 262144 --bg
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLAB_BIN="${COLAB_BIN:-$HOME/.local/bin/colab}"
KEY="${COLAB_SSH_KEY:-$HOME/.ssh/id_ed25519_colab}"
STATE_DIR="${COLAB_STATE_DIR:-$HOME/.local/state/colab-g4-glm53}"

TIER="2.51"
CTX="131072"
LOCAL_PORT="18100"
SESSION="glm53"
TUNNEL_MODE="fg"
WAIT_FOR_GPU="1"
MAYA_REF="${MAYA_REF:-v1.1.74}"
HF_REVISION="${HF_REVISION:-main}"
DFLASH_REVISION="${DFLASH_REVISION:-f3569acb7f9cee95e66d24442d75536eb00ab842}"
DFLASH_SHA256="${DFLASH_SHA256:-}"
AUTH_MODE="${COLAB_AUTH_MODE:-token}"

while [ $# -gt 0 ]; do
  case "$1" in
    2.51|3.05|4.05) TIER="$1"; shift ;;
    --ctx)
      [ $# -ge 2 ] || { echo "Missing value for --ctx" >&2; exit 1; }
      CTX="$2"; shift 2
      ;;
    --port|-p)
      [ $# -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
      LOCAL_PORT="$2"; shift 2
      ;;
    --session|-s)
      [ $# -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
      SESSION="$2"; shift 2
      ;;
    --maya-ref)
      [ $# -ge 2 ] || { echo "Missing value for --maya-ref" >&2; exit 1; }
      MAYA_REF="$2"; shift 2
      ;;
    --hf-revision)
      [ $# -ge 2 ] || { echo "Missing value for --hf-revision" >&2; exit 1; }
      HF_REVISION="$2"; shift 2
      ;;
    --no-auth)      AUTH_MODE="none"; shift ;;
    --bg)           TUNNEL_MODE="--bg"; shift ;;
    --no-wait)      WAIT_FOR_GPU="0"; shift ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

validate_inputs() {
  if [[ ! "$SESSION" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$ ]]; then
    echo "[start] Error: invalid session name '$SESSION' (use alphanumeric, '.', '_', '-', max 64 chars)." >&2
    exit 1
  fi
  if [[ ! "$LOCAL_PORT" =~ ^[0-9]+$ ]] || [ "$LOCAL_PORT" -lt 1024 ] || [ "$LOCAL_PORT" -gt 65535 ]; then
    echo "[start] Error: invalid --port '$LOCAL_PORT' (expected integer 1024..65535)." >&2
    exit 1
  fi
  if [[ ! "$CTX" =~ ^[0-9]+$ ]] || [ "$CTX" -lt 4096 ] || [ "$CTX" -gt 1048576 ]; then
    echo "[start] Error: invalid --ctx '$CTX' (expected integer 4096..1048576)." >&2
    exit 1
  fi
  for ref_name in MAYA_REF HF_REVISION DFLASH_REVISION; do
    local val="${!ref_name}"
    if [[ ! "$val" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$ ]] || [[ "$val" == *..* ]]; then
      echo "[start] Error: unsafe git/HF ref in ${ref_name}: '$val'." >&2
      exit 1
    fi
  done
  if [ -n "$DFLASH_SHA256" ] && [[ ! "$DFLASH_SHA256" =~ ^[0-9a-fA-F]{64}$ ]]; then
    echo "[start] Error: DFLASH_SHA256 must be a 64-character hex SHA-256 digest." >&2
    exit 1
  fi
  if [[ "$AUTH_MODE" != "token" && "$AUTH_MODE" != "none" ]]; then
    echo "[start] Error: invalid COLAB_AUTH_MODE '$AUTH_MODE' (expected 'token' or 'none')." >&2
    exit 1
  fi
  if [[ "$KEY" == *$'\n'* ]] || [[ "$COLAB_BIN" == *$'\n'* ]]; then
    echo "[start] Error: newline characters are not permitted in paths." >&2
    exit 1
  fi
}

ensure_state_dir() {
  mkdir -p "$(dirname "$STATE_DIR")"
  if [ -L "$STATE_DIR" ]; then
    echo "[start] Security error: STATE_DIR '$STATE_DIR' must not be a symlink." >&2
    exit 1
  fi
  mkdir -p -m 700 "$STATE_DIR"
  if [ ! -d "$STATE_DIR" ] || [ ! -O "$STATE_DIR" ]; then
    echo "[start] Security error: STATE_DIR '$STATE_DIR' is not owned by the current user." >&2
    exit 1
  fi
  chmod 700 "$STATE_DIR"
}

assert_safe_file() {
  local f="$1"
  if [ -L "$f" ]; then
    echo "[start] Security error: refusing to use symlink '$f'." >&2
    exit 1
  fi
  if [ -e "$f" ] && [ ! -O "$f" ]; then
    echo "[start] Security error: '$f' is not owned by the current user." >&2
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

if command -v "$COLAB_BIN" >/dev/null 2>&1; then
  COLAB_BIN_RESOLVED="$(command -v "$COLAB_BIN")"
elif [ -x "$COLAB_BIN" ]; then
  COLAB_BIN_RESOLVED="$COLAB_BIN"
else
  echo "[start] Error: colab CLI not found at '$COLAB_BIN'." >&2
  echo "[start] Install google-colab-cli or set COLAB_BIN=/path/to/colab." >&2
  exit 1
fi

for req_bin in ssh ssh-keygen curl python3; do
  if ! command -v "$req_bin" >/dev/null 2>&1; then
    echo "[start] Error: required command '$req_bin' not found in PATH." >&2
    exit 1
  fi
done

case "$TIER" in
  2.51)
    HF_REPO="MikeRoz/GLM-5.3-Flash-Uncensored-2.51bpw-h6-exl3"
    MODEL_DIR="MikeRoz-2.51bpw-uncensored"
    SPEC_MIN_P="0.95"
    ;;
  3.05)
    HF_REPO="MikeRoz/GLM-5.3-Flash-Uncensored-3.05bpw-h6-exl3"
    MODEL_DIR="MikeRoz-3.05bpw-uncensored"
    SPEC_MIN_P="0.90"
    ;;
  4.05)
    HF_REPO="MikeRoz/GLM-5.3-Flash-Uncensored-4.05bpw-h6-exl3"
    MODEL_DIR="MikeRoz-4.05bpw-uncensored"
    SPEC_MIN_P="0.95"
    ;;
esac

MODEL_NAME="glm-5.3-flash-uncensored-${TIER}bpw"
TOKEN_FILE="${STATE_DIR}/session-${SESSION}.token"
KNOWN_HOSTS_FILE="${STATE_DIR}/known_hosts.${SESSION}"
ENDPOINT_FILE="${STATE_DIR}/session-${SESSION}.endpoint"
METAFILE="${STATE_DIR}/tunnel-${SESSION}-${LOCAL_PORT}.env"

LOCAL_IS_TTY=0
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  LOCAL_IS_TTY=1
fi

if [ "$LOCAL_IS_TTY" -eq 1 ]; then
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

ensure_ssh_key() {
  local key_dir
  key_dir="$(dirname "$KEY")"
  if [ -L "$key_dir" ] || [ -L "$KEY" ] || [ -L "${KEY}.pub" ]; then
    echo "[start] Security error: SSH key path '$KEY' (or its parent) must not be a symlink." >&2
    exit 1
  fi
  if [ ! -d "$key_dir" ]; then
    mkdir -p -m 700 "$key_dir"
  elif [ -O "$key_dir" ] && [ "$(basename "$key_dir")" = ".ssh" ]; then
    chmod 700 "$key_dir" 2>/dev/null || true
  fi
  if [ ! -f "$KEY" ]; then
    printf '%s[start]%s Generating dedicated ed25519 SSH key for Colab at %s ...\n' "$C_CYAN" "$C_RESET" "$KEY"
    ssh-keygen -t ed25519 -N "" -C "colab-cli" -f "$KEY"
  fi
  assert_safe_file "$KEY"
  chmod 600 "$KEY"
  if [ -f "${KEY}.pub" ]; then
    assert_safe_file "${KEY}.pub"
    chmod 644 "${KEY}.pub"
  fi
}

ensure_api_token() {
  local force_rotate="${1:-0}"
  if [ "$AUTH_MODE" = "none" ]; then
    API_KEY=""
    rm -f "$TOKEN_FILE"
    return 0
  fi
  assert_safe_file "$TOKEN_FILE"
  if [ -n "${MAYA_API_KEY:-}" ]; then
    if [[ ! "$MAYA_API_KEY" =~ ^[a-zA-Z0-9._-]{16,256}$ ]]; then
      echo "[start] Error: MAYA_API_KEY must be 16..256 chars of [a-zA-Z0-9._-]." >&2
      exit 1
    fi
    API_KEY="$MAYA_API_KEY"
  elif [ "$force_rotate" -eq 0 ] && [ -s "$TOKEN_FILE" ]; then
    API_KEY="$(tr -d '\r\n' < "$TOKEN_FILE")"
    if [[ ! "$API_KEY" =~ ^[a-zA-Z0-9._-]{16,256}$ ]]; then
      API_KEY=""
    fi
  else
    API_KEY=""
  fi
  if [ -z "$API_KEY" ]; then
    API_KEY="$(python3 -c 'import secrets; print("sk-maya-" + secrets.token_hex(24))')"
  fi
  local tmp_tok
  tmp_tok="$(mktemp "${STATE_DIR}/.tok.${SESSION}.XXXXXX")"
  printf '%s\n' "$API_KEY" > "$tmp_tok"
  chmod 600 "$tmp_tok"
  mv -f "$tmp_tok" "$TOKEN_FILE"
}

sync_known_hosts_for_endpoint() {
  local status_text="$1" current_ep="" prev_ep=""
  # Extract endpoint token from `[session] <endpoint> | Hardware: ...`
  if [[ "$status_text" =~ ^\[[^]]+\][[:space:]]+([^[:space:]|]+) ]]; then
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
}

ensure_ssh_key

# Prevent macOS idle sleep while provisioning & tunneling (automatically exits when $$ exits)
if [ "$(uname -s)" = "Darwin" ] && command -v caffeinate >/dev/null 2>&1; then
  caffeinate -i -w $$ >/dev/null 2>&1 &
fi

printf '\n'
printf '%s╭──────────────────────────────────────────────────────────────────────╮%s\n' "$C_CYAN" "$C_RESET"
printf '%s│%s  %sGLM-5.3-Flash Uncensored · Colab G4 Launcher (Hardened)%s             %s│%s\n' \
  "$C_CYAN" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_CYAN" "$C_RESET"
printf '%s╰──────────────────────────────────────────────────────────────────────╯%s\n' "$C_CYAN" "$C_RESET"
printf '  %s%-12s%s %s%s%s\n' "$C_DIM" "Session" "$C_RESET" "$C_BOLD" "$SESSION" "$C_RESET"
printf '  %s%-12s%s %s\n' "$C_DIM" "GPU" "$C_RESET" "Colab G4 (RTX PRO 6000 Blackwell 96 GB)"
printf '  %s%-12s%s %s%s bpw%s\n' "$C_DIM" "Quant" "$C_RESET" "$C_CYAN" "$TIER" "$C_RESET"
printf '  %s%-12s%s %s\n' "$C_DIM" "Context" "$C_RESET" "$CTX"
printf '  %s%-12s%s %s\n' "$C_DIM" "Maya Ref" "$C_RESET" "$MAYA_REF"
printf '  %s%-12s%s %s\n' "$C_DIM" "Local Port" "$C_RESET" "127.0.0.1:${LOCAL_PORT}"
printf '  %s%-12s%s %s\n' "$C_DIM" "API Auth" "$C_RESET" "$([ "$AUTH_MODE" = "token" ] && echo "Bearer token (0600)" || echo "disabled (--no-auth)")"

sleep_with_countdown() {
  local secs="$1"
  local attempt="$2"
  local frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local idx=0
  local rem="$secs"

  if [ "$LOCAL_IS_TTY" -eq 1 ]; then
    while [ "$rem" -gt 0 ]; do
      local f="${frames:$((idx % 10)):1}"
      printf '\r  %s%s%s G4 busy (503). Next check (#%s) in %02ds... %s(Ctrl+C to stop)%s\033[K' \
        "$C_YELLOW" "$f" "$C_RESET" "$attempt" "$rem" "$C_DIM" "$C_RESET"
      sleep 1
      rem=$((rem - 1))
      idx=$((idx + 1))
    done
    printf '\r\033[K'
  else
    printf '  G4 busy (503). Waiting %ss before retry #%s...\n' "$secs" "$attempt"
    sleep "$secs"
  fi
}

SESSION_NEWLY_CREATED=0
create_g4_session() {
  local attempt=1
  local base_delays=(30 45 60 90 120)
  local max_cap="${COLAB_WAIT_CAP:-120}"
  local custom_base="${COLAB_RETRY_BASE:-}"
  local max_attempts="${COLAB_MAX_ATTEMPTS:-0}"

  printf '\n  %s▸%s Creating new Colab G4 session %s%s%s (~10.05 CU/hr)...\n' \
    "$C_YELLOW" "$C_RESET" "$C_BOLD" "$SESSION" "$C_RESET"

  while true; do
    local out rc=0
    # NOTE: Never pass --high-mem for G4; G4 already allocates the full 176 GiB RAM / 48 vCPU shape.
    # Disable colab-cli's internal 4x retry burst so we control rate-limit-safe spacing ourselves.
    out="$(COLAB_CLI_ASSIGN_RETRIES=0 "$COLAB_BIN_RESOLVED" new -s "$SESSION" --gpu G4 2>&1)" || rc=$?

    if [ "$rc" -eq 0 ] && ! grep -qiE "Error:|Traceback|Service Unavailable|Allocation refused|Backend rejected" <<<"$out"; then
      assert_safe_file "$KNOWN_HOSTS_FILE"
      assert_safe_file "$ENDPOINT_FILE"
      rm -f "$KNOWN_HOSTS_FILE" "$ENDPOINT_FILE"
      SESSION_NEWLY_CREATED=1
      printf '  %s✓%s Colab G4 session %s%s%s allocated (attempt #%s)\n' \
        "$C_GREEN" "$C_RESET" "$C_BOLD" "$SESSION" "$C_RESET" "$attempt"
      return 0
    fi

    # Strip Rich traceback box lines and unwrap hard-wrapped lines so we only inspect the actual error message.
    local clean_err
    clean_err="$(printf '%s\n' "$out" | sed -E '/^[╭│╰]/d' | tr '\n' ' ' | tr -s ' ')"

    # Hard stops: quota, too many sessions (412), rate-limit (429), auth (401/403), invalid tier (400).
    if grep -qiE "Allocation refused|precondition failed|Backend rejected|TooManyAssignmentsError|Too Many Requests|Unauthorized|Forbidden|not entitled|no quota|insufficient|invalid_grant|token.*expired|HTTP[^0-9]*(401|403|429)" <<<"$clean_err"; then
      printf '\n  %s✗%s Colab rejected allocation (hard stop, not retrying):\n' "$C_YELLOW" "$C_RESET" >&2
      printf '%s\n' "$out" >&2
      return 1
    fi

    # Retry only transient capacity / gateway / timeout errors (503/502/504/ReadTimeout)
    if [ "$WAIT_FOR_GPU" = "1" ] && grep -qiE "Service[[:space:]]*Unavailable|503|502|504|ReadTimeout|timed out|Temporary|capacity|Resource[[:space:]]*Exhausted" <<<"$clean_err"; then
      if [ "$max_attempts" -gt 0 ] && [ "$attempt" -ge "$max_attempts" ]; then
        printf '\n  %s✗%s Reached COLAB_MAX_ATTEMPTS=%s without available G4.\n' "$C_YELLOW" "$C_RESET" "$max_attempts" >&2
        return 1
      fi

      local delay
      if [ -n "$custom_base" ]; then
        delay="$custom_base"
      else
        local idx=$((attempt - 1))
        if [ "$idx" -ge "${#base_delays[@]}" ]; then
          idx=$((${#base_delays[@]} - 1))
        fi
        delay="${base_delays[$idx]}"
        if [ "$delay" -ge 30 ]; then
          local jitter=$(( (RANDOM % 9) - 4 ))
          delay=$((delay + jitter))
        fi
      fi
      if [ "$delay" -gt "$max_cap" ]; then
        delay="$max_cap"
      fi
      [ "$delay" -lt 1 ] && delay=1

      attempt=$((attempt + 1))
      sleep_with_countdown "$delay" "$attempt"
      continue
    fi

    printf '\n  %s✗%s Failed to create Colab G4 session:\n' "$C_YELLOW" "$C_RESET" >&2
    printf '%s\n' "$out" >&2
    return 1
  done
}

session_rc=0
session_check="$("$COLAB_BIN_RESOLVED" status -s "$SESSION" 2>&1)" || session_rc=$?
if [ "$session_rc" -ne 0 ] || grep -qiE "not found|no active sessions|does not exist" <<<"$session_check"; then
  create_g4_session
fi

printf '\n'
if status_out="$("$COLAB_BIN_RESOLVED" status -s "$SESSION" 2>&1)"; then
  sync_known_hosts_for_endpoint "$status_out"
  while IFS= read -r line; do
    [ -n "$line" ] && printf '  %s%s%s\n' "$C_DIM" "$line" "$C_RESET"
  done <<< "$status_out"
fi
if usage_out="$("$COLAB_BIN_RESOLVED" usage 2>&1)"; then
  while IFS= read -r line; do
    [ -n "$line" ] && printf '  %s%s%s\n' "$C_DIM" "$line" "$C_RESET"
  done <<< "$usage_out"
fi

API_KEY=""
ensure_api_token "$SESSION_NEWLY_CREATED"

REMOTE_SCRIPT_FILE="$(mktemp "${STATE_DIR}/.remote-provision.${SESSION}.XXXXXX")"
chmod 600 "$REMOTE_SCRIPT_FILE"
trap 'rm -f "$REMOTE_SCRIPT_FILE"' EXIT

# Embed API_KEY via stdin script assignment (0600 file) so it never appears in local or remote `ps aux` argv.
printf 'MAYA_REMOTE_API_KEY=%q\n' "$API_KEY" > "$REMOTE_SCRIPT_FILE"

cat >> "$REMOTE_SCRIPT_FILE" <<'REMOTE_EOF'
set -euo pipefail
umask 077
HF_REPO="$1"
MODEL_DIR="$2"
CTX="$3"
SPEC_MIN_P="$4"
TIER="$5"
IS_TTY="${6:-0}"
MAYA_REF="$7"
HF_REVISION="$8"
DFLASH_REVISION="$9"
DFLASH_SHA256="${10:-}"
LOCAL_PORT="${11:-18100}"
[ -n "${NO_COLOR:-}" ] && IS_TTY=0

if [ "$IS_TTY" -eq 1 ]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_CYAN=$'\033[36m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
else
  C_RESET=""
  C_BOLD=""
  C_DIM=""
  C_CYAN=""
  C_GREEN=""
  C_YELLOW=""
  C_RED=""
fi

cleanup_line() {
  [ "$IS_TTY" -eq 1 ] && printf '\r\033[K' || true
}
trap 'cleanup_line; exit 130' INT TERM

fmt_duration() {
  local s="${1:-0}"
  printf '%02d:%02d' $((s / 60)) $((s % 60))
}

step_header() {
  printf '\n%s[%s/6]%s %s%s%s\n' "$C_CYAN$C_BOLD" "$1" "$C_RESET" "$C_BOLD" "$2" "$C_RESET"
}

step_ok() {
  printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"
}

fail_with_log() {
  local msg="$1"
  local logfile="$2"
  local lines="${3:-50}"
  cleanup_line
  printf '  %s✗ %s%s\n' "$C_RED" "$msg" "$C_RESET" >&2
  if [ -f "$logfile" ]; then
    printf 'Last %s lines of %s:\n' "$lines" "$logfile" >&2
    tail -n "$lines" "$logfile" >&2 || true
  fi
  exit 42
}

LAST_DURATION=0
run_with_spinner() {
  local label="$1"
  local logfile="$2"
  shift 2
  local t0=$SECONDS
  "$@" > "$logfile" 2>&1 &
  local pid=$!
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local idx=0
  if [ "$IS_TTY" -eq 1 ]; then
    while kill -0 "$pid" 2>/dev/null; do
      local elapsed=$((SECONDS - t0))
      printf '\r\033[K  %s%s%s %s %s%s%s' \
        "$C_CYAN" "${frames[$idx]}" "$C_RESET" \
        "$label" \
        "$C_DIM" "$(fmt_duration "$elapsed")" "$C_RESET"
      idx=$(( (idx + 1) % ${#frames[@]} ))
      sleep 0.15
    done
    printf '\r\033[K'
  else
    printf '  %s\n' "$label"
  fi
  local rc=0
  wait "$pid" || rc=$?
  LAST_DURATION=$((SECONDS - t0))
  return "$rc"
}

export PATH="/usr/local/cuda/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

step_header 1 "Checking tools & Python dependencies"
install_deps() {
  if ! command -v ninja >/dev/null 2>&1 || ! command -v cmake >/dev/null 2>&1; then
    apt-get -qq update
    apt-get -qq install -y aria2 ninja-build cmake build-essential
  fi
  if ! python3 -c "import huggingface_hub, jinja2, regex, yaml, tqdm, requests, PIL, psutil, jsonschema" 2>/dev/null; then
    pip -q install -U huggingface_hub jinja2 regex pyyaml tqdm requests pillow psutil "jsonschema>=4.18,<5"
  fi
}
if command -v ninja >/dev/null 2>&1 && command -v cmake >/dev/null 2>&1 && \
   python3 -c "import huggingface_hub, jinja2, regex, yaml, tqdm, requests, PIL, psutil, jsonschema" 2>/dev/null; then
  step_ok "Cached"
else
  run_with_spinner "Installing build tools & Python packages..." /content/maya-deps.log install_deps || \
    fail_with_log "Failed to install tools/dependencies." /content/maya-deps.log 50
  step_ok "Dependencies ready in $(fmt_duration "$LAST_DURATION")"
fi

step_header 2 "Building Project Maya (${MAYA_REF}, CUDA sm_120)"
cd /content
MAYA_REF_MARKER="/content/project-maya/.maya_ref_ok"
if [ -f "$MAYA_REF_MARKER" ] && [ "$(cat "$MAYA_REF_MARKER" 2>/dev/null || true)" != "$MAYA_REF" ]; then
  rm -rf /content/project-maya
fi

checkout_maya() {
  rm -rf /content/project-maya
  mkdir -p /content/project-maya
  git -C /content/project-maya init -q
  git -C /content/project-maya remote add origin https://github.com/mw00/project-maya.git
  git -C /content/project-maya fetch --depth 1 origin "$MAYA_REF"
  git -C /content/project-maya checkout -q --detach FETCH_HEAD
  printf '%s\n' "$MAYA_REF" > "$MAYA_REF_MARKER"
}

if [ ! -f /content/project-maya/CMakeLists.txt ] || [ ! -f "$MAYA_REF_MARKER" ]; then
  run_with_spinner "Fetching Project Maya (${MAYA_REF})..." /content/maya-build.log checkout_maya || \
    fail_with_log "Failed to fetch Project Maya (${MAYA_REF})." /content/maya-build.log 50
fi
cd /content/project-maya

build_maya() {
  python3 -c 'import setup as S; S.get_llama_cpp()'
  cmake -G Ninja -S . -B build \
    -DCMAKE_BUILD_TYPE=Release \
    -DSTRATA_ENABLE_CUDA=ON \
    -DCMAKE_CUDA_ARCHITECTURES=120 \
    -DSTRATA_NATIVE_EXPERTS=ON \
    -DSTRATA_BUILD_TESTS=OFF \
    -DCMAKE_CUDA_COMPILER=/usr/local/cuda/bin/nvcc \
    -DCUDAToolkit_ROOT=/usr/local/cuda \
    -DSTRATA_GGML_DIR=/content/project-maya/third_party/llama.cpp
  cmake --build build --target maya -j 24
}

if [ -x /content/project-maya/build/maya ]; then
  step_ok "Cached (${MAYA_REF})"
else
  run_with_spinner "Building Maya (CUDA sm_120)..." /content/maya-build.log build_maya || \
    fail_with_log "Project Maya build failed." /content/maya-build.log 50
  step_ok "Built in $(fmt_duration "$LAST_DURATION")"
fi

step_header 3 "Downloading DFlash2 drafter (665 MB) & ${HF_REPO}"
mkdir -p /content/models/dflash2 "/content/models/${MODEL_DIR}"

verify_dflash_file() {
  python3 - "$1" "$DFLASH_SHA256" <<'PY'
import hashlib, os, sys
path, expected_sha = sys.argv[1], sys.argv[2].strip().lower()
if not os.path.isfile(path) or os.path.islink(path):
    sys.exit(1)
size = os.path.getsize(path)
if size < 600_000_000:
    sys.stderr.write(f"DFlash2 GGUF too small ({size} bytes)\n")
    sys.exit(1)
with open(path, "rb") as f:
    magic = f.read(4)
    if magic != b"GGUF":
        sys.stderr.write(f"Invalid GGUF header: {magic!r}\n")
        sys.exit(1)
    if expected_sha:
        h = hashlib.sha256(magic)
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
        got = h.hexdigest()
        if got != expected_sha:
            sys.stderr.write(f"DFlash2 SHA-256 mismatch: expected {expected_sha}, got {got}\n")
            sys.exit(1)
PY
}

need_dflash=0
need_model=0
if ! verify_dflash_file /content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf 2>/dev/null; then
  need_dflash=1
fi
[ ! -f "/content/models/${MODEL_DIR}/pack/.packed_ok" ] && need_model=1

download_dflash() {
  local tmp="/content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf.tmp"
  rm -f "$tmp"
  curl --proto '=https' --tlsv1.2 -fSL --retry 3 -o "$tmp" \
    "https://huggingface.co/Anbeeld/GLM-5.3-Flash-DFlash2-GGUF/resolve/${DFLASH_REVISION}/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf"
  verify_dflash_file "$tmp"
  mv -f "$tmp" /content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf
}

if [ "$need_dflash" -eq 0 ] && [ "$need_model" -eq 0 ]; then
  step_ok "Cached"
else
  if [ "$need_dflash" -eq 1 ]; then
    run_with_spinner "Downloading & verifying DFlash2 drafter (665 MB)..." /content/maya-dflash.log download_dflash || \
      fail_with_log "Failed to download or verify DFlash2 drafter." /content/maya-dflash.log 50
    step_ok "DFlash2 drafter verified in $(fmt_duration "$LAST_DURATION")"
  else
    step_ok "DFlash2 drafter cached & verified"
  fi

  if [ "$need_model" -eq 1 ]; then
    # Clean other model folders when switching tiers on Colab's ephemeral 236 GB disk
    for d in /content/models/MikeRoz-*; do
      [ -d "$d" ] && [ ! -L "$d" ] && [ "$(basename "$d")" != "$MODEL_DIR" ] && rm -rf "$d"
    done
    dl_t0=$SECONDS
    printf '  %s▸%s Downloading %s (rev: %s) -> /content/models/%s\n' \
      "$C_CYAN" "$C_RESET" "$HF_REPO" "$HF_REVISION" "$MODEL_DIR"
    env HF_XET_HIGH_PERFORMANCE=1 python3 - "$HF_REPO" "/content/models/${MODEL_DIR}" "$IS_TTY" "$HF_REVISION" <<'PY'
import glob, inspect, os, sys

repo, dst, is_tty, rev = sys.argv[1], sys.argv[2], sys.argv[3] == "1", sys.argv[4]
if not is_tty:
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

from huggingface_hub import snapshot_download

# Block unsafe pickle/executable formats from community model repositories
unsafe_patterns = [
    "*.pt", "*.pth", "*.bin", "*.pkl", "*.pickle", "*.ckpt",
    "*.so", "*.dll", "*.exe", "*.bat", "*.cmd", "*.sh",
]

kwargs = {
    "repo_id": repo,
    "revision": rev,
    "local_dir": dst,
    "max_workers": 8,
    "ignore_patterns": unsafe_patterns,
}
if is_tty:
    try:
        from huggingface_hub.utils import tqdm as hf_tqdm

        class LiveTqdm(hf_tqdm):
            def __init__(self, *args, **kw):
                if kw.get("disable") is None:
                    kw["disable"] = False
                super().__init__(*args, **kw)

        if "tqdm_class" in inspect.signature(snapshot_download).parameters:
            kwargs["tqdm_class"] = LiveTqdm
    except Exception:
        pass

snapshot_download(**kwargs)

safetensors = glob.glob(os.path.join(dst, "**", "*.safetensors"), recursive=True)
if not safetensors:
    raise RuntimeError(f"No .safetensors weight files found in {dst}")
PY
    step_ok "Model weights downloaded & checked in $(fmt_duration "$((SECONDS - dl_t0))")"
  fi
fi

step_header 4 "Packing EXL3 weights (zero-copy)"
if [ -f "/content/models/${MODEL_DIR}/pack/.packed_ok" ]; then
  step_ok "Cached"
else
  rm -rf "/content/models/${MODEL_DIR}/pack"
  run_with_spinner "Packing EXL3 weights..." /content/maya-pack.log \
    python3 /content/project-maya/tools/exl3_pack.py --model "/content/models/${MODEL_DIR}" || \
    fail_with_log "Failed to pack EXL3 weights." /content/maya-pack.log 50
  touch "/content/models/${MODEL_DIR}/pack/.packed_ok"
  step_ok "Packed in $(fmt_duration "$LAST_DURATION")"
fi

step_header 5 "Writing hardened Maya server config"
MAYA_REMOTE_API_KEY="$MAYA_REMOTE_API_KEY" python3 - "$MODEL_DIR" "$CTX" "$SPEC_MIN_P" "$TIER" "$LOCAL_PORT" <<'PY'
import json, os, sys

model_dir, ctx, spec_p, tier, local_port = (
    sys.argv[1],
    int(sys.argv[2]),
    sys.argv[3],
    sys.argv[4],
    int(sys.argv[5]),
)
api_key = os.environ.get("MAYA_REMOTE_API_KEY", "")
pack = f"/content/models/{model_dir}/pack"

args = [
    "--glm-pack", pack,
    "--max-context", str(ctx),
    "--vram-reserve-mib", "200",
    "--glm-ram-resident",
    "--dflash", "/content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf",
    "--spec-min-p", spec_p,
]
if ctx <= 131072:
    args += ["--kv", "k8v4"]
else:
    args += ["--kv", "int8", "--kv-resident", "20480"]

cfg = {
    "exe": "/content/project-maya/build/maya",
    "pack": pack,
    "tokenizer": f"{pack}/tokenizer",
    "model": f"glm-5.3-flash-uncensored-{tier}bpw",
    "model_name": f"glm-5.3-flash-uncensored-{tier}bpw",
    "host": "127.0.0.1",
    "port": 8090,
    "cors_origins": [
        f"http://127.0.0.1:{local_port}",
        f"http://localhost:{local_port}",
    ],
    "max_context": ctx,
    "args": args,
    "env": {
        "CUDA_DEVICE_ORDER": "PCI_BUS_ID",
        "CUDA_VISIBLE_DEVICES": "0",
        "MAYA_GLM_PCIE_SHARE": "0.00",
        "MAYA_GLM_CPU_LANE": "18",
        "MAYA_GLM_NGRAM_DRAFT": "1",
        "MAYA_GLM_DSA_GRAPHS": "1",
    },
}
if api_key:
    cfg["api_key"] = api_key

cfg_path = "/content/maya-glm53.json"
fd = os.open(cfg_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(cfg, f, indent=2)
os.chmod(cfg_path, 0o600)
PY
if [ "$CTX" -le 131072 ]; then
  KV_DESC="k8v4"
else
  KV_DESC="int8 (kv_resident=20480)"
fi
step_ok "Config ready (0600): ${KV_DESC}, DFlash2, spec_min_p=${SPEC_MIN_P}, loopback+CORS locked"

step_header 6 "Loading GLM-5.3-Flash (${TIER} bpw) into 96 GB VRAM"
if [ -f /content/maya-server.pid ]; then
  old_pid="$(cat /content/maya-server.pid 2>/dev/null || true)"
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" 2>/dev/null || true
  fi
  rm -f /content/maya-server.pid
fi
pkill -f "/content/project-maya/serve/server.py" 2>/dev/null || true
pkill -f "/content/project-maya/build/maya" 2>/dev/null || true
sleep 1

nohup python3 /content/project-maya/serve/server.py \
  --engine maya \
  --config /content/maya-glm53.json \
  --host 127.0.0.1 \
  --port 8090 \
  > /content/maya-server.log 2>&1 < /dev/null &
srv_pid=$!
printf '%s\n' "$srv_pid" > /content/maya-server.pid
chmod 600 /content/maya-server.pid /content/maya-server.log 2>/dev/null || true

probe_remote_models() {
  if [ -n "$MAYA_REMOTE_API_KEY" ]; then
    curl -sf --config - http://127.0.0.1:8090/v1/models >/dev/null 2>&1 <<EOF
header = "Authorization: Bearer ${MAYA_REMOTE_API_KEY}"
EOF
  else
    curl -sf http://127.0.0.1:8090/v1/models >/dev/null 2>&1
  fi
}

ready=0
t0=$SECONDS
last_probe=-1
last_log=0
frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
idx=0

if [ "$IS_TTY" -eq 0 ]; then
  printf '  Waiting for model load (cold ~3-5 min first time, ~25s warm)...\n'
fi

while true; do
  elapsed=$((SECONDS - t0))
  if ! kill -0 "$srv_pid" 2>/dev/null; then
    fail_with_log "Maya server exited unexpectedly during load." /content/maya-server.log 40
  fi
  if [ "$elapsed" -ge 540 ]; then
    break
  fi
  if [ "$last_probe" -lt 0 ] || [ $((elapsed - last_probe)) -ge 2 ]; then
    last_probe=$elapsed
    if probe_remote_models; then
      ready=1
      break
    fi
  fi
  if [ "$IS_TTY" -eq 1 ]; then
    printf '\r\033[K  %s%s%s Loading model into VRAM... %s%s%s' \
      "$C_CYAN" "${frames[$idx]}" "$C_RESET" \
      "$C_DIM" "$(fmt_duration "$elapsed")" "$C_RESET"
    idx=$(( (idx + 1) % ${#frames[@]} ))
    sleep 0.2
  else
    if [ "$elapsed" -gt 0 ] && [ $((elapsed / 30)) -gt "$last_log" ]; then
      last_log=$((elapsed / 30))
      printf '  still loading... (%s)\n' "$(fmt_duration "$elapsed")"
    fi
    sleep 2
  fi
done

cleanup_line
unset MAYA_REMOTE_API_KEY
if [ "$ready" -ne 1 ]; then
  fail_with_log "Maya server did not become ready within 540s." /content/maya-server.log 40
fi
step_ok "Model ready in $(fmt_duration "$((SECONDS - t0))")"
REMOTE_EOF

run_remote_provision() {
  local max_ssh_tries=4
  local ssh_try=1
  local ssh_bin="${SSH_BIN:-ssh}"
  local proxy_cmd
  proxy_cmd="$(ssh_proxy_quote "$COLAB_BIN_RESOLVED") ssh --proxy-mode -s $(ssh_proxy_quote "$SESSION") -i $(ssh_proxy_quote "$KEY")"

  while [ "$ssh_try" -le "$max_ssh_tries" ]; do
    local rc=0
    assert_safe_file "$KNOWN_HOSTS_FILE"
    "$ssh_bin" \
      -F /dev/null \
      -i "$KEY" \
      -o IdentitiesOnly=yes \
      -o ForwardAgent=no \
      -o ForwardX11=no \
      -o PermitLocalCommand=no \
      -o ClearAllForwardings=yes \
      -o GatewayPorts=no \
      -o "ProxyCommand=${proxy_cmd}" \
      -o StrictHostKeyChecking=accept-new \
      -o "UserKnownHostsFile=${KNOWN_HOSTS_FILE}" \
      -o ServerAliveInterval=20 \
      -o ServerAliveCountMax=6 \
      -o ConnectTimeout=25 \
      root@colab \
      "bash -s -- $(printf '%q ' "$HF_REPO" "$MODEL_DIR" "$CTX" "$SPEC_MIN_P" "$TIER" "$LOCAL_IS_TTY" "$MAYA_REF" "$HF_REVISION" "$DFLASH_REVISION" "$DFLASH_SHA256" "$LOCAL_PORT")" \
      < "$REMOTE_SCRIPT_FILE" || rc=$?

    if [ "$rc" -eq 0 ]; then
      return 0
    fi
    # 42 = explicit remote error from fail_with_log; 130 = Ctrl+C interrupt
    if [ "$rc" -eq 42 ] || [ "$rc" -eq 130 ]; then
      return "$rc"
    fi

    if [ "$ssh_try" -lt "$max_ssh_tries" ]; then
      local st_rc=0 st_out
      st_out="$("$COLAB_BIN_RESOLVED" status -s "$SESSION" 2>&1)" || st_rc=$?
      if [ "$st_rc" -ne 0 ] || grep -qiE "not found|no active sessions|does not exist" <<<"$st_out"; then
        printf '\n  %s✗%s Colab session %s%s%s is no longer active.\n' \
          "$C_YELLOW" "$C_RESET" "$C_BOLD" "$SESSION" "$C_RESET" >&2
        if [ "$WAIT_FOR_GPU" = "1" ]; then
          printf '  %s▸%s Re-allocating G4 session...\n' "$C_YELLOW" "$C_RESET"
          create_g4_session
          ssh_try=$((ssh_try + 1))
          continue
        fi
        return 1
      fi
      sync_known_hosts_for_endpoint "$st_out"

      local wait_s=$((ssh_try * 5))
      printf '\n  %s▸%s SSH/WebSocket interrupted (rc=%s). Keep-alive reconnecting (%s/%s) in %ss...\n' \
        "$C_YELLOW" "$C_RESET" "$rc" "$ssh_try" "$max_ssh_tries" "$wait_s" >&2
      sleep "$wait_s"
    fi
    ssh_try=$((ssh_try + 1))
  done

  printf '\n  %s✗%s Could not complete SSH provisioning after %s attempts.\n' \
    "$C_YELLOW" "$C_RESET" "$max_ssh_tries" >&2
  printf '  If Colab VM is still running, stop billing with: %s/stop.sh %s %s\n' \
    "$SCRIPT_DIR" "$SESSION" "$LOCAL_PORT" >&2
  return 1
}

run_remote_provision
rm -f "$REMOTE_SCRIPT_FILE"

assert_safe_file "$METAFILE"
META_TMP="$(mktemp "${STATE_DIR}/.meta.${SESSION}.${LOCAL_PORT}.XXXXXX")"
cat > "$META_TMP" <<EOF
MODEL_TIER=${TIER}
MODEL_CTX=${CTX}
MODEL_NAME=${MODEL_NAME}
AUTH_MODE=${AUTH_MODE}
EOF
chmod 600 "$META_TMP"
mv -f "$META_TMP" "$METAFILE"

export MODEL_TIER="$TIER"
export MODEL_CTX="$CTX"
export MODEL_NAME="$MODEL_NAME"
export COLAB_AUTH_MODE="$AUTH_MODE"
exec "${SCRIPT_DIR}/tunnel.sh" "$SESSION" "$LOCAL_PORT" "$TUNNEL_MODE"
