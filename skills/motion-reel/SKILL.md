---
name: motion-reel
description: "Create finished code-rendered motion graphics: showreels, product launch films, kinetic typography, continuous UI morphs and animated explainers, with music, frame critique and verified MP4 exports. Use for motion-video production or an explicit motion-reel request, not ordinary slide decks, video summaries or editing existing footage."
---

# Motion Reel Studio

Produce an editable animation project and a verified film, not just a prompt or HTML preview. Adapted from [Movez's course](https://x.com/0xmovez/status/2104216919033192746); implementation and corrections are documented in [provenance](references/provenance.md). Works with any capable coding agent; no particular model, paid service or external skill is required.

## Scope and starting decisions

Read the user's brief and existing project instructions. Preserve the requested engine, look, music and format. If a project already uses Remotion or HyperFrames, extend it; consult that framework's installed instructions/current docs. Otherwise use the bundled Canvas + Playwright + FFmpeg starter. The commands below are for this default route only.

Establish subject/product URL, purpose, duration, aspect ratios, reference, brand assets and sound. Infer supplied answers; ask only for consequential missing inputs. For an open-ended showreel, choose and state a concept, 15 seconds, 1080×1920, 60 fps and original synthesized audio. Do not make up product claims or screenshots. If real product assets are unavailable, collect them or label an authorized concept demo explicitly.

Create the production inside the user's artifact location. In the X repository, use `posts/<slug>/` for a new film and keep all assets there. Install no project files in the repo root. The skill itself stays in the personal skills directory. Work locally without API spending by default; a requested provider needs available tools, credentials and an authorized budget. Publication is a separate action.

## Production workflow

1. **Reference and assets.** Inspect provided images. For video references, extract frames every 0.5–1 s and inspect motion around cuts. Capture actual product states with browser tools; retain origin URLs and capture dates in `docs/assets.md`. Download fonts/images locally and wait for decoding. Write `docs/style-guide.md`: palette, typography, spatial hierarchy, shot rhythm, transition language, camera, texture, what to borrow and what to avoid. With no reference, define an original visual direction explicitly.
2. **Director's brief.** Read [direction](references/direction.md) for the requested mode. Write `docs/brief.md` and `docs/shotlist.md`; each shot has a purpose, start/end frame, exact copy, visual state, camera, transition, sound cue and asset. Use a single timeline for picture and audio. Show a concise plan and proceed within the authorized request. Wait only if the user asked for a plan/approval gate; silence never supplies that approval.
3. **Sound and beats.** Read [audio and execution](references/execution.md). Analyze supplied music or synthesize a score; save `beats.json` and `cues.json`. A beat detector does not establish bar downbeats. Label estimates and confirm the first downbeat before designing bar-level actions. Keep an unchanged-track request intact; do not stretch or normalize that source without permission.
4. **Stills and animatic.** Build hero compositions and sample every shot before polishing movement. Render a low-resolution animatic in the same aspect ratio, with the intended beat grid. Inspect it for pacing and phone readability. For long films, maintain a character bible and chapter timing contracts before implementing chapters. Do not delegate unless independently authorized.
5. **Animation.** Implement `window.seek(t)` as a pure time-to-frame mapping. Use closed-form spring tracks; seed and reset procedural randomness per frame, or derive noise from time and element identity. No persistent integration, timers, CSS transitions or wall-clock sampling in render mode. Local asset readiness belongs in `window.ready`. Make responsive composition decisions for each aspect ratio; do not crop a wide final into portrait.
6. **Critique and correction.** Read [review](references/review.md). Inspect contact sheets, consecutive frames around fast movement, and the actual playback if a playback tool is available. Fix up to three highest-impact defects per round and re-render affected ranges. Use up to three focused rounds by default; stop when the brief is met and no material issue remains, or report a concrete blocker. Never increase self-scores to manufacture a pass. Stills cannot verify audio or motion playback.
7. **Final and delivery.** Render requested resolutions, mix audio, create QA sheets and verify stream metadata, duration, frame count and full decoding. Deliver `out/final.mp4`, poster, contact sheets, source, a reproducible command and concise remaining limitations. Include `out/loop-check.mp4` only for a requested loop. Public copy follows the project's writing rules and final humanizer pass when available.

## Included working toolchain

Read [execution](references/execution.md) before running it. Replace `<skill>` with this SKILL.md's directory and `<project>` with the chosen film directory.

```bash
python3 <skill>/scripts/init_project.py <project>
cd <project>
npm install
npx playwright install chromium
node render.mjs --width 360 --height 640 --fps 30 --out out/animatic.mp4
python3 audio.py synth --duration 15 --bpm 120 --out out/score.wav --beats beats.json
python3 audio.py sfx --duration 15 --cues cues.json --out out/sfx.wav
node render.mjs --width 1080 --height 1920 --fps 60 --sub 4 --out out/silent.mp4
python3 finish.py mix --video out/silent.mp4 --music out/score.wav --sfx out/sfx.wav --out out/final.mp4
python3 finish.py qa --video out/final.mp4 --out out/qa --expected-duration 15 --expected-width 1080 --expected-height 1920 --expected-fps 60 --require-audio
```

The starter is a complete abstract test animation, **not the creative deliverable**. Replace its scenes, copy, score and cues with the brief. `motion.mjs` supplies correct under-, critical- and over-damped springs, multi-target tracks, text swap opacity and seeded noise. `render.mjs` supplies range rendering, subframe blur, local HTTP serving, readiness checks and nonsequential determinism checks. `audio.py` supplies a deterministic score, SFX and optional music analysis. `finish.py` supplies a two-pass loudness mix, full-film paginated contact sheets, phone sheets, action strips, loop copies and technical checks.

## Quality invariants

- Content must remain understandable without sound; sound should reinforce real motion events.
- Avoid the generic centered-title/gradient/fade template unless requested. Prefer a concrete composition and visible transformation; “new every 2–4 s” is a short-form pacing heuristic, not a rule for every film.
- Springs express mass; choose damping for the material. Do not bounce every label or replace intentional linear/periodic motion with springs.
- Text enters after a container starts changing and exits before incompatible content arrives. Keep glyphs sharp at final scale and test at 360 px wide.
- Modulo time does not make a seam continuous. Match near-end and start position, velocity, visibility and sound; inspect the joined playback.
- Keep software/frame determinism separate from aesthetic quality. A reproducible bad frame is still a bad frame.
