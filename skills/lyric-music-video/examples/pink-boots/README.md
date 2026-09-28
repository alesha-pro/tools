# Example: "Pink Boots, Export Doors"

A 3-minute synth-pop song (~135 BPM, generated with Suno) about the US-China AI chip race sung as a flirty pop
song. 1080p60, 3:04 with the end card. This is one worked example of the skill, not a house style.

The two files here are for reading, not running (they need the project's art):

- `timeline.ts`: the edit. Section boundaries from lyric lines snapped to the beat, one scene module reused
  for 3 choruses via `params.n`, an end card after the song.
- `chorus.ts`: the approved reference scene (~870 lines). Six shots in three worlds for one chorus, every
  word an event, per-word camera keys, whips, cut flashes, and the chorus 2/3 variants (pencil-sketch shader
  with a colour wipe; phone-in-scrapbook compositing and a kaleidoscope).

## How it went

1. **Rejected:** a mesh-warped "animated" singer; image-to-video clips of the singer ("I don't want to
   generate video"); a glossy 3D props opener ("the content is boring"); porting scenes from the reference
   video ("don't copy, be inspired").
2. **Styleframes:** three directions for the same two lines: A. her phone OS, B. a Y2K scrapbook,
   C. Lichtenstein pop art crossed with a semiconductor datasheet. The answer was "I want ALL of this", so the
   video cuts between the three worlds on sung words.
3. **Character:** one model sheet, then poses per world as transparent stills (comic-kick, scrap-kiss,
   phone-selfie, …), about 30 in total, plus stickers, tape, bubble letters, props.
4. **The chorus first**, iterated on sheets and one MP4 to "gorgeous, keep going". Note from the user: "AI" as
   one word.
5. **Parallel agents** built verse 1, pre-chorus + chorus tails, verse 2, bridge + outro from one brief
   while the lead built the chorus variants. Each section was reviewed on sheets; small fixes (cropped ransom
   text, overlapping stamps, the last word before each chorus visible for only 5 frames).
6. **Draft render** on a remote GPU box (the laptop ran out of memory), then notes: "B300" not
   "B-THREE-HUNDRED", a watermark, an end card with handles, a stamp whose text overflowed its frame.
7. **Final renders:** full with motion blur, full without blur, and a lighter cut (`calm 0.65`) after viewers
   said the first draft was too fast.

## The worlds

| World | Word appears as | Signature moves |
|---|---|---|
| Phone | chat bubbles, notification titles, keyboard keys, live-text labels, a thermal camera readout | notifications on downbeats, FaceTime tile bobbing on the beat, tapbacks |
| Scrapbook | ransom letters, gel-pen strokes, glitter bubble-letter stickers, stamps | stickers slap with overshoot, washi tape, doodles drawing themselves |
| Comic | SFX lettering, balloons, captions | panels, Ben-Day dots, bursts, speed lines, panels flying apart |

Humour came from colliding the chip-war vocabulary (export licences, ECCN codes, the Entity List, HBM,
capex) with teen pop culture (dating apps, horoscopes, karaoke, lip gloss). Real companies appear only as
words in the lyrics, never as logos; a real CEO appears only as an empty leather jacket.
