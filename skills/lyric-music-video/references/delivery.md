# Delivery

## Watermark

`app/src/lib/brand.ts`: set `X_HANDLE` (and `TG_HANDLE` or other handles for the end card). The watermark is a
small pill in the top-right corner with the platform mark and the handle, drawn on the HUD layer, so shake,
zoom, whips and colour split never move it. It is hidden during the end card. Change the corner or the look in
`watermark()`; keep it small (about 56 px high at 1080p) and readable on white and on saturated colours.

## End card

`scenes/credits.ts`, a timeline entry after the song (`E('credits', 'credits', audio.duration,
audio.duration + 3.2)`). The example: the singer's kiss sticker, "made with ♥ by" in gel pen, the X and
Telegram handles slapped in one after another as white stickers with their marks, tape, floating hearts, a
small line with the song title. Keep it in the video's world, 3 s, no new music.

## Variants

All from the same code, rendered one after another:

| Variant | How |
|---|---|
| full energy, motion blur | `FPS=60 SAMPLES=4` |
| full energy, no motion blur (crisper, some viewers prefer it) | `FPS=60 SAMPLES=1` |
| lighter ("too fast" feedback) | `CALMV=0.65`, blur on |

`calm` scales every beat/word/downbeat punch and decay, spring overshoot, whip roll and the cut flashes by the
factor, so camera punches, shake and colour split drop together. 0.65 is "a bit lighter" and keeps the
character; 0.4 to 0.5 is calm. Do not also scale shake and zoom in the post pass: they already come from the
scaled hits, and a second factor makes the result much calmer than asked. Motion blur alone also makes the
video feel smoother than a draft without it.

## Files for the user

- Full 1080p60 per variant, named `<song>-v1.mp4`, `-v1-noblur`, `-v1-light`.
- A phone copy per variant (`scripts/phone-copy.sh`: 720p two-pass, ~28 MB for 3 minutes, under common 30 MB
  upload limits).
- Say where each file is, its duration, size and what differs between variants.

## Caption

If the user asks for a post caption: short, a line from the chorus or a question from the lyrics as the hook,
one line about what it is. Keep claims true: "no video model" is true for this pipeline; if stills were
generated, say so when asked. Follow the user's own writing rules if they have them.
