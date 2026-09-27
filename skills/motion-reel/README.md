# Motion Reel

An agent skill for making motion graphics in code, with an editable project and
an MP4 export. It covers product films, showreels, kinetic type and continuous
UI morphs, from references and a shot list through audio and frame review.

The included starter uses Canvas, Playwright and FFmpeg. It has a deterministic
`seek(t)` renderer, closed-form springs, synthesized music and effects, beat
analysis, and export checks. No paid API is required. The sample animation tests
the tools; the agent should replace it with scenes for your brief.

## Install

From this repository:

```bash
mkdir -p ~/.codex/skills
cp -R skills/motion-reel ~/.codex/skills/
```

For another agent, copy the folder to its supported skills directory, or give
it the path to [SKILL.md](SKILL.md). The render tools need Node.js 22+, Python
3.10+, FFmpeg and Chromium. The [execution guide](references/execution.md)
includes setup commands. Music analysis uses optional Python packages;
synthesis and mixing do not need them.

## Use

```text
Use $motion-reel to make a 20-second vertical launch film for [product URL].
Use [reference file] for the visual direction and real product screenshots.
Include music. Deliver the MP4 and editable source.
```

The agent gathers the assets, writes a shot list, builds an animatic, reviews
rendered frames and exports the requested formats. It checks frame counts,
duration, decoding and audio presence. Visual review and listening still matter;
a technical pass does not establish creative quality.

## Source and checks

Adapted from [Movez's motion-design course](https://x.com/0xmovez/status/2104216919033192746).
The [source notes](references/provenance.md) explain the changes to its examples.
[Validation results](references/validation.md) record the local render tests and
their limits, including loudness handling for short clips.
