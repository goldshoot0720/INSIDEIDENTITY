// 2D affine helpers. A matrix is [a, b, c, d, e, f] (canvas convention):
//   x' = a*x + c*y + e,  y' = b*x + d*y + f
export const I = () => [1, 0, 0, 1, 0, 0];

export function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const T = (x, y) => [1, 0, 0, 1, x, y];
export const S = (sx, sy = sx) => [sx, 0, 0, sy, 0, 0];
export function R(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, -s, c, 0, 0];
}

export function apply(m, p) {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

export function chain(...ms) {
  return ms.reduce((acc, m) => mul(acc, m));
}

// scale by k along direction `dir` (radians) around the origin
export function scaleAlong(dir, k) {
  if (k === 1) return I();
  return chain(R(dir), S(k, 1), R(-dir));
}

export function toGL(m, out, offset) {
  out[offset + 0] = m[0]; out[offset + 1] = m[1]; out[offset + 2] = 0;
  out[offset + 3] = m[2]; out[offset + 4] = m[3]; out[offset + 5] = 0;
  out[offset + 6] = m[4]; out[offset + 7] = m[5]; out[offset + 8] = 1;
}

export const dir = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpAngle = (a, b, t) => a + wrap(b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export const DEG = Math.PI / 180;
