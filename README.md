<div align="center">

# tools

Things I build while running models on my own hardware,
cleaned up enough for other people to use.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rig](https://img.shields.io/badge/measured%20on-4x%20RTX%203090-76b900.svg)](https://x.com/superalesha)
[![X](https://img.shields.io/badge/@superalesha-follow-black.svg)](https://x.com/superalesha)

</div>

---

## Sections

Every section stands on its own, with its own installer and its own docs. There
is no shared setup to get through first.

### [minimax-h3](minimax-h3)

Video with sound, generated at home.
[MiniMax H3](https://huggingface.co/Comfy-Org/MiniMax-H3) writes the picture and
the synchronized audio in one pass, so voice, effects and music come out of the
same generation as the frames. Open weights.

Thirteen ComfyUI workflows in two sets. One set runs on any single 24 GB card. The
other puts every card in a multi-GPU box to work and hits **3.12x on four
cards**, taking a 15-second shot from 19 minutes of sampling down to 6:41.

Ships with the custom nodes, the patch that makes the turbo LoRA actually load,
and a three-command installer.

```bash
cd minimax-h3 && ./install/setup.sh check
```

### [qwen-image-2.1](qwen-image-2.1)

Image generation, editing and transparent PNGs on **one GPU**. The baseline is
an RTX 3090 with 24 GB VRAM, using official INT8 ConvRot weights.

Five native ComfyUI workflows, an isolated installer, SHA-256 model verification,
and a script that submits a generation and checks the resulting PNG. Includes
an [English guide](qwen-image-2.1/README.md), a
[Russian guide](qwen-image-2.1/README.ru.md), and an
[installation brief for an agent](qwen-image-2.1/INSTALL-WITH-AGENT.md).

For smaller GPUs, use the **[low-VRAM guide](qwen-image-2.1/LOW-VRAM.md)**:
GGUF Q4_K_M, CPU offloading, 7 workflows, and measured memory requirements.

```bash
cd qwen-image-2.1
python3 install/setup.py check
```

### [skills](skills)

Agent skills that stand on their own.

**[hand-drawn-canvas-animation](skills/hand-drawn-canvas-animation)** makes short
films with authored poses and expressive strokes in JavaScript and Canvas 2D.
It covers pencil, ink, risograph, screen print and drawings interacting with
real photos, plus sand animation and projected paper. The
[60-second phoenix film](skills/hand-drawn-canvas-animation/examples/becoming-phoenix/)
combines the materials through one story, including a moving storm and wings
that unfold from a book. The skill includes editable examples, original sound,
an MP4 renderer and browser regression checks. No Blender or video-generation
model is required.

```bash
cp -r skills/hand-drawn-canvas-animation ~/.agents/skills/
```

**[motion-reel](skills/motion-reel)** makes product films, showreels and UI morphs
from a brief and visual references. It includes a Canvas renderer, spring motion,
original music and SFX, beat analysis, contact sheets and MP4 checks. The skill
covers planning, animation, review and export, with source files you can edit.

More lands here as I clean it up.

---

## The rig everything is measured on

4x RTX 3090, 96 GB VRAM total, PCIe 3.0 x16, no NVLink, 320 W per card. Ubuntu.

Numbers in these READMEs come from real runs on that machine, not from
datasheets. Your absolute times will differ, the ratios usually hold.

There is one thing worth checking on your own box before anything else. Cards
ship at whatever power limit the vendor set, and it is often well under the
default. Mine were at 220 W against a 350 W default, and raising them to 320
took an identical run from 220 seconds down to 170.

```bash
nvidia-smi --query-gpu=name,power.limit,power.default_limit --format=csv
```

---

<div align="center">

I post the benchmarks behind all of this. Local inference on 4x RTX 3090,
open-weights models, argv and raw logs attached.

**[@superalesha](https://x.com/superalesha)**

MIT. Take it, change it, ship it.

</div>
