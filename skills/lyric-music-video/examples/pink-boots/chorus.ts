// Chorus 1 — the three worlds, cut on the sung words.
//   P1 PHONE     "My bot, my bot, better than yours": FaceTime + chat thread, words land as bubbles
//   C1 COMIC     "Pink boots kicking down the export doors": panels, the kick, the door shatters, the page breaks
//   S1 SCRAPBOOK "Big chips, little skirts, give it all you got": polaroids, ransom letters, stickers slap on
//   P2 PHONE     "My bot, my bot, hotter than your bot": thermal camera, the readout climbs to 99.9 °C
//   X  ALL       "Oh my, oh my, AI": every word smash-cuts to another world, the last one stacks them all
//   S2 SCRAPBOOK "Do my kisses need a license to fly?": boarding pass, kisses, stamp, the paper plane
// Everything is a pure function of t. The camera never stops: drift, sway, a punch on every beat.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H, clearRT, FSPass } from '../engine/gl';
import { type Line, type Word } from '../engine/lyrics';
import { font, fontW } from '../engine/type';
import { HEX, LIN } from '../engine/palette';
import { strokeText, type StrokeText } from '../engine/stroke';
import { clamp, ease, hash, lerp, mulberry32, noise1, prog, springStep, TAU, CALM } from '../engine/util';
import { art, loadArt, drawArt, sticker, slap, pop, hit, PH, SC, CO, type Ctx, type Img } from '../lib/kit';

type V2 = [number, number];

/** Pencil sketch of the chorus: Sobel edges in graphite (pink where the source is pink), light hatching,
 *  paper; inside `wipe` (radius from the centre, in screen heights) the full colour frame shows. */
const SKETCH_FRAG = /* glsl */ `
uniform sampler2D src; uniform vec2 px; uniform float wipe; uniform float time;
float lum(vec2 uv) { return dot(texture(src, uv).rgb, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec4 col = texture(src, vUv);
  float tl = lum(vUv + px * vec2(-1.0, 1.0)), tc = lum(vUv + px * vec2(0.0, 1.0)), tr = lum(vUv + px * vec2(1.0, 1.0));
  float ml = lum(vUv + px * vec2(-1.0, 0.0)), mr = lum(vUv + px * vec2(1.0, 0.0));
  float bl = lum(vUv + px * vec2(-1.0, -1.0)), bc = lum(vUv + px * vec2(0.0, -1.0)), br = lum(vUv + px * vec2(1.0, -1.0));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  float e = sat(length(vec2(gx, gy)) * 1.8 - 0.05);
  vec2 sp = vUv * vec2(1920.0, 1080.0);
  float grain = hash12(floor(sp * 0.8) + floor(time * 12.0) * 17.0);
  e *= 0.7 + 0.45 * grain;
  float y = lum(vUv);
  float hatch = step(0.55, fract((sp.x + sp.y) / 9.0)) * smoothstep(0.5, 0.08, y) * 0.35;
  float pinkish = sat((col.r - col.g) * 2.0 - 0.3);
  vec3 ink = mix(vec3(0.05, 0.045, 0.06), C_PINK, pinkish);
  vec3 paper = vec3(1.0, 0.975, 0.96);
  vec3 sketch = mix(paper, ink, sat(e + hatch * (1.0 - pinkish)));
  sketch = mix(sketch, mix(paper, C_PINK, 0.35), pinkish * 0.35 * (1.0 - e));
  float d = length((vUv - 0.5) * vec2(1.7778, 1.0));
  float m = smoothstep(wipe, wipe - 0.06, d);
  fragColor = vec4(mix(sketch, col.rgb, m), 1.0);
}`;
interface Cam { x: number; y: number; z: number; r: number }
interface Msg { t: number; side: 'l' | 'r'; text: string | ((t: number) => string); size: number; color?: string; ink?: string }

const ART = [
  'girl/phone-selfie', 'girl/phone-hot', 'girl/phone-hot-thermal', 'girl/comic-kick', 'girl/comic-sing', 'girl/comic-eyeroll',
  'girl/scrap-sing', 'girl/scrap-kiss', 'girl/scrap-chip',
  'comic/door', 'comic/boot-sole', 'comic/bot-pink', 'comic/stamp-hand',
  'scrap/notebook', 'scrap/polaroid-bigchip', 'scrap/polaroid-skirt', 'scrap/boarding-pass', 'scrap/kiss',
  'scrap/washi-gingham', 'scrap/washi-stars', 'scrap/washi-leopard', 'scrap/washi-checker',
  'scrap/st-heart-glitter', 'scrap/st-heart-holo', 'scrap/st-star-yellow', 'scrap/st-star-holo', 'scrap/st-chip', 'scrap/st-wafer', 'scrap/st-plane', 'scrap/st-lipstick',
  'scrap/gl-O', 'scrap/gl-H', 'scrap/gl-M', 'scrap/gl-Y', 'scrap/gl-A', 'scrap/gl-I',
];

export default class Chorus extends Scene {
  L = new Layer2D();
  /** Final composition layer for chorus 3 (phone-in-scrapbook, kaleidoscope). */
  F = new Layer2D();
  /** Which chorus: 1 = full colour, 2 = pencil-sketch soft half that bursts into colour on "Oh my", 3 = max. */
  n = 1;
  prevTail: Word[] = [];
  sketch = new FSPass(SKETCH_FRAG, { src: { value: null }, px: { value: new THREE.Vector2(1.6 / W, 1.6 / H) }, wipe: { value: 0 }, time: { value: 0 } });
  beats: number[] = [];
  downs: number[] = [];
  l: Record<string, Line> = {};
  T: Record<string, number> = {};
  gel: Record<string, StrokeText> = {};
  shards: { poly: V2[]; c: V2; v: V2; w: number }[] = [];

  override async init() {
    await loadArt(ART);
    this.n = Number(this.ctx.params?.n ?? 1);
    const { lyrics: ly, audio: au } = this.ctx;
    this.beats = au.beats; this.downs = au.downbeats;
    const from = this.ctx.start - 1;
    const pick = (q: string) => ly.find(q).find((l) => l.start > from)!;
    this.l = {
      p1: pick('better than yours'), c1: pick('Pink boots'), s1: pick('Big chips'), p2: pick('hotter than your bot'),
      x: pick('Oh my, oh my'), s2: pick('license to fly'),
    };
    // the previous section's last line often ends right on our first frames ("hard?", "address?", "okay?"):
    // the lock screen keeps its tail on screen so the sung word never gets only a few frames
    const prev = ly.lines.filter((l) => l.start < this.l.p1!.start - 0.1).pop();
    this.prevTail = prev && prev.end > this.ctx.start - 0.3 ? prev.words.slice(-2) as Word[] : [];
    const w = (k: string, i: number) => (this.l[k]!.words[i] as Word).start;
    const aiSyl = (this.l.x!.words[4] as Word).syl;
    this.T = {
      p1: w('p1', 0), c1: w('c1', 0), s1: w('s1', 0), p2: w('p2', 0), x: w('x', 0), s2: w('s2', 0),
      kick: w('c1', 2), down: w('c1', 3), the: w('c1', 4), exp: w('c1', 5), doors: w('c1', 6),
      xA: w('x', 4), xI: aiSyl && aiSyl.length > 1 ? aiSyl[1]![0] : w('x', 4) + 0.36,
    };
    this.gel = {
      big: strokeText('BIG', 'felix', 150), little: strokeText('little skirts', 'script', 96), cm: strokeText('38 cm', 'script', 44),
      xo: strokeText('xoxo', 'script', 70), fly: strokeText('fly me?', 'script', 90),
    };
    // door shards: wedges around the impact point, in door-image px (door.png is 1005 x 1565)
    const R = mulberry32(17), cx = 520, cy = 820, n = 14, ang: number[] = [];
    for (let i = 0; i < n; i++) ang.push(((i + 0.15 + 0.7 * R()) / n) * TAU);
    for (let i = 0; i < n; i++) {
      const a0 = ang[i]!, a1 = ang[(i + 1) % n]! + (i === n - 1 ? TAU : 0), r1 = 160 + 200 * R();
      const P = (a: number, r: number): V2 => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      const polys: V2[][] = [[[cx, cy], P(a0, r1), P(a1, r1 * (0.85 + 0.3 * R()))], [P(a0, r1), P(a0, 2600), P(a1, 2600), P(a1, r1 * (0.85 + 0.3 * R()))]];
      for (const poly of polys) {
        const c: V2 = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
        const d = Math.hypot(c[0] - cx, c[1] - cy) || 1, sp = 900 + 1600 * R();
        this.shards.push({ poly, c, v: [((c[0] - cx) / d) * sp, ((c[1] - cy) / d) * sp - 700], w: (R() - 0.5) * 9 });
      }
    }
  }

  // ------------------------------------------------------------------ rhythm
  beatHit(t: number, hl = 0.07) { let p = 0; for (const b of this.beats) { if (b > t) break; if (t - b < 0.6) p = Math.max(p, Math.pow(0.5, (t - b) / hl)); } return p * CALM; }
  downHit(t: number, hl = 0.1) { let p = 0; for (const b of this.downs) { if (b > t) break; if (t - b < 0.8) p = Math.max(p, Math.pow(0.5, (t - b) / hl)); } return p * CALM; }
  wordHit(line: Line, t: number, hl = 0.08) { let p = 0; for (const w of line.words) { if (w.start > t) break; p = Math.max(p, Math.pow(0.5, (t - w.start) / hl)); } return p * CALM; }
  beatIdx(t: number) { let i = -1; for (const b of this.beats) { if (b > t) break; i++; } return i; }

  /** Whip between worlds: the outgoing frame is flung left in the last 4 frames, the new one lands from the right. */
  whip: { dx: number; r: number } = { dx: 0, r: 0 };
  whipAt(t: number) {
    const T = this.T;
    let dx = 0, r = 0;
    for (const tb of [T.c1, T.p2, T.x, T.s2]) {
      if (t >= tb - 0.075 && t < tb) { const u = ease.inQuad((t - (tb - 0.075)) / 0.075); dx -= 1500 * u; r -= 0.12 * CALM * u; }
      if (t >= tb && t < tb + 0.12) { const u = 1 - ease.outCubic((t - tb) / 0.12); dx += 1500 * u; r += 0.12 * CALM * u; }
    }
    return { dx, r };
  }
  applyCam(c: Ctx, cam: Cam) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.translate(W / 2 + this.whip.dx, H / 2); c.rotate(cam.r + this.whip.r); c.scale(cam.z, cam.z); c.translate(-cam.x, -cam.y);
  }

  // ------------------------------------------------------------------ render
  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t, T = this.T;
    const c = this.L.ctx;
    this.L.clear('#ffffff');
    let shake: V2 = [0, 0];
    let flash: string | null = null;
    const bh = this.beatHit(t), dh = this.downHit(t);
    this.whip = this.whipAt(t);

    if (t < T.c1) shake = this.drawP1(c, t);
    else if (t < T.s1) {
      // the scrapbook is already under the page when the comic panels fly apart on "doors"
      if (t > T.doors) this.drawS1(c, t);
      shake = this.drawC1(c, t);
    } else if (t < T.p2) shake = this.drawS1(c, t);
    else if (t < T.x) shake = this.drawP2(c, t);
    else if (t < T.s2) shake = this.drawX(c, t);
    else shake = this.drawS2(c, t);

    // cut flashes: 2 frames of solid colour on every world change
    const cuts: [number, string][] = [[T.p1, HEX.pink], [T.c1, HEX.lemon], [T.s1, HEX.cobalt], [T.p2, HEX.pink], [T.x, HEX.lemon], [T.s2, HEX.pink]];
    for (const [ct, col] of cuts) if (t >= ct && t < ct + 2 / 60) flash = col;
    if (flash) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = CALM; c.fillStyle = flash; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }

    clearRT(renderer, out, LIN.paper);
    const n = this.n, soft = t < T.x;
    if (n === 2 && t < T.x + 0.4) {
      // chorus 2: the soft half is a pencil sketch of the same pictures; "Oh my" fills it with colour from the centre
      const S = this.sketch.u;
      S.src!.value = this.L.upload(); S.time!.value = t;
      S.wipe!.value = soft ? 0 : 1.2 * ease.outCubic(prog(t, T.x, T.x + 0.32));
      this.sketch.render(renderer, out);
    } else if (n === 3 && (soft || t < T.s2)) {
      this.compose3(t, soft);
      comp.draw(renderer, this.F.upload(), out);
    } else comp.draw(renderer, this.L.upload(), out);
    const zoom = 1 + 0.028 * bh + 0.03 * dh;
    // colour split kicks in on every hit (the print slipping out of register)
    let wh = 0;
    for (const k of ['p1', 'c1', 's1', 'p2', 'x', 's2']) wh = Math.max(wh, this.wordHit(this.l[k]!, t, 0.06));
    return { shake, zoom, grain: 0.02, ca: 0.4 + 2.2 * wh + 1.5 * dh };
  }

  /**
   * Chorus 3. Soft half: the whole chorus plays on her phone, taped into the scrapbook while she films.
   * "Oh my, oh my, AI": kaleidoscope — 2x2 mirrored, hue-shifted tiles, 3x3 on the final "AI".
   */
  compose3(t: number, soft: boolean) {
    const T = this.T, f = this.F.ctx, src = this.L.canvas;
    this.F.clear('#ffffff');
    f.setTransform(1, 0, 0, 1, 0, 0);
    if (soft) {
      const bh = this.beatHit(t, 0.08);
      f.translate(W / 2, H / 2); f.rotate(0.03 * Math.sin(t * 1.3) - 0.02 * bh); f.scale(1.02 + 0.02 * bh, 1.02 + 0.02 * bh); f.translate(-W / 2, -H / 2);
      this.notebook(f);
      // the phone (landscape) held over the page
      const pw = 1320, ph = 760, px = (W - pw) / 2 + 30 * Math.sin(t * 0.9), py = (H - ph) / 2 + 20 * Math.cos(t * 1.1);
      f.save(); f.translate(px + pw / 2, py + ph / 2); f.rotate(-0.04 + 0.015 * Math.sin(t * 2)); f.translate(-(px + pw / 2), -(py + ph / 2));
      f.shadowColor = 'rgba(40,10,40,0.35)'; f.shadowBlur = 60; f.shadowOffsetY = 30;
      f.fillStyle = '#15131A'; f.beginPath(); f.roundRect(px - 34, py - 34, pw + 68, ph + 68, 70); f.fill();
      f.shadowColor = 'transparent';
      f.save(); f.beginPath(); f.roundRect(px, py, pw, ph, 44); f.clip(); f.drawImage(src, px, py, pw, ph); f.restore();
      f.fillStyle = '#15131A'; f.beginPath(); f.roundRect(px + pw + 4, py + ph / 2 - 60, 18, 120, 9); f.fill();
      f.fillStyle = '#FF3B30'; f.beginPath(); f.arc(px + 40, py + 40, 12 * (0.6 + 0.4 * Math.sin(t * 6)), 0, TAU); f.fill();
      f.fillStyle = '#fff'; f.font = fontW('Inter', 26, 800); f.fillText('REC', px + 62, py + 50);
      f.restore();
      // tape on the phone corners, doodles and her margin notes
      SC.tape(f, art('scrap/washi-gingham'), px + 40, py - 10, 300, -0.5, t, this.ctx.start);
      SC.tape(f, art('scrap/washi-stars'), px + pw - 40, py + ph + 10, 300, -0.5, t, this.ctx.start + 0.05);
      const beats = this.beats.filter((b) => b >= this.ctx.start && b < T.x);
      beats.forEach((b, i) => {
        const R = mulberry32(i * 17 + 3);
        const side = i % 2, x = side ? 40 + R() * 180 : W - 220 + R() * 180, y = 80 + R() * 900;
        SC.doodle(f, i % 3 ? SC.heartPts(x, y, 40 + 20 * R(), i) : SC.starPts(x, y, 44, R()), prog(t, b, b + 0.25), [HEX.pink, HEX.cobalt, HEX.lilac][i % 3]!, 6);
      });
      f.save(); f.translate(80, 1000); f.rotate(-0.05); f.font = fontW('Caveat', 58, 700); f.fillStyle = HEX.pink;
      f.fillText('filming this for the group chat ♥', 0, 0); f.restore();
      return;
    }
    // kaleidoscope
    const lastHit = this.T.xI;
    const grid = t >= lastHit ? 3 : 2;
    const tw = W / grid, th = H / grid;
    const hues = [0, 90, 200, 300, 40, 150, 250, 320, 20];
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
      const k = j * grid + i;
      f.save();
      f.translate(i * tw + tw / 2, j * th + th / 2);
      // no mirroring: the sung word must stay readable in every tile; each tile tilts and breathes instead
      const R = mulberry32(k * 31 + grid), zk = 1 + 0.06 * this.beatHit(t - 0.03 * k, 0.08);
      f.rotate((R() - 0.5) * 0.12); f.scale(zk, zk);
      f.filter = k ? `hue-rotate(${hues[k]}deg) saturate(1.3)` : 'none';
      f.drawImage(src, -tw / 2, -th / 2, tw, th);
      f.restore();
    }
    f.filter = 'none';
    // white gutters like comic panels
    f.fillStyle = '#fff';
    for (let i = 1; i < grid; i++) { f.fillRect(i * tw - 6, 0, 12, H); f.fillRect(0, i * th - 6, W, 12); }
  }

  // ================================================================== P1 PHONE
  drawP1(c: Ctx, t: number): V2 {
    const l = this.l.p1!, T = this.T;
    const ws = l.words as Word[];
    const lw = (i: number) => ws[i]!.start;
    // camera: starts pushed in on the chat, eases out while swaying with the beat
    const settle = ease.outCubic(prog(t, T.p1, lw(4)));
    const wh = this.wordHit(l, t, 0.09);
    const cam: Cam = { x: lerp(1250, 980, settle) + 14 * Math.sin(t * 1.3), y: lerp(640, 545, settle), z: lerp(1.45, 1.0, settle) * (1 + 0.06 * wh), r: lerp(-0.05, 0.012, settle) + 0.012 * Math.sin(t * 2.1) };
    if (t < T.p1) { cam.x = 960; cam.y = 540; cam.z = 1.02 + 0.02 * (t - this.ctx.start); cam.r = 0; }
    this.applyCam(c, cam);
    PH.wallpaper(c, t, W, H);
    PH.statusBar(c, W, t);

    if (t < T.p1) {
      // lock screen: incoming call from "my bot"
      c.fillStyle = HEX.line; c.textAlign = 'center';
      c.font = fontW('Inter', 260, 800); c.fillText('9:41', W / 2, 380);
      c.font = fontW('Inter', 40, 600); c.fillText('Saturday, date night', W / 2, 450);
      const k = pop(t, this.ctx.start + 0.02, 3, 0.35);
      const vib = Math.sin(t * 80) * 6 * (0.5 + 0.5 * Math.sin(t * 9));
      c.save(); c.translate(vib, 0);
      PH.notif(c, 460, 560, 1000, { app: 'FaceTime', title: 'my bot is calling you ♥', body: 'slide to answer', icon: '☎', iconBg: '#34C759' }, k);
      c.restore();
      // tail of the line sung into the chorus, in big bubble letters under the call
      if (this.prevTail.length) {
        // laid out on one line, centred: small lead-in word (cobalt, as pre-chorus sets it) + the big last word
        const txts = this.prevTail.map((wd, i) => (i === this.prevTail.length - 1 ? wd.w.toUpperCase() : wd.w.toLowerCase()));
        const sizes = this.prevTail.map((_, i) => (i === this.prevTail.length - 1 ? 180 : 96));
        const ws = txts.map((tx, i) => { c.font = font('RubikBubbles', sizes[i]!); return c.measureText(tx).width; });
        const total = ws.reduce((a, b) => a + b, 0) + 50 * (ws.length - 1);
        let x = W / 2 - total / 2;
        this.prevTail.forEach((wd, i) => {
          const last = i === this.prevTail.length - 1, ww = ws[i]!;
          const s = slap(t, Math.max(wd.start, this.ctx.start), last ? 1 : 0.5, last ? 0.12 : -0.06);
          if (s) {
            c.save(); c.translate(x + ww / 2, 900); c.rotate(s.r + (last ? -0.05 : 0.04)); c.scale(s.k, s.k);
            c.font = font('RubikBubbles', sizes[i]!); c.textAlign = 'center'; c.textBaseline = 'middle';
            c.lineJoin = 'round'; c.lineWidth = last ? 22 : 14; c.strokeStyle = '#fff'; c.strokeText(txts[i]!, 0, 0);
            c.fillStyle = last ? HEX.pink : HEX.cobalt; c.fillText(txts[i]!, 0, 0);
            c.restore();
          }
          x += ww + 50;
        });
      }
      c.textAlign = 'left';
      return [vib * 0.5, 0];
    }

    // ---- FaceTime tile (her), bobbing on the beat, live hearts floating up
    const bob = this.beatHit(t, 0.09);
    c.save(); c.translate(330, 560); c.scale(1 + 0.03 * bob, 1 + 0.03 * bob); c.rotate(-0.02 + 0.01 * Math.sin(t * 2)); c.translate(-330, -560);
    PH.tile(c, art('girl/phone-selfie'), 70, 130, 520, 860, 44, { zoom: 1.05 + 0.03 * bob, fy: 0.25 });
    c.fillStyle = '#FF3B30'; c.beginPath(); c.roundRect(100, 160, 110, 44, 22); c.fill();
    c.fillStyle = '#fff'; c.font = fontW('Inter', 24, 800); c.fillText('LIVE', 128, 191);
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.font = fontW('Inter', 24, 600);
    const secs = Math.floor(t - this.ctx.start + 142);
    c.fillText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 226, 191);
    // audio meter
    for (let i = 0; i < 22; i++) {
      const hgt = 10 + 70 * Math.abs(noise1(t * 7 + i * 0.7, 3)) * (0.4 + 0.8 * bob);
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.roundRect(110 + i * 20, 900 - hgt, 10, hgt, 5); c.fill();
    }
    c.restore();
    for (let i = 0; i < 26; i++) { // floating live hearts
      const t0 = T.p1 + i * 0.13, u = t - t0;
      if (u < 0 || u > 2.2) continue;
      const x = 520 + 30 * Math.sin(u * 4 + i) + i % 3 * 18, y = 900 - u * 380;
      c.save(); c.globalAlpha = clamp(2.2 - u); c.translate(x, y); c.scale(0.6 + 0.4 * Math.min(1, u * 4), 0.6 + 0.4 * Math.min(1, u * 4));
      c.fillStyle = [HEX.pink, '#FF7AB8', HEX.lilac, HEX.cobalt][i % 4]!; c.font = font('Inter', 70); c.textAlign = 'center'; c.fillText('♥', 0, 0);
      c.restore();
    }

    // ---- chat thread
    const px = 650, py = 110, pw = 1210, ph = 930;
    PH.glass(c, px, py, pw, ph, 50, 0.66);
    drawArt(c, art('comic/bot-pink'), px + 80, py + 72, 110);
    c.fillStyle = HEX.line; c.font = fontW('Inter', 40, 800); c.fillText('my bot ♥', px + 150, py + 70);
    c.fillStyle = '#34C759'; c.beginPath(); c.arc(px + 160, py + 104, 8, 0, TAU); c.fill();
    c.fillStyle = 'rgba(21,19,26,0.55)'; c.font = fontW('Inter', 24, 600); c.fillText('online · 99.9% uptime · rank #1', px + 178, py + 112);
    c.fillStyle = 'rgba(21,19,26,0.12)'; c.fillRect(px + 30, py + 140, pw - 60, 2);
    // messages: the sung words land as bubbles; the thread scrolls up (spring)
    const better = (tt: number) => ws.slice(4).filter((w) => tt >= w.start).map((w) => w.w).join(' ');
    const msgs: Msg[] = [
      { t: lw(0), side: 'r', text: 'MY', size: 150 },
      { t: lw(1), side: 'r', text: 'BOT ♥', size: 190 },
      { t: lw(2), side: 'r', text: 'MY', size: 150, color: HEX.cobalt },
      { t: lw(3), side: 'r', text: 'BOT!!', size: 190, color: HEX.cobalt },
      { t: lw(4) - 0.34, side: 'l', text: 'your bot: mine is smarter tbh', size: 46 },
      { t: lw(4), side: 'r', text: better, size: 104 },
    ];
    c.save();
    c.beginPath(); c.rect(px, py + 145, pw, ph - 330); c.clip();
    const bottom = py + ph - 200;
    let y = bottom;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]!;
      if (t < m.t) continue;
      const k = pop(t, m.t, 3.6, 0.38);
      const txt = typeof m.text === 'function' ? m.text(t) : m.text;
      // measure height by drawing offscreen first is costly: estimate from size (single line)
      const h = m.size * 1.12 + m.size * 0.84;
      const hh = h * Math.min(1, k) + 30;
      y -= hh;
      const x = m.side === 'r' ? px + pw - 60 : px + 60;
      const shakeB = i === msgs.length - 1 ? 0 : 0;
      PH.bubble(c, txt, x + shakeB, y + 18, { side: m.side, size: m.size, k, color: m.color, fam: m.size > 100 ? 'Inter' : 'Inter', weight: m.size > 100 ? 900 : 600, maxW: 1100 });
      if (i === msgs.length - 1 && t >= ws[6]!.start) {
        // "yours": lipstick strike through + tapback + read receipt
        const p = ease.outCubic(prog(t, ws[6]!.start, ws[6]!.start + 0.18));
        c.save(); c.font = fontW('Inter', m.size, 900);
        const fullW = c.measureText(txt).width, yw = c.measureText('yours').width;
        const x1 = x - m.size * 0.62 - yw - 6, yy = y + 18 + m.size * 0.42 + m.size * 0.56;
        c.strokeStyle = HEX.lemon; c.lineWidth = 22; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x1, yy + 8); c.lineTo(x1 + (yw + 14) * p, yy - 12 * p); c.stroke();
        void fullW;
        c.restore();
        const tk = pop(t, ws[6]!.start + 0.08, 4, 0.35);
        c.save(); c.translate(x - 40, y + 10); c.scale(tk, tk);
        c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 56, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 2; c.stroke();
        c.fillStyle = HEX.pink; c.font = fontW('Inter', 46, 900); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('HA', 0, 3);
        c.restore();
      }
    }
    c.restore();
    // typing indicator from "your bot" while she sings "my bot"
    if (t > lw(2) && t < lw(4) - 0.34) PH.typing(c, px + 70, bottom - 40, t, 0.9);
    // ---- keyboard: the keys of the current word light up
    const kx = px + 40, ky = py + ph - 170, kw = pw - 80;
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.roundRect(kx, ky, kw, 150, 26); c.fill();
    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    let cur: Word | null = null; for (const w of ws) if (t >= w.start) cur = w;
    const lit = new Set<string>();
    if (cur) { const u = t - cur.start, letters = cur.w.toUpperCase().replace(/[^A-Z]/g, ''); for (let i = 0; i < letters.length; i++) if (u > i * 0.05 && u < i * 0.05 + 0.18) lit.add(letters[i]!); }
    rows.forEach((row, ri) => {
      const n = row.length, kwid = (kw - 40) / 10, x0 = kx + 20 + (10 - n) * kwid / 2;
      for (let i = 0; i < n; i++) {
        const on = lit.has(row[i]!);
        const x = x0 + i * kwid, yy = ky + 12 + ri * 45;
        c.fillStyle = on ? HEX.pink : 'rgba(255,255,255,0.95)';
        c.beginPath(); c.roundRect(x + 3, yy, kwid - 6, 38, 8); c.fill();
        c.fillStyle = on ? '#fff' : HEX.line; c.font = fontW('Inter', 20, 600); c.textAlign = 'center'; c.fillText(row[i]!, x + kwid / 2, yy + 27);
        if (on) { c.save(); c.globalAlpha = 0.9; c.fillStyle = HEX.pink; c.beginPath(); c.roundRect(x - 6, yy - 70, kwid + 12, 66, 14); c.fill(); c.fillStyle = '#fff'; c.font = fontW('Inter', 40, 800); c.fillText(row[i]!, x + kwid / 2, yy - 22); c.restore(); }
      }
    });
    c.textAlign = 'left';

    // ---- notifications dropping from the top on downbeats (stacking)
    const notes = [
      { app: 'Arena', title: 'my bot is #1 ♛', body: 'your bot dropped to #2 (lol)', icon: '♛', iconBg: HEX.cobalt },
      { app: 'Messages', title: 'your bot', body: 'left you on read', icon: '✉', iconBg: '#34C759' },
      { app: 'Screen Time', title: '9 h 41 min with my bot', body: 'that’s love, not a problem', icon: '⌛', iconBg: HEX.lilac },
      { app: 'Commerce Dept.', title: 'your bot: license under review', body: 'estimated wait: forever', icon: '§', iconBg: '#8E8E93' },
    ];
    const dts = this.downs.filter((d) => d >= T.p1 - 0.05 && d < T.c1);
    const bt = this.beats.filter((b) => b > T.p1 && b < T.c1);
    const times = [dts[0] ?? bt[1]!, bt[3] ?? 0, dts[1] ?? bt[5]!, bt[6] ?? 0];
    let ny = 150;
    notes.forEach((n, i) => {
      const t0 = times[i]!;
      if (!t0 || t < t0) return;
      const k = pop(t, t0, 3.4, 0.4);
      const yy = lerp(-200, 0, Math.min(1, k)) + ny;
      c.save(); c.globalAlpha = clamp((t0 + 2.2 - t) * 3);
      PH.notif(c, 1100 - i * 30, yy, 760, n, 0.96 + 0.04 * Math.min(1, k));
      c.restore();
      ny += 18;
    });
    const sh = 10 * this.wordHit(l, t, 0.05);
    return [Math.sin(t * 90) * sh, Math.cos(t * 70) * sh];
  }

  // ================================================================== C1 COMIC
  drawC1(c: Ctx, t: number): V2 {
    const l = this.l.c1!, T = this.T;
    const ws = l.words as Word[];
    const lw = (i: number) => ws[i]!.start;
    // panels (world px = screen px at z 1)
    const A: V2[] = [[24, 24], [1010, 24], [930, 1056], [24, 1056]];
    const B: V2[] = [[1034, 24], [1896, 24], [1896, 510], [994, 552]];
    const Cp: V2[] = [[990, 576], [1896, 534], [1896, 1056], [954, 1056]];
    // camera keys: caption → door → the kick → the flying sole → wide → impact
    const keys: [number, Cam][] = [
      [T.c1, { x: 420, y: 330, z: 1.9, r: -0.04 }],
      [lw(1), { x: 480, y: 560, z: 1.3, r: 0.02 }],
      [T.kick, { x: 1440, y: 280, z: 1.75, r: 0.05 }],
      [T.down, { x: 1420, y: 800, z: 1.6, r: -0.05 }],
      [T.the, { x: 960, y: 540, z: 1.0, r: 0.0 }],
      [T.exp, { x: 520, y: 560, z: 1.25, r: -0.03 }],
      [T.doors, { x: 960, y: 540, z: 0.92, r: 0.02 }],
    ];
    let cam = keys[0]![1];
    for (let i = 1; i < keys.length; i++) {
      const [kt, kc] = keys[i]!;
      const u = ease.outExpo(prog(t, kt - 0.03, kt + 0.22));
      if (u > 0) cam = { x: lerp(cam.x, kc.x, u), y: lerp(cam.y, kc.y, u), z: Math.exp(lerp(Math.log(cam.z), Math.log(kc.z), u)), r: lerp(cam.r, kc.r, u) };
    }
    cam.z *= 1 + 0.06 * this.wordHit(l, t, 0.07) + 0.01 * Math.sin(t * 3);
    cam.x += 10 * Math.sin(t * 1.7); cam.y += 8 * Math.cos(t * 2.3);
    // the page breaks apart on "doors": each panel flies off (world transform per panel)
    const brk = t > T.doors ? t - T.doors : 0;
    this.applyCam(c, cam);
    if (brk === 0) { c.fillStyle = '#fff'; c.fillRect(-400, -400, W + 800, H + 800); }
    const fly = (poly: V2[], dir: V2, spin: number, draw: () => void) => {
      if (brk > 0) {
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        c.save(); c.translate(cx + dir[0] * brk * 2600, cy + dir[1] * brk * 2600 + 1800 * brk * brk); c.rotate(spin * brk); c.scale(1 + brk * 0.8, 1 + brk * 0.8); c.translate(-cx, -cy);
        c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 40; c.shadowOffsetY = 20;
        const p = new Path2D(); poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath();
        c.fillStyle = '#fff'; c.fill(p); c.shadowColor = 'transparent';
        CO.panel(c, poly, draw); c.restore();
      } else CO.panel(c, poly, draw);
    };

    // ---- A: the corridor and the EXPORT door
    const impact = T.exp;
    fly(A, [-1, -0.3], -1.2, () => {
      c.fillStyle = HEX.cobalt; c.fillRect(0, 0, 1100, 1100);
      CO.radialDots(c, 500, 600, 150, 900, 'rgba(255,255,255,0.35)', 24, 0, 0, 1040, 1080);
      // floor perspective lines
      c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 3;
      for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(480, 560); c.lineTo(480 + i * 260, 1100); c.stroke(); }
      const door = art('comic/door');
      const rattle = (hit(t, lw(0), 0.06) + hit(t, lw(1), 0.06)) * 10;
      if (t < impact) {
        drawArt(c, door, 480 + Math.sin(t * 90) * rattle, 600, 900, { rot: Math.sin(t * 70) * rattle * 0.002 });
      } else if (door) {
        // shards fly
        const u = t - impact, sc = 900 / door.height, ox = 480 - (door.width * sc) / 2, oy = 600 - 450;
        for (const s of this.shards) {
          c.save();
          c.translate(ox, oy); c.scale(sc, sc);
          c.translate(s.c[0] + s.v[0] * u, s.c[1] + s.v[1] * u + 2600 * u * u);
          c.rotate(s.w * u); c.translate(-s.c[0], -s.c[1]);
          const p = new Path2D(); s.poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath();
          c.clip(p); c.drawImage(door, 0, 0); c.restore();
        }
        // light through the hole
        c.save(); c.globalCompositeOperation = 'lighter';
        CO.speed(c, 500, 700, t, 60, 'rgba(255,226,26,0.5)', 60, 5); c.restore();
      }
      // STOMP STOMP on "pink" "boots"
      for (const [i, x, y, r] of [[0, 250, 900, -0.2], [1, 700, 960, 0.15]] as const) {
        const s = slap(t, lw(i), 0.8, 0.2);
        if (s && t < lw(i) + 0.9) CO.sfx(c, 'STOMP!', x, y, 130, HEX.pink, { rot: r + s.r, k: s.k, shadow: HEX.lemon });
      }
      // caption
      const cap = ws.slice(0, 2).filter((w) => t >= w.start).map((w) => w.w.toUpperCase()).join(' ');
      if (cap) CO.caption(c, cap + (t < lw(2) ? '' : '...'), 60, 60, 64, HEX.lemon, -0.02, 1 + 0.2 * hit(t, lw(ws.findIndex((w) => t >= w.start) >= 0 ? 0 : 0), 0.06));
    });

    // ---- B: the kick
    fly(B, [1, -0.6], 1.4, () => {
      c.fillStyle = HEX.lemon; c.fillRect(900, 0, 1100, 600);
      CO.radialDots(c, 1460, 280, 60, 700, HEX.pink, 20, 900, 0, 1920, 600);
      if (t >= T.kick) CO.speed(c, 1300, 300, t, 70, HEX.line, 220, 7);
      const k = ease.outBack(prog(t, T.kick - 0.12, T.kick + 0.12), 2);
      const g = art('girl/comic-kick');
      drawArt(c, g, lerp(2300, 1420, k), 360 + 20 * Math.sin(t * 6), 860, { rot: -0.08 + 0.1 * (1 - k) });
      const s = slap(t, T.kick, 0.9, 0.3);
      if (s) CO.sfx(c, 'KICKING!', 1160, 200, 140, HEX.pink, { rot: -0.18 + s.r, k: s.k, shadow: HEX.cobalt, skew: -0.2 });
    });

    // ---- C: the sole flying at camera
    fly(Cp, [1, 0.6], 1.8, () => {
      c.fillStyle = HEX.pink; c.fillRect(900, 500, 1100, 600);
      CO.radialDots(c, 1420, 800, 40, 700, HEX.lemon, 22, 900, 500, 1920, 1080);
      CO.speed(c, 1420, 800, t, 90, '#fff', 120, 11);
      const u = prog(t, T.down - 0.25, T.exp + 0.05);
      const sc = lerp(0.25, 2.4, Math.pow(u, 2.2));
      drawArt(c, art('comic/boot-sole'), 1420, 800, 520, { k: sc, rot: 0.4 * (1 - u) });
      const s = slap(t, T.down, 1, 0.3);
      if (s) CO.sfx(c, 'DOWN!!', 1250, 1000, 150, HEX.lemon, { rot: 0.1 + s.r, k: s.k, shadow: HEX.cobalt });
    });

    // ---- impact: burst + EXPORT / DOORS lettering over everything
    if (t >= impact) {
      const s = slap(t, impact, 1.2, 0.2)!;
      CO.burst(c, 520, 600, 260, 620, HEX.lemon, { n: 16, seed: 4, k: s.k * (1 + 0.1 * Math.sin(t * 30)), dots: HEX.pink, rot: t * 0.3 });
      CO.sfx(c, 'KRA-KOOM!', 520, 500, 150, HEX.pink, { rot: -0.12, k: s.k, shadow: HEX.cobalt, skew: -0.15 });
      const off = t > T.doors ? (t - T.doors) : 0;
      CO.sfx(c, 'EXPORT', 560 - 3000 * off * off - 600 * off, 720 - 400 * off, 230, '#fff', { rot: -0.06 + s.r - off * 2, k: s.k, shadow: HEX.pink });
    }
    if (t >= T.doors) {
      const s = slap(t, T.doors, 1.4, 0.3)!;
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      CO.sfx(c, 'DOORS!!', W / 2 + 180, H / 2 + 220, 360, HEX.lemon, { rot: 0.08 + s.r, k: s.k * (1 + (t - T.doors) * 0.6), shadow: HEX.pink, skew: -0.1 });
      c.restore();
    }
    const amp = 28 * hit(t, impact, 0.08) + 16 * hit(t, T.doors, 0.08) + 12 * hit(t, T.kick, 0.06) + 8 * this.wordHit(l, t, 0.05);
    return [Math.sin(t * 97) * amp, Math.cos(t * 83) * amp];
  }

  // ================================================================== S1 SCRAPBOOK
  notebook(c: Ctx) {
    const nb = art('scrap/notebook');
    if (nb) drawArt(c, nb, W / 2, H / 2, H * 1.25);
    else { c.fillStyle = '#FFFDF6'; c.fillRect(-300, -300, W + 600, H + 600); }
  }

  drawS1(c: Ctx, t: number): V2 {
    const l = this.l.s1!, T = this.T;
    const ws = l.words as Word[];
    const lw = (i: number) => ws[i]!.start;
    const tt = Math.max(t, T.s1 - 0.001);
    const pan = ease.inOutCubic(prog(tt, lw(1) + 0.2, lw(2)));
    const out = ease.outExpo(prog(tt, lw(4) - 0.05, lw(4) + 0.3));
    const sway = 0.025 * Math.sin(this.beatIdx(tt) * 1.3) * (tt > T.s1 ? 1 : 0);
    let cam: Cam = { x: lerp(760, 1240, pan), y: lerp(520, 540, pan), z: 1.18 * (1 + 0.05 * this.wordHit(l, tt, 0.07)), r: lerp(-0.04, 0.04, pan) + sway };
    cam = { x: lerp(cam.x, 960, out), y: lerp(cam.y, 540, out), z: lerp(cam.z, 1.02 + 0.03 * this.beatHit(tt, 0.08), out), r: lerp(cam.r, -0.015 + sway * 0.6, out) };
    this.applyCam(c, cam);
    this.notebook(c);
    // doodle stars that draw themselves on each beat
    const bidx = this.beats.filter((b) => b >= T.s1 - 0.05 && b < T.p2);
    bidx.forEach((b, i) => {
      const R = mulberry32(i * 13 + 5);
      const x = 120 + R() * 1680, y = 90 + R() * 900;
      SC.doodle(c, (i % 2 ? SC.starPts(x, y, 34 + 20 * R(), R()) : SC.heartPts(x, y, 38 + 20 * R(), i)), prog(t, b, b + 0.25), [HEX.pink, HEX.cobalt, '#FF7A1A'][i % 3]!, 5);
    });
    // BIG: the giant chip polaroid + gel pen
    sticker(c, art('scrap/polaroid-bigchip'), 640, 470, 760, t, lw(0), { rot: -0.07, big: 0.5 });
    SC.tape(c, art('scrap/washi-gingham'), 420, 130, 300, -0.5, t, lw(0) + 0.1);
    SC.tape(c, art('scrap/washi-stars'), 870, 140, 280, 0.45, t, lw(0) + 0.16);
    if (t >= lw(0)) {
      c.save(); c.translate(470, 800); c.rotate(-0.07);
      SC.gel(c, this.gel.big!, this.gel.big!.total * prog(t, lw(0), lw(1) + 0.05), HEX.pink, 11);
      c.restore();
    }
    // CHIPS in ransom letters
    SC.ransom(c, 'CHIPS,', 120, 1000, 150, t, Array.from('CHIPS,').map((_, i) => lw(1) + i * 0.045), 7);
    // little skirts
    sticker(c, art('scrap/polaroid-skirt'), 1400, 450, 470, t, lw(2), { rot: 0.1, big: 0.6 });
    SC.tape(c, art('scrap/washi-leopard'), 1290, 230, 220, -0.3, t, lw(2) + 0.08);
    if (t >= lw(3)) {
      c.save(); c.translate(1230, 790); c.rotate(0.06);
      SC.gel(c, this.gel.little!, this.gel.little!.total * prog(t, lw(3) - 0.1, lw(4)), HEX.cobalt, 6);
      c.restore();
      // fashion-flat measurements around the skirt polaroid
      const p = prog(t, lw(3), lw(3) + 0.4);
      c.save(); c.strokeStyle = HEX.cobalt; c.lineWidth = 3; c.setLineDash([10, 8]);
      c.beginPath(); c.moveTo(1640, 240); c.lineTo(1640, 240 + 440 * p); c.stroke(); c.setLineDash([]);
      c.translate(1660, 470); c.rotate(-Math.PI / 2 + 0.1);
      if (p > 0.6) SC.gel(c, this.gel.cm!, this.gel.cm!.total * prog(p, 0.6, 1), HEX.cobalt, 4);
      c.restore();
    }
    // give it all you got: her sticker + one word-sticker per sung word
    sticker(c, art('girl/scrap-sing'), 1500, 560, 1020, t, lw(4), { rot: 0.04, big: 0.6 });
    const gw: [number, string, number, number, number][] = [[4, HEX.pink, 700, 300, -0.12], [5, HEX.lemon, 980, 420, 0.1], [6, HEX.cobalt, 760, 600, -0.05], [7, HEX.mint, 1040, 720, 0.12], [8, HEX.pink, 820, 900, -0.08]];
    for (const [i, col, x, y, r] of gw) {
      const s = slap(t, lw(i), 0.9, 0.25);
      if (!s) continue;
      c.save(); c.translate(x, y); c.rotate(r + s.r); c.scale(s.k, s.k);
      c.font = font('RubikBubbles', 190); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      const word = ws[i]!.w.replace(/[,.]/g, '').toUpperCase();
      c.shadowColor = 'rgba(40,10,40,0.3)'; c.shadowBlur = 14 + 30 * s.fresh; c.shadowOffsetY = 8 + 20 * s.fresh;
      c.lineWidth = 34; c.strokeStyle = '#fff'; c.strokeText(word, 0, 0);
      c.shadowColor = 'transparent';
      c.fillStyle = col; c.fillText(word, 0, 0);
      c.lineWidth = 4; c.strokeStyle = HEX.line; c.strokeText(word, 0, 0);
      c.restore();
      SC.glints(c, x - 180, y - 80, 360, 160, t, i * 7);
    }
    // sticker bomb on the beats of "give it all you got"
    const bomb = ['scrap/st-heart-glitter', 'scrap/st-star-yellow', 'scrap/st-chip', 'scrap/st-star-holo', 'scrap/st-heart-holo', 'scrap/st-wafer', 'scrap/st-lipstick'];
    const bb = this.beats.filter((b) => b >= lw(4) - 0.05 && b < T.p2);
    bb.forEach((b, i) => {
      for (let j = 0; j < 1 + this.n; j++) {
        const R = mulberry32(i * 31 + j * 7 + 3);
        const x = 150 + R() * 1650, y = 120 + R() * 860;
        sticker(c, art(bomb[(i * 2 + j) % bomb.length]!), x, y, 150 + 90 * R(), t, b + j * 0.06, { rot: (R() - 0.5) * 0.8, big: 1 });
      }
    });
    const amp = 7 * this.wordHit(l, t, 0.05);
    return [Math.sin(t * 91) * amp, Math.cos(t * 77) * amp];
  }

  // ================================================================== P2 PHONE (thermal)
  drawP2(c: Ctx, t: number): V2 {
    const l = this.l.p2!, T = this.T;
    const ws = l.words as Word[];
    const lw = (i: number) => ws[i]!.start;
    const hot = lw(4);
    const hand: Cam = { x: 960 + 16 * noise1(t * 2, 1), y: 540 + 12 * noise1(t * 2, 2), z: (1.02 + 0.08 * prog(t, T.p2, T.x)) * (1 + 0.05 * this.wordHit(l, t, 0.07)), r: 0.02 * noise1(t * 1.3, 3) };
    this.applyCam(c, hand);
    c.fillStyle = '#000'; c.fillRect(-200, -200, W + 400, H + 400);
    // viewfinder: normal → thermal wipe on "hotter" (flickers to thermal on each "bot")
    const img = art('girl/phone-hot'), th = art('girl/phone-hot-thermal');
    const vf = (im: Img | null) => { if (!im) return; const sc = W / im.width * 1.0; c.drawImage(im, 0, -im.height * sc * 0.09, W, im.height * sc); };
    vf(img);
    const wipe = prog(t, hot - 0.05, hot + 0.35, ease.inOutCubic);
    const flick = [1, 3].some((i) => t >= lw(i) && t < lw(i) + 0.09);
    if (wipe > 0 || flick) {
      c.save(); c.beginPath(); c.rect(0, 0, W, flick && wipe === 0 ? H : H * wipe); c.clip(); vf(th); c.restore();
      if (wipe > 0 && wipe < 1) { c.fillStyle = '#fff'; c.fillRect(0, H * wipe - 4, W, 8); }
    }
    // camera UI
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, W, 90); c.fillRect(0, H - 150, W, 150);
    c.fillStyle = '#FF3B30'; c.beginPath(); c.arc(80, 45, 12, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.font = fontW('Inter', 30, 700);
    c.fillText(`REC  00:${String(Math.floor((t - T.p2) * 1) + 12).padStart(2, '0')}`, 104, 56);
    c.textAlign = 'center'; c.fillText(wipe > 0.5 ? 'THERMAL ◉' : 'PHOTO', W / 2, 56); c.textAlign = 'right'; c.fillText('HDR  4K·60', W - 60, 56); c.textAlign = 'left';
    const modes = ['SLO-MO', 'VIDEO', 'PHOTO', 'THERMAL', 'PORTRAIT'];
    const mi = wipe > 0.5 ? 3 : 2;
    modes.forEach((m, i) => { c.fillStyle = i === mi ? HEX.lemon : 'rgba(255,255,255,0.8)'; c.font = fontW('Inter', 28, 700); c.textAlign = 'center'; c.fillText(m, W / 2 + (i - mi) * 190, H - 110); });
    c.fillStyle = '#fff'; c.beginPath(); c.arc(W / 2, H - 50, 34, 0, TAU); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(W / 2, H - 50, 44, 0, TAU); c.stroke(); c.textAlign = 'left';
    // temperature scale on the right
    const g = c.createLinearGradient(0, 180, 0, 880);
    ['#FFFFFF', '#FFF24D', '#FFA600', '#FF4019', '#CC008C', '#40009A', '#050026'].forEach((col, i) => g.addColorStop(i / 6, col));
    c.fillStyle = g; c.fillRect(W - 90, 180, 34, 700);
    c.fillStyle = '#fff'; c.font = fontW('Inter', 22, 700); c.fillText('99.9°', W - 170, 196); c.fillText('21.0°', W - 170, 880);
    // face lock + readout climbing on "hotter"
    const fx = 1010 + 20 * Math.sin(t * 2.3), fy = 420;
    const temp = lerp(36.6, 99.9, ease.outExpo(prog(t, hot, hot + 0.7)));
    const bw = 380, bhh = 440, lockK = 1 + 0.4 * (1 - pop(t, T.p2, 4, 0.5));
    c.save(); c.translate(fx, fy); c.scale(lockK, lockK);
    c.strokeStyle = HEX.lemon; c.lineWidth = 7;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      c.beginPath(); c.moveTo(sx * bw / 2, sy * bhh / 2 - sy * 60); c.lineTo(sx * bw / 2, sy * bhh / 2); c.lineTo(sx * bw / 2 - sx * 60, sy * bhh / 2); c.stroke();
    }
    c.fillStyle = HEX.lemon; c.beginPath(); c.roundRect(-bw / 2, -bhh / 2 - 70, 330, 58, 10); c.fill();
    c.fillStyle = HEX.line; c.font = fontW('Inter', 34, 900); c.fillText(`MY BOT ♥ ${temp.toFixed(1)}°C`, -bw / 2 + 14, -bhh / 2 - 29);
    c.restore();
    // sung words as live-text detections
    const det = (s: string, t0: number, x: number, y: number, size: number, col = '#fff') => {
      if (t < t0) return;
      const k = pop(t, t0, 4, 0.35);
      c.save(); c.translate(x, y); c.scale(k, k); c.rotate(-0.03);
      c.font = fontW('Inter', size, 900); const w = c.measureText(s).width;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.roundRect(-w / 2 - 30, -size * 0.95, w + 60, size * 1.25, 18); c.fill();
      c.strokeStyle = HEX.lemon; c.lineWidth = 6; c.stroke();
      c.fillStyle = col; c.textAlign = 'center'; c.fillText(s, 0, 0); c.restore();
    };
    det('MY', lw(0), 380, 420, 150);
    det('BOT', lw(1), 420, 640, 190, HEX.pink);
    det('MY', lw(2), 1480, 420, 150);
    det('BOT', lw(3), 1440, 640, 190, HEX.pink);
    // HOTTER: heat-shimmer letters in the thermal ramp
    if (t >= hot) {
      const s = slap(t, hot, 1, 0.1)!;
      c.save(); c.translate(W / 2, 900); c.scale(s.k, s.k);
      c.font = font('Archivo-1250-900', 250); c.textAlign = 'center'; c.lineJoin = 'round';
      const word = 'HOTTER';
      const tw = c.measureText(word).width;
      let x = -tw / 2;
      for (const [i, ch] of Array.from(word).entries()) {
        const cw = c.measureText(ch).width;
        const wy = 14 * Math.sin(t * 14 + i * 0.9);
        const gg = c.createLinearGradient(0, -220 + wy, 0, wy);
        gg.addColorStop(0, '#FFF24D'); gg.addColorStop(0.5, '#FF6A00'); gg.addColorStop(1, '#D1008F');
        c.lineWidth = 16; c.strokeStyle = HEX.line; c.strokeText(ch, x + cw / 2, wy);
        c.fillStyle = gg; c.fillText(ch, x + cw / 2, wy);
        x += cw;
      }
      c.restore();
    }
    // "than your bot": a cold grey PiP of the other bot
    if (t >= lw(5)) {
      const k = pop(t, lw(5), 3.5, 0.4);
      c.save(); c.translate(1560, 760); c.scale(k, k); c.rotate(0.04);
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect(-190, -150, 380, 300, 26); c.fill();
      c.fillStyle = '#1A2A6C'; c.beginPath(); c.roundRect(-176, -136, 352, 272, 18); c.fill();
      // boxy grey bot (drawn)
      c.fillStyle = '#9AA3B5'; c.beginPath(); c.roundRect(-80, -70, 160, 130, 12); c.fill();
      c.fillStyle = '#2B3245'; c.fillRect(-56, -40, 40, 22); c.fillRect(16, -40, 40, 22); c.fillRect(-40, 20, 80, 8);
      c.fillStyle = '#9AA3B5'; c.fillRect(-6, -104, 12, 36);
      c.fillStyle = '#7FD6FF'; c.font = fontW('Inter', 34, 900); c.textAlign = 'center';
      c.fillText(`your bot · 21.0°C ❄`, 0, 118);
      c.restore();
      if (t >= lw(7)) { const s = slap(t, lw(7), 1, 0.3)!; CO.sfx(c, 'BRRR', 1600, 620, 120, '#7FD6FF', { rot: 0.2 + s.r, k: s.k }); }
    }
    const amp = 6 * this.wordHit(l, t, 0.05) + 18 * hit(t, hot, 0.08);
    return [Math.sin(t * 93) * amp, Math.cos(t * 71) * amp];
  }

  // ================================================================== X  OH MY OH MY AI
  drawX(c: Ctx, t: number): V2 {
    const l = this.l.x!, T = this.T;
    const ws = l.words as Word[];
    const hits = [ws[0]!.start, ws[1]!.start, ws[2]!.start, ws[3]!.start, T.xA, T.xI];
    let k = 0; for (let i = 0; i < hits.length; i++) if (t >= hits[i]!) k = i;
    const u = t - hits[k]!;
    const spin = 0.04 * Math.sin(t * 3) + (k === 5 ? 0.12 * Math.sin(u * 2) : 0);
    const z = (1 + 0.25 * Math.exp(-u * 10)) * (k === 5 ? 1 + u * 0.06 : 1);
    this.applyCam(c, { x: 960, y: 540, z, r: spin });
    const word = ['OH', 'MY', 'OH', 'MY', 'A', 'I'][k]!;
    const phone = (col: string, txt: string) => {
      PH.wallpaper(c, t, W, H, k);
      PH.statusBar(c, W, t);
      // notification rain
      for (let i = 0; i < 14; i++) {
        const R = mulberry32(i * 3 + k * 50);
        const t0 = hits[k]! + R() * 0.25, uu = t - t0;
        if (uu < 0) continue;
        c.save(); c.globalAlpha = 0.9; c.translate(R() * W - 300, -200 + uu * (900 + 600 * R()) + R() * 400); c.rotate((R() - 0.5) * 0.4);
        PH.notif(c, 0, 0, 560, { app: ['Arena', 'Messages', 'my bot', 'Commerce Dept.'][i % 4]!, title: ['OH MY ♥', 'AI AI AI', 'u up?', 'license: pending'][i % 4]!, icon: '♥', iconBg: [HEX.pink, HEX.cobalt, HEX.lilac, '#8E8E93'][i % 4]! }, 1);
        c.restore();
      }
      const kk = pop(t, hits[k]!, 3.8, 0.33);
      PH.bubble(c, txt, W / 2 + 330, 300, { side: 'r', size: 380, k: kk, color: col, weight: 900, maxW: 1800 });
    };
    const scrap = (letters: string[], sub: string) => {
      this.notebook(c);
      SC.tape(c, art('scrap/washi-checker'), 300, 120, 500, -0.2, t, hits[k]!);
      SC.tape(c, art('scrap/washi-leopard'), 1600, 950, 520, 0.3, t, hits[k]! + 0.04);
      letters.forEach((ch, i) => {
        const x = W / 2 + (i - (letters.length - 1) / 2) * 560;
        sticker(c, art(`scrap/gl-${ch}`), x, 520, 800, t, hits[k]! + i * 0.07, { rot: (i ? 0.08 : -0.08), big: 0.7 });
        SC.glints(c, x - 250, 200, 500, 640, t, i + k * 10, 8);
      });
      sticker(c, art(sub), letters.length > 1 ? 1650 : 1500, 640, 820, t, hits[k]! + 0.12, { rot: 0.06, big: 0.8 });
      const R = mulberry32(k * 9);
      ['scrap/st-heart-glitter', 'scrap/st-star-yellow', 'scrap/st-star-holo', 'scrap/st-chip'].forEach((s, i) => sticker(c, art(s), 150 + R() * 1600, 120 + R() * 820, 170, t, hits[k]! + 0.05 * i, { rot: R() - 0.5, big: 1 }));
    };
    const comic = (txt: string, fill: string) => {
      c.fillStyle = k === 5 ? HEX.pink : HEX.cobalt; c.fillRect(-300, -300, W + 600, H + 600);
      CO.radialDots(c, W / 2, H / 2, 100, 1100, k === 5 ? HEX.lemon : HEX.pink, 26, -300, -300, W + 300, H + 300);
      CO.speed(c, W / 2, H / 2, t, 110, HEX.line, 380, k);
      CO.burst(c, W / 2 - 260, H / 2, 300, 620, HEX.lemon, { n: 18, seed: k + 3, k: 1 + 0.08 * Math.sin(t * 25), dots: HEX.pink, rot: t * 0.4 });
      const s = slap(t, hits[k]!, 1.3, 0.2)!;
      if (txt) CO.sfx(c, txt, W / 2 - 260, H / 2 + 200, 560, fill, { rot: -0.1 + s.r, k: s.k, shadow: HEX.cobalt, skew: -0.12 });
      drawArt(c, art('girl/comic-sing'), 1480 + 60 * Math.exp(-u * 8), 560, 1080, { rot: 0.05 * Math.sin(t * 4) });
    };
    if (k === 0) phone(HEX.pink, 'OH');
    else if (k === 1) scrap(['M', 'Y'], 'girl/scrap-kiss');
    else if (k === 2) comic('OH!', '#fff');
    else if (k === 3) { phone(HEX.cobalt, 'MY'); PH.tile(c, art('girl/phone-selfie'), 90, 150, 440, 760, 40, { fy: 0.2 }); }
    else if (k === 4) scrap(['A'], 'girl/scrap-sing');
    else {
      // "I": all three worlds stacked: comic burst page, glitter I, phone notifications raining on top
      // "I" completes the word: AI lands as one word, no dash (A already stuck, I slaps on right next to it)
      comic('', HEX.lemon);
      sticker(c, art('scrap/gl-A'), 560, 540, 620, t, hits[4]!, { rot: -0.06, big: 0.3 });
      sticker(c, art('scrap/gl-I'), 850, 530, 620, t, hits[5]!, { rot: 0.05, big: 1 });
      SC.glints(c, 80, 150, 1000, 760, t, 77, 14);
      if (t >= hits[5]!) { const s = slap(t, hits[5]!, 1.1, 0.1)!; CO.sfx(c, 'AI!!', 700, 1000, 150, HEX.lemon, { rot: -0.04 + s.r, k: s.k, shadow: HEX.cobalt }); }
      for (let i = 0; i < 10; i++) {
        const R = mulberry32(i + 900), t0 = hits[5]! + 0.1 + R() * 0.4, uu = t - t0;
        if (uu < 0) continue;
        c.save(); c.translate(R() * W - 200, -180 + uu * 900 + R() * 200); c.rotate((R() - 0.5) * 0.5);
        PH.notif(c, 0, 0, 520, { app: 'AI', title: ['AI ♥', 'OH MY', 'my bot', 'AI AI AI'][i % 4]!, icon: '♥', iconBg: HEX.pink }, 0.9);
        c.restore();
      }
    }
    const amp = 22 * Math.exp(-u * 12);
    return [Math.sin(t * 97) * amp, Math.cos(t * 83) * amp];
  }

  // ================================================================== S2 SCRAPBOOK (license to fly)
  drawS2(c: Ctx, t: number): V2 {
    const l = this.l.s2!, T = this.T;
    const ws = l.words as Word[];
    const lw = (i: number) => ws[i]!.start;
    const flyT = lw(6);
    const follow = ease.inOutCubic(prog(t, flyT, flyT + 0.9));
    const cam: Cam = { x: lerp(960, 1300, follow), y: lerp(560, 380, follow), z: lerp(1.25, 1.05, prog(t, T.s2, flyT)) * (1 + 0.05 * this.wordHit(l, t, 0.07)) * (1 + 0.02 * this.beatHit(t)), r: 0.03 * Math.sin(this.beatIdx(t) * 1.7) - 0.05 * follow };
    this.applyCam(c, cam);
    this.notebook(c);
    // boarding pass + tape
    const lift = ease.outCubic(prog(t, flyT - 0.1, flyT + 0.3));
    c.save(); c.translate(900, 540); c.scale(1 + 0.08 * lift, 1 + 0.08 * lift); c.rotate(-0.05 - 0.05 * lift); c.translate(-900, -540);
    sticker(c, art('scrap/boarding-pass'), 900, 540, 0, t, T.s2, { w: 1300, big: 0.4 });
    SC.tape(c, art('scrap/washi-gingham'), 330, 290, 300, -0.6, t, T.s2 + 0.08);
    SC.tape(c, art('scrap/washi-stars'), 1480, 800, 300, -0.5, t, T.s2 + 0.12);
    // her handwriting on the pass, a field per word
    const fields: [number, string, number, number][] = [[0, 'FROM: my lips', 420, 470], [1, 'TO: you ♥', 420, 560], [3, 'FLIGHT: XO-143', 420, 650], [5, 'CLASS: export-controlled??', 420, 740]];
    for (const [i, s, x, y] of fields) {
      const n = Math.floor(Array.from(s).length * prog(t, lw(i), lw(i) + 0.3));
      if (n <= 0) continue;
      c.save(); c.translate(x, y); c.rotate(-0.03);
      c.font = fontW('Caveat', 70, 700); c.fillStyle = i === 5 ? HEX.pink : HEX.cobalt;
      c.fillText(s.slice(0, n), 0, 0); c.restore();
    }
    // kisses on "kiss-es"
    const kt = lw(2);
    sticker(c, art('scrap/kiss'), 1230, 450, 230, t, kt, { rot: -0.3, big: 0.8 });
    sticker(c, art('scrap/kiss'), 1380, 560, 200, t, kt + 0.2, { rot: 0.25, big: 0.8 });
    // LICENSE REQUIRED? stamp
    if (t >= lw(5)) {
      const s = slap(t, lw(5), 0.9, 0.1)!;
      c.save(); c.translate(1150, 720); c.rotate(-0.14 + s.r); c.scale(s.k, s.k); c.globalAlpha = 0.9;
      // two lines, frame sized from the measured text so the words always sit inside the stamp
      c.fillStyle = HEX.cobalt; c.font = font('Archivo-750-900', 76); c.textAlign = 'center'; c.textBaseline = 'middle';
      const tw = Math.max(c.measureText('LICENSE').width, c.measureText('REQUIRED?').width);
      const hw = tw / 2 + 60, hh = 140;
      c.strokeStyle = HEX.cobalt; c.lineWidth = 12; c.strokeRect(-hw, -hh, hw * 2, hh * 2);
      c.lineWidth = 4; c.strokeRect(-hw + 20, -hh + 20, hw * 2 - 40, hh * 2 - 40);
      c.fillText('LICENSE', 0, -40); c.fillText('REQUIRED?', 0, 52);
      c.restore();
    }
    c.restore();
    // "need"... question marks doodled
    if (t >= lw(3)) for (let i = 0; i < 3; i++) {
      const s = slap(t, lw(3) + i * 0.08, 0.8, 0.3);
      if (s) { c.save(); c.translate(1620 + i * 70, 300 - i * 40); c.rotate(0.2 * i - 0.2 + s.r); c.scale(s.k, s.k); c.font = font('PermanentMarker', 130); c.fillStyle = HEX.pink; c.fillText('?', 0, 0); c.restore(); }
    }
    // girl sticker blowing the kiss
    sticker(c, art('girl/scrap-kiss'), 260, 620, 760, t, lw(1), { rot: -0.06, big: 0.6 });
    // "to fly?": the plane takes off along a dashed loop and out of frame
    if (t >= flyT - 0.05) {
      const u = prog(t, flyT - 0.05, flyT + 1.1, ease.inQuad);
      const path = (s: number): V2 => [900 + s * 1500 + 220 * Math.sin(s * 7), 560 - s * 900 - 180 * Math.sin(s * 5)];
      c.save(); c.strokeStyle = HEX.pink; c.lineWidth = 7; c.setLineDash([22, 16]); c.lineCap = 'round';
      c.beginPath(); for (let s = 0; s <= u; s += 0.01) { const [x, y] = path(s); s ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.restore();
      // one plane per chorus: they fly in formation by the third
      for (let q = 0; q < this.n; q++) {
        const uq = clamp(u - q * 0.06), dy = q * 120, dx = -q * 90;
        const [x, y] = path(uq), [x2, y2] = path(uq + 0.01);
        drawArt(c, art('scrap/st-plane'), x + dx, y + dy, 260 - q * 30, { rot: Math.atan2(y2 - y, x2 - x) + 0.3 });
      }
      const s = slap(t, flyT, 1, 0.2);
      if (s) { c.save(); c.translate(1500, 200); c.rotate(-0.1 + s.r); c.scale(s.k, s.k); SC.gel(c, this.gel.fly!, this.gel.fly!.total * prog(t, flyT, flyT + 0.5), HEX.pink, 8); c.restore(); }
    }
    const amp = 6 * this.wordHit(l, t, 0.05) + 16 * hit(t, lw(5), 0.07);
    return [Math.sin(t * 91) * amp, Math.cos(t * 77) * amp];
  }
}
