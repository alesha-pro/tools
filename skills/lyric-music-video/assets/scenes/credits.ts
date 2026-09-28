// End card after the music: who made it. Example from the pink-boots video: the singer's sticker + the X and
// Telegram handles (lib/brand.ts) slapped onto a notebook page. Replace the art paths with your own world's art,
// keep the structure: 3 s, handles slap in one after another, no music (render.ts pads the audio with silence).
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H, clearRT } from '../engine/gl';
import { fontW } from '../engine/type';
import { HEX, LIN } from '../engine/palette';
import { ease, mulberry32, prog } from '../engine/util';
import { art, loadArt, drawArt, sticker, slap, SC } from '../lib/kit';
import { xBadge, tgBadge, X_HANDLE, TG_HANDLE } from '../lib/brand';

export default class Credits extends Scene {
  L = new Layer2D();

  override async init() {
    await loadArt(['scrap/notebook', 'girl/scrap-kiss', 'scrap/washi-gingham', 'scrap/washi-stars', 'scrap/st-heart-glitter', 'scrap/st-star-yellow']);
  }

  /** A handle row: badge + text, slapped in at t0; returns nothing, draws around (x, y) = left-middle. */
  private row(c: CanvasRenderingContext2D, t: number, t0: number, x: number, y: number, badge: 'x' | 'tg', text: string, size: number, rot: number) {
    const s = slap(t, t0, 1, rot);
    if (!s) return;
    c.save(); c.translate(x, y); c.rotate(s.r + rot); c.scale(s.k, s.k);
    const b = size * 1.25;
    c.font = fontW('Inter', size, 900);
    const tw = c.measureText(text).width;
    // white sticker backing with a lifted shadow
    c.shadowColor = 'rgba(40,10,40,0.25)'; c.shadowBlur = 24; c.shadowOffsetY = 10 + 20 * (1 - s.a);
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(-28, -b / 2 - 24, b + 36 + tw + 56, b + 48, 34); c.fill();
    c.shadowColor = 'transparent';
    if (badge === 'x') xBadge(c, 0, -b / 2, b); else tgBadge(c, 0, -b / 2, b);
    c.fillStyle = badge === 'x' ? HEX.line : '#1C8FCF'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillText(text, b + 36, 4);
    c.restore();
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.lt, L = this.L, c = L.ctx;
    L.clear();
    const z = 1.0 + 0.035 * ease.outCubic(prog(t, 0, 3.2)) + 0.03 * Math.pow(0.5, t / 0.08);
    c.translate(W / 2, H / 2); c.scale(z, z); c.rotate(-0.01 + 0.006 * Math.sin(t * 2)); c.translate(-W / 2, -H / 2);

    const nb = art('scrap/notebook');
    if (nb) drawArt(c, nb, W / 2, H / 2, H * 1.25); else { c.fillStyle = '#FFFDF6'; c.fillRect(-300, -300, W + 600, H + 600); }

    // her, blowing a kiss
    sticker(c, art('girl/scrap-kiss'), 470, 590, 900, t, 0.02, { rot: -0.05, big: 0.7 });

    // "made by" in gel pen, then the two handles
    const mb = slap(t, 0.12, 0.6, -0.04);
    if (mb) {
      c.save(); c.translate(900, 300); c.rotate(-0.05 + mb.r); c.scale(mb.k, mb.k);
      c.font = fontW('Caveat', 92, 700); c.fillStyle = HEX.pink; c.textBaseline = 'alphabetic';
      c.fillText('made with ♥ by', 0, 0);
      c.restore();
    }
    this.row(c, t, 0.3, 910, 460, 'x', X_HANDLE, 92, -0.02);
    this.row(c, t, 0.62, 910, 680, 'tg', TG_HANDLE, 74, 0.025);
    SC.tape(c, art('scrap/washi-gingham'), 900, 395, 220, -0.6, t, 0.36);
    SC.tape(c, art('scrap/washi-stars'), 1700, 400, 200, 0.55, t, 0.68);

    // small stickers and the credit line
    sticker(c, art('scrap/st-heart-glitter'), 1760, 250, 150, t, 0.85, { rot: 0.2, big: 0.8 });
    sticker(c, art('scrap/st-star-yellow'), 790, 960, 110, t, 0.95, { rot: -0.3, big: 0.8 });
    if (t > 1.0) {
      c.save(); c.globalAlpha = Math.min(1, (t - 1.0) * 3);
      c.font = fontW('Inter', 26, 600); c.fillStyle = 'rgba(21,19,26,0.6)'; c.textBaseline = 'alphabetic';
      c.fillText('“Pink Boots, Export Doors” · song + video', 912, 870);
      c.restore();
    }
    // hearts drifting up
    for (let i = 0; i < 14; i++) {
      const R = mulberry32(i * 7 + 1), t0 = 0.4 + R() * 1.6;
      if (t < t0) continue;
      const u = t - t0, x = 760 + R() * 1100 + 30 * Math.sin(u * 3 + i), y = 1100 - u * (220 + 160 * R());
      c.save(); c.globalAlpha = Math.max(0, 1 - u / 2.2); c.translate(x, y); c.rotate(0.3 * Math.sin(u * 2 + i));
      c.fillStyle = [HEX.pink, HEX.lilac, HEX.cobalt][i % 3]!; c.font = fontW('Inter', 34 + 26 * R(), 900); c.fillText('♥', 0, 0);
      c.restore();
    }

    clearRT(renderer, out, LIN.paper);
    comp.draw(renderer, L.upload(), out);
    return { grain: 0.02, flash: t < 0.034 ? 1 : 0 };
  }
}
