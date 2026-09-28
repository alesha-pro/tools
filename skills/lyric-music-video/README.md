# lyric-music-video

An agent skill for making a code-rendered lyric music video for a finished song. Every sung word lands on
screen on its own syllable inside animated graphics; a recurring character is built from generated stills;
the video is a deterministic function of song time, so the browser preview and the 1080p60 export match.
No video model.

The agent interviews the user (song, references, character, energy, credits), explores styles with
styleframes, aligns lyrics and beats, builds one section to approval, then the rest (optionally with parallel
sub-agents), checks everything on contact sheets and renders drafts and final variants, locally or on a
remote GPU box.

## Contents

- `SKILL.md`: the workflow and invariants for the agent.
- `references/`: intake, style exploration, engine, edit and motion, art, parallel agents, QA, render,
  delivery.
- `assets/engine.patch`: changes to [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT):
  preload hook, fonts with weights, HUD overlay for a watermark, end card past the song, the `calm` energy
  knob, Linux GPU / CPU render flags.
- `assets/analysis-example.patch`: the example song's changes to the alignment and beat tools, including a
  variable-tempo beat tracker for generated songs.
- `assets/lib/kit.ts`: motion (slap, pop, pulses, camera keys, whips, cut flashes) and three example world
  toolkits (phone UI, scrapbook, pop-art comic). `assets/lib/brand.ts`: watermark and platform marks.
  `assets/scenes/`: end card and sync test.
- `assets/fonts/pop/`: Bricolage Grotesque and Instrument Serif instances (SIL OFL 1.1). Other fonts are
  downloaded from Google Fonts by `scripts/fetch-fonts.sh`.
- `scripts/`: `new-project.sh`, `render-chunks.sh`, `phone-copy.sh`, `fetch-fonts.sh`.
- `examples/pink-boots/`: the worked example's timeline and chorus scene, and how the project went.

## Quick start

```bash
bash scripts/new-project.sh ~/videos/my-song     # needs bun, Chrome, ffmpeg (uv for the analysis tools)
cd ~/videos/my-song/engine/app && bunx vite      # preview
```

Then follow `SKILL.md`. Install the skill by copying this folder into `~/.agents/skills/` or
`.agents/skills/` inside a project.
