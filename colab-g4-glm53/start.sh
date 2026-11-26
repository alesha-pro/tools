#!/usr/bin/env bash
# One-command launcher: provisions Google Colab G4 (RTX PRO 6000 Blackwell 96 GB),
# builds Project Maya for sm_120, downloads & packs an abliterated GLM-5.3-Flash EXL3 quant
# + DFlash2 drafter, starts the tuned OpenAI/Anthropic server on remote :8090,
# and opens an SSH port-forward tunnel to http://127.0.0.1:<PORT>/v1.
#
# Usage:
#   ./start.sh [2.51|3.05|4.05] [--ctx 131072|262144] [--port 18100] [--session glm53] [--bg]
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

if [ ! -f "$KEY" ]; then
  echo "[start] Generating ed25519 SSH key for Colab at $KEY ..."
  mkdir -p "$(dirname "$KEY")"
  ssh-keygen -t ed25519 -N "" -C "colab-cli" -f "$KEY"
fi

echo "[start] Checking Colab session '${SESSION}' (tier=${TIER}bpw, ctx=${CTX}, local_port=${LOCAL_PORT})..."
if ! "$COLAB_BIN" status -s "$SESSION" >/dev/null 2>&1; then
  echo "[start] Creating new Colab G4 session '${SESSION}' (~10.05 CU/hr)..."
  # NOTE: Never pass --high-mem for G4; G4 already allocates the full 176 GiB RAM / 48 vCPU shape.
  "$COLAB_BIN" new -s "$SESSION" --gpu G4
fi
"$COLAB_BIN" status -s "$SESSION"
"$COLAB_BIN" usage

echo "[start] Provisioning Project Maya (sm_120) + downloading ${HF_REPO} + starting server on G4..."
"$COLAB_BIN" ssh -s "$SESSION" -i "$KEY" -- bash -s -- "$HF_REPO" "$MODEL_DIR" "$CTX" "$SPEC_MIN_P" "$TIER" <<'REMOTE_EOF'
set -euo pipefail
HF_REPO="$1"
MODEL_DIR="$2"
CTX="$3"
SPEC_MIN_P="$4"
TIER="$5"

export PATH="/usr/local/cuda/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo "=== [G4] 1. Tools & Python deps ==="
if ! command -v ninja >/dev/null 2>&1 || ! command -v cmake >/dev/null 2>&1; then
  apt-get -qq update
  apt-get -qq install -y aria2 ninja-build cmake build-essential >/dev/null
fi
python3 -c "import huggingface_hub, jinja2, regex, yaml, tqdm, requests, PIL, psutil, jsonschema" 2>/dev/null || \
  pip -q install -U huggingface_hub jinja2 regex pyyaml tqdm requests pillow psutil "jsonschema>=4.18,<5" >/dev/null

echo "=== [G4] 2. Clone & build Project Maya for sm_120 ==="
cd /content
if [ ! -d /content/project-maya ]; then
  git clone --depth 1 https://github.com/mw00/project-maya.git
fi
cd /content/project-maya

if [ ! -x /content/project-maya/build/maya ]; then
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
fi

echo "=== [G4] 3. Download DFlash2 drafter (665 MB) + model (${HF_REPO}) ==="
mkdir -p /content/models/dflash2 "/content/models/${MODEL_DIR}"
if [ ! -f /content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf ]; then
  curl -sSL -o /content/models/dflash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf \
    "https://huggingface.co/Anbeeld/GLM-5.3-Flash-DFlash2-GGUF/resolve/f3569acb7f9cee95e66d24442d75536eb00ab842/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf"
fi

# Clean other model folders when switching tiers on Colab's ephemeral 236 GB disk
if [ ! -f "/content/models/${MODEL_DIR}/pack/dense.bin" ]; then
  for d in /content/models/MikeRoz-*; do
    [ -d "$d" ] && [ "$(basename "$d")" != "$MODEL_DIR" ] && rm -rf "$d"
  done
  env HF_XET_HIGH_PERFORMANCE=1 python3 - "$HF_REPO" "/content/models/${MODEL_DIR}" <<'PY'
import sys, time
from huggingface_hub import snapshot_download
repo, dst = sys.argv[1], sys.argv[2]
t0 = time.time()
print(f"Downloading {repo} -> {dst} ...", flush=True)
snapshot_download(repo_id=repo, local_dir=dst, max_workers=8)
print(f"Download finished in {time.time()-t0:.1f}s", flush=True)
PY
fi

echo "=== [G4] 4. Pack EXL3 (no weight copy) ==="
if [ ! -f "/content/models/${MODEL_DIR}/pack/dense.bin" ]; then
  python3 /content/project-maya/tools/exl3_pack.py --model "/content/models/${MODEL_DIR}"
fi

echo "=== [G4] 5. Write tuned config /content/maya-glm53.json ==="
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
print(json.dumps(cfg, indent=2))
PY

echo "=== [G4] 6. Start Maya server on 127.0.0.1:8090 ==="
pkill -f "serve/server.py" 2>/dev/null || true
pkill -f "build/maya" 2>/dev/null || true
sleep 1

nohup python3 /content/project-maya/serve/server.py \
  --engine maya \
  --config /content/maya-glm53.json \
  --host 127.0.0.1 \
  --port 8090 \
  > /content/maya-server.log 2>&1 < /dev/null &

echo "Waiting for model load (cold load ~3-5 min first time, ~25s warm)..."
ready=0
for i in $(seq 1 180); do
  if curl -sf http://127.0.0.1:8090/v1/models >/dev/null 2>&1; then
    echo "SERVER READY after $((i*3))s!"
    ready=1
    break
  fi
  if [ $((i % 10)) -eq 0 ]; then
    echo "  still loading... ($((i*3))s)"
  fi
  sleep 3
done
if [ "$ready" -ne 1 ]; then
  echo "ERROR: Maya server did not become ready within 540s. Last 40 log lines:" >&2
  tail -n 40 /content/maya-server.log >&2 || true
  exit 1
fi
curl -sf http://127.0.0.1:8090/v1/models && echo ""
REMOTE_EOF

METAFILE="/tmp/colab-tunnel-${SESSION}-${LOCAL_PORT}.env"
cat > "$METAFILE" <<EOF
MODEL_TIER="${TIER}"
MODEL_CTX="${CTX}"
MODEL_NAME="${MODEL_NAME}"
EOF

echo ""
echo "[start] Remote Maya server is up. Opening SSH tunnel to 127.0.0.1:${LOCAL_PORT}..."

export MODEL_TIER="$TIER"
export MODEL_CTX="$CTX"
export MODEL_NAME="$MODEL_NAME"
exec "${SCRIPT_DIR}/tunnel.sh" "$SESSION" "$LOCAL_PORT" "$TUNNEL_MODE"
