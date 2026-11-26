<div align="center">

# GLM-5.3-Flash Uncensored на Google Colab G4

**До 102.3 tok/s на контексте 131K** на одной **RTX PRO 6000 Blackwell (96 GB)** через [Project Maya](https://github.com/mw00/project-maya) (`v1.1.74`) с SSH-туннелем на локальный `127.0.0.1`.

[English guide](README.md) · [Эталонные конфиги](configs/)

</div>

---

Готовый комплект для быстрого подъёма аблитерированного **GLM-5.3-Flash (321B-A18B)** на **Google Colab G4** через **Project Maya (`v1.1.74`)** и проброса OpenAI / Anthropic API на локальную машину через SSH-туннель (`colab ssh --proxy-mode`).

Когда сервер поднят и туннель реально пробросил порт (`http://127.0.0.1:18100/v1/models` отвечает `200 OK`), скрипт выводит готовую сводку с эндпоинтами, именем модели, сниппетами для OpenAI / Claude Code и напоминанием команды `./stop.sh`.

## Требования

- Аккаунт **Google Colab** с Compute Units (Colab Pro, Google AI Pro или Google AI Ultra).
- Установленный и авторизованный **`google-colab-cli`** (`colab` в `~/.local/bin/colab` или через переменную `COLAB_BIN`).
- Локально: `bash`, `ssh`, `ssh-keygen`, `curl`, `python3`.

## Быстрый старт

```bash
git clone https://github.com/alesha-pro/tools.git
cd tools/colab-g4-glm53

# Вариант 1 (по умолчанию, ~102.3 tok/s): EXL3 2.51 bpw Uncensored, 131K ctx
./start.sh

# Вариант 2 (~89–95 tok/s, выше качество): EXL3 3.05 bpw Uncensored, 131K ctx
./start.sh 3.05

# Вариант 3 (уровень Q4, ~71.8 tok/s): EXL3 4.05 bpw Uncensored, 131K ctx
./start.sh 4.05

# Длинный контекст 262K + запуск туннеля в фоне
./start.sh 2.51 --ctx 262144 --bg
```

Все скрипты используют `SCRIPT_DIR` и работают из любой текущей директории.

Полный холодный старт (поднять G4 + собрать Maya за ~87 с + скачать веса + упаковать за ~10 с + загрузить в память):
- `2.51 bpw` (98.1 GiB): **~10–12 минут**
- `3.05 bpw` (117.5 GiB): **~12–13 минут**
- `4.05 bpw` (153.8 GiB): **~18–20 минут**

После старта доступны локальные эндпоинты:
- **OpenAI API:** `http://127.0.0.1:18100/v1` (любой API-ключ, например `sk-local`)
- **Anthropic API:** `http://127.0.0.1:18100` (`/v1/messages` с поддержкой `thinking` и tool calls)
- **Web UI + монитор Maya:** `http://127.0.0.1:18100/`

### Переподключить туннель (если Мак заснул или оборвался WebSocket)

```bash
./tunnel.sh glm53 18100
# или в фоне:
./tunnel.sh glm53 18100 --bg
```

### Остановить всё (ОБЯЗАТЕЛЬНО после работы!)

```bash
./stop.sh
```

Скрипт закрывает локальный SSH-туннель, гасит VM `glm53` в Colab и выводит `colab sessions` + `colab usage` (`Usage rate: 0.00/hr`).

---

## Замеренное железо Colab G4 (2026-11-23)

- **GPU:** `NVIDIA RTX PRO 6000 Blackwell Server Edition` (`sm_120`, 188 SMs, 600 W), **95.6 GiB VRAM** GDDR7 ECC, CUDA 13.0 (`nvcc 13.0.88`)
- **GPU D2D / BF16 GEMM:** **1,325.5 GB/s** / **414.2 TFLOPS** (8192³)
- **PCIe:** **Gen 5 x16**, pinned **H2D 56.9 GB/s**, **D2H 56.5 GB/s**
- **CPU:** **AMD EPYC 9B45 (Zen 5 Turin)**, 24 физ. ядра / 48 потоков, 1 NUMA, полный **512-bit AVX-512** (`avx512f`, `avx512bw`, `avx512vnni`, `avx512_bf16`) + быстрый `PDEP`
- **RAM:** **176 GiB** (`Swap: 0B`), STREAM Triad **141.5 GB/s** (12T) / **139–140 GB/s** (24–48T)
- **Диск (`/content`):** **236 GB** (GCP Persistent Disk; холодное чтение ~330–400 MB/s, тёплый кэш 14 GB/s)
- **Расход кредитов:** **10.05 CU/ч** (**~19.9 ч** в Google AI Pro на 200 CU/мес; **~99.5 ч** на каждые 1000 CU в Google AI Ultra). `H100` стоит ~18.05 CU/ч, имеет на 16 GB меньше VRAM (80 GB) и в момент тестов 2× отдала `503 Service Unavailable`.

---

## Сводка замеров всех 3 тиров (Project Maya `v1.1.74`, `--bench`)

Все три кванта — публичные **EXL3 (`-hq`, head 6, MTP + vision + tools)** от `MikeRoz`, собранные из **`orcarouter/GLM-5.3-Flash-Uncensored-FP8`** (чистая abliteration, проверено без отказов как с выключенными, так и с включёнными размышлениями). Драфтер — **DFlash2** (`Anbeeld/GLM-5.3-Flash-DFlash2-GGUF`, 665 MB).

| Квант (`MikeRoz/...`) | Размер | Контекст / KV | Режим | Decode mean | Python | Проза | HTML/JS | Prefill 2K / 8K | Загрузка (холодн. / тёпл.) |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| **2.51 bpw** *(реком. скорость)* | 98.1 GiB | 131K / `k8v4` | DFlash2 (`p=0.95`) + `DSA_GRAPHS` | **102.3 tok/s** | 100.5 | 91.4 | 114.9 | **1190 / 2255** | ~5 мин / 22 с |
| **2.51 bpw** | 98.1 GiB | 131K / `k8v4` | DFlash2 (`p=0.92`) + `DSA_GRAPHS` | **101.0 tok/s** | 97.1 | 89.3 | **116.6** | 1179 / 2260 | ~5 мин / 22 с |
| **2.51 bpw** *(длинный ctx)* | 98.1 GiB | **262K** / `int8`+stream | DFlash2 (`p=0.92`) + `DSA_GRAPHS` | **98.9 tok/s** | 96.5 | 88.2 | 112.0 | 1142 / 2232 | ~5 мин / 22 с |
| **2.51 bpw** | 98.1 GiB | 131K / `int8`+stream | MTP (сток без DFlash2) | 71.5 tok/s | 70.5 | 71.1 | 72.9 | 993 / 1998 | ~5 мин / 22 с |
| **3.05 bpw** *(баланс качество/скорость)* | 117.5 GiB | 131K / `int8`+stream | DFlash2 (`p=0.90`) *(без `k8v4`/`GRAPHS`)* | **89.0 tok/s** *(~93–95 с `k8v4`)* | 87.3 | 74.0 | 105.8 | 1139 / 2258 | ~5 мин / 25 с |
| **3.05 bpw** | 117.5 GiB | 131K / `int8`+stream | MTP калиброванный (`PCIE=0, LANE=18`) | 63.6 tok/s | 61.9 | 64.9 | 63.9 | 1151 / 2264 | ~5 мин / 26 с |
| **4.05 bpw** *(Q4-качество)* | 153.8 GiB | 131K / `k8v4` | DFlash2 (`p=0.95`) + `DSA_GRAPHS` | **71.8 tok/s** | 65.5 | 64.4 | **85.7** | 819 / 2164 | ~7.5 мин |

---

## Что именно дало прирост (подобранные параметры)

1. **`MAYA_GLM_PCIE_SHARE=0.00` + `MAYA_GLM_CPU_LANE=18`:** по калибровке `--calibrate` на Zen 5 (141.5 GB/s DDR5 + AVX-512) считать промахи экспертов на 18 CPU-потоках быстрее, чем гонять их по PCIe Gen5 и стопорить основной поток GPU (+10.7% к стоку).
2. **`--dflash GLM-5.3-Flash-DFlash2-Q4_K_M.gguf --spec-min-p 0.95` (или `0.90` для `3.05`):** даёт **+35–40%** к скорости decode по сравнению с встроенным MTP (на `2.51 bpw`: `71.5 → 97.2 tok/s`, на `3.05 bpw`: `63.6 → 89.0 tok/s`).
3. **`--kv k8v4` (для контекста ≤ 131K):** INT8 ключи + rotated Q4 значения освобождают лишние гигабайты VRAM под пул экспертов (**+4.2 tok/s**, пробивает 100 tok/s на `2.51 bpw`). Для `262K` используется `--kv int8 --kv-resident 20480` (`k8v4` несовместим с `--kv-resident`).
4. **`MAYA_GLM_DSA_GRAPHS=1`:** включает CUDA graphs для шагов attention на одной карте (**+2.0 tok/s** бесплатно).
5. **`--vram-reserve-mib 200 --glm-ram-resident`:** отдаёт максимум из 95.6 GiB под эксперты и держит все оставшиеся эксперты в pinned RAM без вытеснения на диск.
6. **`MAYA_GLM_NGRAM_DRAFT=1`:** бесплатное n-gram дописывание повторяющихся фрагментов кода/правок/аргументов tool calls.

---

## Важные грабли Colab (уже учтены в скриптах)

1. **Не передавай `--high-mem` в `colab new --gpu G4`:** в `colab_cli` G4 не занесён в `HIGH_MEM_ONLY_ACCELERATORS`, и бэкенд отклоняет `shape=hm`. Без флага G4 сразу выдаёт полные 176 GiB RAM / 48 vCPU.
2. **Порт `8080` на Colab занят** внутренним сервисом — Maya запускается на `127.0.0.1:8090` и пробрасывается на локальный порт `18100`.
3. **SSH-ключ для Colab:** Colab принимает только `ed25519` / `ecdsa` (RSA отклоняет). Скрипты используют отдельный ключ `~/.ssh/id_ed25519_colab`.
4. **Неинтерактивный `colab ssh` не добавляет `/usr/local/cuda/bin` в `PATH`** — `start.sh` выставляет его явно.
5. **Диск 236 GB — временный:** при `colab stop` VM и файлы удаляются.
6. **Подключение к харнессам (OMP / OpenCode / Claude Code / Codex / OpenAI SDK):**
   - OpenAI base URL: `http://127.0.0.1:18100/v1`, model: `glm-5.3-flash-uncensored-2.51bpw` (Maya принимает любое имя модели и любой API-ключ).
   - Anthropic base URL: `http://127.0.0.1:18100`, API key: любой непустой.
   - Готовые эталонные JSON-конфиги лежат в [`configs/`](configs/).
