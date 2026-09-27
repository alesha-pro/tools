# Validation — 2026-09-28

Executed the packaged starter on macOS arm64 with Node 22.23.1, Playwright 1.58.2, Chromium 145.0.7632.6, Python 3 and local FFmpeg.

Passed:
- Skill frontmatter/scaffold validator; local Markdown links resolve.
- Spring formulas versus independent RK4 ODE integration for under-, critical- and over-damping; multi-target continuity and repeatable noise.
- 360×640, 24 fps, 2 seconds, four subframes: 48 encoded frames, audio present, full decode succeeds.
- 320×180, 12 fps, 15 seconds: 180 frames, original score and SFX, full decode succeeds.
- 240×240, one second starting at global second 5: range rendering succeeds.
- Nonsequential seeks and page reload produce identical raw pixels at checked timestamps.
- 30-second QA yields two contact sheets and four phone sheets, covering the whole duration.
- All four SFX types, empty-cue silence and supplied-track beat analysis with/without a user downbeat anchor.
- Invalid cue times and nonempty initialization targets fail safely.
- Contact sheets visually inspected; wide-layout text/shape overlap found and corrected.

The starter is a runtime demonstration, not a finished creative film. No claim of playback/listening evaluation, 1080p throughput testing, framework-route testing, paid API integration or creative-quality benchmarking. Audio analysis estimates are explicitly labeled. Short peaky clips can miss the loudness target; QA reports this instead of declaring an acoustic pass.
