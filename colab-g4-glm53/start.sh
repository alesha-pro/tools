#!/usr/bin/env bash
# One-command launcher: provisions Google Colab G4 (RTX PRO 6000 Blackwell 96 GB),
# builds Project Maya for sm_120, downloads & packs an abliterated GLM-5.3-Flash EXL3 quant
# + DFlash2 drafter, starts the tuned OpenAI/Anthropic server on remote :8090,
# and opens an SSH port-forward tunnel to http://127.0.0.1:<PORT>/v1.
#
# Usage:
#   ./start.sh [2.51|3.05|4.05] [--ctx 131072|262144] [--port 18100] [--session glm53] [--bg] [--no-wait]
#
# Examples:
#   ./start.sh                 # Default: 2.51bpw (~102 tok/s), 131K ctx, localhost:18100
#   ./start.sh 3.05            # Balanced quality (~89-95 tok/s), 131K ctx
#   ./start.sh 4.05            # Q4-level quality (~72 tok/s), 131K ctx
#   ./start.sh 2.51 --ctx 262144 --bg
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLAB_BIN="${COLAB_BIN:-$HOME/.local/bin/colab}"
KEY="${COLAB_SSH_KEY:-$HOME/.ssh/id_ed25519_colab}"

TIER="2.51"
CTX="131072"
LOCAL_PORT="18100"
SESSION="glm53"
TUNNEL_MODE="fg"
WAIT_FOR_GPU="1"

while [ $# -gt 0 ]; do
  case "$1" in
    2.51|3.05|4.05) TIER="$1"; shift ;;
    --ctx)
      [ $# -ge 2 ] || { echo "Missing value for --ctx" >&2; exit 1; }
      CTX="$2"; shift 2
      ;;
    --port)
      [ $# -ge 2 ] || { echo "Missing value for --port" >&2; exit 1; }
      LOCAL_PORT="$2"; shift 2
      ;;
    --session|-s)
      [ $# -ge 2 ] || { echo "Missing value for $1" >&2; exit 1; }
      SESSION="$2"; shift 2
      ;;
    --bg)           TUNNEL_MODE="--bg"; shift ;;
    --no-wait)      WAIT_FOR_GPU="0"; shift ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if ! command -v "$COLAB_BIN" >/dev/null 2>&1 && [ ! -x "$COLAB_BIN" ]; then
  echo "[start] Error: colab CLI not found at '$COLAB_BIN'." >&2
  echo "[start] Install google-colab-cli or set COLAB_BIN=/path/to/colab." >&2
  exit 1
fi

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

if [ ! -f "$KEY" ]; then
  printf '%s[start]%s Generating ed25519 SSH key for Colab at %s ...\n' "$C_CYAN" "$C_RESET" "$KEY"
  mkdir -p "$(dirname "$KEY")"
  ssh-keygen -t ed25519 -N "" -C "colab-cli" -f "$KEY"
fi

printf '\n'
printf '%s╭──────────────────────────────────────────────────────────────────────╮%s\n' "$C_CYAN" "$C_RESET"
printf '%s│%s  %sGLM-5.3-Flash Uncensored · Colab G4 Launcher%s                        %s│%s\n' \
  "$C_CYAN" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_CYAN" "$C_RESET"
printf '%s╰──────────────────────────────────────────────────────────────────────╯%s\n' "$C_CYAN" "$C_RESET"
printf '  %s%-12s%s %s%s%s\n' "$C_DIM" "Session" "$C_RESET" "$C_BOLD" "$SESSION" "$C_RESET"
printf '  %s%-12s%s %s\n' "$C_DIM" "GPU" "$C_RESET" "Colab G4 (RTX PRO 6000 Blackwell 96 GB)"
printf '  %s%-12s%s %s%s bpw%s\n' "$C_DIM" "Quant" "$C_RESET" "$C_CYAN" "$TIER" "$C_RESET"
printf '  %s%-12s%s %s\n' "$C_DIM" "Context" "$C_RESET" "$CTX"
printf '  %s%-12s%s %s\n' "$C_DIM" "Local Port" "$C_RESET" "$LOCAL_PORT"

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
    out="$(COLAB_CLI_ASSIGN_RETRIES=0 "$COLAB_BIN" new -s "$SESSION" --gpu G4 2>&1)" || rc=$?

    if [ "$rc" -eq 0 ] && ! grep -qiE "Error:|Traceback|Service Unavailable|Allocation refused|Backend rejected" <<<"$out"; then
      printf '  %s✓%s Colab G4 session %s%s%s allocated (attempt #%s)\n' \
        "$C_GREEN" "$C_RESET" "$C_BOLD" "$SESSION" "$C_RESET" "$attempt"
      return 0
    fi

    # Strip Rich traceback box lines (e.g. `│ 170 │ except TooManyAssignmentsError:`)
    # and unwrap hard-wrapped lines so we only inspect the actual error message.
    local clean_err
    clean_err="$(printf '%s\n' "$out" | sed -E '/^[╭│╰]/d' | tr '\n' ' ' | tr -s ' ')"

    # Hard stops: quota, too many sessions (412), rate-limit (429), auth (401/403), invalid tier (400).
    # Never retry these so we don't hit Colab API rate limits or account locks.
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
        # Add small +/-4s jitter when waiting >=30s so polling never looks robotic
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
session_check="$("$COLAB_BIN" status -s "$SESSION" 2>&1)" || session_rc=$?
if [ "$session_rc" -ne 0 ] || grep -qiE "not found|no active sessions|does not exist" <<<"$session_check"; then
  create_g4_session
fi

printf '\n'
if status_out="$("$COLAB_BIN" status -s "$SESSION" 2>&1)"; then
  while IFS= read -r line; do
    [ -n "$line" ] && printf '  %s%s%s\n' "$C_DIM" "$line" "$C_RESET"
  done <<< "$status_out"
fi
if usage_out="$("$COLAB_BIN" usage 2>&1)"; then
  while IFS= read -r line; do
    [ -n "$line" ] && printf '  %s%s%s\n' "$C_DIM" "$line" "$C_RESET"
  done <<< "$usage_out"
fi

"$COLAB_BIN" ssh -s "$SESSION" -i "$KEY" -- bash -s -- "$HF_REPO" "$MODEL_DIR" "$CTX" "$SPEC_MIN_P" "$TIER" "$LOCAL_IS_TTY" <<'REMOTE_EOF'
set -euo pipefail
HF_REPO="$1"
MODEL_DIR="$2"
CTX="$3"
SPEC_MIN_P="$4"
TIER="$5"
IS_TTY="${6:-0}"
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
  exit 1
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

step_header 2 "Building Project Maya (CUDA sm_120)"
cd /content
if [ ! -d /content/project-maya ]; then
  run_with_spinner "Cloning Project Maya..." /content/maya-build.log \
    git clone --depth 1 https://github.com/mw00/project-maya.git /content/project-maya || \
    fail_with_log "Failed to clone Project Maya." /content/maya-build.log 50
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
  step_ok "Cached"
else
  run_with_spinner "Building Maya (CUDA sm_120)..." /content/maya-build.log build_maya || \
    fail_with_log "Project Maya build failed." /content/maya-build.log 50
  step_ok "Built in $(fmt_duration "$LAST_DURATION")"
fi

step_header 3 "Downloading DFlash2 drafter (665 MB) & ${HF_REPO}"
mkdir -p /content/models/dflash2 "/content/models/${MODEL_DIR}"

need_dflash=0
need_model=0
[ ! -f /content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf ] && need_dflash=1
[ ! -f "/content/models/${MODEL_DIR}/pack/dense.bin" ] && need_model=1

download_dflash() {
  local tmp="/content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf.tmp"
  rm -f "$tmp"
  curl -fSL -o "$tmp" \
    "https://huggingface.co/Anbeeld/GLM-5.3-Flash-DFlash2-GGUF/resolve/f3569acb7f9cee95e66d24442d75536eb00ab842/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf"
  mv -f "$tmp" /content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf
}

if [ "$need_dflash" -eq 0 ] && [ "$need_model" -eq 0 ]; then
  step_ok "Cached"
else
  if [ "$need_dflash" -eq 1 ]; then
    run_with_spinner "Downloading DFlash2 drafter (665 MB)..." /content/maya-dflash.log download_dflash || \
      fail_with_log "Failed to download DFlash2 drafter." /content/maya-dflash.log 50
    step_ok "DFlash2 drafter downloaded in $(fmt_duration "$LAST_DURATION")"
  else
    step_ok "DFlash2 drafter cached"
  fi

  if [ "$need_model" -eq 1 ]; then
    # Clean other model folders when switching tiers on Colab's ephemeral 236 GB disk
    for d in /content/models/MikeRoz-*; do
      [ -d "$d" ] && [ "$(basename "$d")" != "$MODEL_DIR" ] && rm -rf "$d"
    done
    dl_t0=$SECONDS
    printf '  %s▸%s Downloading %s -> /content/models/%s\n' "$C_CYAN" "$C_RESET" "$HF_REPO" "$MODEL_DIR"
    env HF_XET_HIGH_PERFORMANCE=1 python3 - "$HF_REPO" "/content/models/${MODEL_DIR}" "$IS_TTY" <<'PY'
import inspect, os, sys

repo, dst, is_tty = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
if not is_tty:
    os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

from huggingface_hub import snapshot_download

kwargs = {"repo_id": repo, "local_dir": dst, "max_workers": 8}
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
PY
    step_ok "Model weights downloaded in $(fmt_duration "$((SECONDS - dl_t0))")"
  fi
fi

step_header 4 "Packing EXL3 weights (zero-copy)"
if [ -f "/content/models/${MODEL_DIR}/pack/dense.bin" ]; then
  step_ok "Cached"
else
  run_with_spinner "Packing EXL3 weights..." /content/maya-pack.log \
    python3 /content/project-maya/tools/exl3_pack.py --model "/content/models/${MODEL_DIR}" || \
    fail_with_log "Failed to pack EXL3 weights." /content/maya-pack.log 50
  step_ok "Packed in $(fmt_duration "$LAST_DURATION")"
fi

step_header 5 "Writing Maya server config"
python3 - "$MODEL_DIR" "$CTX" "$SPEC_MIN_P" "$TIER" <<'PY'
import sys, json
model_dir, ctx, spec_p, tier = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
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
    # k8v4 cannot be combined with --kv-resident; use int8 KV streaming for 262K+
    args += ["--kv", "int8", "--kv-resident", "20480"]

cfg = {
    "exe": "/content/project-maya/build/maya",
    "pack": pack,
    "tokenizer": f"{pack}/tokenizer",
    "model": f"glm-5.3-flash-uncensored-{tier}bpw",
    "model_name": f"glm-5.3-flash-uncensored-{tier}bpw",
    "host": "127.0.0.1",
    "port": 8090,
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
with open("/content/maya-glm53.json", "w") as f:
    json.dump(cfg, f, indent=2)
PY
if [ "$CTX" -le 131072 ]; then
  KV_DESC="k8v4"
else
  KV_DESC="int8 (kv_resident=20480)"
fi
step_ok "Config ready: ${KV_DESC}, DFlash2, spec_min_p=${SPEC_MIN_P}, CPU_LANE=18, DSA_GRAPHS=1"

step_header 6 "Loading GLM-5.3-Flash (${TIER} bpw) into 96 GB VRAM"
pkill -f "serve/server.py" 2>/dev/null || true
pkill -f "build/maya" 2>/dev/null || true
sleep 1

nohup python3 /content/project-maya/serve/server.py \
  --engine maya \
  --config /content/maya-glm53.json \
  --host 127.0.0.1 \
  --port 8090 \
  > /content/maya-server.log 2>&1 < /dev/null &
srv_pid=$!

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
    if curl -sf http://127.0.0.1:8090/v1/models >/dev/null 2>&1; then
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
if [ "$ready" -ne 1 ]; then
  fail_with_log "Maya server did not become ready within 540s." /content/maya-server.log 40
fi
step_ok "Model ready in $(fmt_duration "$((SECONDS - t0))")"
REMOTE_EOF

METAFILE="/tmp/colab-tunnel-${SESSION}-${LOCAL_PORT}.env"
cat > "$METAFILE" <<EOF
MODEL_TIER="${TIER}"
MODEL_CTX="${CTX}"
MODEL_NAME="${MODEL_NAME}"
EOF

export MODEL_TIER="$TIER"
export MODEL_CTX="$CTX"
export MODEL_NAME="$MODEL_NAME"
exec "${SCRIPT_DIR}/tunnel.sh" "$SESSION" "$LOCAL_PORT" "$TUNNEL_MODE"
