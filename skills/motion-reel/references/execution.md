# Runtime and execution

## Requirements and setup

Default route: Node.js 22+, npm, Python 3.10+, FFmpeg/ffprobe with libx264 and AAC, and Playwright Chromium. No paid API and no Python packages are required for synthesis/mixing. Music analysis optionally needs numpy, librosa and soundfile. Check existing runtimes first; prefer a project venv for Python dependencies and a local npm install. Never overwrite unrelated config or upgrade a user's runtime as a side effect.

```bash
node --version
npm --version
python3 --version
ffmpeg -version
ffprobe -version
python3 <skill>/scripts/init_project.py <project>
cd <project>
npm install
npx playwright install chromium
npm test
```

The initializer refuses a nonempty destination. For an existing film project, selectively copy the helpers that are missing and preserve user work. The pinned Playwright package is tested with this starter; retain the generated package-lock.json. The renderer runs a loopback HTTP server so ES modules and local assets load correctly; it closes server/browser on success or failure. It never needs a browser login.

## Scene API

`index.html` exposes Canvas `#c`, `window.ready` (asset readiness promise) and `window.seek(seconds)`. URL parameters `w` and `h` select render dimensions; `render=1` disables the interactive preview clock. Create the Canvas context with `{willReadFrequently:true}` for consistent CPU readback during pixel hashing and export; the starter does this. Every scene must initialize its transforms/opacity/styles and cover its assigned interval. Derive all geometry from dimensions and time. Prefer locally served fonts; await `document.fonts.load(...)` for canvas-only font families because unused CSS faces may not load with `document.fonts.ready` alone.

The supplied sample lasts 15 s. When authoring a different film, change its duration/scene boundaries and use the same duration in every command. `render.mjs --duration` defines segment length, not a time stretch of the source. `--start` seeks on the global timeline. `--fps` times `--duration` must be an integer frame count. Width/height must be positive even integers.

```bash
# Fast full-length draft
node render.mjs --width 360 --height 640 --fps 30 --duration 15 --out out/animatic.mp4
# Inspect a 2-second range starting at global second 4
node render.mjs --start 4 --duration 2 --width 540 --height 960 --fps 60 --out out/fix-4-6.mp4
# Final: 4 equally spaced exposure samples per frame
node render.mjs --width 1080 --height 1920 --fps 60 --duration 15 --sub 4 --out out/silent.mp4
```

The renderer samples within each frame interval and averages each group using FFmpeg tmix before selecting it. This is a full-frame box-filter blur, not vector blur; it can ghost text/cuts. Use `--sub 1` for crisp UI or review cuts before enabling it. Four subframes cost roughly four times the rendering work. Encoded video is H.264, yuv420p, CRF 16, faststart.

Pixel-hash checks happen before every render, including shuffled seeks and reload. Metadata is written next to the MP4 as `.render.json` and `.determinism.json`. Assets/fonts and browser version must remain fixed for reproducibility. Partial renders are review artifacts; make a new full render after fixes rather than delivering a truncated range.

## Audio

```bash
python3 audio.py synth --duration 15 --bpm 120 --out out/score.wav --beats beats.json
python3 audio.py sfx --duration 15 --cues cues.json --out out/sfx.wav
```

`cues.json` is an array of `{ "t": 0.5, "type": "click", "gain": 0.4 }`. Supported types: click, pop, thump, whoosh. Empty cues make a duration-correct silent WAV. Invalid times/types fail explicitly. Score and SFX use repeatable seeds, 48 kHz PCM and headroom. The bundled score is a basic plucked arpeggio with percussion; adapt harmony/instrumentation and cues to the film instead of presenting it as bespoke musical direction.

For supplied music:

```bash
python3 -m venv .venv
.venv/bin/pip install numpy librosa soundfile
.venv/bin/python audio.py analyze assets/music.wav --out beats.json
# After confirming a downbeat at 0.48s in a 4/4 track:
.venv/bin/python audio.py analyze assets/music.wav --first-downbeat 0.48 --out beats.json
```

The detector estimates beats/onsets, not meter. Anchored downbeats assume 4/4 and must be checked against the actual music. Silence or poor detection is not a usable timing grid. Fix the grid manually or compose one; never call it measured if it was guessed. A generated grid begins on a composed downbeat at zero.

```bash
python3 finish.py mix --video out/silent.mp4 --music out/score.wav --sfx out/sfx.wav --out out/final.mp4
```

Mix pads/trims to video length, sums tracks with configurable gains and performs two-pass loudnorm targeting -14 LUFS / -1.5 dBTP before AAC encoding (headroom for codec overshoot). QA measures the encoded output; very short or silent material may not meet the loudness target. The command replaces existing audio with its explicit input tracks. If preserving an unchanged source is requested, use a direct mux with appropriate duration rather than this mix command. If the source is shorter, decide the loop/edit with the brief; automatic silence padding is only a technical fallback.

## Review and validation

```bash
python3 finish.py qa --video out/final.mp4 --out out/qa --expected-duration 15 --expected-width 1080 --expected-height 1920 --expected-fps 60 --require-audio --action-time 4.1
# Add --loop only for a looped deliverable.
```

Creates `contact-001.png` etc at 2 frames/s, phone sheets at 1 frame/s, 12 consecutive frames beginning at the action time, poster and verification JSON. Sheets are paginated over the full duration. They do not add timestamps over artwork; page one starts at 0, contact pages advance by 15 seconds and phone pages by 9 seconds. Review all pages. A strip close to the end can contain fewer than 12 frames; choose an earlier start if needed.

Full decode and expected metadata violations fail the command. Technical pass is separate from visual/audio review. Inspect output loudness in `verification.json`; resolve loudness warnings before a final handoff: reduce overly peaky SFX, compress the music if appropriate, or use more balanced gains and re-run mix/QA. Silence and intentionally quiet material may need a documented exception. Reframe and rerun separately for each requested format, giving each its own output and QA paths. Keep one source timeline; layout branches can depend on width/height.

For delivery copy the selected poster and first contact page to `out/poster.png` and `out/contact.png` if convenient, while retaining the full QA directory. Include all source assets and commands; exclude node_modules, caches, secrets and temporary render files from a handoff archive.
