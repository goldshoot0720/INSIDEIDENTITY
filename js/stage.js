// MV look: crimson / black / white, brush-torn frame, halftone, scrolling giant type,
// stamped vertical Mincho words, a distressed title card and name tags for close-ups.
import { clamp, lerp } from './mat.js';

export const W = 1920, H = 1080;
const RED = '#c8102e', DARK = '#12000a', BLOOD = '#6e0616';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ragged brush edge polygon along a horizontal line
function tornEdge(ctx, r, y, depth, down) {
  ctx.beginPath();
  ctx.moveTo(-20, down ? -20 : H + 20);
  let x = -20;
  ctx.lineTo(x, y);
  while (x < W + 40) {
    x += 6 + r() * 26;
    const spike = r() < 0.12 ? depth * (0.8 + r() * 1.4) : depth * r() * 0.55;
    ctx.lineTo(x, y + (down ? spike : -spike));
  }
  ctx.lineTo(W + 20, down ? -20 : H + 20);
  ctx.closePath();
  ctx.fill();
}

function splatter(ctx, r, cx, cy, size, n) {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 1.8) * size;
    const rad = (1 - d / size) * size * 0.08 * (0.3 + r());
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, Math.max(1, rad), 0, Math.PI * 2);
    ctx.fill();
  }
}

export class Stage {
  constructor() {
    this.frames = [0, 1, 2].map((k) => this.makeFrame(k));
    this.grain = [0, 1, 2].map((k) => this.makeGrain(k));
    this.halftone = this.makeHalftone();
    this.splats = this.makeSplats();
    this.title = null;
    this.words = ['内なる声', '本当の私', '闇の炎', '解き放て', '踊れ', '叫べ', '心の奥', '見つけて'];
    this.latin = ['INSIDE', 'IDENTITY', 'RAISON D\'ÊTRE', 'WHO AM I'];
  }

  makeFrame(seed) {
    const c = canvas(W, H), x = c.getContext('2d');
    const r = rng(101 + seed * 17);
    x.fillStyle = DARK;
    tornEdge(x, r, 34, 26, true);
    tornEdge(x, r, H - 34, 26, false);
    // side scratches
    x.globalAlpha = 0.9;
    for (let i = 0; i < 26; i++) {
      const left = r() < 0.5;
      const y = r() * H, len = 30 + r() * 140;
      x.beginPath();
      x.moveTo(left ? 0 : W, y);
      x.lineTo(left ? 8 + r() * 30 : W - 8 - r() * 30, y + len * 0.2);
      x.lineTo(left ? 0 : W, y + len);
      x.fill();
    }
    x.globalAlpha = 1;
    x.fillStyle = 'rgba(255,255,255,0.85)';
    splatter(x, r, W * 0.06, 70, 90, 40);
    splatter(x, r, W * 0.94, H - 80, 110, 50);
    return c;
  }

  makeGrain(seed) {
    const c = canvas(256, 256), x = c.getContext('2d');
    const d = x.createImageData(256, 256);
    const r = rng(7 + seed);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = r() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  makeHalftone() {
    const c = canvas(W, H), x = c.getContext('2d');
    x.fillStyle = DARK;
    const step = 22;
    for (let y = 0; y < H; y += step) {
      for (let i = 0; i < W; i += step) {
        const ox = (y / step) % 2 ? step / 2 : 0;
        const px = i + ox;
        // two corner fields
        const a = Math.max(0, 1 - Math.hypot(px - 0, y - H) / 900);
        const b = Math.max(0, 1 - Math.hypot(px - W, y - 0) / 800);
        const s = Math.max(a, b) * step * 0.55;
        if (s > 0.6) {
          x.beginPath();
          x.arc(px, y, s, 0, Math.PI * 2);
          x.fill();
        }
      }
    }
    return c;
  }

  makeSplats() {
    const c = canvas(W, H), x = c.getContext('2d');
    const r = rng(33);
    x.fillStyle = '#fff';
    for (let k = 0; k < 7; k++) splatter(x, r, r() * W, 120 + r() * (H - 360), 60 + r() * 120, 30);
    // long brush strokes
    x.strokeStyle = '#fff';
    x.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const y = 150 + r() * 600;
      x.lineWidth = 6 + r() * 16;
      x.beginPath();
      x.moveTo(-50, y);
      x.bezierCurveTo(W * 0.3, y - 120 * r(), W * 0.6, y + 140 * r(), W + 50, y - 40);
      x.stroke();
    }
    return c;
  }

  // distressed title, built once fonts are ready
  makeTitle(names) {
    const c = canvas(W, 560), x = c.getContext('2d');
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '900 210px "Cinzel", "Times New Roman", serif';
    x.fillStyle = BLOOD;
    x.fillText('INSIDE', W / 2 + 10, 150 + 10);
    x.fillText('IDENTITY', W / 2 + 10, 350 + 10);
    x.fillStyle = '#fff';
    x.fillText('INSIDE', W / 2, 150);
    x.fillText('IDENTITY', W / 2, 350);
    // wear it down with speckles
    x.globalCompositeOperation = 'destination-out';
    const r = rng(9);
    for (let i = 0; i < 2600; i++) {
      x.globalAlpha = 0.3 + r() * 0.7;
      x.beginPath();
      x.arc(r() * W, 40 + r() * 440, r() * r() * 7, 0, Math.PI * 2);
      x.fill();
    }
    for (let i = 0; i < 30; i++) {
      x.globalAlpha = 0.6;
      x.fillRect(r() * W, 40 + r() * 440, 40 + r() * 200, 1 + r() * 3);
    }
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.font = '800 38px "Shippori Mincho B1", serif';
    x.fillStyle = '#fff';
    x.fillText('アイデンティティ ― 動作模倣 MV', W / 2, 470);
    x.font = '700 26px "Shippori Mincho B1", serif';
    x.fillStyle = 'rgba(255,255,255,0.8)';
    x.fillText('dance by ' + names.join(' & '), W / 2, 520);
    this.title = c;
  }

  background(ctx, s) {
    const { t, beat, energy, cam } = s;
    const hit = Math.pow(1 - (((beat % 1) + 1) % 1), 4);
    const par = (k) => {
      // parallax: background moves less than the characters
      const z = lerp(1, cam.zoom, k);
      ctx.setTransform(z, 0, 0, z, W / 2 - lerp(W / 2, cam.x, k) * z, H / 2 - lerp(H / 2, cam.y, k) * z);
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.5, W * 0.62);
    g.addColorStop(0, '#e0223c');
    g.addColorStop(0.45, RED);
    g.addColorStop(0.8, BLOOD);
    g.addColorStop(1, '#1c0208');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // giant scrolling outline words
    par(0.15);
    ctx.save();
    ctx.font = '900 250px "Cinzel", serif';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const rows = ['INSIDE IDENTITY  ', 'RAISON D\'ÊTRE  ', 'INSIDE IDENTITY  '];
    rows.forEach((txt, i) => {
      const wdt = ctx.measureText(txt).width;
      const sp = (i % 2 ? -1 : 1) * 60;
      let x0 = ((t * sp) % wdt) - wdt;
      const y = 170 + i * 330;
      for (let x = x0; x < W + wdt; x += wdt) {
        ctx.fillText(txt, x, y);
        ctx.strokeText(txt, x, y);
      }
    });
    ctx.restore();

    // diagonal black slashes that kick on every beat
    par(0.35);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.42);
    ctx.fillStyle = DARK;
    const kick = hit * 40;
    const slashes = [[-760, 150], [-420, 60], [380, 210], [700, 70], [980, 120]];
    for (const [x, w] of slashes) {
      const drift = Math.sin(t * 0.4 + x) * 30;
      ctx.globalAlpha = 0.82;
      ctx.fillRect(x + drift - kick, -1400, w + kick * 0.5, 2800);
    }
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-560 + Math.sin(t * 0.3) * 40, -1400, 10, 2800);
    ctx.fillRect(560 + Math.cos(t * 0.35) * 40, -1400, 5, 2800);
    ctx.restore();

    // halftone corners and white splatter
    par(0.25);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(this.halftone, 0, 0);
    ctx.globalAlpha = 0.16 + 0.25 * hit * energy;
    ctx.drawImage(this.splats, 0, 0);
    ctx.globalAlpha = 1;

    // floor
    par(1);
    const f = ctx.createLinearGradient(0, H * 0.8, 0, H);
    f.addColorStop(0, 'rgba(20,0,6,0)');
    f.addColorStop(1, 'rgba(20,0,6,0.85)');
    ctx.fillStyle = f;
    ctx.fillRect(-W, H * 0.8, W * 3, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // beat pump
    if (hit > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,40,70,${0.1 * hit * (0.4 + energy)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // soft shadow blobs on the floor, in stage space (called with camera transform set)
  shadows(ctx, feet) {
    for (const [x, y, w] of feet) {
      const g = ctx.createRadialGradient(x, y, 5, x, y, w);
      g.addColorStop(0, 'rgba(10,0,4,0.55)');
      g.addColorStop(1, 'rgba(10,0,4,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.18);
      ctx.translate(-x, -y);
      ctx.beginPath();
      ctx.arc(x, y, w, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  verticalWord(ctx, word, x, y, size, k) {
    // stamp in: overshoot scale + fade
    const sc = lerp(1.5, 1, clamp(k * 3, 0, 1));
    const al = clamp(k * 4, 0, 1);
    ctx.save();
    ctx.globalAlpha = al;
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.font = `800 ${size}px "Shippori Mincho B1", "Hiragino Mincho ProN", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...word];
    const isLatin = /^[\x00-\x7FÀ-ÿ' ]+$/.test(word);
    if (isLatin) {
      ctx.rotate(Math.PI / 2);
      ctx.font = `900 ${size * 0.8}px "Cinzel", serif`;
      ctx.lineWidth = 10;
      ctx.strokeStyle = DARK;
      ctx.strokeText(word, 0, 0);
      ctx.fillStyle = RED;
      ctx.fillText(word, 7, 7);
      ctx.fillStyle = '#fff';
      ctx.fillText(word, 0, 0);
    } else {
      const total = chars.length * size * 1.02;
      chars.forEach((ch, i) => {
        const cy = -total / 2 + (i + 0.5) * size * 1.02;
        ctx.lineWidth = 12;
        ctx.strokeStyle = DARK;
        ctx.strokeText(ch, 0, cy);
        ctx.fillStyle = RED;
        ctx.fillText(ch, 8, cy + 8);
        ctx.fillStyle = '#fff';
        ctx.fillText(ch, 0, cy);
      });
    }
    ctx.restore();
  }

  overlay(ctx, s) {
    const { t, beat, energy, word, wordAge, wordSide, sub, nameTag, tagAge, titleK, wipe, flash, focusName } = s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (word && wordAge < 8) {
      const x = wordSide ? W - 170 : 170;
      const fade = clamp((8 - wordAge) * 2, 0, 1);
      ctx.save();
      ctx.globalAlpha = fade;
      this.verticalWord(ctx, word, x, H / 2 - 20 + Math.sin(t) * 6, word.length > 5 ? 118 : 150, wordAge / 1.2);
      ctx.restore();
    }

    if (nameTag) {
      const k = clamp(tagAge * 2.5, 0, 1);
      ctx.save();
      ctx.translate(lerp(-900, 0, 1 - Math.pow(1 - k, 3)), H - 250);
      ctx.transform(1, 0, -0.35, 1, 0, 0);
      ctx.fillStyle = DARK;
      ctx.fillRect(40, 0, 800, 118);
      ctx.fillStyle = RED;
      ctx.fillRect(70, 10, 800, 98);
      ctx.fillStyle = '#fff';
      ctx.font = 'italic 900 70px "Cinzel", serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(nameTag.tag, 150, 58);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = k;
      ctx.font = '800 42px "Shippori Mincho B1", serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('— ' + nameTag.name, 110, H - 88);
      ctx.restore();
    }

    if (titleK > 0 && this.title) {
      ctx.save();
      ctx.globalAlpha = titleK;
      ctx.fillStyle = `rgba(10,0,4,${0.55 * titleK})`;
      ctx.fillRect(0, 0, W, H);
      const shake = (1 - titleK) * 20;
      ctx.drawImage(this.title, Math.sin(t * 40) * shake, H / 2 - 290);
      ctx.restore();
    }

    if (sub) {
      ctx.save();
      ctx.font = '700 44px "Shippori Mincho B1", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(sub, W / 2, H - 110);
      ctx.fillStyle = '#fff';
      ctx.fillText(sub, W / 2, H - 110);
      ctx.restore();
    }

    // vignette, frame, grain
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.frames[Math.floor(Math.max(0, beat)) % 3], 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    const gi = this.grain[Math.floor(t * 24) % 3];
    const pat = ctx.createPattern(gi, 'repeat');
    ctx.fillStyle = pat;
    ctx.translate((t * 997) % 256, (t * 613) % 256);
    ctx.fillRect(-256, -256, W + 512, H + 512);
    ctx.restore();

    if (wipe > 0 && wipe < 1) {
      // diagonal black wipe used for camera cuts
      const x = lerp(-W * 0.9, W * 1.9, wipe);
      ctx.save();
      ctx.transform(1, 0, -0.5, 1, 0, 0);
      ctx.fillStyle = RED;
      ctx.fillRect(x - W * 0.62 + 270, 0, 60, H);
      ctx.fillStyle = DARK;
      ctx.fillRect(x - W * 0.6 + 270, 0, W * 0.6, H);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + 270, 0, 14, H);
      ctx.restore();
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
