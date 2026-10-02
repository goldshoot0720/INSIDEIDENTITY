// The four dancers, drawn in code: navy blazers, red plaid skirts, each girl with her own
// hair, bow and socks (after the INSIDE IDENTITY cover MV line-up).
// Everything is drawn in a 1024x1536 T-pose frame, so the same functions give
//   - the puppet textures (body layer + arms layer) with known joint positions, and
//   - sharp close-up portraits at any scale with blinking / singing / winking.

const SKIN = { base: '#fff1e8', shade: '#f7cfc0', line: '#b8786a' };
const BLAZER = { base: '#302b4a', shade: '#211d36', light: '#4a4370', line: '#120f1e' };
const SHIRT = { base: '#ffffff', shade: '#dde2ef', line: '#868ba6' };
const PLAID = { base: '#a3223a', dark: '#5e1022', light: '#d9566b', line: '#3d0914', white: 'rgba(255,255,255,0.32)' };
const GOLD = { base: '#d8ab45', line: '#7a5718' };
const LASH = '#2a1622';

export const GIRLS = [
  {
    id: 'mikan', name: 'ミカン', zh: '蜜柑', tag: 'SUNNY BOW', color: '#f5b51b', style: 'bob',
    hair: { base: '#ecb57e', shade: '#c88a56', light: '#fbdcae', line: '#8a5630' },
    eye: { dark: '#163a8c', base: '#3b7fe6', light: '#9fd0ff' },
    neck: { type: 'bow', base: '#f6c21c', shade: '#d99b0a', line: '#8a5a00' },
    socks: { type: 'thigh', base: '#1d1a24', light: '#3b3646', top: 900 },
    shoes: { type: 'loafer', base: '#5a2d22', light: '#8a4c3a', line: '#2a120c' },
    face: { mouth: 0.75 }, frill: true,
  },
  {
    id: 'shizuku', name: 'シズク', zh: '雫', tag: 'SILVER TWIN', color: '#3fb8b2', style: 'twin',
    hair: { base: '#e9ebf3', shade: '#b5bad0', light: '#ffffff', line: '#7c819c' },
    eye: { dark: '#1d3f8f', base: '#4b93ec', light: '#b6dcff' },
    neck: { type: 'ribbon', base: '#3fb8b2', shade: '#2a8f8a', line: '#195b58' },
    socks: { type: 'knee', base: '#dcdee5', light: '#f4f5f8', stripe: '#8d90a0', top: 1080 },
    shoes: { type: 'sneaker', base: '#26232c', light: '#4a4652', line: '#0c0b10' },
    face: { mouth: 0.1, wink: true }, frill: true,
  },
  {
    id: 'momo', name: 'モモ', zh: '桃', tag: 'PINK CAT', color: '#ff5c8a', style: 'cat',
    hair: { base: '#ff7aa0', shade: '#e2507c', light: '#ffc0d3', line: '#a3294f', tip: '#ffab7a' },
    eye: { dark: '#7a1d40', base: '#d0627f', light: '#ffc2d2' },
    neck: { type: 'tie', base: '#e3283f', shade: '#b0142a', line: '#64071a' },
    socks: { type: 'crew', base: '#1d1a24', light: '#3b3646', top: 1115 },
    shoes: { type: 'loafer', base: '#1f1a20', light: '#4a424c', line: '#050405' },
    face: { mouth: 0.85, fang: true }, frill: false, tail: true,
  },
  {
    id: 'luna', name: 'ルナ', zh: '露娜', tag: 'GOLDEN WAVE', color: '#6fa8ff', style: 'long',
    hair: { base: '#f8d77e', shade: '#ddab4c', light: '#fff2c2', line: '#9a6c1c', streak: '#6fa8ff', streakShade: '#3f74d0' },
    eye: { dark: '#8a4a06', base: '#eba11e', light: '#ffe08a' },
    neck: { type: 'bow', base: '#8fbdf2', shade: '#5f93d6', line: '#2c5591' },
    socks: { type: 'white', base: '#f8f8fb', light: '#ffffff', stripe: '#d4d6e0', top: 1100 },
    shoes: { type: 'loafer', base: '#5a2d22', light: '#8a4c3a', line: '#2a120c' },
    face: { mouth: 0.75 }, frill: true,
  },
];

// joint layout shared by every girl (source px, screen-left = l)
function rigOf(g) {
  const side = (s) => {
    const m = (p) => (s < 0 ? p : [1024 - p[0], p[1]]);
    return {
      sh: m([400, 412]), el: m([268, 412]), wr: m([152, 412]), tip: m([44, 412]),
      hip: m([468, 800]), knee: m([462, 1040]), ank: m([460, 1268]),
    };
  };
  const rig = {
    id: g.id, name: g.name, zh: g.zh, tag: g.tag, color: g.color,
    neck: [512, 362], waist: 600, pelvis: [512, 790], face: [512, 262], hem: 856,
    l: side(-1), r: side(1), size: [1024, 1536], armCut: 396,
  };
  if (g.tail) rig.tail = { root: [652, 850], tip: [806, 760], minx: 658, miny: 4000 };
  return rig;
}

// ------------------------------------------------------------------ helpers
const P = (d) => new Path2D(d);

function paint(x, path, fill, line, lw = 4) {
  if (fill) {
    x.fillStyle = fill;
    x.fill(path);
  }
  if (line) {
    x.lineWidth = lw;
    x.strokeStyle = line;
    x.stroke(path);
  }
}

function clipped(x, path, fn) {
  x.save();
  x.clip(path);
  fn();
  x.restore();
}

function mirrored(x, fn) {
  x.save();
  x.translate(1024, 0);
  x.scale(-1, 1);
  fn();
  x.restore();
}

// Catmull-Rom samples through control points
function spline(pts, n = 10) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// filled outline of a variable-width stroke along control points; widths = half widths per control point
function tube(pts, widths, { cap = true } = {}) {
  const n = 12;
  const s = spline(pts, n);
  const hw = [];
  for (let i = 0; i < widths.length - 1; i++) for (let k = 0; k < n; k++) hw.push(widths[i] + (widths[i + 1] - widths[i]) * (k / n));
  hw.push(widths[widths.length - 1]);
  const L = [], Rr = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    L.push([s[i][0] - dy * hw[i], s[i][1] + dx * hw[i]]);
    Rr.push([s[i][0] + dy * hw[i], s[i][1] - dx * hw[i]]);
  }
  const p = new Path2D();
  p.moveTo(L[0][0], L[0][1]);
  for (const q of L) p.lineTo(q[0], q[1]);
  const e = s[s.length - 1], we = hw[hw.length - 1];
  if (cap && we > 1) {
    const a = s[s.length - 2];
    const ang = Math.atan2(e[1] - a[1], e[0] - a[0]);
    p.arc(e[0], e[1], we, ang + Math.PI / 2, ang - Math.PI / 2, true);
  }
  for (let i = Rr.length - 1; i >= 0; i--) p.lineTo(Rr[i][0], Rr[i][1]);
  p.closePath();
  return p;
}

// ------------------------------------------------------------------ legs & shoes
const LEG = [[468, 776], [466, 910], [462, 1040], [460, 1150], [460, 1272]];
const LEG_W = [41, 34, 25, 28, 16];

function drawLeg(x, g) {
  const leg = tube(LEG, LEG_W, { cap: false });
  paint(x, leg, SKIN.base, null);
  clipped(x, leg, () => {
    // inner shading + knee
    x.fillStyle = SKIN.shade;
    x.beginPath();
    x.ellipse(494, 980, 14, 160, -0.02, 0, Math.PI * 2);
    x.fill();
    const s = g.socks;
    x.fillStyle = s.base;
    x.fillRect(380, s.top, 180, 400);
    if (s.type === 'thigh' || s.type === 'crew') {
      x.fillStyle = s.light;
      x.fillRect(434, s.top + 30, 8, 340);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect(380, s.top, 180, 12);
    } else {
      x.fillStyle = 'rgba(120,124,150,0.35)';
      x.fillRect(484, s.top, 20, 400);
      x.fillStyle = s.stripe;
      if (s.type === 'knee') {
        x.fillRect(380, s.top + 14, 180, 7);
        x.fillRect(380, s.top + 28, 180, 7);
      } else {
        x.globalAlpha = 0.6;
        for (let k = 0; k < 9; k++) x.fillRect(428 + k * 8, s.top, 2, 120);
        x.globalAlpha = 1;
      }
      x.fillStyle = 'rgba(0,0,0,0.12)';
      x.fillRect(380, s.top, 180, 6);
    }
  });
  x.lineWidth = 4;
  x.strokeStyle = SKIN.line;
  x.stroke(leg);
  // knee hint above the socks
  if (g.socks.top > 1060) {
    x.strokeStyle = SKIN.line;
    x.lineWidth = 2.5;
    x.beginPath();
    x.moveTo(452, 1046);
    x.quadraticCurveTo(462, 1054, 472, 1046);
    x.stroke();
  }
  drawShoe(x, g.shoes);
}

function drawShoe(x, s) {
  const big = s.type === 'sneaker' ? 4 : 0;
  const shoe = P(`M${428 - big} 1256 C${422 - big} 1288 ${426 - big} 1318 444 1328 Q461 1336 478 1328 C${496 + big} 1318 ${500 + big} 1288 ${494 + big} 1256 Q461 1246 ${428 - big} 1256 Z`);
  paint(x, shoe, s.base, s.line, 4);
  clipped(x, shoe, () => {
    if (s.type === 'sneaker') {
      x.fillStyle = '#f4f4f6';
      x.fillRect(400, 1312, 120, 30);
      x.beginPath();
      x.ellipse(461, 1314, 26, 12, 0, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = '#f4f4f6';
      x.lineWidth = 4;
      for (const y of [1268, 1280, 1292]) {
        x.beginPath();
        x.moveTo(448, y);
        x.lineTo(474, y + 2);
        x.stroke();
      }
    } else {
      x.fillStyle = s.light;
      x.beginPath();
      x.ellipse(452, 1300, 9, 16, 0.3, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = s.line;
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(432, 1280);
      x.quadraticCurveTo(461, 1292, 490, 1280);
      x.stroke();
      x.fillStyle = s.line;
      x.fillRect(452, 1283, 18, 4);
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.fillRect(400, 1322, 120, 20);
    }
  });
}

// ------------------------------------------------------------------ skirt
const SKIRT = P('M440 596 L584 596 L654 844 Q583 866 512 866 Q441 866 370 844 Z');

function drawSkirt(x, g) {
  if (g.frill) {
    const fr = new Path2D();
    fr.moveTo(366, 836);
    let px = 366;
    while (px < 658) {
      const nx = Math.min(658, px + 21);
      const y = 852 + 18 * (1 - Math.pow((px + nx) / 2 / 146 - 3.5, 2));
      fr.quadraticCurveTo((px + nx) / 2, y + 30, nx, y + 8);
      px = nx;
    }
    fr.lineTo(658, 836);
    fr.closePath();
    paint(x, fr, '#ffffff', SHIRT.line, 3);
  }
  paint(x, SKIRT, PLAID.base, null);
  clipped(x, SKIRT, () => {
    x.fillStyle = PLAID.dark;
    x.globalAlpha = 0.55;
    for (let px = 352; px < 680; px += 46) x.fillRect(px, 590, 17, 290);
    for (let py = 616; py < 880; py += 46) x.fillRect(340, py, 340, 17);
    x.globalAlpha = 1;
    x.fillStyle = PLAID.light;
    for (let px = 384; px < 680; px += 46) x.fillRect(px, 590, 3, 290);
    for (let py = 648; py < 880; py += 46) x.fillRect(340, py, 340, 3);
    x.fillStyle = PLAID.white;
    for (let px = 360; px < 680; px += 46) x.fillRect(px + 6, 590, 2, 290);
    // pleats
    for (let k = -5; k <= 5; k++) {
      x.strokeStyle = 'rgba(40,0,10,0.55)';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(512 + k * 13, 596);
      x.lineTo(512 + k * 27, 870);
      x.stroke();
      x.strokeStyle = 'rgba(255,190,200,0.22)';
      x.beginPath();
      x.moveTo(516 + k * 13, 596);
      x.lineTo(518 + k * 27, 870);
      x.stroke();
    }
    // shadow under the blazer
    x.fillStyle = 'rgba(30,0,10,0.4)';
    x.fillRect(340, 596, 340, 70);
  });
  paint(x, SKIRT, null, PLAID.line, 4);
}

// ------------------------------------------------------------------ torso
const BLAZER_PATH = P(`M486 370 L538 370 C570 374 610 380 628 388 C646 396 652 420 646 448
  L636 520 C630 560 624 590 620 612 L628 662 Q600 672 568 668 L512 672 L456 668 Q424 672 396 662
  L404 612 C400 590 394 560 388 520 L378 448 C372 420 378 396 396 388 C414 380 454 374 486 370 Z`);
const SHIRT_V = P('M470 374 L554 374 L512 538 Z');

function drawTorso(x, g) {
  paint(x, BLAZER_PATH, BLAZER.base, null);
  clipped(x, BLAZER_PATH, () => {
    x.fillStyle = BLAZER.shade;
    x.beginPath();
    x.moveTo(370, 440); x.lineTo(412, 448); x.lineTo(436, 680); x.lineTo(370, 680);
    x.fill();
    x.beginPath();
    x.moveTo(512, 538); x.lineTo(524, 538); x.lineTo(530, 680); x.lineTo(512, 680);
    x.fill();
    x.fillStyle = BLAZER.light;
    x.globalAlpha = 0.6;
    x.beginPath();
    x.moveTo(610, 420); x.lineTo(630, 430); x.lineTo(616, 600); x.lineTo(604, 600);
    x.fill();
    x.globalAlpha = 1;
  });
  paint(x, BLAZER_PATH, null, BLAZER.line, 4);
  // shirt + collar
  paint(x, SHIRT_V, SHIRT.base, SHIRT.line, 3);
  clipped(x, SHIRT_V, () => {
    x.fillStyle = SHIRT.shade;
    x.fillRect(470, 374, 84, 26);
  });
  const collar = P('M490 366 L466 394 L502 408 L512 384 Z');
  paint(x, collar, SHIRT.base, SHIRT.line, 3);
  mirrored(x, () => paint(x, collar, SHIRT.base, SHIRT.line, 3));
  // lapels
  const lapel = P('M470 376 L506 520 L512 540 L496 470 L480 476 L468 410 Z');
  paint(x, lapel, BLAZER.light, BLAZER.line, 3);
  mirrored(x, () => paint(x, lapel, BLAZER.light, BLAZER.line, 3));
  // front edge, buttons, pockets
  x.strokeStyle = BLAZER.line;
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(512, 540); x.lineTo(512, 646); x.lineTo(500, 670);
  x.moveTo(512, 646); x.lineTo(524, 670);
  x.moveTo(416, 622); x.lineTo(472, 616);
  x.moveTo(608, 622); x.lineTo(552, 616);
  x.stroke();
  for (const by of [566, 616]) {
    const b = new Path2D();
    b.arc(512, by, 7.5, 0, Math.PI * 2);
    paint(x, b, GOLD.base, GOLD.line, 2.5);
  }
  drawNeckwear(x, g.neck);
}

function drawNeckwear(x, n) {
  if (n.type === 'tie') {
    const blade = P('M504 404 L520 404 L532 496 L512 522 L492 496 Z');
    paint(x, blade, n.base, n.line, 3);
    clipped(x, blade, () => {
      x.fillStyle = n.shade;
      x.fillRect(512, 400, 30, 130);
    });
    const knot = P('M500 384 L524 384 L520 406 L504 406 Z');
    paint(x, knot, n.shade, n.line, 3);
    return;
  }
  if (n.type === 'ribbon') {
    x.lineCap = 'round';
    x.strokeStyle = n.base;
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(512, 398); x.bezierCurveTo(486, 376, 470, 398, 506, 402);
    x.moveTo(512, 398); x.bezierCurveTo(538, 376, 554, 398, 518, 402);
    x.moveTo(510, 402); x.bezierCurveTo(500, 430, 504, 450, 494, 478);
    x.moveTo(514, 402); x.bezierCurveTo(526, 436, 524, 460, 534, 486);
    x.stroke();
    x.fillStyle = n.shade;
    x.beginPath();
    x.arc(512, 400, 6, 0, Math.PI * 2);
    x.fill();
    return;
  }
  // big bow
  const loop = P('M512 400 C492 372 448 370 450 398 C452 426 494 426 512 400 Z');
  const tail = P('M506 404 L480 462 L494 456 L502 470 L516 406 Z');
  paint(x, tail, n.shade, n.line, 3);
  mirrored(x, () => paint(x, tail, n.shade, n.line, 3));
  paint(x, loop, n.base, n.line, 3);
  mirrored(x, () => paint(x, loop, n.base, n.line, 3));
  x.strokeStyle = n.shade;
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(470, 390); x.quadraticCurveTo(486, 398, 500, 400);
  x.moveTo(554, 390); x.quadraticCurveTo(538, 398, 524, 400);
  x.stroke();
  const knot = P('M502 388 Q512 384 522 388 L522 412 Q512 416 502 412 Z');
  paint(x, knot, n.shade, n.line, 3);
}

// ------------------------------------------------------------------ arms
const SLEEVE = P('M404 380 Q334 380 268 386 L176 390 L176 436 L268 440 Q334 446 404 452 Z');
const SLEEVE_EDGE = P('M404 380 Q334 380 268 386 L176 390 L176 436 L268 440 Q334 446 404 452');
const HAND = P(`M156 396 C132 390 106 392 86 396 C64 398 48 400 44 408 C42 416 50 420 64 421
  L86 422 C96 430 104 440 116 441 C128 442 138 434 156 430 Z`);

function drawArm(x) {
  paint(x, HAND, SKIN.base, SKIN.line, 3.5);
  x.strokeStyle = SKIN.line;
  x.lineWidth = 2.5;
  x.beginPath();
  x.moveTo(62, 407); x.lineTo(92, 405);
  x.moveTo(60, 414); x.lineTo(90, 414);
  x.moveTo(104, 428); x.quadraticCurveTo(112, 426, 120, 430);
  x.stroke();
  const cuff = P('M150 392 L180 390 L180 436 L150 434 Q144 413 150 392 Z');
  paint(x, cuff, SHIRT.base, SHIRT.line, 3);
  x.fillStyle = BLAZER.base;
  x.fill(SLEEVE);
  clipped(x, SLEEVE, () => {
    x.fillStyle = BLAZER.shade;
    x.beginPath();
    x.moveTo(170, 424); x.lineTo(410, 432); x.lineTo(410, 460); x.lineTo(170, 460);
    x.fill();
    x.fillStyle = BLAZER.light;
    x.globalAlpha = 0.55;
    x.fillRect(170, 392, 240, 7);
    x.globalAlpha = 1;
  });
  x.lineWidth = 4;
  x.strokeStyle = BLAZER.line;
  x.stroke(SLEEVE_EDGE);
  x.lineWidth = 2.5;
  x.beginPath();
  x.moveTo(276, 388); x.quadraticCurveTo(268, 404, 280, 418);
  x.moveTo(262, 440); x.quadraticCurveTo(256, 430, 264, 422);
  x.stroke();
  for (const bx of [190, 202]) {
    const b = new Path2D();
    b.arc(bx, 428, 3.5, 0, Math.PI * 2);
    paint(x, b, GOLD.base, null);
  }
}

// arms hanging at the sides (portraits only)
function drawArmDown(x) {
  const pts = [[396, 396], [380, 470], [370, 560], [366, 640]];
  const s = tube(pts, [36, 31, 29, 28], { cap: false });
  const hand = P('M346 650 C340 680 344 704 360 712 C376 716 388 700 388 676 L386 650 Z');
  paint(x, hand, SKIN.base, SKIN.line, 3.5);
  const cuff = P('M338 632 L394 634 L392 660 L340 658 Z');
  paint(x, cuff, SHIRT.base, SHIRT.line, 3);
  paint(x, s, BLAZER.base, null);
  clipped(x, s, () => {
    x.fillStyle = BLAZER.shade;
    x.fillRect(330, 380, 26, 300);
  });
  paint(x, s, null, BLAZER.line, 4);
}

// ------------------------------------------------------------------ head
const FACE = P('M410 190 C408 252 430 300 470 328 Q498 346 512 346 Q526 346 554 328 C594 300 616 252 614 190 C612 120 412 120 410 190 Z');
const NECK = P('M490 316 L490 380 Q512 390 534 380 L534 316 Z');

function fringe(tips, valley = 186) {
  // tips run from screen-right temple to screen-left temple
  const p = new Path2D();
  p.moveTo(384, 300);
  p.bezierCurveTo(366, 150, 432, 78, 512, 78);
  p.bezierCurveTo(592, 78, 658, 150, 640, 300);
  p.lineTo(646, 336);
  p.quadraticCurveTo(632, 362, 618, 376);
  p.quadraticCurveTo(612, 320, 606, 236);
  let prev = [606, valley];
  for (let i = 0; i < tips.length; i++) {
    const t = tips[i];
    const next = i + 1 < tips.length ? [(t[0] + tips[i + 1][0]) / 2, valley + (i % 2) * 6] : [418, valley + 40];
    p.quadraticCurveTo(prev[0] * 0.55 + t[0] * 0.45, (prev[1] + t[1]) / 2 - 6, t[0], t[1]);
    p.quadraticCurveTo(t[0] * 0.6 + next[0] * 0.4, (t[1] + next[1]) / 2 - 10, next[0], next[1]);
    prev = next;
  }
  p.quadraticCurveTo(412, 300, 406, 376);
  p.quadraticCurveTo(392, 362, 378, 336);
  p.closePath();
  return p;
}

const FRINGE_TIPS = {
  bob: [[594, 236], [566, 220], [538, 240], [508, 224], [478, 242], [448, 222], [428, 246]],
  twin: [[596, 242], [570, 216], [546, 238], [516, 220], [488, 240], [458, 218], [432, 242]],
  cat: [[598, 240], [574, 224], [548, 246], [520, 222], [492, 242], [462, 226], [434, 248]],
  long: [[596, 246], [568, 222], [540, 242], [510, 216], [482, 238], [452, 220], [430, 246]],
};

function hairShading(x, h, path) {
  clipped(x, path, () => {
    // angel ring
    x.fillStyle = h.light;
    x.globalAlpha = 0.85;
    x.beginPath();
    x.moveTo(400, 150);
    for (let i = 0; i <= 12; i++) x.lineTo(400 + i * 19, 136 + (i % 2 ? 18 : 0));
    for (let i = 12; i >= 0; i--) x.lineTo(400 + i * 19, 156 + (i % 2 ? 26 : 8));
    x.fill();
    x.globalAlpha = 1;
    // strand lines
    x.strokeStyle = h.shade;
    x.lineWidth = 3;
    x.globalAlpha = 0.7;
    for (const [tx, ty] of [[452, 226], [500, 230], [552, 236], [588, 230], [430, 250]]) {
      x.beginPath();
      x.moveTo(512 + (tx - 512) * 0.3, 96);
      x.quadraticCurveTo(tx - 4, 160, tx, ty);
      x.stroke();
    }
    x.globalAlpha = 1;
  });
}

function backHair(x, g) {
  const h = g.hair;
  let p;
  if (g.style === 'bob') {
    p = P('M378 300 C356 140 430 66 512 66 C594 66 668 140 646 300 C652 340 664 362 674 376 Q642 388 608 370 L416 370 Q382 388 350 376 C360 362 372 340 378 300 Z');
  } else if (g.style === 'twin') {
    for (const side of [0, 1]) {
      const draw = () => {
        const t = tube([[400, 176], [344, 230], [318, 350], [334, 470], [312, 600], [330, 660]], [30, 44, 46, 40, 24, 3]);
        paint(x, t, h.base, h.line, 4);
        clipped(x, t, () => {
          x.strokeStyle = h.shade;
          x.lineWidth = 3;
          for (const o of [-14, 6, 22]) {
            x.beginPath();
            x.moveTo(350 + o, 230);
            x.bezierCurveTo(310 + o, 360, 350 + o, 470, 316 + o * 0.6, 640);
            x.stroke();
          }
          x.fillStyle = h.light;
          x.globalAlpha = 0.7;
          x.fillRect(300, 300, 60, 10);
          x.globalAlpha = 1;
        });
      };
      side ? mirrored(x, draw) : draw();
    }
    p = P('M382 300 C360 140 432 70 512 70 C592 70 664 140 642 300 L640 340 L384 340 Z');
  } else if (g.style === 'cat') {
    p = P(`M376 300 C354 140 430 66 512 66 C594 66 670 140 648 300 C654 334 664 360 680 384 L650 378 L660 408
      L622 384 L402 384 L364 408 L374 378 L344 384 C360 360 370 334 376 300 Z`);
  } else {
    p = P(`M382 290 C358 140 430 72 512 72 C594 72 666 140 642 290 C664 380 676 470 690 560
      C704 640 672 700 700 780 Q650 790 616 770 L408 770 Q374 790 324 780 C352 700 320 640 334 560
      C348 470 360 380 382 290 Z`);
  }
  paint(x, p, h.shade, h.line, 4);
  if (g.style === 'long') {
    clipped(x, p, () => {
      x.strokeStyle = h.base;
      x.lineWidth = 10;
      for (const o of [-150, -120, 120, 150]) {
        x.beginPath();
        x.moveTo(512 + o * 0.7, 300);
        x.bezierCurveTo(512 + o * 1.05, 450, 512 + o * 0.95, 600, 512 + o * 1.15, 780);
        x.stroke();
      }
      // blue streak on the screen-left side
      x.strokeStyle = h.streakShade;
      x.lineWidth = 26;
      x.beginPath();
      x.moveTo(396, 300);
      x.bezierCurveTo(350, 450, 380, 600, 344, 780);
      x.stroke();
    });
  }
  if (g.style === 'cat') {
    clipped(x, p, () => {
      const gr = x.createLinearGradient(0, 290, 0, 400);
      gr.addColorStop(0, 'rgba(255,171,122,0)');
      gr.addColorStop(1, h.tip);
      x.fillStyle = gr;
      x.fillRect(330, 290, 370, 130);
    });
  }
}

function catEars(x, g) {
  const h = g.hair;
  const ear = P('M432 150 L414 58 Q416 46 428 52 L490 112 Z');
  const inner = P('M436 132 L424 74 L474 116 Z');
  for (const side of [0, 1]) {
    const draw = () => {
      paint(x, ear, h.base, h.line, 4);
      paint(x, inner, '#ffd4df', null);
      x.strokeStyle = h.light;
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(430, 100); x.lineTo(440, 112);
      x.moveTo(436, 92); x.lineTo(448, 106);
      x.stroke();
    };
    side ? mirrored(x, draw) : draw();
  }
}

function drawEye(x, cx, cy, e, open, smileClosed) {
  x.save();
  x.translate(cx, cy);
  x.scale(1.14, 1.14);
  if (open < 0.2) {
    x.strokeStyle = LASH;
    x.lineWidth = 6;
    x.lineCap = 'round';
    x.beginPath();
    if (smileClosed) {
      x.moveTo(-28, 8);
      x.quadraticCurveTo(0, -16, 28, 8);
    } else {
      x.moveTo(-28, 4);
      x.quadraticCurveTo(0, 16, 28, 4);
    }
    x.moveTo(-28, smileClosed ? 8 : 4);
    x.lineTo(-38, smileClosed ? 0 : 0);
    x.stroke();
    x.restore();
    return;
  }
  const sclera = P('M-30 -8 C-20 -24 10 -27 28 -14 L28 18 Q2 34 -26 22 Z');
  x.fillStyle = '#ffffff';
  x.fill(sclera);
  clipped(x, sclera, () => {
    const gr = x.createLinearGradient(0, -26, 0, 34);
    gr.addColorStop(0, e.dark);
    gr.addColorStop(0.45, e.base);
    gr.addColorStop(1, e.light);
    x.fillStyle = gr;
    x.beginPath();
    x.ellipse(2, 4, 22, 29, 0, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = 2.5;
    x.strokeStyle = e.dark;
    x.stroke();
    x.fillStyle = e.dark;
    x.beginPath();
    x.ellipse(2, 4, 10, 14, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(40,20,40,0.28)';
    x.fillRect(-32, -30, 64, 16);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.ellipse(-8, -6, 8, 10, -0.3, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.arc(11, 17, 4, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 0.8;
    x.beginPath();
    x.arc(12, -4, 2.5, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
  });
  const lash = P('M-38 -2 L-31 -10 C-20 -28 12 -31 32 -16 L32 -10 C12 -22 -16 -22 -28 -5 Z');
  x.fillStyle = LASH;
  x.fill(lash);
  x.strokeStyle = LASH;
  x.lineWidth = 2;
  x.globalAlpha = 0.7;
  x.beginPath();
  x.moveTo(-16, 27);
  x.quadraticCurveTo(2, 32, 18, 24);
  x.stroke();
  x.globalAlpha = 1;
  x.restore();
}

function drawMouth(x, f, open) {
  x.lineCap = 'round';
  x.lineJoin = 'round';
  if (open < 0.15) {
    x.strokeStyle = SKIN.line;
    x.lineWidth = 3.5;
    x.beginPath();
    x.moveTo(498, 308);
    x.quadraticCurveTo(505, 316, 512, 309);
    x.quadraticCurveTo(519, 316, 526, 308);
    x.stroke();
    return;
  }
  const h = 8 + 20 * open;
  const m = P(`M490 306 Q512 312 534 306 Q530 ${306 + h} 512 ${308 + h} Q494 ${306 + h} 490 306 Z`);
  paint(x, m, '#a52a44', null);
  clipped(x, m, () => {
    x.fillStyle = '#ff7f95';
    x.beginPath();
    x.ellipse(512, 312 + h, 16, 9, 0, 0, Math.PI * 2);
    x.fill();
  });
  paint(x, m, null, SKIN.line, 3);
  if (f.fang) {
    const fang = P('M520 309 L528 308 L525 317 Z');
    paint(x, fang, '#ffffff', null);
  }
}

function drawFace(x, g, ex) {
  paint(x, NECK, SKIN.base, SKIN.line, 3.5);
  clipped(x, NECK, () => {
    x.fillStyle = SKIN.shade;
    x.beginPath();
    x.ellipse(512, 330, 34, 22, 0, 0, Math.PI * 2);
    x.fill();
  });
  paint(x, FACE, SKIN.base, SKIN.line, 3.5);
  // bangs shadow on the forehead
  clipped(x, FACE, () => {
    x.save();
    x.translate(0, 14);
    x.fillStyle = SKIN.shade;
    x.fill(fringe(FRINGE_TIPS[g.style]));
    x.restore();
  });
  // blush
  x.fillStyle = 'rgba(255,128,150,0.42)';
  for (const bx of [440, 584]) {
    x.beginPath();
    x.ellipse(bx, 298, 24, 11, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.strokeStyle = 'rgba(230,90,120,0.55)';
  x.lineWidth = 2;
  for (const bx of [440, 584]) {
    x.beginPath();
    for (let k = -1; k <= 1; k++) {
      x.moveTo(bx + k * 10 - 3, 303);
      x.lineTo(bx + k * 10 + 3, 293);
    }
    x.stroke();
  }
  drawEye(x, 462, 266, g.eye, ex.eyeL, ex.smileEyes);
  mirrored(x, () => drawEye(x, 462, 266, g.eye, ex.eyeR, ex.smileEyes));
  // nose
  x.strokeStyle = SKIN.line;
  x.lineWidth = 2.5;
  x.beginPath();
  x.moveTo(512, 288);
  x.lineTo(509, 293);
  x.stroke();
  drawMouth(x, g.face, ex.mouth);
}

function frontHair(x, g) {
  const h = g.hair;
  if (g.style === 'cat') catEars(x, g);
  if (g.style === 'bob') {
    const bun = new Path2D();
    bun.arc(606, 104, 40, 0, Math.PI * 2);
    paint(x, bun, h.base, h.line, 4);
    x.strokeStyle = h.shade;
    x.lineWidth = 3;
    x.beginPath();
    x.arc(606, 104, 22, 0.6, 4.4);
    x.stroke();
    const tie = P('M574 128 Q600 150 634 134 L628 146 Q600 160 568 140 Z');
    paint(x, tie, '#f6c21c', '#8a5a00', 3);
  }
  const fr = fringe(FRINGE_TIPS[g.style]);
  const grad = x.createLinearGradient(0, 80, 0, 380);
  grad.addColorStop(0, h.base);
  grad.addColorStop(0.75, h.base);
  grad.addColorStop(1, h.tip || h.light);
  paint(x, fr, grad, null);
  hairShading(x, h, fr);
  paint(x, fr, null, h.line, 4);
  if (g.style === 'long') {
    // front locks over the shoulders, the screen-left one blue
    const lockL = tube([[410, 232], [398, 330], [404, 440], [394, 520]], [16, 22, 18, 2]);
    paint(x, lockL, h.streak, h.line, 4);
    const lockR = tube([[614, 232], [626, 330], [620, 440], [630, 520]], [16, 22, 18, 2]);
    paint(x, lockR, h.base, h.line, 4);
    x.lineCap = 'round';
    const ahoge = tube([[508, 84], [500, 44], [528, 26], [548, 50]], [7, 6, 4, 1]);
    paint(x, ahoge, h.base, h.line, 3);
  }
  if (g.style === 'twin') {
    for (const side of [0, 1]) {
      const draw = () => {
        const b = new Path2D();
        b.arc(402, 170, 20, 0, Math.PI * 2);
        paint(x, b, '#3a3542', '#14121a', 3);
        x.fillStyle = 'rgba(255,255,255,0.5)';
        x.beginPath();
        x.arc(396, 164, 6, 0, Math.PI * 2);
        x.fill();
      };
      side ? mirrored(x, draw) : draw();
    }
    // watermelon clips
    for (const [cx, cy, a] of [[592, 186, 0.5], [604, 212, 0.7]]) {
      x.save();
      x.translate(cx, cy);
      x.rotate(a);
      const w = P('M-14 -6 L14 -6 L0 16 Z');
      paint(x, w, '#ff5d6c', '#9a1c2c', 2);
      x.fillStyle = '#3cbf6c';
      x.fillRect(-14, -9, 28, 5);
      x.fillStyle = '#222';
      x.fillRect(-5, 0, 2.5, 3);
      x.fillRect(3, 0, 2.5, 3);
      x.restore();
    }
  }
  if (g.style === 'cat') {
    x.strokeStyle = GOLD.base;
    x.lineWidth = 5;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(580, 192); x.lineTo(612, 222);
    x.moveTo(612, 192); x.lineTo(580, 222);
    x.moveTo(574, 236); x.lineTo(606, 240);
    x.stroke();
  }
}

function drawTail(x, g) {
  const h = g.hair;
  const t = tube([[600, 800], [664, 868], [744, 884], [800, 832], [812, 764], [792, 742]], [16, 17, 16, 14, 11, 4]);
  paint(x, t, h.base, h.line, 4);
  clipped(x, t, () => {
    x.strokeStyle = h.light;
    x.lineWidth = 5;
    x.beginPath();
    x.moveTo(668, 862); x.quadraticCurveTo(760, 880, 800, 800);
    x.stroke();
  });
}

const NEUTRAL = { eyeL: 1, eyeR: 1, mouth: 0.7, smileEyes: true };

function expression(g, ex = {}) {
  return { ...NEUTRAL, mouth: g.face.mouth, ...ex };
}

// everything except the T-pose arms
export function drawBody(x, g, ex, { armsDown = false } = {}) {
  ex = expression(g, ex);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  backHair(x, g);
  if (g.tail) drawTail(x, g);
  drawLeg(x, g);
  mirrored(x, () => drawLeg(x, g));
  drawSkirt(x, g);
  drawTorso(x, g);
  if (armsDown) {
    drawArmDown(x);
    mirrored(x, () => drawArmDown(x));
  }
  drawFace(x, g, ex);
  frontHair(x, g);
}

export function drawArms(x) {
  x.lineJoin = 'round';
  x.lineCap = 'round';
  drawArm(x);
  mirrored(x, () => drawArm(x));
}

// bust portrait for close-ups: ex = { eyeL, eyeR, mouth }, crop in source px
export const BUST = { x: 300, y: 30, w: 424, h: 520 };
export function drawPortrait(x, g, ex) {
  drawBody(x, g, ex, { armsDown: true });
}

function layer(fn) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1536;
  fn(c.getContext('2d'));
  return c;
}

export function buildCast() {
  return GIRLS.map((g) => ({
    girl: g,
    rig: rigOf(g),
    body: layer((x) => drawBody(x, g, g.face.wink ? { eyeL: 1, eyeR: 1, mouth: 0.1 } : {})),
    arms: layer((x) => drawArms(x)),
  }));
}
