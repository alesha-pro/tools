// World kit: the three visual languages of the video, drawn in Canvas2D (logical 1920x1080 px).
//   PHONE     her phone's OS: glass panels, chat bubbles, notifications, status bar, FaceTime tiles
//   SCRAPBOOK Y2K notebook: stickers that slap on, washi tape, polaroids, ransom letters, gel pen
//   COMIC     pop-art datasheet: panels with gutters, halftone fills, bursts, balloons, SFX lettering
// Plus shared motion (slap / pop springs) and image loading for the generated art in public/art.
// Everything is a pure function of song time t: pass event times in, never keep state.
import { font, fontW } from '../engine/type';
import { HEX } from '../engine/palette';
import { clamp, ease, hash, mulberry32, springStep, TAU, CALM } from '../engine/util';
import { drawStrokeText, type StrokeText } from '../engine/stroke';

export type Ctx = CanvasRenderingContext2D;
export type Img = ImageBitmap;

// ---------------- images ----------------
const images = new Map<string, Img>();
/** Load art/<path>.png files (relative to public/art) once. */
export async function loadArt(paths: string[]) {
  await Promise.all(paths.filter((p) => !images.has(p)).map(async (p) => {
    // a flaky read (e.g. ERR_CACHE_WRITE_FAILURE under parallel renders) must not drop a sticker from the video: retry
    for (let k = 0; k < 4; k++) {
      try {
        const r = await fetch(`art/${p}.png`, { cache: 'no-store' });
        // a missing file comes back as Vite's index.html (200, text/html): skip it, the draw code tolerates null
        if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) { console.warn('missing art', p); return; }
        images.set(p, await createImageBitmap(await r.blob()));
        return;
      } catch { await new Promise((ok) => setTimeout(ok, 200 * (k + 1))); }
    }
    console.warn('bad art', p);
  }));
}
export const art = (p: string) => images.get(p) ?? null;

// ---------------- motion ----------------
/** Sticker slap: scale overshoots from big to 1, a little rotation settles, fades in over 2 frames. */
export function slap(t: number, t0: number, big = 0.35, rot = 0.12) {
  if (t < t0) return null;
  const u = t - t0;
  const s = springStep(u, 3.2, 0.34);
  return { k: 1 + big * CALM * (1 - s), r: rot * CALM * (1 - s), a: clamp(u * 30), fresh: Math.exp(-u * 12) };
}
/** Pop in from zero (UI bubbles). */
export function pop(t: number, t0: number, freq = 3.4, damp = 0.42) {
  if (t < t0) return 0;
  const s = springStep(t - t0, freq, damp);
  return s > 1 ? 1 + (s - 1) * CALM : s;
}
/** Decaying hit 1 → 0. */
export const hit = (t: number, t0: number, hl = 0.1) => (t < t0 ? 0 : CALM * Math.pow(0.5, (t - t0) / hl));

/** Draw an image by its centre at height h (or width w if given), with rotation / scale / alpha. */
export function drawArt(c: Ctx, im: Img | null, x: number, y: number, h: number, o: { rot?: number; k?: number; a?: number; w?: number; ax?: number; ay?: number; flip?: boolean } = {}) {
  if (!im) return;
  const k = o.k ?? 1;
  const hh = o.w ? (o.w / im.width) * im.height : h, ww = o.w ?? (h / im.height) * im.width;
  c.save();
  c.globalAlpha *= o.a ?? 1;
  c.translate(x, y); c.rotate(o.rot ?? 0); c.scale(k * (o.flip ? -1 : 1), k);
  c.drawImage(im, -ww * (o.ax ?? 0.5), -hh * (o.ay ?? 0.5), ww, hh);
  c.restore();
}

/** A sticker: soft drop shadow that lifts while the slap is fresh. */
export function sticker(c: Ctx, im: Img | null, x: number, y: number, h: number, t: number, t0: number, o: { rot?: number; big?: number; w?: number } = {}) {
  const s = slap(t, t0, o.big ?? 0.35);
  if (!s || !im) return;
  c.save();
  c.shadowColor = 'rgba(40,10,40,0.28)';
  c.shadowBlur = 14 + 30 * s.fresh;
  c.shadowOffsetX = 4 + 14 * s.fresh; c.shadowOffsetY = 8 + 22 * s.fresh;
  drawArt(c, im, x, y, h, { rot: (o.rot ?? 0) + s.r, k: s.k, a: s.a, w: o.w });
  c.restore();
}

// ---------------- text utils ----------------
export function fitFont(c: Ctx, text: string, fam: string, maxW: number, maxSize: number) {
  c.font = font(fam, 100);
  const w = c.measureText(text).width;
  return Math.min(maxSize, (100 * maxW) / Math.max(1, w));
}

// =====================================================================================
// PHONE
// =====================================================================================
export const PH = {
  glass(c: Ctx, x: number, y: number, w: number, h: number, r = 34, a = 0.62) {
    c.save();
    c.shadowColor = 'rgba(120,20,80,0.18)'; c.shadowBlur = 40; c.shadowOffsetY = 18;
    c.fillStyle = `rgba(255,255,255,${a})`;
    c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
    c.restore();
    c.save();
    const g = c.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0.3)');
    c.strokeStyle = g; c.lineWidth = 2;
    c.beginPath(); c.roundRect(x + 1, y + 1, w - 2, h - 2, r - 1); c.stroke();
    c.restore();
  },
  /** Holographic pink wallpaper with drifting blobs (the phone's background). */
  wallpaper(c: Ctx, t: number, W: number, H: number, hue = 0) {
    c.save();
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#FFE3F1'); g.addColorStop(0.5, '#FFF4FA'); g.addColorStop(1, '#E9E4FF');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const blobs = [[HEX.pink, 0.35], ['#FF9ACB', 0.4], [HEX.lilac, 0.35], ['#FFD0E6', 0.5], [HEX.cobalt, 0.12]] as const;
    c.globalCompositeOperation = 'multiply';
    blobs.forEach(([col, a], i) => {
      const x = W * (0.5 + 0.42 * Math.sin(t * 0.21 + i * 1.7 + hue)), y = H * (0.5 + 0.4 * Math.cos(t * 0.17 + i * 2.3));
      const r = 420 + 140 * Math.sin(t * 0.3 + i);
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, hexA(col, a)); rg.addColorStop(1, hexA(col, 0));
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
    });
    c.restore();
  },
  statusBar(c: Ctx, W: number, t: number, clock = '9:41', battery = 99) {
    c.save();
    c.fillStyle = HEX.line; c.font = fontW('Inter', 30, 700); c.textBaseline = 'middle';
    c.fillText(clock, 70, 42);
    c.textAlign = 'right';
    c.font = fontW('Inter', 24, 700); c.fillText(`5G`, W - 190, 42);
    // signal bars
    for (let i = 0; i < 4; i++) c.fillRect(W - 300 + i * 14, 50 - 8 - i * 6, 9, 8 + i * 6);
    // battery
    c.strokeStyle = HEX.line; c.lineWidth = 2.5; c.beginPath(); c.roundRect(W - 160, 28, 62, 28, 8); c.stroke();
    c.fillStyle = battery > 20 ? '#34C759' : '#FF3B30'; c.beginPath(); c.roundRect(W - 156, 32, 54 * battery / 100, 20, 5); c.fill();
    c.fillStyle = HEX.line; c.fillRect(W - 95, 36, 4, 12);
    c.font = fontW('Inter', 22, 700); c.fillText(`${battery}%`, W - 172, 42);
    void t;
    c.restore();
  },
  /**
   * iMessage-style bubble. side 'l' = grey incoming, 'r' = coloured outgoing. Returns its height.
   * `k` = pop scale (0..1+), anchored at the tail.
   */
  bubble(c: Ctx, text: string, x: number, y: number, o: { side?: 'l' | 'r'; color?: string; ink?: string; size?: number; maxW?: number; k?: number; fam?: string; weight?: number } = {}) {
    const side = o.side ?? 'r', size = o.size ?? 44, k = o.k ?? 1;
    const fam = o.fam ?? 'Inter', wt = o.weight ?? 700;
    c.save();
    c.font = fontW(fam, size, wt);
    const lines = wrap(c, text, (o.maxW ?? 900) - size);
    const tw = Math.max(...lines.map((l) => c.measureText(l).width));
    const padX = size * 0.62, padY = size * 0.42, lh = size * 1.12;
    const w = tw + padX * 2, h = lines.length * lh + padY * 2;
    const bx = side === 'r' ? x - w : x;
    const ax = side === 'r' ? x : x, ay = y + h;
    c.translate(ax, ay); c.scale(k, k); c.translate(-ax, -ay);
    const col = o.color ?? (side === 'r' ? HEX.pink : '#E9E9EF');
    c.fillStyle = col;
    c.shadowColor = 'rgba(80,0,50,0.12)'; c.shadowBlur = 16; c.shadowOffsetY = 6;
    c.beginPath(); c.roundRect(bx, y, w, h, Math.min(size * 0.9, h / 2)); c.fill();
    // tail
    c.beginPath();
    if (side === 'r') { c.moveTo(x - 30, y + h - 26); c.quadraticCurveTo(x - 4, y + h - 4, x + 14, y + h + 2); c.quadraticCurveTo(x - 20, y + h + 4, x - 52, y + h - 8); }
    else { c.moveTo(x + 30, y + h - 26); c.quadraticCurveTo(x + 4, y + h - 4, x - 14, y + h + 2); c.quadraticCurveTo(x + 20, y + h + 4, x + 52, y + h - 8); }
    c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = o.ink ?? (side === 'r' ? '#fff' : HEX.line);
    c.textBaseline = 'alphabetic';
    lines.forEach((l, i) => c.fillText(l, bx + padX, y + padY + size * 0.9 + i * lh));
    c.restore();
    return h;
  },
  typing(c: Ctx, x: number, y: number, t: number, s = 1) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#E9E9EF'; c.beginPath(); c.roundRect(0, 0, 130, 70, 35); c.fill();
    c.beginPath(); c.arc(8, 64, 12, 0, TAU); c.fill(); c.beginPath(); c.arc(-4, 78, 6, 0, TAU); c.fill();
    for (let i = 0; i < 3; i++) {
      const b = 0.5 + 0.5 * Math.sin(t * 9 - i * 0.9);
      c.fillStyle = `rgba(120,120,135,${0.45 + 0.5 * b})`;
      c.beginPath(); c.arc(38 + i * 27, 35 - 4 * b, 9, 0, TAU); c.fill();
    }
    c.restore();
  },
  /** Notification banner. Returns height. */
  notif(c: Ctx, x: number, y: number, w: number, n: { app: string; title: string; body?: string; time?: string; icon?: string; iconBg?: string }, k = 1) {
    const h = n.body ? 150 : 110;
    c.save();
    c.translate(x + w / 2, y); c.scale(k, k); c.translate(-(x + w / 2), -y);
    PH.glass(c, x, y, w, h, 34, 0.78);
    c.fillStyle = n.iconBg ?? HEX.pink; c.beginPath(); c.roundRect(x + 24, y + 24, 62, 62, 16); c.fill();
    c.fillStyle = '#fff'; c.font = fontW('Inter', 34, 800); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(n.icon ?? '♥', x + 55, y + 57);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = 'rgba(21,19,26,0.55)'; c.font = fontW('Inter', 20, 600); c.fillText(n.app.toUpperCase(), x + 108, y + 44);
    c.textAlign = 'right'; c.fillText(n.time ?? 'now', x + w - 28, y + 44); c.textAlign = 'left';
    c.fillStyle = HEX.line; c.font = fontW('Inter', 30, 800); c.fillText(n.title, x + 108, y + 84, w - 140);
    if (n.body) { c.fillStyle = 'rgba(21,19,26,0.75)'; c.font = fontW('Inter', 26, 500); c.fillText(n.body, x + 108, y + 122, w - 140); }
    c.restore();
    return h;
  },
  /** Rounded image tile (FaceTime / photo), cover-fit. */
  tile(c: Ctx, im: Img | null, x: number, y: number, w: number, h: number, r = 40, o: { zoom?: number; fx?: number; fy?: number } = {}) {
    c.save();
    c.shadowColor = 'rgba(80,0,50,0.25)'; c.shadowBlur = 40; c.shadowOffsetY = 16;
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
    c.shadowColor = 'transparent';
    c.clip();
    if (im) {
      const z = o.zoom ?? 1, sc = Math.max(w / im.width, h / im.height) * z;
      const iw = im.width * sc, ih = im.height * sc;
      c.drawImage(im, x + (w - iw) * (o.fx ?? 0.5), y + (h - ih) * (o.fy ?? 0.4), iw, ih);
    }
    c.restore();
  },
};

// =====================================================================================
// SCRAPBOOK
// =====================================================================================
const RANSOM_FONTS = ['Archivo-1250-900', 'Cormorant-600', 'Bricolage-75-800', 'Plex-700', 'Bangers', 'InstrumentSerif', 'Archivo-620-900', 'LuckiestGuy'];
const RANSOM_BG = ['#FFFFFF', '#FFE21A', HEX.pink, '#15131A', '#B79CFF', '#FFD0E6', '#2440FF', '#FFF4D6'];
export const SC = {
  /** Magazine cut-out letters, each on its own paper chip; letter i appears at times[i]. */
  ransom(c: Ctx, text: string, x: number, y: number, size: number, t: number, times: number[], seed = 1, align: 'left' | 'center' = 'left') {
    const R = mulberry32(seed);
    const chars = Array.from(text);
    const specs = chars.map((ch) => {
      const fi = Math.floor(R() * RANSOM_FONTS.length), bi = Math.floor(R() * RANSOM_BG.length);
      const s = size * (0.85 + 0.3 * R());
      return { ch, fam: RANSOM_FONTS[fi]!, bg: RANSOM_BG[bi]!, s, rot: (R() - 0.5) * 0.22, dy: (R() - 0.5) * size * 0.12, upper: R() > 0.4 };
    });
    let total = 0;
    const widths = specs.map((sp) => { c.font = font(sp.fam, sp.s); const w = sp.ch === ' ' ? size * 0.35 : c.measureText(sp.upper ? sp.ch.toUpperCase() : sp.ch).width + sp.s * 0.28; total += w; return w; });
    let cx = align === 'center' ? x - total / 2 : x;
    specs.forEach((sp, i) => {
      const w = widths[i]!;
      const t0 = times[i] ?? times[times.length - 1] ?? 0;
      const s = slap(t, t0, 0.5, sp.rot * 2);
      if (s && sp.ch !== ' ') {
        c.save();
        c.translate(cx + w / 2, y + sp.dy); c.rotate(sp.rot + s.r); c.scale(s.k, s.k);
        c.shadowColor = 'rgba(40,10,40,0.25)'; c.shadowBlur = 6; c.shadowOffsetY = 4;
        c.fillStyle = sp.bg;
        const hh = sp.s * 1.12;
        // torn-ish chip
        c.beginPath();
        const RR = mulberry32(seed * 100 + i);
        const pts: [number, number][] = [[-w / 2, -hh * 0.62], [w / 2, -hh * 0.6], [w / 2, hh * 0.45], [-w / 2, hh * 0.46]];
        pts.forEach(([px, py], j) => { const jx = px + (RR() - 0.5) * 8, jy = py + (RR() - 0.5) * 8; j ? c.lineTo(jx, jy) : c.moveTo(jx, jy); });
        c.closePath(); c.fill();
        c.shadowColor = 'transparent';
        const dark = sp.bg === '#15131A' || sp.bg === '#2440FF' || sp.bg === HEX.pink;
        c.fillStyle = dark ? '#FFFFFF' : (RR() > 0.5 ? HEX.line : HEX.pink);
        c.font = font(sp.fam, sp.s); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(sp.upper ? sp.ch.toUpperCase() : sp.ch, 0, -hh * 0.06);
        c.restore();
      }
      cx += w;
    });
    return total;
  },
  /** Washi tape strip (image), slapped at t0. */
  tape(c: Ctx, im: Img | null, x: number, y: number, len: number, rot: number, t: number, t0: number) {
    const s = slap(t, t0, 0.15, 0.05);
    if (!s || !im) return;
    c.save(); c.globalAlpha *= 0.92 * s.a;
    drawArt(c, im, x, y, 0, { w: len * s.k, rot: rot + s.r });
    c.restore();
  },
  /** Gel-pen writing: a stroke-font text written up to `len`, with a glossy double line. */
  gel(c: Ctx, st: StrokeText, len: number, color: string = HEX.pink, width = 6) {
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = color; c.lineWidth = width; drawStrokeText(c, st, len);
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = width * 0.28; c.translate(-width * 0.12, -width * 0.12); drawStrokeText(c, st, len);
    c.restore();
  },
  /** Hand-drawn doodle polyline written progressively (heart/star/arrow/squiggle). */
  doodle(c: Ctx, pts: [number, number][], p: number, color: string = HEX.pink, width = 6) {
    if (p <= 0 || pts.length < 2) return;
    let L = 0; const seg: number[] = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); seg.push(L); }
    const target = L * clamp(p);
    c.save(); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) {
      if (seg[i]! <= target) c.lineTo(pts[i]![0], pts[i]![1]);
      else { const u = (target - seg[i - 1]!) / (seg[i]! - seg[i - 1]!); c.lineTo(pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * u, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * u); break; }
    }
    c.stroke(); c.restore();
  },
  heartPts(cx: number, cy: number, s: number, seed = 1): [number, number][] {
    const R = mulberry32(seed); const out: [number, number][] = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * TAU;
      const x = 16 * Math.pow(Math.sin(a), 3), y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
      out.push([cx + x * s / 16 + (R() - 0.5) * s * 0.05, cy + y * s / 16 + (R() - 0.5) * s * 0.05]);
    }
    return out;
  },
  starPts(cx: number, cy: number, r: number, rot = 0): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i <= 10; i++) { const a = rot - Math.PI / 2 + (i / 10) * TAU; const rr = i % 2 ? r * 0.42 : r; out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    return out;
  },
  /** Twinkling glints over a glitter sticker's box. */
  glints(c: Ctx, x: number, y: number, w: number, h: number, t: number, seed: number, n = 6) {
    c.save();
    for (let i = 0; i < n; i++) {
      const ph = hash(seed, i) * TAU, sp = 3 + 4 * hash(seed, i + 50);
      const b = Math.pow(Math.max(0, Math.sin(t * sp + ph)), 8);
      if (b < 0.02) continue;
      const gx = x + hash(seed, i + 100) * w, gy = y + hash(seed, i + 200) * h, r = 14 + 22 * b;
      c.fillStyle = `rgba(255,255,255,${0.9 * b})`;
      c.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const rr = k % 2 ? r * 0.16 : r; c.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr); }
      c.closePath(); c.fill();
    }
    c.restore();
  },
};

// =====================================================================================
// COMIC
// =====================================================================================
const dotCache = new Map<string, CanvasPattern>();
export const CO = {
  /** Ben-Day dot pattern (cached) for fills: colour dots on transparent. */
  dots(c: Ctx, color: string, cell = 18, r = 5.5, angle = 0.26) {
    const key = `${color}|${cell}|${r}|${angle}`;
    let p = dotCache.get(key);
    if (!p) {
      const cv = document.createElement('canvas'); cv.width = cell; cv.height = cell;
      const g = cv.getContext('2d')!;
      g.fillStyle = color; g.beginPath(); g.arc(cell / 2, cell / 2, r, 0, TAU); g.fill();
      p = c.createPattern(cv, 'repeat')!;
      p.setTransform(new DOMMatrix().rotate(angle * 57.3));
      dotCache.set(key, p);
    }
    return p;
  },
  /** Fill a path with a flat colour + a dot layer (the classic pop-art tone). */
  toneFill(c: Ctx, path: Path2D, base: string, dotColor: string, cell = 18, r = 5.5) {
    c.save(); c.fillStyle = base; c.fill(path); c.fillStyle = CO.dots(c, dotColor, cell, r); c.fill(path); c.restore();
  },
  /** Radial halftone gradient: dots grow toward the edge (a spotlight). */
  radialDots(c: Ctx, cx: number, cy: number, r0: number, r1: number, color: string, cell = 22, x0 = 0, y0 = 0, x1 = 1920, y1 = 1080) {
    c.save(); c.fillStyle = color;
    for (let y = y0 + cell / 2; y < y1; y += cell) for (let x = x0 + cell / 2 + ((Math.floor(y / cell) % 2) * cell) / 2; x < x1; x += cell) {
      const d = Math.hypot(x - cx, y - cy);
      const k = clamp((d - r0) / (r1 - r0));
      if (k <= 0.02) continue;
      c.beginPath(); c.arc(x, y, (cell / 2) * 0.95 * k, 0, TAU); c.fill();
    }
    c.restore();
  },
  /** Speed lines toward a vanishing point. */
  speed(c: Ctx, cx: number, cy: number, t: number, n = 80, color: string = HEX.line, rIn = 260, seed = 3) {
    c.save(); c.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = hash(seed, i) * TAU + t * 0.05, w = 0.004 + 0.012 * hash(seed, i + 9);
      const r0 = rIn + 200 * hash(seed, i + 3) + 60 * Math.sin(t * 20 + i);
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a - w) * 3000, cy + Math.sin(a - w) * 3000); c.lineTo(cx + Math.cos(a + w) * 3000, cy + Math.sin(a + w) * 3000);
      c.closePath(); c.fill();
    }
    c.restore();
  },
  burstPath(cx: number, cy: number, r0: number, r1: number, n = 14, seed = 1, rot = 0) {
    const R = mulberry32(seed); const p = new Path2D();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * TAU + (R() - 0.5) * 0.12;
      const r = i % 2 ? r0 * (0.85 + 0.3 * R()) : r1 * (0.8 + 0.4 * R());
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath(); return p;
  },
  burst(c: Ctx, cx: number, cy: number, r0: number, r1: number, fill: string, o: { n?: number; seed?: number; rot?: number; k?: number; dots?: string; line?: number } = {}) {
    c.save(); c.translate(cx, cy); c.scale(o.k ?? 1, o.k ?? 1); c.translate(-cx, -cy);
    const p = CO.burstPath(cx, cy, r0, r1, o.n ?? 14, o.seed ?? 1, o.rot ?? 0);
    if (o.dots) CO.toneFill(c, p, fill, o.dots, 16, 4.5); else { c.fillStyle = fill; c.fill(p); }
    c.lineWidth = o.line ?? 9; c.lineJoin = 'miter'; c.strokeStyle = HEX.line; c.stroke(p);
    c.restore();
  },
  /** Comic SFX lettering: thick ink outline, misregistered colour shadow, optional skew. */
  sfx(c: Ctx, text: string, x: number, y: number, size: number, fill: string, o: { rot?: number; k?: number; shadow?: string; fam?: string; align?: CanvasTextAlign; skew?: number; line?: number } = {}) {
    c.save();
    c.translate(x, y); c.rotate(o.rot ?? 0); c.scale(o.k ?? 1, o.k ?? 1);
    if (o.skew) c.transform(1, 0, o.skew, 1, 0, 0);
    c.font = font(o.fam ?? 'Bangers', size); c.textAlign = o.align ?? 'center'; c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.fillStyle = o.shadow ?? HEX.line; c.fillText(text, size * 0.06, size * 0.07);
    c.lineWidth = o.line ?? size * 0.1; c.strokeStyle = HEX.line; c.strokeText(text, 0, 0);
    c.fillStyle = fill; c.fillText(text, 0, 0);
    c.restore();
  },
  /** Speech balloon with a tail toward (tx, ty). */
  balloon(c: Ctx, x: number, y: number, w: number, h: number, tx: number, ty: number, k = 1, fill = '#fff') {
    c.save(); c.translate(x, y); c.scale(k, k); c.translate(-x, -y);
    const p = new Path2D();
    p.ellipse(x, y, w / 2, h / 2, 0, 0, TAU);
    const a = Math.atan2(ty - y, tx - x);
    const bx = x + Math.cos(a) * w * 0.3, by = y + Math.sin(a) * h * 0.3;
    const n = { x: -Math.sin(a), y: Math.cos(a) };
    const tail = new Path2D();
    tail.moveTo(bx + n.x * 36, by + n.y * 36); tail.lineTo(tx, ty); tail.lineTo(bx - n.x * 36, by - n.y * 36); tail.closePath();
    c.fillStyle = fill; c.lineWidth = 8; c.strokeStyle = HEX.line;
    c.stroke(tail); c.stroke(p); c.fill(tail); c.fill(p);
    c.restore();
  },
  /** A panel: clip to polygon, draw inside, then the ink border. */
  panel(c: Ctx, poly: [number, number][], draw: () => void, border = 9) {
    const p = new Path2D(); poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath();
    c.save(); c.clip(p); draw(); c.restore();
    c.save(); c.lineWidth = border; c.strokeStyle = HEX.line; c.lineJoin = 'miter'; c.stroke(p); c.restore();
    return p;
  },
  /** Caption box (yellow, ink border, caps). */
  caption(c: Ctx, text: string, x: number, y: number, size = 40, fill: string = HEX.lemon, rot = -0.02, k = 1) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, k);
    c.font = font('ComicNeue', size);
    const w = c.measureText(text).width + size * 1.1, h = size * 1.6;
    c.fillStyle = fill; c.fillRect(0, 0, w, h);
    c.lineWidth = 6; c.strokeStyle = HEX.line; c.strokeRect(0, 0, w, h);
    c.fillStyle = HEX.line; c.textBaseline = 'middle'; c.fillText(text, size * 0.55, h / 2 + 2);
    c.restore();
    return w;
  },
};

// ---------------- helpers ----------------
function hexA(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export { hexA };
function wrap(c: Ctx, text: string, maxW: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const tryL = cur ? cur + ' ' + w : w;
    if (c.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL;
  }
  if (cur) lines.push(cur);
  return lines;
}
export const EASE = ease;

// ---------------- rhythm + camera (shared by all sections) ----------------
/** Punch from a list of event times: the strongest recent decay (half-life hl), scaled by CALM. */
export function pulse(times: number[], t: number, hl = 0.07, win = 0.6) {
  let p = 0;
  for (const b of times) { if (b > t) break; if (t - b < win) p = Math.max(p, Math.pow(0.5, (t - b) / hl)); }
  return p * CALM;
}
/** Punch on every sung word of a line. */
export const wordHit = (line: { words: { start: number }[] }, t: number, hl = 0.08) => pulse(line.words.map((w) => w.start), t, hl, 10);

export interface Cam { x: number; y: number; z: number; r: number }
/** Camera from keys [time, cam]: each key is reached with a fast expo ease right on its time (a few frames early). */
export function camKeys(t: number, keys: [number, Cam][], dur = 0.22, lead = 0.03): Cam {
  let cam = { ...keys[0]![1] };
  for (let i = 1; i < keys.length; i++) {
    const [kt, kc] = keys[i]!;
    const u = ease.outExpo(clamp((t - (kt - lead)) / (dur + lead)));
    if (u > 0) cam = { x: cam.x + (kc.x - cam.x) * u, y: cam.y + (kc.y - cam.y) * u, z: Math.exp(Math.log(cam.z) + (Math.log(kc.z) - Math.log(cam.z)) * u), r: cam.r + (kc.r - cam.r) * u };
  }
  return cam;
}
/** Whip between worlds at each cut: the outgoing frame is flung in the last 4.5 frames, the new one lands over ~7. dir ±1. */
export function whipAt(t: number, cuts: number[], dirs: number[] = []) {
  let dx = 0, r = 0;
  cuts.forEach((tb, i) => {
    const d = dirs[i] ?? (i % 2 ? -1 : 1);
    if (t >= tb - 0.075 && t < tb) { const u = ease.inQuad((t - (tb - 0.075)) / 0.075); dx -= d * 1500 * u; r -= d * 0.12 * CALM * u; }
    if (t >= tb && t < tb + 0.12) { const u = 1 - ease.outCubic((t - tb) / 0.12); dx += d * 1500 * u; r += d * 0.12 * CALM * u; }
  });
  return { dx, r };
}
/** Set the canvas transform: logical 1920x1080, camera centred on (x, y) at zoom z and roll r, plus a whip offset. */
export function applyCam(c: Ctx, cam: Cam, whip = { dx: 0, r: 0 }, W = 1920, H = 1080) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.translate(W / 2 + whip.dx, H / 2); c.rotate(cam.r + whip.r); c.scale(cam.z, cam.z); c.translate(-cam.x, -cam.y);
}
/** 2-frame solid colour on each cut (softened by CALM). */
export function cutFlash(c: Ctx, t: number, cuts: [number, string][], W = 1920, H = 1080) {
  for (const [tc, col] of cuts) if (t >= tc && t < tc + 2 / 60) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = CALM; c.fillStyle = col; c.fillRect(0, 0, W, H); c.restore();
  }
}
