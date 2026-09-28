# Style exploration

Goal: the user points at a frame and says "that one" before any scene code exists.

## Study references for principles

For each reference, write down *why* it works, as transferable principles, and never port its scenes:

- how text lives inside the graphics (typed into a form, stamped, riding a curve, a chat bubble);
- how dense it is and where the density comes from (many objects, or micro-typography and details);
- camera behaviour (drift, snaps on hits, whips between worlds);
- the palette and how many colours carry meaning;
- how each line gets its own "world" or reference that the audience recognises.

The example's reference (pdoom-video) gave: one world per line, text inside graphics, micro-typography
everywhere, a live camera, render craft. Its scenes (TikZ unicorns, loss curves) were not reused; the user
explicitly rejected copying ("be inspired, don't copy").

## Propose directions

Write 2 or 3 directions that differ in *world*, not in colour: for example "the singer's phone OS", "a teenage
scrapbook", "a pop-art comic crossed with a datasheet". For each: one sentence, the palette, the type, how a
sung word appears, where the character appears, and what makes it funny or moving for this song.

## Styleframes

For each direction, make **the same 2 lyric lines** as finished-looking stills (an image model is fine here;
text in the frame may be imperfect, that is expected at this stage). Same lines across directions makes the
comparison fair. Show them side by side and ask which one, or which parts of each.

Save to `<project>/styleframes/<letter>-<direction>-<line>.png` with the prompt next to each image. Do not
publish styleframes: they can contain things the final video must not (seals, logos, real-looking documents).

## Deciding

- The user may want all of them ("I want ALL of this"). Then the directions become worlds of one video, and
  the edit cuts between worlds on sung words. This is very effective for pop songs.
- If the reaction is lukewarm, change the world, not the polish. "The content is boring" means the idea
  is wrong, not the rendering.
- Write the decision into the brief: worlds, palette tokens, fonts per world, how each world shows a word.

## A first rendered test

Before building a section, render one line in the chosen look with real word timing (10 to 20 s). This is
where timing, readability and energy get judged; stills cannot show them.
