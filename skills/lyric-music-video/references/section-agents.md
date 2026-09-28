# Parallel section agents

A 3-minute song is 6 to 10 sections. Once one section is approved and the timeline exists, the rest can be
built in parallel by sub-agents, each owning one or two sections. In the example 4 agents built verse 1,
pre-chorus + chorus tails, verse 2, bridge + outro in about 30 minutes while the lead agent built the chorus
variants.

## Before spawning

- The approved reference scene exists and is on disk (for example `scenes/chorus.ts`).
- `timeline.ts` is final: every entry exists, placeholders re-export the sync test
  (`export { default } from './synctest';`).
- Shared files are frozen for the duration: `engine/*`, `lib/kit.ts`, `timeline.ts`, the reference scene.
- Each agent gets its own preview port (5192, 5193, …) so renders never share a dev server.

## Brief template

Write it once to a file and point each agent at it plus its own section list.

```
# Build one section of the "<song>" music video

You own: <section ids and scene files>, entry windows from timeline.ts.
Match the approved <reference scene> exactly in quality, density and energy.

Read first, in order:
1. <reference scene>: copy its patterns (world functions, camera keys per word, beat/word punches,
   slap/pop springs, 2-frame colour flashes on world changes, whips, shake + ca returned to post).
2. lib/kit.ts (motion + world toolkits). 3. styleframes/*.png. 4. BRIEF.md and the treatment.
5. engine basics: scene.ts, lyrics.ts, audio.ts, stroke.ts, type.ts (available fonts).

The look: <worlds, palette, how a word appears in each world>.
Humour and copy: <the song's world, in-jokes, tone>. Tiny secondary text everywhere. No slogans.

Hard rules:
- EVERY sung word on screen inside the graphics, on its own start time, from the lyric data. Find lines with
  lyrics.find(q) and pick the occurrence inside your window. Never hard-code times.
- At least one event per beat; camera never static; cut worlds at least every line.
- Deterministic: no Math.random, no state across frames.
- The character is the star: use her art generously (assets/girl/*.png).
- No real logos, real people's likeness, seals, real flags. <topic-specific limits>.
- DO NOT EDIT shared files: lib/kit.ts, engine/*, timeline.ts, <reference scene>, other sections' scenes.
  Put helpers in your scene file or lib/<section>-*.ts. Wanted kit changes go in your final report.
- Art only in assets/<your-section>/ and assets/girl/<section>-*.png. Scratch files in your scratchpad.
- New art: <image tool command>, prompt before -i, references = styleframe + model sheet + a pose.
  QA every image (anatomy, transparency, style). Ask before paid credits.

Verify (required):
- typecheck: cd engine/app && bunx tsc --noEmit -p .
- contact sheet on YOUR port:
  bun scripts/render.ts sheet --times a,b,c,... --cols 4 --url http://localhost:<PORT> --out <scratch>/sheet.png
  Look at it. Check every line, framing, overlaps, empty frames, legibility. Iterate.
- final: bun scripts/render.ts video --from <start> --to <end> --fps 60 --samples 4 --url ... --out renders/<section>-v1.mp4

Final report (short): what each line shows, files created, render path, known issues, wished kit changes.
```

## When agents report

- Treat the report as a claim. Render your own contact sheet of their section and look at it.
- Typical fixes: text cropped at the frame edge at a camera key, two stamps overlapping, a word that only
  shows for a few frames at a section boundary, a frame that looks empty (usually mid-whip: check the
  neighbouring frames before "fixing" it).
- Check the seams: the last beat of each section and the first beat of the next in one sheet.
- Agents that render in parallel on one machine can reload each other's pages through the dev server's live
  reload: renders must use a server with `PDOOM_NO_HMR=1` (the renderer starts one if the URL is not up).
