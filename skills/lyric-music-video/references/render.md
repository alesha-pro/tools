# Render

The renderer drives the app in headless Chrome, streams raw frames over a WebSocket into ffmpeg (libx264,
BT.709 tagged). Each frame can average N sub-frames over the shutter for motion blur.

## Two passes

| | Draft | Final |
|---|---|---|
| purpose | the user watches the whole thing, gives notes | delivery |
| settings | `FPS=30 SAMPLES=1 CRF=22 PRESET=medium TUNE=none` | `FPS=60 SAMPLES=4 CRF=16 PRESET=slow TUNE=grain` |
| 3-min 1080p size | ~240 MB | ~1.4 GB |
| work | 1x | ~8x (2x frames, 4x sub-frames) |

Always send a draft first; notes after a draft are normal ("AI one word", "the stamp text overflows") and cost
minutes instead of an hour.

```bash
bash scripts/render-chunks.sh <project> pink-boots-draft               # env as in the table
FPS=60 SAMPLES=4 bash scripts/render-chunks.sh <project> pink-boots-v1
```

It splits the frames into `P` chunks, renders them in parallel, concatenates without re-encoding, adds the
audio (padded with silence for the end card) and writes a phone copy.

## Where to render

- **A laptop can run out of memory** on a full 60 fps, 4-sample render (the example Mac died twice at ~92%,
  leaving a 1.4 GB file without a `moov` atom). Use it for sheets and short clips.
- **A Linux GPU box** works well even while other jobs use the GPUs: Chrome with ANGLE on Vulkan needs about
  300 MB of VRAM. Use Playwright's Chromium:
  ```bash
  export CHROME_PATH=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome RENDER_ANGLE=vulkan
  ```
  Measured on an RTX 3090 shared with LLM servers: ~10 fps at 1 sample for a lone Chrome.
- `RENDER_ANGLE=gl-egl` also works, about 3x slower than Vulkan.
- `RENDER_CPU=1` (SwiftShader) renders correctly but at 1.3 to 2.6 s per frame at 4 samples: only for a
  machine without a GPU and a lot of time.

## Parallelism

- Chrome always takes the first GPU; there is no flag to pick another one, and identical cards have the same
  device ID. Parallel Chromes on one GPU choke each other: 3 to 6 workers dropped to ~1 fps each, while a lone
  chunk did 10.5 fps. Use `P=1` or `P=2`.
- Throughput also depends on what else runs on that GPU; the same final render took 12 minutes once and 50
  minutes when the GPU was busy. Check the per-chunk fps in `chunks-<name>/c*.log` after a minute and plan.
- Render variants one after another, not at the same time.

## Gotchas

- Renders must use a dev server without live reload (`PDOOM_NO_HMR=1`; the scripts set it). A file saved
  mid-render otherwise reloads the page and kills the render.
- The last chunk must not end past the timeline (`--to` is clamped to the duration); a chunk that asks for
  frames after the end fails with `evaluate: undefined`.
- `still()` is async after the patch: sheet and stills modes await it; custom scripts must too.
- Watch renders by their logs and the frame counter, not just by process lists: a hung render and a slow one
  look the same from `ps`.
- Stopping processes with `pkill -f "<pattern>"` over ssh can kill the ssh command itself, because its own
  command line contains the pattern. Use a small script that skips its own PID.
- Moving files: a 1.4 GB MP4 per variant; copy only what the user needs and leave drafts on the render box.
