// Skinned 2D puppet: the T-pose image is cut into a grid mesh whose vertices are
// weighted to a small bone hierarchy and deformed on the GPU.
import { I, T, R, mul, apply, chain, scaleAlong, toGL, dir, smoothstep, DEG } from './mat.js';

export const B = {
  pelvis: 0, chest: 1, head: 2,
  lu: 3, lf: 4, ru: 5, rf: 6,
  lt: 7, ls: 8, rt: 9, rs: 10,
  tail: 11,
};
const NB = 12;
const CELL = 14; // mesh cell size in source pixels

const VS = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec4 aBone; in vec4 aW;
uniform mat3 uBones[${NB}];
uniform mat3 uView;
uniform vec2 uOffset;
out vec2 vUV;
void main() {
  vec3 p = vec3(aPos, 1.0);
  vec2 s = (uBones[int(aBone.x)] * p).xy * aW.x
         + (uBones[int(aBone.y)] * p).xy * aW.y
         + (uBones[int(aBone.z)] * p).xy * aW.z
         + (uBones[int(aBone.w)] * p).xy * aW.w;
  vec3 c = uView * vec3(s + uOffset, 1.0);
  gl_Position = vec4(c.xy, 0.0, 1.0);
  vUV = aUV;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec4 uTint;   // rgb + amount
uniform float uAlpha;
out vec4 o;
void main() {
  vec4 c = texture(uTex, vUV);
  c.rgb = mix(c.rgb, uTint.rgb * c.a, uTint.a);
  o = c * uAlpha;
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 が使えません / 此瀏覽器不支援 WebGL2');
    this.gl = gl;
    this.canvas = canvas;
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.prog = p;
    this.loc = {};
    for (const n of ['aPos', 'aUV', 'aBone', 'aW']) this.loc[n] = gl.getAttribLocation(p, n);
    for (const n of ['uBones', 'uView', 'uOffset', 'uTex', 'uTint', 'uAlpha']) this.loc[n] = gl.getUniformLocation(p, n);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.view = new Float32Array(9);
  }

  texture(img) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  mesh(data) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = (arr, loc, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    };
    buf(data.pos, this.loc.aPos, 2);
    buf(data.uv, this.loc.aUV, 2);
    buf(data.bone, this.loc.aBone, 4);
    buf(data.w, this.loc.aW, 4);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: data.idx.length };
  }

  begin(w, h) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
  }

  // camera: stage px -> clip space
  setView(m, w, h) {
    const clip = chain([2 / w, 0, 0, -2 / h, -1, 1], m);
    toGL(clip, this.view, 0);
    this.gl.uniformMatrix3fv(this.loc.uView, false, this.view);
  }

  draw(mesh, tex, bones, { offset = [0, 0], tint = [0, 0, 0, 0], alpha = 1 } = {}) {
    const gl = this.gl;
    gl.uniformMatrix3fv(this.loc.uBones, false, bones);
    gl.uniform2f(this.loc.uOffset, offset[0], offset[1]);
    gl.uniform4f(this.loc.uTint, tint[0], tint[1], tint[2], tint[3]);
    gl.uniform1f(this.loc.uAlpha, alpha);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.loc.uTex, 0);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}

function alphaOf(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const a = new Uint8Array(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return { a, w: c.width, h: c.height };
}

// grid mesh over the opaque part of an image, weights from `weightFn(x, y) -> [[bone, w], ...]`
function buildMesh(alpha, weightFn) {
  const { a, w, h } = alpha;
  const gx = Math.ceil(w / CELL), gy = Math.ceil(h / CELL);
  const keep = new Uint8Array(gx * gy);
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      let any = 0;
      const x0 = i * CELL, y0 = j * CELL;
      for (let y = y0 - 2; y < y0 + CELL + 2 && !any; y += 2) {
        if (y < 0 || y >= h) continue;
        for (let x = x0 - 2; x < x0 + CELL + 2; x += 2) {
          if (x < 0 || x >= w) continue;
          if (a[y * w + x] > 4) { any = 1; break; }
        }
      }
      keep[j * gx + i] = any;
    }
  }
  const vid = new Int32Array((gx + 1) * (gy + 1)).fill(-1);
  const pos = [], uv = [], bone = [], wt = [], idx = [];
  const vert = (i, j) => {
    const k = j * (gx + 1) + i;
    if (vid[k] >= 0) return vid[k];
    const x = i * CELL, y = j * CELL;
    vid[k] = pos.length / 2;
    pos.push(x, y);
    uv.push(x / w, y / h);
    const ws = weightFn(x, y).filter((e) => e[1] > 1e-4).sort((p, q) => q[1] - p[1]).slice(0, 4);
    const sum = ws.reduce((s, e) => s + e[1], 0) || 1;
    for (let n = 0; n < 4; n++) {
      bone.push(ws[n] ? ws[n][0] : 0);
      wt.push(ws[n] ? ws[n][1] / sum : 0);
    }
    return vid[k];
  };
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      if (!keep[j * gx + i]) continue;
      const v00 = vert(i, j), v10 = vert(i + 1, j), v01 = vert(i, j + 1), v11 = vert(i + 1, j + 1);
      idx.push(v00, v10, v11, v00, v11, v01);
    }
  }
  return {
    pos: new Float32Array(pos), uv: new Float32Array(uv),
    bone: new Float32Array(bone), w: new Float32Array(wt), idx: new Uint32Array(idx),
  };
}

const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

export class Puppet {
  constructor(renderer, rig, bodyImg, armsImg) {
    this.r = renderer;
    this.rig = rig;
    const L = rig.l, Rr = rig.r;
    this.rest = {
      lu: dir(L.sh, L.el), lf: dir(L.el, L.wr), ru: dir(Rr.sh, Rr.el), rf: dir(Rr.el, Rr.wr),
      lt: dir(L.hip, L.knee), ls: dir(L.knee, L.ank), rt: dir(Rr.hip, Rr.knee), rs: dir(Rr.knee, Rr.ank),
    };
    this.waistPt = [rig.pelvis[0], rig.waist];
    this.torsoLen = rig.pelvis[1] - rig.neck[1];
    const bodyA = alphaOf(bodyImg);
    // lowest opaque row = sole of the shoes
    let foot = bodyA.h - 1;
    outer: for (; foot > 0; foot--) {
      for (let x = 0; x < bodyA.w; x += 2) if (bodyA.a[foot * bodyA.w + x] > 128) break outer;
    }
    this.foot = foot;
    this.ankleY = Math.max(L.ank[1], Rr.ank[1]);
    this.body = renderer.mesh(buildMesh(bodyA, (x, y) => this.bodyWeights(x, y)));
    this.arms = renderer.mesh(buildMesh(alphaOf(armsImg), (x, y) => this.armWeights(x, y)));
    this.texBody = renderer.texture(bodyImg);
    this.texArms = renderer.texture(armsImg);
    this.bones = new Float32Array(NB * 9);
    this.joints = {};
  }

  bodyWeights(x, y) {
    const g = this.rig;
    const tl = g.tail;
    if (tl && x > tl.root[0] - 15 && y > 730 && (x > tl.minx || y > tl.miny)) {
      const d = Math.hypot(x - tl.root[0], y - tl.root[1]);
      const w = smoothstep(10, 90, d);
      return [[B.tail, w], [B.pelvis, 1 - w]];
    }
    const cx = g.pelvis[0];
    if (y > g.hem - 30) {
      const side = x < cx ? g.l : g.r;
      // leg centre line at this height
      let c;
      if (y < side.knee[1]) c = lerp2(side.hip, side.knee, (y - side.hip[1]) / (side.knee[1] - side.hip[1]))[0];
      else c = lerp2(side.knee, side.ank, Math.min(1.6, (y - side.knee[1]) / (side.ank[1] - side.knee[1])))[0];
      const inLeg = 1 - smoothstep(70, 95, Math.abs(x - c));
      const wl = smoothstep(g.hem - 30, g.hem + 30, y) * inLeg;
      const ws = smoothstep(side.knee[1] - 28, side.knee[1] + 28, y);
      const tb = x < cx ? B.lt : B.rt, sb = x < cx ? B.ls : B.rs;
      return [[tb, wl * (1 - ws)], [sb, wl * ws], [B.pelvis, 1 - wl]];
    }
    const wh = smoothstep(g.neck[1] + 30, g.neck[1] - 40, y);
    const wc = smoothstep(g.waist + 50, g.waist - 50, y);
    return [[B.head, wh], [B.chest, (1 - wh) * wc], [B.pelvis, (1 - wh) * (1 - wc)]];
  }

  armWeights(x, y) {
    const g = this.rig;
    const left = x < g.pelvis[0];
    const s = left ? g.l : g.r;
    const d = Math.abs(x - s.sh[0]);          // distance out from the shoulder
    const de = Math.abs(s.el[0] - s.sh[0]);   // shoulder -> elbow
    const wf = smoothstep(de - 20, de + 20, d);
    const wc = 1 - smoothstep(0, 26, Math.abs(x - g.armCut));
    const u = left ? B.lu : B.ru, f = left ? B.lf : B.rf;
    return [[u, (1 - wf) * (1 - wc)], [f, wf * (1 - wc)], [B.chest, wc]];
  }

  // pose: world angles (radians, screen space, y down); see dance.js for the fields
  solve(pose, model) {
    const g = this.rig, rest = this.rest, L = g.l, Rr = g.r;
    const tl = this.torsoLen;
    const off = [pose.x * tl, pose.y * tl];
    const pelvis = chain(T(g.pelvis[0] + off[0], g.pelvis[1] + off[1]), R(pose.pelvis), T(-g.pelvis[0], -g.pelvis[1]));
    const bone = (parent, pivot, rot, restDir, k) => {
      const wp = apply(parent, pivot);
      return chain(T(wp[0], wp[1]), R(rot), k != null && k !== 1 ? scaleAlong(restDir, k) : I(), T(-pivot[0], -pivot[1]));
    };
    const chest = bone(pelvis, this.waistPt, pose.chest);
    const head = bone(chest, g.neck, pose.head);
    const lu = bone(chest, L.sh, pose.lu - rest.lu, rest.lu, pose.lul);
    const lf = bone(lu, L.el, pose.lf - rest.lf, rest.lf, pose.lfl);
    const ru = bone(chest, Rr.sh, pose.ru - rest.ru, rest.ru, pose.rul);
    const rf = bone(ru, Rr.el, pose.rf - rest.rf, rest.rf, pose.rfl);
    const lt = bone(pelvis, L.hip, pose.lt - rest.lt);
    const ls = bone(lt, L.knee, pose.ls - rest.ls);
    const rt = bone(pelvis, Rr.hip, pose.rt - rest.rt);
    const rs = bone(rt, Rr.knee, pose.rs - rest.rs);
    const tail = g.tail ? bone(pelvis, g.tail.root, pose.pelvis + (pose.tail || 0)) : I();

    // keep the lower foot on the floor (bent knees -> the whole body sinks)
    const la = apply(ls, L.ank), ra = apply(rs, Rr.ank);
    const ground = this.ankleY - Math.max(la[1], ra[1]) + off[1];
    const drop = T(0, pose.grounded === false ? 0 : ground);
    const list = [pelvis, chest, head, lu, lf, ru, rf, lt, ls, rt, rs, tail];
    const M = mul(model, drop);
    for (let i = 0; i < NB; i++) toGL(mul(M, list[i]), this.bones, i * 9);

    // world joints for skeleton overlay / camera
    const J = this.joints;
    const W = (m, p) => apply(M, apply(m, p));
    J.neck = W(chest, g.neck); J.pelvis = W(pelvis, g.pelvis); J.face = W(head, g.face);
    J.lsh = W(chest, L.sh); J.lel = W(lu, L.el); J.lwr = W(lf, L.wr); J.ltip = W(lf, L.tip);
    J.rsh = W(chest, Rr.sh); J.rel = W(ru, Rr.el); J.rwr = W(rf, Rr.wr); J.rtip = W(rf, Rr.tip);
    J.lhip = W(pelvis, L.hip); J.lknee = W(lt, L.knee); J.lank = W(ls, L.ank);
    J.rhip = W(pelvis, Rr.hip); J.rknee = W(rt, Rr.knee); J.rank = W(rs, Rr.ank);
  }

  draw(opts = {}) {
    this.r.draw(this.body, this.texBody, this.bones, opts);
    this.r.draw(this.arms, this.texArms, this.bones, opts);
  }
}

// rest pose expressed in the same form a dance / tracker produces
export function neutralPose() {
  return {
    x: 0, y: 0, pelvis: 0, chest: 0, head: 0, tail: 0,
    lu: 100 * DEG, lf: 96 * DEG, ru: 80 * DEG, rf: 84 * DEG,
    lul: 1, lfl: 1, rul: 1, rfl: 1,
    lt: 92 * DEG, ls: 90 * DEG, rt: 88 * DEG, rs: 90 * DEG,
  };
}
