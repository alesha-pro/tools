# Art: character, props, stickers

Code draws all lyric text and all UI and typography. Generated stills provide characters, props, stickers and
textures. Motion comes from code.

## The character

1. **Model sheet first:** front, 3/4, a couple of expressions, the outfit, on a plain background. Iterate with
   the user until it is "her/him". Keep it as the identity reference for every later image.
2. **Poses per world and per moment,** each a separate transparent PNG: singing, pointing, kicking, eye-roll,
   blowing a kiss, holding a prop. Name by world and action: `girl/comic-kick.png`, `girl/scrap-kiss.png`,
   `girl/verse2-shock.png`.
3. Match each pose to its world's rendering (comic inks and halftone, scrapbook die-cut sticker with a white
   rim, phone selfie photo look).

Prompt essentials for every character image: "EXACTLY the character in the reference", the outfit, "correct
anatomy: exactly two arms, two legs, five fingers per hand", "transparent background, clean alpha", "no text"
(unless text is the prop). Always pass the model sheet and one existing pose in the target style as
references.

## Props and stickers

Stickers (glitter hearts, holo stars, chips, planes), tape textures, paper textures, bubble letters (one image
per letter: `gl-A.png`), stamps, a door, a boot sole, empty clothing instead of a real person. One object per
image, transparent, centred, a little padding.

## Tools

Any image model works. Codex CLI image generation from a terminal:

```bash
codex e --skip-git-repo-check --ephemeral -C <out-dir> \
  "<prompt ... save to /abs/path/name.png>" -i ref1.png ref2.png
```

The prompt must come **before** `-i` (it takes several paths and swallows what follows). Run several jobs in
the background in parallel (each takes minutes), then poll for the files.

Ask the user before spending paid credits on any service.

## QA every image

Open each generated file and check: anatomy (count arms, hands, fingers), identity against the model sheet,
real transparency (not a painted checkerboard), no stray text or watermark, no real logos, faces or flags,
style match with its world. Regenerate failures; do not fix in code what the image got wrong.

## Serving

Files go to `<project>/assets/<world>/<name>.png` and are served at `art/<world>/<name>.png`. Load them in the
scene's `init()` with `loadArt(['girl/comic-kick', 'scrap/st-heart'])`, draw with `art('girl/comic-kick')`.
A missing file comes back from Vite as HTML: `loadArt` detects that, retries flaky reads and leaves the image
null, and the draw helpers skip null images, so a typo shows as a missing sticker, not a crash. Look for
`missing art` warnings in the render log.

Offline processing for effects that would be slow per frame (a thermal-camera colour map, a blur) can be baked
into extra PNGs with PIL.
