// PV for every song. One deterministic render(t): the same frame for live preview and for the
// frame-by-frame MP4 export (tools/render-pv.mjs). Nothing is carried between frames, so seeking
// and re-rendering always give the same picture.
//
// Look: the INSIDE IDENTITY cover MV (crimson stage, torn black frame, Mincho subtitles, torn
// four-strip close-ups) crossed with a pastel "desktop pet" PV (bubbly title type, search bar,
// `.pet` windows with live portraits).
import { Renderer, Puppet } from './puppet.js';
import { dancePose } from './dance.js';
import { buildCast, drawPortrait } from './cast.js';
import { Stage } from './stage.js';
import { T, S, chain, lerp, clamp } from './mat.js';
import { SONGS } from '../songs/songs.js';

const W = 1920, H = 1080, FPS = 30;
const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const JOB = params.get('job') || '0';

const MINCHO = '"Hiragino Mincho ProN","Songti TC","Noto Serif TC",serif';
const MARU = '"Hiragino Maru Gothic ProN","Hiragino Sans","PingFang TC",sans-serif';
const SANS = '"Hiragino Sans","PingFang TC",sans-serif';
const LATIN = '"Avenir Next Condensed","Avenir Next","Helvetica Neue",sans-serif';
const POP = ['#ff5c9a', '#36b9f0', '#ffb31f', '#9b6bff', '#2fcf94', '#ff7a45'];

// one look per song: stage glow, accent, signboard words and the giant scrolling type
const LOOKS = {
  s023: { stage: ['#2f63e0', '#070e33'], accent: '#ffd34d', words: ['百年の夢', '藍圖', '一張桌', '一枝筆'], latin: ['DREAM', 'BLUEPRINT', '1994 → 2094'] },
  s024: { stage: ['#12b3a2', '#02211f'], accent: '#d9ff3a', words: ['水電進化', '樂團', '嗨起來', '進化論'], latin: ['VOLT', 'EVOLUTION', 'SHOW'] },
  s026: { stage: ['#ff4f9a', '#33041c'], accent: '#ffd166', words: ['本喵掉毛', '跪好', '朝拜', '原廠'], latin: ['MEOW', 'FLUFF', 'PRICE 888'] },
  s027: { stage: ['#8a3cff', '#170533'], accent: '#ffd23f', words: ['傳奇人生', '頭獎', '榜首', '總統'], latin: ['LEGEND', 'JACKPOT', 'PRESIDENT'] },
  s028: { stage: ['#ff6a1a', '#2a0700'], accent: '#ffe14d', words: ['水電王子', '爆紅', '太陽餅', '小學堂'], latin: ['BLAZE', 'PRINCE', 'VIRAL'] },
  s029: { stage: ['#ff4d73', '#360513'], accent: '#ffe3ea', words: ['結婚理由', '紅線', '五三九', '命中注定'], latin: ['WEDDING', 'LUCKY 539', 'TRUE?'] },
  s062: { stage: ['#ff2fd0', '#10002b'], accent: '#3df5ff', words: ['進化', '榜首', '市長', '大合唱'], latin: ['EVOLUTION', 'NEON', 'NO LIMIT'] },
  s101: { stage: ['#d6913f', '#261203'], accent: '#fff0cf', words: ['紀念冊', '三十三', '排列組合', '對話'], latin: ['MEMORIES', 'CLASS OF 33', '2021'] },
  s102: { stage: ['#f0b000', '#380900'], accent: '#ff4f4f', words: ['頭獎', '發票', '威力彩', '招財喵'], latin: ['JACKPOT', 'LUCKY CAT', 'BIRTHDAY'] },
};

// ------------------------------------------------------------------ helpers
const ease = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const easeOut = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const easeBack = (u) => { u = clamp(u, 0, 1); const c = 1.8; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const frac = (x) => x - Math.floor(x);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t, alpha = 1) => {
  const p = hex(a), q = hex(b);
  return `rgba(${p.map((v, i) => Math.round(v + (q[i] - v) * t)).join(',')},${alpha})`;
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function rrect(x, px, py, w, h, r) {
  x.beginPath();
  x.roundRect(px, py, w, h, r);
}

// ------------------------------------------------------------------ setup
const out = document.getElementById('pv');
const ctx = out.getContext('2d');
const glc = mk(W, H);
const renderer = new Renderer(glc);
const cast = buildCast();
const puppets = cast.map((c) => new Puppet(renderer, c.rig, c.body, c.arms));
const GIRLS = cast.map((c) => c.girl);
const stage = new Stage();
const SLOT_X = [330, 750, 1170, 1590];
const FLOOR = 1012, SCALE = 0.555;

let song = null, look = null, env = null, shots = [], routine = [], outroStart = 0;
let songIndex = 0;

const MOVES = {
  verse: ['bounce', 'step', 'point', 'wave', 'bounce', 'clap'],
  chorus: ['clap', 'jump', 'wave', 'chuuni', 'clap', 'heart'],
  hook: ['chuuni', 'point', 'jump'],
  inst: ['bounce', 'wave', 'step', 'point'],
};

const beatAt = (t) => (t - song.beat0) * song.bpm / 60;
const envAt = (arr, t) => (arr[clamp(Math.round(t * song.fps), 0, arr.length - 1)] || 0) / 255;
function sectionAt(t) {
  for (let i = 0; i < song.sections.length; i++) {
    const s = song.sections[i];
    if (t >= s.start - 0.3 && t < s.end + 0.3) return { ...s, index: i };
  }
  return { kind: 'inst', index: -1 };
}

function setup(index) {
  songIndex = index;
  song = SONGS[index];
  look = LOOKS[song.id];
  env = { low: decode(song.low), voc: decode(song.voc) };
  const L = song.lines;
  L.forEach((l, i) => {
    const next = L[i + 1] ? L[i + 1].t : song.dur;
    l.end = Math.min(next, l.t + Math.max(l.d, 1.2) + 0.6);
    l.kind = song.sections[l.sec] ? song.sections[l.sec].kind : 'verse';
    l.singer = l.kind === 'chorus' ? -1 : (i + l.sec) % 4;
  });

  // choreography: one 8-beat entry per bar, picked by the section the bar starts in
  const spb = 60 / song.bpm;
  const bars = Math.ceil(song.dur / spb / 8) + 2;
  routine = [];
  let run = 0, lastKind = '';
  for (let n = 0; n < bars; n++) {
    const kind = sectionAt(song.beat0 + n * 8 * spb + 0.5).kind;
    run = kind === lastKind ? run + 1 : 0;
    lastKind = kind;
    const list = MOVES[kind] || MOVES.verse;
    routine.push({ move: list[(run + n) % list.length], mirror: n % 2 === 1, canon: n % 3 === 2 ? 0.25 : 0 });
  }

  // shot list
  shots = [];
  const push = (start, type, opt = {}) => {
    const prev = shots[shots.length - 1];
    if (prev && start - prev.start < 0.9) {
      if (type === 'END' || prev.type !== 'TITLE') Object.assign(prev, { type, ...opt });
      return;
    }
    shots.push({ start, type, ...opt });
  };
  const first = L[0] ? L[0].t : 6;
  const titleEnd = clamp(first - 0.4, 4, 7.5);
  push(0, 'TITLE');
  const bar = 8 * spb;
  const fill = (a, b, seed) => {
    const kinds = ['G', 'W', 'C'];
    let k = 0;
    for (let s = a; s < b - 1.5; s += Math.max(bar, 3)) {
      const type = kinds[(seed + k) % 3];
      push(s, type, { girl: (seed + k) % 4 });
      k++;
    }
  };
  fill(titleEnd, first, 0);
  const pattern = {
    verse: ['PET', 'G', 'C', 'PET2', 'W', 'C'],
    chorus: ['G', 'C', 'PET4', 'W', 'C', 'G'],
    hook: ['G', 'C', 'W'],
  };
  const count = {};
  L.forEach((l, i) => {
    const firstOfSection = i === 0 || L[i - 1].sec !== l.sec;
    let type;
    if (firstOfSection && (l.kind === 'chorus' || l.kind === 'hook')) type = 'STRIP';
    else {
      const p = pattern[l.kind] || pattern.verse;
      count[l.kind] = (count[l.kind] || 0) + 1;
      type = p[(count[l.kind] + l.sec) % p.length];
    }
    const girl = l.singer >= 0 ? l.singer : i % 4;
    push(l.t, type, { girl, line: i });
    if (l.end - l.t > 6) push(l.t + (l.end - l.t) / 2, type === 'G' ? 'W' : 'G', { girl });
    const next = L[i + 1] ? L[i + 1].t : null;
    if (next && next - l.end > 3) fill(l.end, next, i);
  });
  const last = L[L.length - 1];
  outroStart = clamp(Math.max(last ? last.end + 0.6 : song.dur - 8, song.dur - 9), 0, song.dur - 3);
  if (last) fill(last.end, outroStart, 1);
  push(outroStart, 'END');
}

function shotAt(t) {
  let i = shots.length - 1;
  while (i > 0 && shots[i].start > t) i--;
  return { shot: shots[i], next: shots[i + 1] };
}

function lineAt(t) {
  for (const l of song.lines) if (t >= l.t && t < l.end) return l;
  return null;
}

// face state for portraits: blinking, singing with the vocal envelope, Shizuku's wink
function faceOf(i, t, singing) {
  const g = GIRLS[i];
  const blink = frac((t + i * 1.37) / 3.3) < 0.045;
  if (singing) {
    const v = envAt(env.voc, t);
    return { eyeL: blink ? 0 : 1, eyeR: blink ? 0 : 1, mouth: clamp(0.18 + v * 1.1, 0, 1) };
  }
  if (g.face.wink && frac(t / 4.2) < 0.5) return { eyeL: 1, eyeR: 0, mouth: 0.1 };
  return { eyeL: blink ? 0 : 1, eyeR: blink ? 0 : 1, mouth: g.face.mouth * 0.6 };
}

// ------------------------------------------------------------------ backgrounds
function moeBackground(t, tint) {
  const base = tint || look.stage[0];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, mix(base, '#ffffff', 0.9));
  g.addColorStop(1, mix(look.accent, '#ffffff', 0.82));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // dot grid
  ctx.fillStyle = mix(base, '#ffffff', 0.55, 0.35);
  const off = (t * 12) % 40;
  for (let y = -40; y < H + 40; y += 40) {
    for (let x = -40; x < W + 40; x += 40) {
      ctx.beginPath();
      ctx.arc(x + off, y + off * 0.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // soft circles
  for (let k = 0; k < 5; k++) {
    const x = hash(k) * W, y = hash(k + 9) * H, r = 120 + hash(k + 3) * 220;
    ctx.fillStyle = mix(POP[k % POP.length], '#ffffff', 0.78, 0.45);
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 0.3 + k) * 30, y + Math.cos(t * 0.25 + k) * 24, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // twinkles
  for (let k = 0; k < 26; k++) {
    const x = hash(k * 3.1) * W, y = frac(hash(k * 7.7) - t * (0.02 + hash(k) * 0.03)) * H;
    const s = 6 + hash(k * 2.3) * 12;
    const tw = 0.5 + 0.5 * Math.sin(t * 3 + k);
    star(x, y, s * (0.6 + 0.4 * tw), POP[k % POP.length], 0.35 + 0.5 * tw);
  }
}

function star(x, y, s, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

function stageBackground(t, b, energy, cam) {
  const [hot, dark] = look.stage;
  const cx = W / 2 + (W / 2 - cam.x) * 0.25, cy = H * 0.42;
  const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, 1250);
  g.addColorStop(0, mix(hot, '#ffffff', 0.12 + 0.15 * energy));
  g.addColorStop(0.45, hot);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // light shafts
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 5; k++) {
    const a = -0.5 + k * 0.25 + Math.sin(t * 0.4 + k) * 0.08;
    ctx.fillStyle = `rgba(255,255,255,${0.04 + 0.05 * energy})`;
    ctx.beginPath();
    ctx.moveTo(W / 2 + Math.sin(a) * 200, -50);
    ctx.lineTo(W / 2 + Math.sin(a) * 2200 - 90, H + 50);
    ctx.lineTo(W / 2 + Math.sin(a) * 2200 + 90, H + 50);
    ctx.fill();
  }
  ctx.restore();
  // giant scrolling type
  ctx.save();
  ctx.font = `900 260px ${LATIN}`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  const word = look.latin[Math.floor(Math.max(0, b) / 32) % look.latin.length] + '   ';
  const ww = ctx.measureText(word).width;
  for (let row = 0; row < 3; row++) {
    const y = 230 + row * 300;
    const shift = ((t * (row % 2 ? -90 : 70)) % ww + ww) % ww;
    for (let x = -shift - ww; x < W + ww; x += ww) ctx.strokeText(word, x, y);
  }
  ctx.restore();
  ctx.globalAlpha = 0.85;
  ctx.drawImage(stage.halftone, 0, 0);
  ctx.globalAlpha = 1;
  // floor
  const f = ctx.createLinearGradient(0, H * 0.72, 0, H);
  f.addColorStop(0, 'rgba(0,0,0,0)');
  f.addColorStop(1, mix(dark, '#000000', 0.4, 0.85));
  ctx.fillStyle = f;
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
}

// ------------------------------------------------------------------ dancers
function solvePuppets(b) {
  puppets.forEach((p, i) => {
    const model = chain(T(SLOT_X[i], FLOOR), S(SCALE), T(-p.rig.pelvis[0], -p.foot));
    p.solve(dancePose(b, i, '', routine), model);
  });
}

function camFor(shot, age, len) {
  const k = clamp(age / Math.max(len, 0.1), 0, 1);
  if (shot.type === 'C') {
    const f = puppets[shot.girl].joints.face;
    return { x: f[0], y: f[1] + 120, zoom: lerp(1.95, 2.15, k) };
  }
  if (shot.type === 'W') {
    const dirn = shot.girl % 2 ? -1 : 1;
    return { x: W / 2 + dirn * lerp(-340, 340, ease(k)), y: 600, zoom: 1.4 };
  }
  return { x: W / 2, y: H / 2 + 10, zoom: lerp(1, 1.06, k) };
}

function drawStageShot(t, shot, next) {
  const b = beatAt(t);
  const age = t - shot.start, len = (next ? next.start : song.dur) - shot.start;
  const energy = 0.35 + 0.65 * envAt(env.low, t);
  solvePuppets(b);
  const cam = camFor(shot, age, len);
  const hit = Math.pow(1 - frac(Math.max(0, b)), 4);
  const z = cam.zoom * (1 + 0.014 * hit);
  stageBackground(t, b, energy, cam);
  const camM = chain(T(W / 2, H / 2), S(z), T(-cam.x, -cam.y));
  const focus = shot.type === 'C' ? shot.girl : -1;
  ctx.save();
  ctx.setTransform(camM[0], camM[1], camM[2], camM[3], camM[4], camM[5]);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  puppets.forEach((p, i) => {
    if (focus >= 0 && focus !== i) return;
    ctx.beginPath();
    ctx.ellipse(p.joints.pelvis[0], FLOOR - 4, 150, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  renderer.begin(W, H);
  renderer.setView(camM, W, H);
  const dk = hex(look.stage[1]).map((v) => v / 255);
  puppets.forEach((p, i) => (focus < 0 || focus === i) && p.draw({ offset: [18, 8], tint: [dk[0], dk[1], dk[2], 1], alpha: 0.6 }));
  puppets.forEach((p, i) => (focus < 0 || focus === i) && p.draw({}));
  ctx.drawImage(glc, 0, 0);

  // stamped vertical word
  const word = look.words[Math.floor(Math.max(0, b) / 16) % look.words.length];
  const wb = frac(Math.max(0, b) / 16) * 16;
  const side = Math.floor(Math.max(0, b) / 16) % 2 ? W - 150 : 150;
  if (focus < 0 || focus >= 2 ? side < W / 2 : side > W / 2) {
    ctx.save();
    ctx.globalAlpha = clamp(wb * 2, 0, 1) * clamp((16 - wb) * 2, 0, 1);
    ctx.font = `800 104px ${MINCHO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...word];
    const top = H / 2 - (chars.length - 1) * 55;
    ctx.fillStyle = look.stage[1];
    ctx.fillRect(side - 70, top - 70, 140, chars.length * 110 + 30);
    ctx.fillStyle = '#ffffff';
    chars.forEach((c, k) => ctx.fillText(c, side + (k === 0 ? 0 : Math.sin(b * 3 + k) * 1.5), top + k * 110));
    ctx.restore();
  }
  if (focus >= 0) nameTag(GIRLS[focus], age);
}

function nameTag(g, age) {
  const k = easeOut(age / 0.4);
  ctx.save();
  ctx.translate(lerp(-700, 0, k), 0);
  ctx.fillStyle = g.color;
  ctx.beginPath();
  ctx.moveTo(60, H - 260); ctx.lineTo(720, H - 260); ctx.lineTo(680, H - 180); ctx.lineTo(60, H - 180);
  ctx.fill();
  ctx.fillStyle = '#12000a';
  ctx.font = `italic 900 64px ${LATIN}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(g.tag, 96, H - 220);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 40px ${MINCHO}`;
  ctx.fillText(`— ${g.name}　${g.zh}`, 96, H - 140);
  ctx.restore();
}

// ------------------------------------------------------------------ portraits & windows
// draws a girl's portrait so that her face (512, 262) lands at (fx, fy) with the given scale
function portrait(i, fx, fy, scale, t, singing, tilt = 0) {
  const b = beatAt(t);
  ctx.save();
  ctx.translate(fx, fy + Math.abs(Math.sin(b * Math.PI)) * -6 * scale);
  ctx.rotate(tilt + Math.sin(b * Math.PI * 0.5 + i) * 0.03);
  ctx.scale(scale, scale);
  ctx.translate(-512, -262);
  drawPortrait(ctx, GIRLS[i], faceOf(i, t, singing));
  ctx.restore();
}

function petWindow(i, x, y, w, h, t, age, { singing = false, scale = 1.5, delay = 0 } = {}) {
  const g = GIRLS[i];
  const k = easeBack((age - delay) / 0.4);
  if (k <= 0) return;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(k, k);
  ctx.translate(-w / 2, -h / 2);
  // shadow + frame
  ctx.fillStyle = 'rgba(60,30,80,0.22)';
  rrect(ctx, 14, 18, w, h, 26);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  rrect(ctx, 0, 0, w, h, 26);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#2b2440';
  ctx.stroke();
  // content
  ctx.save();
  rrect(ctx, 10, 66, w - 20, h - 76, 16);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 66, 0, h);
  bg.addColorStop(0, mix(g.color, '#ffffff', 0.62));
  bg.addColorStop(1, mix(g.color, '#ffffff', 0.9));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let yy = 80; yy < h; yy += 36) for (let xx = (yy / 36) % 2 ? 18 : 0; xx < w; xx += 36) ctx.fillRect(xx, yy, 4, 4);
  portrait(i, w / 2, 66 + (h - 66) * 0.46, scale, t, singing);
  ctx.restore();
  // title bar
  ctx.fillStyle = mix(g.color, '#ffffff', 0.25);
  rrect(ctx, 6, 6, w - 12, 54, [20, 20, 6, 6]);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(38, 33, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = g.color;
  for (const [dx, dy, r] of [[0, 4, 6], [-7, -4, 3], [0, -7, 3], [7, -4, 3]]) {
    ctx.beginPath();
    ctx.arc(38 + dx, 33 + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2b2440';
  ctx.font = `800 26px ${MARU}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${g.name}.pet`, 66, 34);
  ctx.font = `600 15px ${LATIN}`;
  ctx.textAlign = 'right';
  ctx.fillText(g.id.toUpperCase().split('').join(' '), w - 130, 34);
  for (let k2 = 0; k2 < 3; k2++) {
    ctx.beginPath();
    ctx.arc(w - 98 + k2 * 30, 33, 10, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  if (singing) {
    // little equaliser while she sings
    const v = envAt(env.voc, t);
    ctx.fillStyle = g.color;
    for (let k2 = 0; k2 < 5; k2++) {
      const bh = 8 + 34 * clamp(v * (0.6 + hash(k2 + Math.floor(t * 8)) * 0.8), 0, 1);
      ctx.fillRect(w - 64 + k2 * 10 - 30, h - 24 - bh, 7, bh);
    }
  }
  ctx.restore();
}

function drawPet(t, shot) {
  const age = t - shot.start;
  const i = shot.girl;
  moeBackground(t, GIRLS[i].color);
  if (shot.type === 'PET') {
    petWindow(i, 150, 110, 1020, 780, t, age, { singing: true, scale: 1.75 });
    petWindow((i + 1) % 4, 1270, 150, 500, 420, t, age, { delay: 0.18, scale: 0.95 });
    bubbleLine(look.words[(shot.line || 0) % look.words.length], 1520, 720, 92, age - 0.35);
  } else if (shot.type === 'PET2') {
    petWindow((i + 2) % 4, 980, 120, 820, 640, t, age, { scale: 1.45 });
    petWindow(i, 140, 230, 900, 700, t, age, { singing: true, scale: 1.6, delay: 0.15 });
  } else {
    const L = [[90, 90, 760, 520], [990, 70, 820, 560], [140, 560, 700, 440], [920, 520, 860, 470]];
    [0, 1, 2, 3].forEach((k) => petWindow(k, ...L[k], t, age, { singing: true, scale: 1.25, delay: k * 0.1 }));
  }
}

// four torn vertical close-up strips (all singing)
const STRIP_EDGES = [0, 1, 2, 3].map((k) => {
  const pts = [];
  for (let y = 0; y <= H; y += 18) pts.push(hash(k * 50 + y) * 16);
  return pts;
});
function drawStrips(t, shot) {
  const age = t - shot.start;
  ctx.fillStyle = '#0a0006';
  ctx.fillRect(0, 0, W, H);
  const sw = W / 4;
  for (let k = 0; k < 4; k++) {
    const kk = easeOut((age - k * 0.08) / 0.45);
    const dy = (k % 2 ? 1 : -1) * (1 - kk) * H;
    const x0 = k * sw;
    ctx.save();
    ctx.translate(0, dy);
    ctx.beginPath();
    const e = STRIP_EDGES[k];
    ctx.moveTo(x0 + 6 + e[0], 0);
    e.forEach((v, j) => ctx.lineTo(x0 + 6 + v, j * 18));
    for (let j = e.length - 1; j >= 0; j--) ctx.lineTo(x0 + sw - 6 - STRIP_EDGES[(k + 1) % 4][j] * 0.8, j * 18);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = mix(GIRLS[k].color, '#ffffff', 0.55);
    ctx.fillRect(x0, 0, sw, H);
    portrait(k, x0 + sw / 2 + (k - 1.5) * 10, 430, 2.6 + 0.05 * Math.sin(t + k), t, true, (k - 1.5) * 0.04);
    ctx.restore();
    ctx.restore();
  }
  // white slashes over the outer strips
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineCap = 'round';
  for (const [x, y, w] of [[40, 210, 14], [60, 250, 7], [1560, 1010, 12], [1600, 990, 6]]) {
    const k = easeOut((age - 0.4) / 0.3);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 320 * k, y - 110 * k);
    ctx.stroke();
  }
  ctx.restore();
  if (age < 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - age / 0.3)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------------ bubbly type
function bubbleChar(c, x, y, size, color, k, rot) {
  if (k <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(k, k);
  ctx.font = `800 ${size}px ${MARU}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.3;
  ctx.strokeStyle = 'rgba(70,40,90,0.35)';
  ctx.strokeText(c, size * 0.05, size * 0.07);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(c, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(c, 0, 0);
  ctx.lineWidth = size * 0.035;
  ctx.strokeStyle = mix(color, '#2b1030', 0.45);
  ctx.strokeText(c, 0, 0);
  ctx.restore();
}

function bubbleLine(text, cx, cy, size, age, stagger = 0.06) {
  const chars = [...text];
  ctx.font = `800 ${size}px ${MARU}`;
  const ws = chars.map((c) => ctx.measureText(c).width * 0.98);
  const total = ws.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    const k = easeBack((age - i * stagger) / 0.35);
    const bob = Math.sin(age * 3 + i * 0.8) * size * 0.03;
    bubbleChar(c, x + ws[i] / 2, cy + bob, size, POP[(i + songIndex) % POP.length], k, (i % 2 ? 1 : -1) * 0.05);
    x += ws[i];
  });
}

function splitTitle(s) {
  const chars = [...s];
  if (chars.length <= 9) return [s];
  const mid = Math.ceil(chars.length / 2);
  const sp = s.lastIndexOf(' ', s.length * 0.7);
  if (sp > s.length * 0.3) return [s.slice(0, sp), s.slice(sp + 1)];
  return [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
}

function drawTitle(t, shot, next) {
  const age = t - shot.start, len = (next ? next.start : 6) - shot.start;
  moeBackground(t);
  const rows = splitTitle(song.title);
  const longest = Math.max(...rows.map((r) => [...r].length));
  const size = Math.min(190, 1500 / longest);
  rows.forEach((r, k) => bubbleLine(r, W / 2, 330 + (k - (rows.length - 1) / 2) * size * 1.15, size, age - k * 0.3));
  // pill
  const pk = easeBack((age - 0.9) / 0.4);
  if (pk > 0) {
    ctx.save();
    ctx.translate(W / 2, 640);
    ctx.scale(pk, pk);
    rrect(ctx, -330, -34, 660, 68, 34);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#2b2440';
    ctx.stroke();
    ctx.fillStyle = look.stage[0];
    ctx.beginPath();
    ctx.arc(-290, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2440';
    ctx.font = `800 30px ${LATIN}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`I N S I D E   I D E N T I T Y   ·   P V  ${String(songIndex + 1).padStart(2, '0')}`, 20, 2);
    ctx.restore();
  }
  // search bar typing the tagline
  const sk = easeOut((age - 1.2) / 0.4);
  if (sk > 0) {
    ctx.save();
    ctx.globalAlpha = sk;
    ctx.translate(W / 2, 770 + (1 - sk) * 40);
    rrect(ctx, -520, -54, 1040, 108, 54);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#2b2440';
    ctx.stroke();
    ctx.fillStyle = POP[0];
    ctx.beginPath();
    ctx.arc(-462, 0, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(-466, -4, 13, 0, Math.PI * 2);
    ctx.moveTo(-457, 5);
    ctx.lineTo(-447, 15);
    ctx.stroke();
    const typed = [...song.tagline].slice(0, Math.floor(Math.max(0, age - 1.6) * 10)).join('');
    ctx.fillStyle = '#3a3150';
    ctx.font = `600 40px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(typed, -405, 2);
    if (frac(age * 1.6) < 0.5) ctx.fillRect(-403 + ctx.measureText(typed).width, -24, 4, 50);
    rrect(ctx, 330, -32, 150, 64, 12);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2b2440';
    ctx.stroke();
    ctx.fillStyle = '#2b2440';
    ctx.font = `800 26px ${LATIN}`;
    ctx.fillText('ENTER ↵', 352, 2);
    ctx.restore();
  }
  // the girls peek in from the bottom
  for (let i = 0; i < 4; i++) {
    const k = easeBack((age - 2 - i * 0.15) / 0.5);
    if (k <= 0) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    portrait(i, 240 + i * 480, H + 250 - k * 230, 0.9, t, false, (i - 1.5) * 0.08);
    ctx.restore();
  }
  ctx.fillStyle = '#3a3150';
  ctx.font = `600 26px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.globalAlpha = easeOut((age - 1.5) / 0.5);
  ctx.fillText(`鋒兄宇宙 · ${song.cast}`, W / 2, 880);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  // exit wipe
  const out2 = (age - (len - 0.4)) / 0.4;
  if (out2 > 0) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = clamp(out2, 0, 1);
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

function drawEnd(t, shot) {
  const age = t - shot.start;
  moeBackground(t);
  const L = [[110, 300, 400, 470], [560, 260, 400, 470], [1010, 300, 400, 470], [1460, 260, 400, 470]];
  L.forEach((r, k) => petWindow(k, ...r, t, age, { scale: 0.95, delay: 0.2 + k * 0.12 }));
  bubbleLine('THANK YOU!', W / 2, 150, 150, age);
  ctx.globalAlpha = easeOut((age - 1) / 0.5);
  ctx.fillStyle = '#3a3150';
  ctx.font = `800 44px ${MARU}`;
  ctx.textAlign = 'center';
  ctx.fillText(`♪ ${song.title}`, W / 2, 860);
  ctx.font = `600 26px ${LATIN}`;
  ctx.fillText(`INSIDE IDENTITY PV  ${String(songIndex + 1).padStart(2, '0')} / ${String(SONGS.length).padStart(2, '0')}  ·  ミカン · シズク · モモ · ルナ`, W / 2, 920);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
  const fade = (t - (song.dur - 1.5)) / 1.5;
  if (fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(fade, 0, 1)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------------ lyrics & chrome
function wrapText(text, maxW) {
  if (ctx.measureText(text).width <= maxW) return [text];
  const chars = [...text];
  let best = Math.ceil(chars.length / 2);
  const sp = chars.map((c, i) => (c === ' ' || c === '　' ? i : -1)).filter((i) => i > 0);
  if (sp.length) best = sp.reduce((a, b) => (Math.abs(b - chars.length / 2) < Math.abs(a - chars.length / 2) ? b : a));
  return [chars.slice(0, best).join('').trim(), chars.slice(best).join('').trim()];
}

function drawLyric(t, moe) {
  const l = lineAt(t);
  if (!l) return;
  const age = t - l.t, left = l.end - t;
  const a = clamp(Math.min(age / 0.15, left / 0.2), 0, 1);
  let size = 54;
  ctx.font = `800 ${size}px ${MINCHO}`;
  let rows = wrapText(l.text, 1640);
  while (rows.some((r) => ctx.measureText(r).width > 1700) && size > 30) {
    size -= 4;
    ctx.font = `800 ${size}px ${MINCHO}`;
    rows = wrapText(l.text, 1640);
  }
  const lh = size * 1.3, base = H - 70 - (rows.length - 1) * lh;
  ctx.save();
  ctx.globalAlpha = a;
  const band = ctx.createLinearGradient(0, base - lh, 0, H);
  band.addColorStop(0, 'rgba(0,0,0,0)');
  band.addColorStop(0.5, moe ? 'rgba(40,20,60,0.35)' : 'rgba(0,0,0,0.5)');
  band.addColorStop(1, moe ? 'rgba(40,20,60,0.45)' : 'rgba(0,0,0,0.65)');
  ctx.fillStyle = band;
  ctx.fillRect(0, base - lh * 1.1, W, H);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const prog = clamp(age / Math.max(0.6, l.d), 0, 1);
  const totalChars = rows.reduce((s, r) => s + [...r].length, 0);
  let before = 0;
  rows.forEach((r, k) => {
    const w = ctx.measureText(r).width, x = W / 2 - w / 2, y = base + k * lh;
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(10,0,10,0.75)';
    ctx.strokeText(r, x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(r, x, y);
    const n = [...r].length;
    const local = clamp((prog * totalChars - before) / n, 0, 1);
    before += n;
    if (local > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y - lh, w * local, lh * 2);
      ctx.clip();
      ctx.fillStyle = look.accent;
      ctx.fillText(r, x, y);
      ctx.restore();
    }
  });
  ctx.restore();
}

function hud(t, moe) {
  ctx.save();
  ctx.font = `700 24px ${SANS}`;
  ctx.textBaseline = 'middle';
  const label = `PV ${String(songIndex + 1).padStart(2, '0')}  ${song.title}`;
  const w = ctx.measureText(label).width + 50;
  rrect(ctx, 56, 52, w, 46, 23);
  ctx.fillStyle = moe ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.fillStyle = moe ? '#3a3150' : '#ffffff';
  ctx.fillText(label, 81, 76);
  ctx.textAlign = 'right';
  ctx.font = `700 24px ${LATIN}`;
  ctx.fillText(`♪ ${mmss(t)} / ${mmss(song.dur)}`, W - 70, 76);
  ctx.restore();
}

function cutWipe(age, dark) {
  if (age >= 0.28) return;
  const k = easeOut(age / 0.28);
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(W * k * 1.3 - 300, 0);
  ctx.lineTo(W * 1.4, 0);
  ctx.lineTo(W * 1.4, H);
  ctx.lineTo(W * k * 1.3 - 700, H);
  ctx.fill();
}

// ------------------------------------------------------------------ frame
export function render(t) {
  t = clamp(t, 0, song.dur);
  const { shot, next } = shotAt(t);
  const age = t - shot.start;
  const moe = ['TITLE', 'PET', 'PET2', 'PET4', 'END'].includes(shot.type);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  if (shot.type === 'TITLE') drawTitle(t, shot, next);
  else if (shot.type === 'END') drawEnd(t, shot);
  else if (shot.type === 'STRIP') drawStrips(t, shot);
  else if (moe) drawPet(t, shot);
  else drawStageShot(t, shot, next);
  if (shot.type !== 'TITLE' && shot.type !== 'END') drawLyric(t, moe);
  if (!moe) {
    ctx.drawImage(stage.frames[Math.floor(Math.max(0, beatAt(t)) / 2) % 3], 0, 0);
    const b = beatAt(t);
    if (frac(b / 8) < 0.06 && b > 0 && sectionAt(t).kind === 'chorus') {
      ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - frac(b / 8) / 0.06)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (shot.type !== 'TITLE' && shot.type !== 'END') hud(t, moe);
  if (shot.type !== 'TITLE' && shot.type !== 'STRIP') cutWipe(age, moe ? '#ffffff' : '#0a0006');
  // film grain: a fixed texture (changing it every frame costs the encoder ~10x the bitrate)
  ctx.globalAlpha = moe ? 0.03 : 0.06;
  ctx.globalCompositeOperation = moe ? 'multiply' : 'overlay';
  const gr = stage.grain[0];
  for (let y = 0; y < H; y += 256) for (let x = 0; x < W; x += 256) ctx.drawImage(gr, x, y);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ export (headless) / player
async function exportFrames() {
  const from = clamp(+(params.get('from') || 0), 0, song.dur);
  const to = clamp(+(params.get('to') || song.dur), from, song.dur);
  const post = (what, body) => fetch(`/__pv/${what}?job=${JOB}`, { method: 'POST', body });
  const frames = Math.round((to - from) * FPS);
  const file = `${String(songIndex + 1).padStart(2, '0')} ${song.title}`;
  await post('meta', JSON.stringify({ title: song.title, file, audio: song.audio, fps: FPS, frames, from, to, bpm: song.bpm }));
  for (let f = 0; f < frames; f++) {
    render(from + f / FPS);
    const blob = await new Promise((ok) => out.toBlob(ok, 'image/jpeg', 0.92));
    const r = await post('frame', blob);
    if (!r.ok) throw new Error('frame rejected');
  }
  await post('done', '');
}

function player() {
  const $ = (s) => document.querySelector(s);
  const audio = new Audio();
  const menu = $('#menu'), list = $('#list'), sel = $('#song'), playBtn = $('#play'), seek = $('#seek'), time = $('#time');
  SONGS.forEach((s, i) => {
    sel.add(new Option(`${String(i + 1).padStart(2, '0')} ${s.title}`, i));
    const b = document.createElement('button');
    b.innerHTML = `<small>PV ${String(i + 1).padStart(2, '0')} · ${mmss(s.dur)}</small><strong></strong><span></span>`;
    b.querySelector('strong').textContent = s.title;
    b.querySelector('span').textContent = s.tagline;
    b.onclick = () => open(i, true);
    list.append(b);
  });
  function open(i, autoplay) {
    setup(i);
    sel.value = i;
    audio.src = song.audio;
    audio.currentTime = 0;
    menu.hidden = true;
    history.replaceState(null, '', `?song=${i}`);
    if (autoplay) audio.play().catch(() => {});
  }
  const toggle = () => (audio.paused ? audio.play() : audio.pause());
  sel.onchange = () => open(+sel.value, true);
  playBtn.onclick = toggle;
  out.onclick = toggle;
  seek.oninput = () => (audio.currentTime = (seek.value / 1000) * song.dur);
  $('#menuBtn').onclick = () => { audio.pause(); menu.hidden = false; };
  audio.onplay = audio.onpause = () => (playBtn.textContent = audio.paused ? '▶ 播放' : '❚❚ 暫停');
  addEventListener('keydown', (e) => {
    if (e.target.matches('select, input')) return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') audio.currentTime = Math.min(song.dur, audio.currentTime + 5);
    else if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    else if (e.key === 'Escape') { audio.pause(); menu.hidden = false; }
    else if (e.key === 'n' || e.key === 'N') open((songIndex + 1) % SONGS.length, true);
    else if (e.key === 'p' || e.key === 'P') open((songIndex + SONGS.length - 1) % SONGS.length, true);
    else if (e.key === 'f' || e.key === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  });
  let idle = 0;
  addEventListener('pointermove', () => { idle = performance.now(); $('#ui').classList.remove('idle'); });
  const q = params.get('song');
  open(q != null ? clamp(+q | 0, 0, SONGS.length - 1) : 0, false);
  if (q == null) menu.hidden = false;
  const tick = () => {
    const t = window.__pv.hold ?? audio.currentTime;
    render(t);
    seek.value = Math.round((t / song.dur) * 1000);
    time.textContent = `${mmss(t)} / ${mmss(song.dur)}`;
    if (!audio.paused && performance.now() - idle > 2500) $('#ui').classList.add('idle');
    requestAnimationFrame(tick);
  };
  tick();
}

// handle for poking at the page from the devtools console
window.__pv = { hold: null, render, setup, get shots() { return shots; }, get song() { return song; } };

if (RENDER) {
  document.body.classList.add('render');
  setup(clamp(+(params.get('song') || 0) | 0, 0, SONGS.length - 1));
  exportFrames().catch((e) => fetch(`/__pv/error?job=${JOB}`, { method: 'POST', body: String(e && e.stack || e) }));
} else player();
