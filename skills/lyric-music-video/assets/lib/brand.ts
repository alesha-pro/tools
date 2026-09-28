// Author branding: the X / Telegram marks, the corner watermark (every frame, via the HUD) and the handles.
import { fontW } from '../engine/type';

// Set these to the author's handles (the watermark shows X_HANDLE; the end card shows both). Empty = hidden.
export const X_HANDLE = '@your_handle';
export const TG_HANDLE = 't.me/your_channel';

// X mark (viewBox 0 0 1200 1227) and the Telegram plane (viewBox 0 0 240 240, on a blue disc)
const X_PATH = new Path2D('M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z');
const TG_PLANE = new Path2D('M54.3 118.8c35-15.2 58.3-25.3 70-30.2 33.3-13.9 40.3-16.3 44.8-16.4 1 0 3.2.2 4.7 1.4 1.2 1 1.5 2.3 1.7 3.3s.4 3.1.2 4.7c-1.8 19-9.6 65.1-13.6 86.3-1.7 9-5 12-8.2 12.3-7 .6-12.3-4.6-19-9-10.6-6.9-16.5-11.2-26.8-18-11.9-7.8-4.2-12.1 2.6-19.1 1.8-1.8 32.5-29.8 33.1-32.3.1-.3.1-1.5-.6-2.1-.7-.6-1.7-.4-2.5-.2-1.1.2-17.9 11.4-50.6 33.5-4.8 3.3-9.1 4.9-13 4.8-4.3-.1-12.5-2.4-18.7-4.4-7.5-2.4-13.5-3.7-13-7.9.3-2.2 3.3-4.4 8.9-6.7z');
export const TG_BLUE = '#2AABEE';

/** X mark on a black rounded square, `s` px wide, top-left at (x, y). */
export function xBadge(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.save();
  c.fillStyle = '#000'; c.beginPath(); c.roundRect(x, y, s, s, s * 0.24); c.fill();
  const g = s * 0.56, k = g / 1227;
  c.translate(x + (s - 1200 * k) / 2, y + (s - g) / 2); c.scale(k, k);
  c.fillStyle = '#fff'; c.fill(X_PATH);
  c.restore();
}

/** Telegram mark: blue disc with the white plane, `s` px wide, top-left at (x, y). */
export function tgBadge(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.save();
  c.fillStyle = TG_BLUE; c.beginPath(); c.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); c.fill();
  c.translate(x, y); c.scale(s / 240, s / 240);
  c.fillStyle = '#fff'; c.fill(TG_PLANE);
  c.restore();
}

/** Corner watermark: X badge + handle on a soft white pill, top-right. */
export function watermark(c: CanvasRenderingContext2D, W: number) {
  if (!X_HANDLE) return;
  const h = 56, pad = 9, gap = 14;
  c.save();
  c.font = fontW('Inter', 29, 800);
  const tw = c.measureText(X_HANDLE).width;
  const w = pad + (h - 2 * pad) + gap + tw + 18;
  const x = W - 28 - w, y = 24;
  c.shadowColor = 'rgba(21,19,26,0.18)'; c.shadowBlur = 12; c.shadowOffsetY = 3;
  c.fillStyle = 'rgba(255,255,255,0.86)'; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill();
  c.shadowColor = 'transparent';
  xBadge(c, x + pad, y + pad, h - 2 * pad);
  c.fillStyle = '#15131A'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(X_HANDLE, x + pad + (h - 2 * pad) + gap, y + h / 2 + 1);
  c.restore();
}
