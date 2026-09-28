# Edit and motion

## The edit (`timeline.ts`)

Entries `{ id, load, start, end, params }`, one per section. Rules that worked:

- Boundaries come from the data, never typed in: cut on the **last beat at or before a section's first sung
  word** (`audio.timeOfBeat(Math.floor(audio.beatAt(wordStart + 0.02)))`).
- A section may start a beat early to set up its first word (the example's chorus opens with a phone ringing
  one beat before "My bot").
- Re-use one scene module for repeated sections with `params` (`{ n: 1 | 2 | 3 }` for the choruses).
- The last word of a section that ends right at a cut gets only a few frames. Either end the section later or
  have the next scene hold that word for a moment (the example's chorus lock screen shows the previous line's
  last word: "this HARD?", "shipping ADDRESS?", "karaoke, OKAY?").
- An end card may run past the song (`credits`, 3.2 s after `audio.duration`); the export pads the audio.

See `examples/pink-boots/timeline.ts`.

## Every word is an event

Find the line inside the scene's window and take word times from it:

```ts
const from = this.ctx.start - 1;
const pick = (q: string) => ly.find(q).find((l) => l.start > from)!;   // works for chorus 1, 2 and 3
const T = { kick: pick('Pink boots').words[2].start, ... };
```

Ways a word appears, per world (the example's; invent your own per look):

- **Phone:** a chat bubble per word, a notification title that builds word by word, keyboard keys lighting as
  if typed, a search bar with autocomplete, live-text labels in a camera app.
- **Scrapbook:** ransom-note letters cut one by one, gel-pen handwriting drawn stroke by stroke, glitter
  bubble-letter stickers slapped on, washi tape, stamps.
- **Comic:** SFX lettering (outline, misregistered shadow), balloons, captions, panels breaking apart.

A word sung in syllables is built from its syllables as one word: "B" + "3" + "00" = B300; "A" then "I" = AI.
Do not print the syllables as separate words unless that is the joke.

Tiny secondary text rewards pausing: fake UI copy, form fields, footnotes, in-jokes of the song's world.

## Motion vocabulary (kit.ts)

- `slap(t, t0, big, rot)`: sticker lands: scale overshoot from `1 + big`, rotation settles, shadow lifts.
- `pop(t, t0)`: spring from 0 to 1 with overshoot (UI bubbles, tiles).
- `hit(t, t0, hl)`: decaying 1 → 0 pulse (shake amounts, flashes, colour split).
- `sticker(c, img, x, y, h, t, t0, { rot, big })`: draw an image with a slap.
- Beat and word punches: `pulse(audio.beats, t)`, `pulse(audio.downbeats, t, 0.1)`, `wordHit(line, t)` (the
  strongest recent decay). Use them for camera zoom (`z *= 1 + 0.05 * wordHit`), shake amplitude and `ca`.
- `camKeys(t, [[time, {x, y, z, r}], ...])`: camera keys eased per word (`outExpo` over ~0.2 s, a few frames
  early); add slow drift and sway on top; `applyCam(c, cam, whip)` sets the canvas transform.
- `whipAt(t, cuts, dirs)`: **whips** between worlds, the outgoing frame flung ±1500 px with a roll over the
  last 4 frames, the new one lands over ~7 frames.
- `cutFlash(c, t, [[time, colour], ...])`: 2 frames of a solid palette colour on a world change.
- Post: return `shake`, `zoom` (1 + small beat punch), `ca` (colour split on hits), `grain`.

World toolkits in the kit (examples, replace for another look): `PH` (glass panels, wallpaper, status bar,
bubbles, typing dots, notifications, video tiles), `SC` (ransom text, washi tape, gel pen strokes, doodles
drawing themselves, glints), `CO` (Ben-Day dots, tone fills, speed lines, bursts, SFX, balloons, panels,
captions).

Density rule: at least one event per beat, a camera move per word, cut worlds at least every line, per word
on hooks. Energy can be lowered later with `calm`; it is hard to add.

## Repeated choruses

Same words, escalating treatment. The example:

- **Chorus 1:** full colour, the reference scene.
- **Chorus 2:** the soft first half as a live pencil sketch of the same frames (a full-screen shader: Sobel
  edges, graphite and pink ink, hatching, grain); on the hook the colour opens from the centre in 0.3 s.
- **Chorus 3:** the soft half plays on the singer's phone taped into the scrapbook (REC dot, doodles per
  beat); on the hook a kaleidoscope of the frame, 2x2 tiles, then 3x3 on the last word, hue-shifted. Do not
  mirror tiles that contain words: mirrored words are unreadable.
- Counts that grow per chorus (paper planes = chorus number, bigger sticker bombs).

## Bridge and build

A bridge can be one continuous camera move over a single large drawing (a map) instead of cuts, for contrast.
A build before the last chorus: accelerating cuts (eighths, then sixteenths) through props of the video with a
"loading chorus 3" bar.

## Deterministic randomness

`mulberry32(seed)` and `hash(i, j)`; seed by index (sticker i, beat i), never by time alone, so a frame renders
the same alone or in sequence.
