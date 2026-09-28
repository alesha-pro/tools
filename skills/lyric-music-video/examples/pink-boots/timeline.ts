// The edit: which scene plays when. Boundaries come from the aligned lyrics and the
// section map (data/lyrics.json, data/audio.json); never hard-code times here.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  const E = (id: string, file: string, start: number, end: number, extra: Partial<TimelineEntry> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, ...extra });
  /** Cut on the last beat at/before the first word of the matching line (never after the word). */
  const cut = (q: string, nth = 0, tol = 0.02) => {
    const s = ly.get(q, nth).words[0]!.start;
    return au.timeOfBeat(Math.floor(au.beatAt(s + tol)));
  };
  // The edit. Section scenes own their lines; boundaries sit on beats right before the first sung word.
  const chorusIn = (n: number) => cut('My bot, my bot, better', n) - 0.45; // one beat of lead-in (the call / the drop)
  const future = (n: number) => ly.get('You want the future', n).start;
  const b = {
    pre1: cut('Export controls'),
    c1: chorusIn(0), t1: future(0), v2: cut('DeepSeek'),
    c2: chorusIn(1), t2: future(1), bridge: cut('If Beijing'),
    c3: chorusIn(2), t3: future(2), outro: cut('is this lip gloss'),
  };
  return [
    E('verse1', 'verse1', 0, b.pre1),
    E('pre1', 'pre1', b.pre1, b.c1),
    E('chorus1', 'chorus', b.c1, b.t1, { params: { n: 1 } }),
    E('tail1', 'chorus-tail', b.t1, b.v2, { params: { n: 1 } }),
    E('verse2', 'verse2', b.v2, b.c2),
    E('chorus2', 'chorus', b.c2, b.t2, { params: { n: 2 } }),
    E('tail2', 'chorus-tail', b.t2, b.bridge, { params: { n: 2 } }),
    E('bridge', 'bridge', b.bridge, b.c3),
    E('chorus3', 'chorus', b.c3, b.t3, { params: { n: 3 } }),
    E('tail3', 'chorus-tail', b.t3, b.outro, { params: { n: 3 } }),
    E('outro', 'outro', b.outro, au.duration),
    E('credits', 'credits', au.duration, au.duration + 3.2), // end card after the music: authorship
  ];
}
