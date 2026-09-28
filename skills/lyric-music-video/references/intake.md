# Intake

Ask only what the user has not already said, and ask it in one batch (a multiple-choice tool is ideal).
Infer the rest and state the assumptions in the brief. Most users know what they like when they see it, not in
advance, so the questions exist to pick a starting point and to collect references, not to design by committee.

## Must have before starting

- **The song file** (wav or mp3, final master) and **the lyrics as text**. If the lyrics came from a generator
  (Suno, Udio), the sung words can differ from the text: the alignment will show where.
- **Where it will be posted** and the format: 16:9 1920x1080 (X, YouTube), 9:16 1080x1920 (Reels, TikTok,
  Shorts) or 1:1. Pick one primary format; a second format needs its own composition pass, not a crop.
- **Length:** the full song, or a cut (for example chorus only, 30 to 60 s for a teaser).

## Ask (skip what is answered)

1. **What is the song about, in the user's words**, and what should a viewer feel: laugh, dance, cry, "wow".
2. **References.** Links to videos, accounts, images, and *what exactly* they like in each (the typography, the
   pace, the colours, the humour). Ask for 2 to 5. If they have none, offer 3 short directions to react to
   ([style-exploration.md](style-exploration.md)).
3. **A character?** A singer or mascot on screen, or pure graphics and typography. If a character: do they
   have one (images, a model sheet), or should one be designed? Any constraints (no real person, no likeness).
4. **Tone of the jokes and copy**, if the song is funny: in-jokes of which community, how edgy.
5. **Energy:** "calm and elegant" to "wild, an event every beat". Default to dense; say that a lighter
   variant is cheap later.
6. **Must-haves and no-gos:** words that must read a certain way (brand names, "AI" as one word), logos,
   colours, anything off limits.
7. **Credits:** author handles for a watermark and an end card, and where each goes.
8. **Budget:** paid image or video generation credits available? (Always ask before spending.) Hardware for
   rendering: this machine, or a remote GPU box.
9. **Deadline**, and whether a quick draft is wanted first.

## The brief (write to `<project>/BRIEF.md`)

```
song:        <file>, <duration>, <bpm>, <key sections with times>
lyrics:      <file>; words to spell a specific way: ...
format:      1920x1080 @60, full song | cut <from>-<to>
posted on:   ...
about:       <one paragraph in the user's words>
feel:        ...
references:  <link> - what they like in it
character:   none | existing (<files>) | design one: <notes>
look:        (after style exploration) <chosen direction(s)>
energy:      dense (default) | <notes>; lighter variant: yes/no
no-gos:      ...
credits:     watermark <handle>, end card <handles>
budget:      image gen: <tool/credits>; render on: <machine>
deadline:    ...
```

Update the brief when the user corrects something; it is the reference for any agent that joins later.
