import { Renderer, Puppet, neutralPose } from './puppet.js';
import { dancePose, blendPose, MOVE_NAMES } from './dance.js';
import { Tracker, PoseMapper, sortPeople, BONES } from './pose.js';
import { Stage, W, H } from './stage.js';
import { T, S, chain, lerp, clamp } from './mat.js';
import { buildCast } from './cast.js';

const $ = (s) => document.querySelector(s);
const view = $('#view');
const ctx = view.getContext('2d');
view.width = W;
view.height = H;

const SLOT_X = [330, 750, 1170, 1590];
const FLOOR = 1012;
const SCALE = 0.555;
const SHOTS = ['G', 'C0', 'G', 'C1', 'W', 'C2', 'G', 'C3'];

const st = {
  mode: 'dance', playing: false, bpm: 180, offset: 0, clock: 0,
  mirror: true, mvcam: true, title: true, skeleton: false, pip: true, legs: true, depth: true,
  follow: 'each', only: '', lrc: [], manualShot: null,
};

const status = (msg) => { $('#status').textContent = msg; };

// ---------------------------------------------------------------- loading
const glc = document.createElement('canvas');
let renderer, puppets = [];
const stage = new Stage();
const tracker = new Tracker();
const mappers = [0, 1, 2, 3].map(() => new PoseMapper());
const idleK = [0, 0, 0, 0];

async function init() {
  renderer = new Renderer(glc);
  puppets = buildCast().map((c) => new Puppet(renderer, c.rig, c.body, c.arms));
  const rig = puppets.map((p) => p.rig);
  await document.fonts.ready;
  stage.makeTitle(rig.map((r) => r.name));
  const sel = $('#only');
  for (const n of MOVE_NAMES) sel.add(new Option(n, n));
  status('準備完成 — 按 ▶ 開始，或切換到鏡頭 / 影片模仿');
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- media & audio
const audio = new Audio();
audio.loop = false;
const srcVideo = $('#srcVideo');
const camVideo = $('#camVideo');
let actx, analyser, recDest, freq;
let energy = 0.4;

function audioGraph(el) {
  if (!actx) {
    actx = new AudioContext();
    analyser = actx.createAnalyser();
    analyser.fftSize = 512;
    freq = new Uint8Array(analyser.frequencyBinCount);
    recDest = actx.createMediaStreamDestination();
    analyser.connect(actx.destination);
  }
  if (actx.state === 'suspended') actx.resume();
  if (el && !el._node) {
    el._node = actx.createMediaElementSource(el);
    el._node.connect(analyser);
    el._node.connect(recDest);
  }
}

function media() {
  if (st.mode === 'video' && srcVideo.src) return srcVideo;
  if (audio.src) return audio;
  return null;
}

function time() {
  const m = media();
  return m ? m.currentTime : st.clock;
}

function play(on = !st.playing) {
  st.playing = on;
  $('#play').textContent = on ? '❚❚ 暫停' : '▶ 播放';
  const m = media();
  audioGraph(m);
  if (m) on ? m.play().catch((e) => status('播放失敗：' + e.message)) : m.pause();
}

function restart() {
  st.clock = 0;
  const m = media();
  if (m) m.currentTime = 0;
  mappers.forEach((p) => p.reset());
}

// ---------------------------------------------------------------- camera (MV shots)
const cam = { x: W / 2, y: H / 2, zoom: 1 };
let shot = 'G', shotStart = 0, wipeT = 1, pendingShot = null, flash = 0;

function shotTarget(s, beat) {
  if (s[0] === 'C') {
    const i = +s[1];
    const f = puppets[i]?.joints.face || [SLOT_X[i], 400];
    return { x: f[0], y: f[1] + 115, zoom: 2.05 };
  }
  if (s === 'W') {
    const k = ((beat % 8) + 8) % 8 / 8;
    return { x: lerp(620, 1300, k), y: 560, zoom: 1.35 };
  }
  return { x: W / 2, y: H / 2, zoom: 1 };
}

function cutTo(s) {
  if (s === pendingShot || (s === shot && !pendingShot)) return;
  pendingShot = s;
  wipeT = 0;
}

// ---------------------------------------------------------------- tempo
const taps = [];
function tap() {
  const now = performance.now() / 1000;
  if (taps.length && now - taps[taps.length - 1] > 2) taps.length = 0;
  taps.push(now);
  if (taps.length >= 3) {
    const d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    st.bpm = Math.round(60 / d);
    $('#bpm').value = st.bpm;
    // align the downbeat with the last tap when a track is running
    st.offset = +(time() % (60 / st.bpm)).toFixed(3);
    $('#offset').value = st.offset;
  }
}

// ---------------------------------------------------------------- lyrics (LRC)
function parseLRC(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const body = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) out.push({ t: +m[1] * 60 + +m[2], text: body });
  }
  return out.sort((a, b) => a.t - b.t);
}

function lyricAt(t) {
  let cur = null;
  for (const l of st.lrc) {
    if (l.t <= t) cur = l;
    else break;
  }
  return cur && cur.text ? cur : null;
}

// ---------------------------------------------------------------- frame
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (st.playing && !media()) st.clock += dt;
  const t = time();
  const beat = (t - st.offset) * st.bpm / 60;
  const bar = Math.floor(beat / 8);

  // audio energy
  if (analyser && media() && !media().paused) {
    analyser.getByteFrequencyData(freq);
    let e = 0;
    for (let i = 1; i < 14; i++) e += freq[i];
    energy = lerp(energy, e / (13 * 255), 0.3);
  } else energy = lerp(energy, 0.45, 0.05);

  // ---- poses
  let poses;
  if (st.mode === 'dance') {
    poses = puppets.map((_, i) => st.playing || t > 0 ? dancePose(beat, i, st.only) : breathe(now, i));
  } else {
    const src = st.mode === 'camera' ? camVideo : srcVideo;
    tracker.update(src);
    const people = sortPeople(tracker.people, st.mirror);
    const n = people.length;
    poses = puppets.map((_, i) => {
      const m = mappers[i];
      let pose;
      if (n) {
        const who = st.follow === 'one' ? people[largest(people)] : people[Math.min(n - 1, Math.floor((i * n) / 4))];
        pose = m.update(who, tracker.aspect || 16 / 9, st.mirror, dt, { legs: st.legs, depth: st.depth });
        idleK[i] = Math.max(0, idleK[i] - dt * 3);
      } else {
        pose = m.relax(dt);
        idleK[i] = Math.min(1, idleK[i] + dt * 0.8);
      }
      return idleK[i] > 0 ? blendPose(pose, breathe(now, i), idleK[i]) : pose;
    });
  }

  // ---- camera shot schedule
  if (st.manualShot) cutTo(st.manualShot);
  else if (st.mvcam && st.playing && beat >= 8) cutTo(SHOTS[((bar % SHOTS.length) + SHOTS.length) % SHOTS.length]);
  else cutTo('G');
  if (wipeT < 1) {
    const before = wipeT;
    wipeT = Math.min(1, wipeT + dt / 0.42);
    if (before < 0.5 && wipeT >= 0.5 && pendingShot) {
      shot = pendingShot;
      pendingShot = null;
      shotStart = now / 1000;
      const tg = shotTarget(shot, beat);
      Object.assign(cam, tg);
    }
  }
  const tg = shotTarget(shot, beat);
  const kf = 1 - Math.exp(-dt / 0.25);
  cam.x = lerp(cam.x, tg.x, kf);
  cam.y = lerp(cam.y, tg.y, kf);
  cam.zoom = lerp(cam.zoom, tg.zoom, kf);
  const hit = st.playing ? Math.pow(1 - (((beat % 1) + 1) % 1), 4) : 0;
  const z = cam.zoom * (1 + 0.012 * hit);
  const camM = chain(T(W / 2, H / 2), S(z), T(-cam.x, -cam.y));
  if (st.playing && (beat % 8 + 8) % 8 < dt * st.bpm / 60) flash = 0.35;
  flash = Math.max(0, flash - dt * 2.2);

  // ---- draw
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  stage.background(ctx, { t, beat: st.playing ? beat : now / 1000, energy, cam: { ...cam, zoom: z } });

  const focus = shot[0] === 'C' ? +shot[1] : -1;
  const alphas = puppets.map((_, i) => (focus < 0 || focus === i ? 1 : 0));
  ctx.setTransform(camM[0], camM[1], camM[2], camM[3], camM[4], camM[5]);
  stage.shadows(ctx, puppets.map((p, i) => [p.joints.pelvis ? p.joints.pelvis[0] : SLOT_X[i], FLOOR - 4, 150]).filter((_, i) => alphas[i]));

  renderer.begin(W, H);
  renderer.setView(camM, W, H);
  puppets.forEach((p, i) => {
    const model = chain(T(SLOT_X[i], FLOOR), S(SCALE), T(-p.rig.pelvis[0], -p.foot));
    p.solve(poses[i], model);
  });
  // dark red echo behind everyone first, then the characters
  puppets.forEach((p, i) => alphas[i] && p.draw({ offset: [18, 8], tint: [0.12, 0, 0.03, 1], alpha: 0.55 }));
  puppets.forEach((p, i) => alphas[i] && p.draw({}));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(glc, 0, 0);

  if (st.skeleton) drawSkeleton(camM, alphas);

  const lyric = lyricAt(t);
  const block = Math.floor(beat / 16);
  const words = stage.words.concat(stage.latin);
  const title = st.title && st.playing && beat >= 0 && beat < 8 ? clamp(Math.min(beat * 2, (8 - beat) * 1.5), 0, 1) : 0;
  stage.overlay(ctx, {
    t, beat: st.playing ? beat : 0, energy,
    word: lyric ? lyric.text.split(/[\s、。！？!?]+/).filter(Boolean)[0] : (st.playing && beat >= 8 ? words[((block % words.length) + words.length) % words.length] : null),
    wordAge: lyric ? (t - lyric.t) * st.bpm / 60 : beat - block * 16,
    wordSide: block % 2 === 1 || (focus >= 0 && focus < 2),
    sub: lyric ? lyric.text : '',
    nameTag: focus >= 0 ? puppets[focus].rig : null,
    tagAge: now / 1000 - shotStart,
    titleK: title,
    wipe: wipeT,
    flash,
  });

  if (st.pip && st.mode !== 'dance') drawPip();
  requestAnimationFrame(frame);
}

// gentle idle when nothing drives the puppets
function breathe(now, i) {
  const t = now / 1000 + i * 0.7;
  const p = neutralPose();
  p.y = -0.01 * Math.sin(t * 2);
  p.head = 0.05 * Math.sin(t * 0.9);
  p.chest = 0.02 * Math.sin(t * 0.9 + 1);
  p.lu += 0.04 * Math.sin(t * 1.3);
  p.ru -= 0.04 * Math.sin(t * 1.3);
  p.tail = 0.2 * Math.sin(t * 1.6);
  return p;
}

function largest(people) {
  let best = 0, size = -1;
  people.forEach((lm, i) => {
    const s = Math.hypot(lm[11].x - lm[23].x, lm[11].y - lm[23].y);
    if (s > size) { size = s; best = i; }
  });
  return best;
}

function drawSkeleton(camM, alphas) {
  ctx.save();
  ctx.setTransform(camM[0], camM[1], camM[2], camM[3], camM[4], camM[5]);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#7CFFB2';
  ctx.fillStyle = '#fff';
  const segs = [['lsh', 'lel'], ['lel', 'lwr'], ['lwr', 'ltip'], ['rsh', 'rel'], ['rel', 'rwr'], ['rwr', 'rtip'], ['lsh', 'rsh'], ['neck', 'pelvis'], ['neck', 'face'],
    ['lhip', 'lknee'], ['lknee', 'lank'], ['rhip', 'rknee'], ['rknee', 'rank'], ['lhip', 'rhip']];
  puppets.forEach((p, i) => {
    if (!alphas[i]) return;
    const J = p.joints;
    ctx.beginPath();
    for (const [a, b] of segs) {
      ctx.moveTo(J[a][0], J[a][1]);
      ctx.lineTo(J[b][0], J[b][1]);
    }
    ctx.stroke();
    for (const k in J) {
      ctx.beginPath();
      ctx.arc(J[k][0], J[k][1], 7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawPip() {
  const src = st.mode === 'camera' ? camVideo : srcVideo;
  if (!src.videoWidth) return;
  const w = 400, h = w / (src.videoWidth / src.videoHeight);
  const x = W - w - 60, y = H - h - 70;
  ctx.save();
  ctx.fillStyle = '#12000a';
  ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
  if (st.mirror) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
  } else ctx.translate(x, y);
  ctx.drawImage(src, 0, 0, w, h);
  ctx.lineWidth = 3;
  const colors = ['#5b8cff', '#ffc233', '#ff4d5e', '#9fd0ff'];
  sortPeople(tracker.people, false).forEach((lm, k) => {
    ctx.strokeStyle = colors[k % 4];
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    ctx.stroke();
  });
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = '700 20px "Shippori Mincho B1", serif';
  ctx.fillText(`偵測到 ${tracker.people.length} 人`, x, y - 16);
}

// ---------------------------------------------------------------- recording
let rec = null, chunks = [];
function toggleRec() {
  if (rec) {
    rec.stop();
    return;
  }
  audioGraph(media());
  const tracks = [...view.captureStream(30).getVideoTracks(), ...recDest.stream.getAudioTracks()];
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const mimeType = types.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  rec = new MediaRecorder(new MediaStream(tracks), { mimeType, videoBitsPerSecond: 12e6 });
  chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: rec.mimeType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inside-identity-dance.${rec.mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
    a.click();
    rec = null;
    $('#rec').textContent = '● 錄影';
    $('#rec').classList.remove('on');
  };
  rec.start(250);
  $('#rec').textContent = '■ 停止錄影';
  $('#rec').classList.add('on');
}

// ---------------------------------------------------------------- UI wiring
function setMode(m) {
  st.mode = m;
  document.querySelectorAll('button[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  document.body.dataset.mode = m;
  if (m !== 'video') srcVideo.pause();
  if (m === 'camera') st.mirror = true;
  if (m === 'video') st.mirror = false;
  $('#mirror').checked = st.mirror;
  mappers.forEach((p) => p.reset());
  if (m !== 'dance') tracker.load(status).catch((e) => status('MediaPipe 載入失敗：' + e.message));
}

async function startCamera() {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: false });
    camVideo.srcObject = s;
    await camVideo.play();
    await tracker.load(status);
    status('鏡頭已開啟 — 站遠一點讓全身入鏡，角色會跟著你動');
  } catch (e) {
    status('無法開啟鏡頭：' + e.message);
  }
}

document.querySelectorAll('button[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#play').onclick = () => play();
$('#restart').onclick = restart;
$('#tap').onclick = tap;
$('#bpm').oninput = (e) => (st.bpm = clamp(+e.target.value || 180, 40, 300));
$('#offset').oninput = (e) => (st.offset = +e.target.value || 0);
$('#only').onchange = (e) => (st.only = e.target.value);
$('#follow').onchange = (e) => (st.follow = e.target.value);
$('#cam').onclick = startCamera;
$('#rec').onclick = toggleRec;
$('#full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : $('#stage').requestFullscreen());
$('#hide').onclick = () => document.body.classList.toggle('bare');
for (const k of ['mirror', 'mvcam', 'title', 'skeleton', 'pip', 'legs', 'depth']) {
  $('#' + k).checked = st[k];
  $('#' + k).onchange = (e) => (st[k] = e.target.checked);
}
$('#audioFile').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  audio.src = URL.createObjectURL(f);
  audioGraph(audio);
  restart();
  status('音樂已載入：' + f.name + '（按 TAP 對拍，或直接輸入 BPM）');
};
$('#videoFile').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  srcVideo.src = URL.createObjectURL(f);
  setMode('video');
  audioGraph(srcVideo);
  status('影片已載入：' + f.name + ' — 按 ▶ 播放，角色會模仿影片裡的人');
};
srcVideo.onended = () => play(false);
audio.onended = () => play(false);
$('#lrc').oninput = (e) => {
  st.lrc = parseLRC(e.target.value);
  status(st.lrc.length ? `字幕 ${st.lrc.length} 行已載入` : '沒有字幕');
};

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); play(); }
  else if (k === 'h') document.body.classList.toggle('bare');
  else if (k === 'f') $('#full').click();
  else if (k === 't') tap();
  else if (k === 'r') restart();
  else if (k === 'g') st.manualShot = 'G';
  else if ('1234'.includes(k)) st.manualShot = 'C' + (+k - 1);
  else if (k === 'w') st.manualShot = 'W';
  else if (k === 'a') st.manualShot = null;
  else if (k === 's') { st.skeleton = !st.skeleton; $('#skeleton').checked = st.skeleton; }
});

// handle for poking at the page from the devtools console
window.__app = { st, play, restart, setMode, cutTo };

init().catch((e) => {
  console.error(e);
  status('初始化失敗：' + e.message);
});
