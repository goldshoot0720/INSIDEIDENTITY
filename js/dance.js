// Built-in choreography, loosely modelled on the group chorus of the reference MV:
// bounces, overhead claps, the "chuuni" dramatic pose, arm waves and canon ripples.
// Poses are written in degrees (0 = pointing screen-right, 90 = straight down).
import { DEG, lerpAngle, lerp, clamp } from './mat.js';
import { neutralPose } from './puppet.js';

const ease = (t) => t * t * (3 - 2 * t);
const pulse = (b) => Math.pow(1 - (b % 1), 3);          // sharp hit on every beat
const swing = (b, period = 2) => Math.sin((b / period) * Math.PI * 2);

// build a pose from degree fields on top of the neutral one
function P(o) {
  const p = neutralPose();
  for (const k in o) {
    if (['x', 'y', 'lul', 'lfl', 'rul', 'rfl', 'grounded'].includes(k)) p[k] = o[k];
    else p[k] = o[k] * DEG;
  }
  return p;
}

// mirror a pose left <-> right
export function mirror(p) {
  const m = { ...p };
  const flip = (a) => Math.PI - a;
  m.lu = flip(p.ru); m.ru = flip(p.lu); m.lf = flip(p.rf); m.rf = flip(p.lf);
  m.lul = p.rul; m.rul = p.lul; m.lfl = p.rfl; m.rfl = p.lfl;
  m.lt = flip(p.rt); m.rt = flip(p.lt); m.ls = flip(p.rs); m.rs = flip(p.ls);
  m.pelvis = -p.pelvis; m.chest = -p.chest; m.head = -p.head; m.x = -p.x; m.tail = -p.tail;
  return m;
}

export function blendPose(a, b, t) {
  const o = {};
  for (const k in a) {
    if (typeof a[k] !== 'number') { o[k] = t < 0.5 ? a[k] : b[k]; continue; }
    o[k] = ['x', 'y', 'lul', 'lfl', 'rul', 'rfl'].includes(k) ? lerp(a[k], b[k], t) : lerpAngle(a[k], b[k], t);
  }
  return o;
}

// each move: (b = beat inside the 8-beat bar, i = dancer index) -> pose
const MOVES = {
  bounce(b, i) {
    const s = swing(b, 2), h = pulse(b);
    return P({
      y: -0.05 * Math.abs(Math.sin(b * Math.PI)), x: 0.03 * s,
      lu: 104 + 8 * s, lf: 110 + 10 * s, ru: 76 + 8 * s, rf: 70 + 10 * s,
      chest: 4 * s, head: -7 * s, pelvis: -3 * s,
      lt: 94 - 3 * h, rt: 86 + 3 * h, tail: 12 * s,
    });
  },
  clap(b) {
    // arms swing up, hands meet over the head on every other beat
    const open = 0.5 + 0.5 * Math.cos(b * Math.PI);
    const s = swing(b, 4);
    return P({
      y: -0.04 * pulse(b), x: 0.02 * s,
      lu: 228 + 22 * open, lf: 300 - 30 * open, ru: 312 - 22 * open, rf: 240 + 30 * open,
      chest: 5 * s, head: 8 * s, tail: 15 * s,
      lt: 95, rt: 85,
    });
  },
  point(b) {
    // screen-right arm stabs up-right, other hand on the hip, switch every 4 beats
    const k = ease(clamp((b % 4) * 2, 0, 1));
    const h = pulse(b);
    const p = P({
      x: 0.05 * k, y: -0.02 * h,
      ru: lerp(80, 318, k), rf: lerp(84, 312 - 6 * h, k),
      lu: 128, lf: 42,
      chest: 8 * k, head: -10 * k, pelvis: -4 * k,
      lt: 100, rt: 80, tail: 20 * k,
    });
    return Math.floor(b / 4) % 2 ? mirror(p) : p;
  },
  chuuni(b) {
    // the dramatic "evil eye" pose: one arm flung out, other hand across the face
    const k = ease(clamp(b / 1.2, 0, 1));
    const shake = b > 1.2 ? Math.sin(b * 22) * 1.2 : 0;
    return P({
      x: -0.04 * k, y: 0.02 * k,
      lu: lerp(100, 196, k), lf: lerp(96, 200 + shake, k),
      ru: lerp(80, 150, k), rf: lerp(84, 236, k),
      chest: -9 * k, head: 14 * k + shake, pelvis: 5 * k,
      lt: lerp(92, 104, k), rt: lerp(88, 80, k), tail: -18 * k,
    });
  },
  wave(b, i) {
    // V arms rolling left/right, each dancer a quarter beat behind the previous
    const s = swing(b - i * 0.35, 2);
    return P({
      x: 0.06 * s, y: -0.03 * Math.abs(s),
      lu: 222 + 18 * s, lf: 222 + 30 * s, ru: 318 + 18 * s, rf: 318 + 30 * s,
      chest: 10 * s, head: 12 * s, pelvis: -7 * s,
      lt: 95 + 5 * s, rt: 85 + 5 * s, tail: 25 * s,
    });
  },
  step(b) {
    // side steps with knee lifts and alternating punches
    const side = Math.floor(b) % 2 ? 1 : -1;
    const ph = b % 1;
    const lift = Math.sin(Math.PI * clamp(ph * 1.6, 0, 1));
    const p = P({
      x: 0.07 * side * ease(ph), y: -0.05 * lift,
      lu: 190 - 70 * lift, lf: 250 - 150 * lift, ru: 70, rf: 115,
      lt: 92 - 42 * lift, ls: 92 + 50 * lift, rt: 88, rs: 90,
      chest: -6 * side, head: 8 * side, tail: 18 * side,
    });
    return side > 0 ? mirror(p) : p;
  },
  jump(b) {
    // crouch, jump with arms up on beat 4, land
    const ph = b % 4;
    const air = ph > 2 && ph < 3.2 ? Math.sin(((ph - 2) / 1.2) * Math.PI) : 0;
    const crouch = ph > 1.2 && ph <= 2 ? Math.sin(((ph - 1.2) / 0.8) * Math.PI) : (ph >= 3.2 && ph < 3.8 ? Math.sin(((ph - 3.2) / 0.6) * Math.PI) * 0.7 : 0);
    const up = clamp(air * 1.5, 0, 1);
    return P({
      y: -0.32 * air,
      lu: lerp(120, 240, up), lf: lerp(70, 250, up), ru: lerp(60, 300, up), rf: lerp(110, 290, up),
      lt: 92 + 22 * crouch - 14 * air, ls: 92 - 28 * crouch + 20 * air,
      rt: 88 - 22 * crouch + 14 * air, rs: 88 + 28 * crouch - 20 * air,
      chest: 0, head: -6 * crouch + 6 * air, tail: 30 * air,
    });
  },
  heart(b) {
    // arms curved overhead, sway (a cute idol ending pose)
    const s = swing(b, 4);
    return P({
      x: 0.03 * s,
      lu: 245, lf: 325, ru: 295, rf: 215,
      chest: 6 * s, head: 10 * s, pelvis: -3 * s,
      lt: 96, rt: 84, tail: 14 * s,
    });
  },
};

// 8-beat bars; `mirror` flips the odd dancers, `canon` delays each dancer a little
export const ROUTINE = [
  { move: 'bounce' }, { move: 'bounce', mirror: true },
  { move: 'clap' }, { move: 'clap', canon: 0.5 },
  { move: 'point', mirror: true }, { move: 'wave' },
  { move: 'chuuni', mirror: true }, { move: 'jump', canon: 0.25 },
  { move: 'step' }, { move: 'step', mirror: true },
  { move: 'wave' }, { move: 'wave', mirror: true },
  { move: 'clap', canon: 0.25 }, { move: 'point' },
  { move: 'chuuni' }, { move: 'heart', canon: 0.5 },
];

export const MOVE_NAMES = Object.keys(MOVES);

// beat (float, can be negative before the start) -> pose for dancer i;
// `routine` lists one entry per 8-beat bar and loops
export function dancePose(beat, i, only, routine = ROUTINE) {
  if (beat < 0) return MOVES.bounce(beat + 64, i);
  const barOf = (b) => {
    const n = Math.floor(b / 8);
    const e = only ? { move: only } : routine[n % routine.length];
    return { e, local: b - n * 8 };
  };
  const at = (b) => {
    const { e, local } = barOf(b);
    const lb = Math.max(0, local - (e.canon || 0) * i);
    let p = MOVES[e.move](lb, i);
    if (e.mirror && i % 2 === 1) p = mirror(p);
    return p;
  };
  const cur = at(beat);
  // cross-fade into the next bar over the last half beat
  const local = beat % 8;
  if (local > 7.5) return blendPose(cur, at(Math.ceil(beat / 8) * 8 + 0.001), ease((local - 7.5) / 0.5));
  return cur;
}

export function barInfo(beat) {
  const n = Math.max(0, Math.floor(beat / 8));
  return { bar: n, entry: ROUTINE[n % ROUTINE.length] };
}
