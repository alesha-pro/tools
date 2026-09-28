// Sync test: white page, the current line big, each word pops on its sung start.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H, clearRT } from '../engine/gl';
import { Lyrics, LYRIC_LEAD } from '../engine/lyrics';
import { F, font } from '../engine/type';
import { rgba, LIN } from '../engine/palette';
import { ease, clamp } from '../engine/util';

export default class SyncTest extends Scene {
  text = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics, audio } = this.ctx;
    clearRT(renderer, out, LIN.paper);
    const c = this.text.ctx;
    this.text.clear();
    const line = lyrics.lineAt(f.t) ?? lyrics.lastLine(f.t);
    if (line) {
      const size = 96;
      c.font = font(F.pop(100, 800), size);
      c.textBaseline = 'alphabetic';
      const widths = line.words.map((w) => c.measureText(w.w + ' ').width);
      const total = widths.reduce((a, b) => a + b, 0);
      let x = Math.max(96, (W - total) / 2);
      for (const [i, w] of line.words.entries()) {
        const p = Lyrics.wordProgress(w, f.t);
        const on = f.t >= w.start;
        const pop = on ? 1 + 0.25 * Math.exp(-(f.t - w.start) * 14) : 1;
        c.save();
        c.translate(x + widths[i]! / 2, H / 2);
        c.scale(pop, pop);
        c.fillStyle = on ? rgba('pink') : rgba('line', 0.18);
        c.textAlign = 'center';
        c.fillText(w.w, 0, 0);
        c.restore();
        x += widths[i]!;
        void p;
      }
    }
    // beat ticks + section name
    const sec = audio.sections.find((s) => f.t >= s.start && f.t < s.end);
    c.font = font(F.mono(500), 22);
    c.fillStyle = rgba('line', 0.6);
    c.textAlign = 'left';
    c.fillText(`${sec?.name ?? ''}  bar ${Math.floor(f.bar)}  beat ${(Math.floor(f.beat) % 4 + 4) % 4 + 1}   lead ${Math.round(LYRIC_LEAD * 1000)} ms`, 96, H - 96);
    const k = clamp(1 - f.beatPhase * 3, 0, 1);
    c.fillStyle = Math.floor(f.beat) % 4 === 3 ? rgba('cobalt', k) : rgba('lemon', k);
    c.beginPath(); c.arc(W - 140, H - 104, 22 + 10 * ease.outCubic(k), 0, Math.PI * 2); c.fill();
    comp.draw(renderer, this.text.upload(), out);
    return { hud: 0 };
  }
}
