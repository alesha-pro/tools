# QA

The contact sheet is the main instrument. A render is judged by looking at frames, not by reading code.

```bash
cd engine/app
bun scripts/render.ts sheet --times 38.9,42.5,43.0,50.9,53.45 --cols 4 --url http://localhost:5191 --out /tmp/sheet.png
bun scripts/render.ts sheet --from 38 --to 60 --n 16 --cols 4 --out /tmp/chorus.png
bun scripts/render.ts stills --t 59.0 --out /tmp/stills        # full-size frames for detail
bun scripts/render.ts sheet ... --calm 0.65                    # the lighter variant
```

Pick times deliberately: each word's start + 0.1 s, the middle of held notes, both sides of every cut, the
peak of each whip. The sheet renders frames independently, so it also proves determinism.

## Checklist per section

- [ ] Every sung word visible, on its start (not before, not a beat late), spelled the way the user wants.
- [ ] Words sung in syllables read as one word at the end (B300, AI).
- [ ] No text cropped by the frame edge after the camera settles; no two stamps or labels overlapping
      unreadably; text inside its stamp or bubble frame (measure the text, size the frame from it).
- [ ] Legible at phone size: view the sheet at 480 px per frame; small print is decoration, the sung word must
      read.
- [ ] At least one event per beat; no stretch longer than a beat where nothing moves.
- [ ] Section seams: the previous section's last word is not cut off; flashes and whips land on the cut.
- [ ] Mirrored or hue-rotated effects never mirror words.
- [ ] No missing art (`missing art` / `bad art` warnings in the render log).
- [ ] Rights: no real logos, faces, seals, flags; platform icons only for the author's handles.

## Motion QA

A sheet cannot show timing or energy. After sheets pass, render a short MP4 of the section (draft settings)
and watch it with sound, or ask the user to. Look for: jitter at camera keys, springs that never settle,
strobing (flash + whip + shake on the same frame too often), a word that pops before it is sung.

## Final file QA

```bash
ffprobe -v error -show_entries format=duration:stream=codec_type,r_frame_rate,width,height -of compact out.mp4
ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 out.mp4
for t in 4.9 55.9 59 183; do ffmpeg -v error -y -ss $t -i out.mp4 -frames:v 1 -vf scale=480:-1 /tmp/f_$t.png; done
```

Duration = song + end card, frame count = round(duration x fps), audio stream present, spot frames correct.
A file without a `moov` atom was cut off mid-write (killed render): it is not a video, delete it and re-render.
