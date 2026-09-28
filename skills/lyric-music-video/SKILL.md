---
name: lyric-music-video
description: >-
  Make a code-rendered lyric music video for a finished song: every sung word lands on screen on its own
  syllable, inside dense animated graphics, with a recurring character built from generated stills. Covers the
  intake interview, style exploration with styleframes, word/beat alignment, a deterministic three.js + Canvas
  engine, per-section scenes (optionally built by parallel agents), contact-sheet QA and offline 1080p60 renders
  (local or on a remote GPU box), plus variants, watermark and end card. Use for "make a music video / lyric
  video / clip for my song", Suno or other AI songs, karaoke-style videos. Not for generating video with a video
  model, slide decks or UI animation.
---

# Lyric music video

A music video that is a pure function of song time: `frame = render(t)`. The browser preview and the offline
export are identical, so every idea can be checked on a contact sheet before a long render. Motion comes from
code (springs, cameras, cuts, typography); pictures come from generated **stills** (character poses, props,
stickers, textures). No video model is involved, which keeps the result sharp, on the beat and cheap to change.

The engine is [mexicat/pdoom-video](https://github.com/mexicat/pdoom-video) (MIT) plus this skill's patch.
The worked example is "Pink Boots, Export Doors" (a 3-minute synth-pop song, 3 worlds: phone OS, Y2K scrapbook,
pop-art comic). It is an example, not the house style: [examples/pink-boots/README.md](examples/pink-boots/README.md).

## References

| Read | When |
|---|---|
| [intake.md](references/intake.md) | Always first: what to ask, what to infer, the brief |
| [style-exploration.md](references/style-exploration.md) | Choosing the look: references, directions, styleframes |
| [engine.md](references/engine.md) | Project setup, alignment data, engine APIs, what the patch adds |
| [edit-and-motion.md](references/edit-and-motion.md) | Timeline, per-word events, camera, transitions, chorus variations |
| [art.md](references/art.md) | Character and prop stills: generation, references, QA |
| [section-agents.md](references/section-agents.md) | Splitting the song between parallel agents, the brief template |
| [qa.md](references/qa.md) | Contact sheets, the checklist, seams between sections |
| [render.md](references/render.md) | Local and remote renders, motion blur, chunks, sizes, speed |
| [delivery.md](references/delivery.md) | Watermark, end card, variants (lighter / no blur), phone copies, caption |

## Workflow

1. **Intake.** Get the song file and the lyrics. Ask the questions in [intake.md](references/intake.md) that
   the user has not answered yet, in one short batch. Ask for references (videos, accounts, images) and what
   exactly they like in each. Write the brief into the project folder.
2. **Set up.** `scripts/new-project.sh <dir>` clones the engine, applies `assets/engine.patch`, copies the
   world kit, brand and end-card files, fetches the fonts and installs dependencies. Align the lyrics to
   words (and syllables where a word is sung long) and analyse beats, downbeats and sections
   ([engine.md](references/engine.md)). Check the alignment with the sync-test scene before any design work.
3. **Find the look.** Study the references for principles, never copy their scenes. Propose 2 or 3 distinct
   directions, make one styleframe per direction for the same 2 lyric lines, show them side by side and let
   the user choose or combine ([style-exploration.md](references/style-exploration.md)). A combination of
   directions is often the answer: cut between them on sung words.
4. **Character and art.** Generate the recurring character once as a model sheet, then poses per world as
   transparent stills, plus props, stickers and textures ([art.md](references/art.md)). QA every image.
5. **One section to approval.** Build the chorus (or the densest section) completely: every word an event,
   camera on the beat, transitions, colour flashes. Render a contact sheet, then a short MP4, and get the
   user's reaction before building anything else. This scene becomes the quality bar.
6. **The rest of the song.** Write the timeline (cuts on the beat before each section's first word), then
   build the other sections, yourself or with parallel agents using the brief in
   [section-agents.md](references/section-agents.md). Repeated choruses get escalating variants.
7. **QA.** Contact sheets for every section, the seams between sections, the words that land near a cut, and
   legibility at phone size ([qa.md](references/qa.md)). Fix, re-check.
8. **Render.** A fast draft first (30 fps, no motion blur) for the user to watch; then final quality
   (60 fps, 4 sub-frames of motion blur). Prefer a GPU machine; never run the final render on a laptop that is
   short of memory ([render.md](references/render.md)).
9. **Deliver.** Watermark, end card with the author's handles, the requested variants, phone-size copies, and
   a caption if asked ([delivery.md](references/delivery.md)).

## Invariants

- **Every sung word is on screen, on its own start time**, inside the graphics (a bubble, a stamp, a sticker,
  a sound effect), never as subtitles on top. Word times come from the alignment data; never hard-code times.
  Find lines by text and pick the occurrence inside the scene's window.
- **Deterministic.** No `Math.random`, no state across frames, no wall clock. Seeded hashes only. Any frame
  can be rendered alone.
- **Density and motion by default.** At least one visual event per beat; a camera move per word; cuts per line
  (per word on hooks). Energy is tunable afterwards with the `calm` knob; it is hard to add later.
- **Stills plus code, not video generation.** If the user wants the character to move, give poses per phrase
  with spring motion, cuts and camera. That reads as intentional in collage, comic and UI worlds.
- **The user's taste decides.** Show frames early and often. Ask before spending paid generation credits.
- **Rights.** No real company logos, no real people's likeness, no government seals or real flags unless the
  user owns them. Political lines stay playful. Platform icons are fine for the author's own handles.
- **Verify before claiming.** Look at every contact sheet you produce. A render is done when the file decodes,
  has the right duration, frame count and audio, and spot frames look right.

## Lessons from the example project

- A mesh-warped "animated" character looked cheap; image-to-video clips were rejected ("I don't want generated
  video"); glossy 3D props with confetti were called boring. What worked: three flat, graphic worlds with the
  character as stickers and panels, cut on the words.
- "Be inspired, don't copy": take principles from references (text inside the graphics, micro-typography,
  one world per line, a live camera), not their scenes.
- Small wording matters to users: "AI" had to be one word, not "A-I"; "B300" had to read as B300, not
  "B-THREE-HUNDRED", even though it is sung in syllables. Build the word from its syllables instead.
- Viewers found the full-energy cut "too fast"; a second render with `calm=0.65` and a version without motion
  blur were requested. Plan for variants: they are cheap with the knob.
