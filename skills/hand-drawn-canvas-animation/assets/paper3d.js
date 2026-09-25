'use strict';
// ============================================================
// paper3d.js: PAPER IN SPACE. Everything is still drawn by the core in 2D, but onto sheets of paper that stand in a
// 3D room: a book on a table, pages that turn about the spine, cut-out pieces that fold flat and stand up as a spread
// opens, a camera that moves round them, light that shades each sheet by its angle and drops soft shadows on the page.
// Canvas 2D has no perspective, so a sheet is drawn as a mesh of small triangles, each mapped with an affine transform.
//
//   cam3({ eye, target, f, up })                 the camera; f is the focal length in frame units; up: [0, .3, -1] lets it look straight down
//   proj3(p)                                      [x, y, depth] in frame units
//   tex3(w, h, draw, scale)                       a sheet of paper: draw(c, w, h) in sheet units, origin top left
//   quad3(c, tex, [p00, p10, p11, p01], opts)     draw a sheet on a 3D quad (corners in texture order: TL, TR, BR, BL)
//   book3({ ... })                                pages, leaves, pieces; book.draw(c, state)
// Axes: x right, y up, z towards the reader. The spine lies along z through the origin, the table is y = 0. Load after core.js.
// ============================================================
const V3 = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }, lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] };
const CAM3 = { eye: [0, 1000, 1300], target: [0, 100, 0], f: 1500, R: null, cx: null, cy: null };
const LIGHT3 = V3.norm([-.55, 1, .5]);          // the direction TO the lamp
function cam3({ eye = CAM3.eye, target = CAM3.target, f = CAM3.f, cx = null, cy = null, up: hint = [0, 1, 0] } = {}) { const fw = V3.norm(V3.sub(target, eye)), rt = V3.norm(V3.cross(fw, hint)), up = V3.cross(rt, fw); Object.assign(CAM3, { eye, target, f, fw, rt, up, cx, cy }); }
function proj3(p) { const d = V3.sub(p, CAM3.eye), z = V3.dot(d, CAM3.fw), k = CAM3.f / Math.max(1, z); return [(CAM3.cx ?? CX) + V3.dot(d, CAM3.rt) * k, (CAM3.cy ?? CY) - V3.dot(d, CAM3.up) * k, z]; }
// tex3: a sheet. scale = texture pixels per sheet unit. draw may be called again later through sheet.redraw(fn) for a sheet that changes.
function tex3(w, h, draw, scale = 2) { const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale); const sheet = { cv, w, h, scale, sil: null, silKey: -1, ver: 0 };
  sheet.redraw = fn => { const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(scale, 0, 0, scale, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; fn(g, w, h); sheet.ver++; return sheet; }; if (draw) sheet.redraw(draw); return sheet; }
// the soft black silhouette of a sheet, small on purpose: it is the shadow, and drawing it large is what blurs it
function _sil(sheet) { if (sheet.sil && sheet.silKey === sheet.ver) return sheet.sil; const q = 10, cv = sheet.sil || document.createElement('canvas'); cv.width = Math.max(8, Math.round(sheet.cv.width / q) + 8); cv.height = Math.max(8, Math.round(sheet.cv.height / q) + 8); const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
  g.imageSmoothingQuality = 'high'; g.drawImage(sheet.cv, 4, 4, cv.width - 8, cv.height - 8); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#140c06'; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over'; sheet.sil = cv; sheet.silKey = sheet.ver; return cv; }
const _shadeCv = document.createElement('canvas');
function _tri(c, img, u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2) { const det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0); if (Math.abs(det) < 1e-9) return; const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / det, b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / det, cc = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / det, d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / det, e = x0 - a * u0 - cc * v0, f = y0 - b * u0 - d * v0;
  const mx = (x0 + x1 + x2) / 3, my = (y0 + y1 + y2) / 3, g = (x, y) => { const dx = x - mx, dy = y - my, l = Math.hypot(dx, dy) || 1, k = (l + .9) / l; return [mx + dx * k, my + dy * k]; }, A = g(x0, y0), B = g(x1, y1), C = g(x2, y2);
  c.save(); c.beginPath(); c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]); c.lineTo(C[0], C[1]); c.closePath(); c.clip(); c.transform(a, b, cc, d, e, f); c.drawImage(img, 0, 0); c.restore(); }
// quad3: a sheet in space. opts: n = mesh density, al = opacity, dark = 0..1 shading, back = the sheet seen from behind, img = draw this canvas instead (shadows)
function quad3(c, sheet, P, o = {}) { const { n = 10, al = 1, dark = 0, back = null, img = null, deform = p => p, shadeMesh = false } = o, S4 = P.map(proj3); if (S4.every(s => s[2] < 40)) return false;
  const ctr = V3.mul(V3.add(V3.add(P[0], P[1]), V3.add(P[2], P[3])), .25), facing = V3.dot(V3.cross(V3.sub(P[1], P[0]), V3.sub(P[3], P[0])), V3.sub(CAM3.eye, ctr)) < 0, sh = facing || !back ? sheet : back; let src = img || sh.cv;
  if (!img && dark > .01) { _shadeCv.width = sh.cv.width; _shadeCv.height = sh.cv.height; const g = _shadeCv.getContext('2d'); g.drawImage(sh.cv, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(24,14,30,${Math.min(.85, dark)})`; g.fillRect(0, 0, _shadeCv.width, _shadeCv.height); src = _shadeCv; }
  const tw = src.width, th = src.height, grid = [], worldGrid = []; for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { const u = i / n, v = j / n, top = V3.lerp(P[0], P[1], u), bot = V3.lerp(P[3], P[2], u); const wp = deform(V3.lerp(top, bot, v), u, v); worldGrid.push(wp); grid.push(proj3(wp)); }
  c.save(); c.globalAlpha *= al; const flipU = !facing && back; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const p00 = grid[j * (n + 1) + i], p10 = grid[j * (n + 1) + i + 1], p01 = grid[(j + 1) * (n + 1) + i], p11 = grid[(j + 1) * (n + 1) + i + 1]; if (p00[2] < 40 || p10[2] < 40 || p01[2] < 40 || p11[2] < 40) continue;      // a cell behind the camera
      let u0 = i / n * tw, u1 = (i + 1) / n * tw; const v0 = j / n * th, v1 = (j + 1) / n * th; if (flipU) { u0 = tw - u0; u1 = tw - u1; }
      _tri(c, src, u0, v0, u1, v0, u0, v1, p00[0], p00[1], p10[0], p10[1], p01[0], p01[1]); _tri(c, src, u1, v0, u1, v1, u0, v1, p10[0], p10[1], p11[0], p11[1], p01[0], p01[1]);
      if (shadeMesh && !img) { const k = j * (n + 1) + i, amount = shadeOf([worldGrid[k], worldGrid[k + 1], worldGrid[k + n + 2], worldGrid[k + n + 1]]) * .55; c.save(); c.globalAlpha *= amount; c.fillStyle = '#21192a'; c.beginPath(); [p00,p10,p11,p01].forEach((p,i) => i ? c.lineTo(p[0],p[1]) : c.moveTo(p[0],p[1])); c.closePath(); c.fill(); c.restore(); } }
  c.restore(); return true; }
const quadNormal = P => V3.norm(V3.cross(V3.sub(P[1], P[0]), V3.sub(P[3], P[0])));
const shadeOf = P => { const k = Math.abs(V3.dot(quadNormal(P), LIGHT3)); return .46 * (1 - k); };                     // how much to darken a sheet at this angle to the lamp
// shadow3: the shadow of a sheet on a plane (point r0, normal n), clipped to a polygon of that plane given in 3D
// Shadows are gathered at full strength on their own layer and laid down once, so overlapping shadows and mesh seams do not add up.
let _shLayer = null;
function shadowsBegin() { if (!_shLayer || _shLayer.width !== OUT_W || _shLayer.height !== OUT_H) { _shLayer = document.createElement('canvas'); _shLayer.width = OUT_W; _shLayer.height = OUT_H; } const g = _shLayer.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, OUT_W, OUT_H); return g; }
function shadowsEnd(c, al = .32) { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = al; c.drawImage(_shLayer, 0, 0); c.restore(); }
function shadow3(c, sheet, P, r0, nrm, clipPoly, al = .34, options = {}) { const dn = V3.dot(LIGHT3, nrm); if (Math.abs(dn) < .05) return; const Q = P.map(p => V3.add(V3.sub(p, V3.mul(LIGHT3, V3.dot(V3.sub(p, r0), nrm) / dn)), V3.mul(nrm, .6)));
  c.save(); if (clipPoly) { c.beginPath(); clipPoly.map(proj3).forEach((s, i) => i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1])); c.closePath(); c.clip(); } const deform = options.deform ? (p, u, v) => { const original = V3.lerp(V3.lerp(P[0], P[1], u), V3.lerp(P[3], P[2], u), v), bent = options.deform(original, u, v); return V3.add(V3.sub(bent, V3.mul(LIGHT3, V3.dot(V3.sub(bent, r0), nrm) / dn)), V3.mul(nrm, .6)); } : p => p; quad3(c, sheet, Q, { n: options.n || 6, al, img: _sil(sheet), deform }); c.restore(); }

// ---------- the book ----------
// A book is a cover and leaves hinged on the spine. state.turn counts the leaves that lie on the left: 0 = shut, 1 = the cover is open and
// spread 0 shows, 2 = spread 1, and so on; a fraction is a leaf in the air. With n spreads the book opens n times (turn = n shows the last one).
// spreads[k] = { left: sheet, right: sheet, pieces: [ { base: [[x, z], [x, z]], h, sheet, lean, back, rise, mesh, shadow, after } ] }
//   base is the foot of the piece on the open spread: x < 0 on the left page, z < 0 far from the reader, the first point is its left end.
//   A piece lies flat on its page, top away from the reader, while its spread is shut, and stands up (lean degrees, 90 = upright) as it opens.
function book3({ PW = 460, PD = 620, spreads, cover, board = '#27335c', edge = '#e9dfc8' }) { const book = { PW, PD, spreads, cover }, nS = spreads.length, LEAF = 5;
  const frame = (side, ang) => { const s = side === 'L' ? -1 : 1, ca = Math.cos(ang), sa = Math.sin(ang); return { U: [s * ca, sa, 0], N: [-s * sa, ca, 0] }; };        // ang = how far the page is lifted off the table
  const pageQuad = (side, ang, y0 = 0, grow = 0) => { const { U } = frame(side, ang), a = [0, y0, -PD / 2 - grow], b = [0, y0, PD / 2 + grow], A = V3.add(a, V3.mul(U, PW + grow)), B = V3.add(b, V3.mul(U, PW + grow)); return side === 'L' ? [A, a, b, B] : [a, A, B, b]; };
  const solid = (color, w = 8, h = 8) => tex3(w, h, (g, w, h) => { g.fillStyle = color; g.fillRect(0, 0, w, h); }, 1), boardSheet = solid(board), edgeSheet = tex3(PW, 24, (g, w, h) => { g.fillStyle = edge; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,70,40,.35)'; g.lineWidth = .6; for (let y = 2; y < h; y += 3) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (y % 2 ? .6 : -.4)); g.stroke(); } }, 2);
  function block(c, side, y1) { if (y1 <= 1) return; const s = side === 'L' ? -1 : 1, z = PD / 2, x0 = 0, x1 = s * PW, front = side === 'L' ? [[x1, y1, z], [x0, y1, z], [x0, 0, z], [x1, 0, z]] : [[x0, y1, z], [x1, y1, z], [x1, 0, z], [x0, 0, z]]; quad3(c, edgeSheet, front, { n: 4, dark: .22 });
    const sideQ = side === 'R' ? [[x1, y1, z], [x1, y1, -z], [x1, 0, -z], [x1, 0, z]] : [[x1, y1, -z], [x1, y1, z], [x1, 0, z], [x1, 0, -z]]; quad3(c, edgeSheet, sideQ, { n: 4, dark: side === 'R' ? .3 : .1 }); }
  function collect(pieces, side, ang, open, y0) { const fr = frame(side, ang), e = easeOut(clamp((open - .1) / .85, 0, 1)), out = [], at = (x, z) => V3.add([0, y0, z], V3.mul(fr.U, Math.abs(x)));
    for (const p of pieces) { if (p.base[0][0] * p.base[1][0] < 0) continue; const onLeft = (p.base[0][0] + p.base[1][0]) / 2 < 0; if (onLeft !== (side === 'L')) continue; const b0 = at(...p.base[0]), b1 = at(...p.base[1]), dir = V3.norm(V3.sub(b1, b0)), flat = V3.norm(V3.cross(fr.N, dir)), th = (p.lean ?? 90) * Math.PI / 180 * clamp(e * (p.rise ?? 1), 0, 1),
        upv = V3.add(V3.mul(flat, Math.cos(th)), V3.mul(fr.N, Math.sin(th))), t0 = V3.add(b0, V3.mul(upv, p.h)), t1 = V3.add(b1, V3.mul(upv, p.h)); out.push({ p, e, Q: [t0, t1, b1, b0], zc: (p.base[0][1] + p.base[1][1]) / 2, r0: at(0, 0), N: fr.N }); } return out; }
  // a piece across the gutter: its left foot stands on the left page, its right foot on the right page, whatever their angles
  function collectAcross(pieces, angL, angR, open, yL, yR) { const fL = frame('L', angL), fR = frame('R', angR), e = easeOut(clamp((open - .1) / .85, 0, 1)), out = [];
    for (const p of pieces) { if (p.base[0][0] * p.base[1][0] >= 0) continue; const b0 = V3.add([0, yL, p.base[0][1]], V3.mul(fL.U, Math.abs(p.base[0][0]))), b1 = V3.add([0, yR, p.base[1][1]], V3.mul(fR.U, Math.abs(p.base[1][0]))), N = V3.norm(V3.add(fL.N, fR.N)), dir = V3.norm(V3.sub(b1, b0)), flat = V3.norm(V3.cross(N, dir)),
        th = (p.lean ?? 90) * Math.PI / 180 * clamp(e * (p.rise ?? 1), 0, 1), upv = V3.add(V3.mul(flat, Math.cos(th)), V3.mul(N, Math.sin(th))); out.push({ p, e, Q: [V3.add(b0, V3.mul(upv, p.h)), V3.add(b1, V3.mul(upv, p.h)), b1, b0], zc: (p.base[0][1] + p.base[1][1]) / 2, r0: [0, Math.max(yL, yR), 0], N: [0, 1, 0] }); } return out; }
  function drawQuads(c, quads, clip) { const depth = q => q.Q.reduce((v,p) => v + proj3(p)[2], 0) / 4; quads.sort((a, b) => depth(b) - depth(a)); const casters = quads.filter(q => q.e > .03 && q.p.shadow !== false); if (casters.length) { const g = shadowsBegin(); g.setTransform(c.getTransform()); for (const q of casters) shadow3(g, q.p.sheet, q.Q, q.r0, q.N, clip, Math.min(1, q.e * 1.5)); shadowsEnd(c, .34); }
    for (const q of quads) { if (q.e <= .015) continue; quad3(c, q.p.sheet, q.Q, { n: q.p.mesh ?? 8, dark: shadeOf(q.Q) * .85 + (1 - q.e) * .22, back: q.p.back || q.p.sheet, al: Math.min(1, q.e * 5) }); if (q.p.after) q.p.after(c, q.Q, q.e); } }
  // Carry each cut-out foot with the curved leaf; the upper edge follows the
  // same displacement. This is an artistic hinge, not a folding-constraint solve.
  function attachToLeaf(quads, side, deform) {
    for (const q of quads) for (let j = 0; j < 2; j++) {
      const [x,z] = q.p.base[j]; if ((x < 0) !== (side === 'L')) continue;
      const u = side === 'R' ? Math.abs(x) / PW : 1 - Math.abs(x) / PW;
      const b = 3 - j, moved = deform(q.Q[b], u, (z + PD / 2) / PD), delta = V3.sub(moved, q.Q[b]);
      q.Q[b] = moved; q.Q[j] = V3.add(q.Q[j], delta);
    }
    return quads;
  }
  book.draw = (c, { turn }) => { const t = clamp(turn, 0, nS), k = Math.min(Math.floor(t + 1e-9), nS), fr = k >= nS ? 0 : t - k, yL = k * LEAF + 3, yR = (nS - k) * LEAF + 3, top = Math.max(yL, yR);
    // boards, then the two blocks of leaves. While the cover (leaf 0) is in the air it is the front board,
    // so the left board only lies flat once the cover has landed there (a flat copy would pop at the end of the turn).
    { const QL = pageQuad('L', 0, 0, 10), QR = pageQuad('R', 0, 0, 10); if (k > 0) quad3(c, boardSheet, QL, { n: 4, dark: shadeOf(QL) + .1 }); quad3(c, boardSheet, QR, { n: 4, dark: shadeOf(QR) + .1 }); }
    if (k > 0) block(c, 'L', yL); block(c, 'R', yR - (fr > 0 ? LEAF : 0));
    if (fr === 0) { if (k === 0) { const Q = pageQuad('R', 0, yR + 2, 8); quad3(c, cover, Q, { n: 12, dark: shadeOf(Q) }); return; }
      const sp = spreads[k - 1], QL = pageQuad('L', 0, yL), QR = pageQuad('R', 0, yR); quad3(c, sp.left, QL, { n: 12, dark: shadeOf(QL) }); quad3(c, sp.right, QR, { n: 12, dark: shadeOf(QR) });
      const clip = [QL[0], QR[1], QR[2], QL[3]]; drawQuads(c, [...collect(sp.pieces, 'L', 0, 1, yL), ...collect(sp.pieces, 'R', 0, 1, yR), ...collectAcross(sp.pieces, 0, 0, 1, yL, yR)], clip); return; }
    // leaf k is in the air: spread k-1 shuts (if there is one), spread k opens
    const phi = easeIO(fr) * Math.PI, openA = phi / Math.PI, shut = k > 0 ? spreads[k - 1] : null, opening = spreads[k], yRu = yR - LEAF;
    if (shut) { const QL = pageQuad('L', 0, yL); quad3(c, shut.left, QL, { n: 12, dark: shadeOf(QL) + .12 * Math.sin(phi) * (phi > Math.PI / 2 ? 1 : 0) }); drawQuads(c, collect(shut.pieces, 'L', 0, 1 - openA, yL), QL); }
    { const QR = pageQuad('R', 0, yRu); quad3(c, opening.right, QR, { n: 12, dark: shadeOf(QR) + .12 * Math.sin(phi) * (phi < Math.PI / 2 ? 1 : 0) }); drawQuads(c, collect(opening.pieces, 'R', 0, openA, yRu), QR); }
    const side = phi <= Math.PI / 2 ? 'R' : 'L', lift = side === 'R' ? phi : Math.PI - phi, Q = pageQuad(side, lift, top, k === 0 ? 8 : 0), showing = side === 'R' ? (k === 0 ? cover : shut.right) : opening.left, under = pageQuad(side, 0, side === 'R' ? yRu : yL);
    const normal = V3.mul(quadNormal(Q), side === 'L' ? -1 : 1), curl = PW * .11 * Math.sin(phi), deform = (p, u) => V3.add(p, V3.mul(normal, curl * Math.sin(Math.PI * u)));
    { const g = shadowsBegin(); g.setTransform(c.getTransform()); shadow3(g, showing, Q, [0, side === 'R' ? yRu : yL, 0], [0, 1, 0], under, 1, { deform, n: 14 }); shadowsEnd(c, .24); } quad3(c, showing, Q, { n: 18, dark: shadeOf(Q) * .65, deform, shadeMesh: true });
    if (side === 'R' && shut) drawQuads(c, attachToLeaf([...collect(shut.pieces, 'R', lift, 1 - openA, top), ...collectAcross(shut.pieces, 0, lift, 1 - openA, yL, top)], side, deform), null); if (side === 'L') drawQuads(c, attachToLeaf([...collect(opening.pieces, 'L', lift, openA, top), ...collectAcross(opening.pieces, lift, 0, openA, top, yRu)], side, deform), null); };
  book.pageQuad = pageQuad; return book; }
