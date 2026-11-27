<div align="center">

# GLM-5.3-Flash Uncensored on Google Colab G4

**Up to 102.3 tok/s at 131K context** on a single **RTX PRO 6000 Blackwell (96 GB)** via [Project Maya](https://github.com/mw00/project-maya) (`v1.1.74`), tunneled straight to `127.0.0.1` on your machine.

[Russian translation](README.ru.md) · [Reference configs](configs/)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)
[![GPU](https://img.shields.io/badge/measured%20on-Colab%20G4%20(RTX%20PRO%206000%2096GB)-76b900.svg)](https://x.com/superalesha)
[![Rate](https://img.shields.io/badge/burn%20rate-10.05%20CU%2Fhr-blue.svg)](#compute-units--cost)

</div>

---

One-command launcher for running abliterated **GLM-5.3-Flash (321B-A18B)** EXL3 quants with a **DFlash2** drafter on **Google Colab G4**. It provisions the G4 VM, builds Project Maya for `sm_120`, downloads and packs the weights, starts an OpenAI- and Anthropic-compatible server on the VM, and opens a self-healing SSH port-forward to `http://127.0.0.1:18100`.

Once the tunnel passes a live `200 OK` check on `/v1/models`, it prints your local endpoints, model name, copy-pasteable `OPENAI_*` / Claude Code env snippets, and the stop command.

## Prerequisites

- **Google Colab** account with Compute Units (Colab Pro, Google AI Pro, or Google AI Ultra).
- **`google-colab-cli`** (`colab`) installed and authenticated on your machine (checked at `~/.local/bin/colab` by default, or override with `COLAB_BIN=/path/to/colab`).
- Standard local tools: `bash`, `ssh`, `ssh-keygen`, `curl`, `python3`.

If you do not have an `ed25519` key at `~/.ssh/id_ed25519_colab`, `start.sh` / `tunnel.sh` generates one automatically.

---

## Quick start

```bash
git clone https://github.com/alesha-pro/tools.git
cd tools/colab-g4-glm53

# Default (~102.3 tok/s): EXL3 2.51 bpw Uncensored, 131K context, foreground tunnel
./start.sh

# Balanced quality/speed (~89–95 tok/s): EXL3 3.05 bpw Uncensored, 131K context
./start.sh 3.05

# Q4-class quality (~71.8 tok/s): EXL3 4.05 bpw Uncensored, 131K context
./start.sh 4.05

# 262K context + background tunnel
./start.sh 2.51 --ctx 262144 --bg
```

All three scripts resolve their own directory via `SCRIPT_DIR`, so you can also invoke them from any working directory (for example, `./colab-g4-glm53/start.sh`).

### Cold start timing

Full cold start (allocate G4 VM + build Maya in ~87 s + download weights + zero-copy pack in ~10 s + load into GPU/RAM):

- **`2.51 bpw`** (98.1 GiB): **~10–12 minutes**
- **`3.05 bpw`** (117.5 GiB): **~12–13 minutes**
- **`4.05 bpw`** (153.8 GiB): **~18–20 minutes**

### Reconnect the tunnel

If your laptop sleeps or the WebSocket drops while the Colab VM is still running:

```bash
./tunnel.sh glm53 18100
# or in the background:
./tunnel.sh glm53 18100 --bg
```

### Stop everything (always run when done!)

```bash
./stop.sh
```

`stop.sh` kills the local tunnel process and lingering port-forwards, calls `colab stop -s glm53` to end billing, and prints `colab sessions` and `colab usage` so you can verify the usage rate is back to `0.00/hr`.

### Stop orphan sessions too (`--all`)

Sessions created outside this repo's local `colab` CLI store (e.g. the web dashboard or another machine) show up as `[?]` in `colab sessions` and **cannot** be stopped with a bare `colab stop` or `colab stop -s <name>` — the CLI only sees sessions it created locally. Add `--all` to also re-adopt any such orphan by endpoint and stop it, so no billing leaks:

```bash
./stop.sh --all
```

`--all` is opt-in: without it, `stop.sh` only stops the named session and never touches unknown ones.

---

## Quant tiers and measured benchmarks

All three quants are public **EXL3 (`-hq`, head 6, MTP + vision + tools)** builds by `MikeRoz` from [`orcarouter/GLM-5.3-Flash-Uncensored-FP8`](https://huggingface.co/orcarouter/GLM-5.3-Flash-Uncensored-FP8) (clean abliteration, verified refusal-free with both thinking off and thinking on). Drafter: **DFlash2** (`Anbeeld/GLM-5.3-Flash-DFlash2-GGUF`, 665 MB).

Measured on Colab G4 with Project Maya `v1.1.74` (`--bench`, 2026-11-23):

| Quant (`MikeRoz/...`) | Size | Context / KV | Mode | Decode mean | Python | Prose | HTML/JS | Prefill 2K / 8K | Load (cold / warm) |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| **2.51 bpw** *(speed pick)* | 98.1 GiB | 131K / `k8v4` | DFlash2 (`p=0.95`) + `DSA_GRAPHS` | **102.3 tok/s** | 100.5 | 91.4 | 114.9 | **1190 / 2255** | ~5 min / 22 s |
| **2.51 bpw** | 98.1 GiB | 131K / `k8v4` | DFlash2 (`p=0.92`) + `DSA_GRAPHS` | **101.0 tok/s** | 97.1 | 89.3 | **116.6** | 1179 / 2260 | ~5 min / 22 s |
| **2.51 bpw** *(long ctx)* | 98.1 GiB | **262K** / `int8`+stream | DFlash2 (`p=0.92`) + `DSA_GRAPHS` | **98.9 tok/s** | 96.5 | 88.2 | 112.0 | 1142 / 2232 | ~5 min / 22 s |
| **2.51 bpw** | 98.1 GiB | 131K / `int8`+stream | Stock MTP (no DFlash2) | 71.5 tok/s | 70.5 | 71.1 | 72.9 | 993 / 1998 | ~5 min / 22 s |
| **3.05 bpw** *(balanced)* | 117.5 GiB | 131K / `int8`+stream | DFlash2 (`p=0.90`) *(bench without `k8v4`/`GRAPHS`)* | **89.0 tok/s** *(~93–95 w/ `k8v4`)* | 87.3 | 74.0 | 105.8 | 1139 / 2258 | ~5 min / 25 s |
| **3.05 bpw** | 117.5 GiB | 131K / `int8`+stream | Calibrated MTP (`PCIE=0, LANE=18`) | 63.6 tok/s | 61.9 | 64.9 | 63.9 | 1151 / 2264 | ~5 min / 26 s |
| **4.05 bpw** *(Q4 quality)* | 153.8 GiB | 131K / `k8v4` | DFlash2 (`p=0.95`) + `DSA_GRAPHS` | **71.8 tok/s** | 65.5 | 64.4 | **85.7** | 819 / 2164 | ~7.5 min |

---

## Compute Units & cost

Measured burn rate on Colab G4: **10.05 CU/hr**.

| Plan | Included monthly quota | G4 runtime per month |
|---|---:|---:|
| **Google AI Pro** | 200 CU / mo | **~19.9 hours** |
| **Google AI Ultra** *(1,000 CU tier)* | 1,000 CU / mo | **~99.5 hours** |
| **Google AI Ultra** *(2,000 CU tier)* | 2,000 CU / mo | **~199.0 hours** |

By comparison, Colab `H100` costs **~18.05 CU/hr**, has **16 GB less VRAM** (80 GB vs 95.6 GiB), and returned `503 Service Unavailable` twice during testing.

---

## Connecting harnesses and clients

Once `tunnel.sh` reports `200 OK` on `http://127.0.0.1:18100/v1/models`:

- **OpenAI Base URL:** `http://127.0.0.1:18100/v1`
- **Anthropic Base URL:** `http://127.0.0.1:18100` (`/v1/messages` with `thinking` and tool calls)
- **Web UI + Maya monitor:** `http://127.0.0.1:18100/`
- **API Key:** any non-empty string, e.g. `sk-local`
- **Model Name:** `glm-5.3-flash-uncensored-2.51bpw` (or `3.05bpw` / `4.05bpw`; Maya accepts any model string)

### OpenAI SDK / OpenCode / Codex / OMP

```bash
export OPENAI_BASE_URL="http://127.0.0.1:18100/v1"
export OPENAI_API_KEY="sk-local"
export OPENAI_MODEL="glm-5.3-flash-uncensored-2.51bpw"
```

### Claude Code

```bash
ANTHROPIC_BASE_URL="http://127.0.0.1:18100" \
ANTHROPIC_AUTH_TOKEN="sk-local" \
ANTHROPIC_MODEL="glm-5.3-flash-uncensored-2.51bpw" \
claude
```

### Quick health check

```bash
curl -s http://127.0.0.1:18100/v1/models
```

Reference Maya server JSON configs for all three tiers are included in [`configs/`](configs/).

---

## Measured Colab G4 hardware (2026-11-23)

- **GPU:** `NVIDIA RTX PRO 6000 Blackwell Server Edition` (`sm_120`, 188 SMs, 600 W), **95.6 GiB VRAM** GDDR7 ECC, CUDA 13.0 (`nvcc 13.0.88`)
- **GPU D2D / BF16 GEMM:** **1,325.5 GB/s** / **414.2 TFLOPS** (8192³)
- **PCIe:** **Gen 5 x16**, pinned **H2D 56.9 GB/s**, **D2H 56.5 GB/s**
- **CPU:** **AMD EPYC 9B45 (Zen 5 Turin)**, 24 physical cores / 48 threads, 1 NUMA node, full **512-bit AVX-512** (`avx512f`, `avx512bw`, `avx512vnni`, `avx512_bf16`) + fast `PDEP`
- **RAM:** **176 GiB** (`Swap: 0B`), STREAM Triad **141.5 GB/s** (12T) / **139–140 GB/s** (24–48T)
- **Disk (`/content`):** **236 GB** (GCP Persistent Disk; cold read ~330–400 MB/s, warm page cache 14 GB/s)

---

## Tuned knobs behind the speedup

1. **`MAYA_GLM_PCIE_SHARE=0.00` + `MAYA_GLM_CPU_LANE=18`:** `--calibrate` on Zen 5 (141.5 GB/s DDR5 + AVX-512) showed computing missed experts across 18 CPU threads is faster than streaming them over PCIe Gen5 and stalling the main GPU stream (**+10.7%** over stock).
2. **`--dflash GLM-5.3-Flash-DFlash2-Q4_K_M.gguf --spec-min-p 0.95` (`0.90` on `3.05`):** delivers **+35–40%** decode speed over built-in MTP (`2.51 bpw`: `71.5 → 97.2 tok/s`; `3.05 bpw`: `63.6 → 89.0 tok/s`).
3. **`--kv k8v4` (for context ≤ 131K):** INT8 keys + rotated Q4 values free extra GiB of VRAM for the GPU expert cache (**+4.2 tok/s**, pushing `2.51 bpw` past 100 tok/s). For `262K`, `start.sh` switches automatically to `--kv int8 --kv-resident 20480` (`k8v4` cannot be combined with `--kv-resident`).
4. **`MAYA_GLM_DSA_GRAPHS=1`:** enables CUDA graphs for single-GPU attention steps (**+2.0 tok/s** for free).
5. **`--vram-reserve-mib 200 --glm-ram-resident`:** gives almost all 95.6 GiB to GPU experts and pins remaining experts in RAM so they never spill back to disk.
6. **`MAYA_GLM_NGRAM_DRAFT=1`:** free n-gram drafting for repetitive code blocks, edits, and tool-call arguments.

---

## Colab gotchas (handled by the scripts)

1. **Do not pass `--high-mem` to `colab new --gpu G4`:** `colab_cli` does not list `G4` in `HIGH_MEM_ONLY_ACCELERATORS`, so the backend rejects `shape=hm`. Without it, G4 already allocates the full 176 GiB RAM / 48 vCPU VM.
2. **Port `8080` is taken on Colab** by an internal service — Maya binds to `127.0.0.1:8090` and tunnels to local port `18100`.
3. **SSH key type:** Colab accepts `ed25519` / `ecdsa` and rejects RSA keys. The scripts manage a dedicated `~/.ssh/id_ed25519_colab`.
4. **Non-interactive `colab ssh` omits `/usr/local/cuda/bin` from `PATH`** — `start.sh` exports it explicitly.
5. **The 236 GB `/content` disk is ephemeral:** `colab stop` deletes the VM and local model weights (and switching tiers in `start.sh` clears other cached `MikeRoz-*` folders first so 150+ GB downloads fit).
6. **Orphan sessions are invisible to `colab stop`:** the CLI only tracks sessions it created locally (stored in `~/.config/colab-cli/sessions.json`). A session made via the web dashboard or another machine shows as `[?]` in `colab sessions` and can't be stopped by name — so it keeps billing until killed. `./stop.sh --all` re-adopts any such orphan by endpoint and stops it (opt-in, to avoid killing sessions you didn't start).
