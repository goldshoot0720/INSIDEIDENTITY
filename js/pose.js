// Webcam / video motion capture with MediaPipe Pose Landmarker, converted to puppet poses.
import { dir, clamp, lerpAngle, lerp } from './mat.js';
import { neutralPose } from './puppet.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

// BlazePose indices
const LM = { nose: 0, lear: 7, rear: 8, lsh: 11, rsh: 12, lel: 13, rel: 14, lwr: 15, rwr: 16, lhip: 23, rhip: 24, lknee: 25, rknee: 26, lank: 27, rank: 28 };
export const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [0, 7], [0, 8],
];

export class Tracker {
  constructor() {
    this.landmarker = null;
    this.loading = null;
    this.people = [];      // latest landmark sets (normalized)
    this.lastTime = -1;
    this.lastStamp = 0;
  }

  async load(onStatus) {
    if (this.landmarker) return this.landmarker;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      onStatus?.('載入 MediaPipe 中…');
      const { FilesetResolver, PoseLandmarker } = await import(`${MP}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
      const opts = (delegate) => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO', numPoses: 4,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      try {
        this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch (e) {
        console.warn('GPU delegate failed, using CPU', e);
        this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
      }
      onStatus?.('姿勢模型已就緒');
      return this.landmarker;
    })();
    return this.loading;
  }

  // run detection when the video has a new frame
  update(video) {
    if (!this.landmarker || !video || video.readyState < 2 || !video.videoWidth) return false;
    if (video.currentTime === this.lastTime && !video.srcObject) return false;
    this.lastTime = video.currentTime;
    const stamp = Math.max(this.lastStamp + 1, performance.now());
    this.lastStamp = stamp;
    const res = this.landmarker.detectForVideo(video, stamp);
    this.people = res.landmarks || [];
    this.aspect = video.videoWidth / video.videoHeight;
    return true;
  }
}

// Converts one person's landmarks into a smoothed puppet pose.
export class PoseMapper {
  constructor() {
    this.pose = neutralPose();
    this.base = null;       // slow average of hip position -> body stays in its slot
    this.maxSeg = {};       // longest seen segment/torso ratio, for foreshortening
    this.seen = 0;
  }

  reset() {
    this.base = null;
    this.maxSeg = {};
  }

  // lm: 33 normalized landmarks; mirror: selfie view; dt seconds
  update(lm, aspect, mirror, dt, { legs = true, depth = true } = {}) {
    const p = lm.map((q) => [(mirror ? 1 - q.x : q.x) * aspect, q.y, q.visibility ?? 1]);
    // whichever shoulder is further left on screen drives the puppet's screen-left arm
    const flip = p[LM.lsh][0] > p[LM.rsh][0];
    const g = (name) => {
      const side = name[0];
      const n = name.slice(1);
      const idx = (flip ? (side === 'l' ? LM['r' + n] : LM['l' + n]) : LM[name]);
      return p[idx];
    };
    const vis = (...names) => names.every((n) => g(n)[2] > 0.5);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    const sh = mid(g('lsh'), g('rsh'));
    const hipsOk = vis('lhip', 'rhip');
    const hip = hipsOk ? mid(g('lhip'), g('rhip')) : [sh[0], sh[1] + len(g('lsh'), g('rsh')) * 1.3];
    const torso = Math.max(1e-3, len(sh, hip));

    const t = neutralPose();
    // arms
    const arm = (s) => {
      if (!vis(s + 'sh', s + 'el')) return;
      t[s + 'u'] = dir(g(s + 'sh'), g(s + 'el'));
      if (vis(s + 'wr')) t[s + 'f'] = dir(g(s + 'el'), g(s + 'wr'));
      else t[s + 'f'] = t[s + 'u'];
      if (depth) {
        const segs = [[s + 'ul', len(g(s + 'sh'), g(s + 'el')) / torso], [s + 'fl', len(g(s + 'el'), g(s + 'wr')) / torso]];
        for (const [k, v] of segs) {
          this.maxSeg[k] = Math.max(this.maxSeg[k] || 0, v) * 0.9995;
          t[k] = clamp(v / Math.max(this.maxSeg[k], 1e-3), 0.55, 1);
        }
      }
    };
    arm('l'); arm('r');

    // torso: lean of the spine plus shoulder roll
    const lean = Math.atan2(sh[0] - hip[0], hip[1] - sh[1]);
    const roll = dir(g('lsh'), g('rsh'));
    t.chest = clamp(lean * 0.8 + roll * 0.6, -0.7, 0.7);
    t.pelvis = hipsOk ? clamp(dir(g('lhip'), g('rhip')) * 0.7, -0.4, 0.4) : t.chest * 0.3;
    if (vis('lear', 'rear')) t.head = clamp(dir(g('lear'), g('rear')), -0.7, 0.7);
    else t.head = t.chest;

    // legs
    if (legs && hipsOk && vis('lknee', 'rknee')) {
      t.lt = dir(g('lhip'), g('lknee'));
      t.rt = dir(g('rhip'), g('rknee'));
      t.ls = vis('lank') ? dir(g('lknee'), g('lank')) : t.lt;
      t.rs = vis('rank') ? dir(g('rknee'), g('rank')) : t.rt;
    }

    // body translation relative to a slow moving baseline (in torso units)
    if (!this.base) this.base = [...hip];
    const kb = 1 - Math.exp(-dt / 2.5);
    this.base[0] = lerp(this.base[0], hip[0], kb);
    this.base[1] = lerp(this.base[1], hip[1], kb);
    t.x = clamp((hip[0] - this.base[0]) / torso, -0.8, 0.8);
    t.y = clamp((hip[1] - this.base[1]) / torso, -0.8, 0.5);
    t.tail = clamp(-t.x * 1.2 + t.pelvis, -0.6, 0.6);

    // smoothing
    const k = 1 - Math.exp(-dt / 0.055);
    const o = this.pose;
    for (const key in t) {
      if (['x', 'y', 'lul', 'lfl', 'rul', 'rfl'].includes(key)) o[key] = lerp(o[key], t[key], k);
      else o[key] = lerpAngle(o[key], t[key], k);
    }
    this.seen = 1;
    return o;
  }

  // no person visible: drift back to neutral
  relax(dt) {
    const n = neutralPose();
    const k = 1 - Math.exp(-dt / 0.4);
    for (const key in n) {
      if (['x', 'y', 'lul', 'lfl', 'rul', 'rfl'].includes(key)) this.pose[key] = lerp(this.pose[key], n[key], k);
      else this.pose[key] = lerpAngle(this.pose[key], n[key], k);
    }
    this.seen = Math.max(0, this.seen - dt);
    return this.pose;
  }
}

// order detected people left -> right on screen
export function sortPeople(people, mirror) {
  return [...people].sort((a, b) => {
    const ax = (a[11].x + a[12].x) / 2, bx = (b[11].x + b[12].x) / 2;
    return mirror ? bx - ax : ax - bx;
  });
}

