/*
 * Theme-aware canvas renderer for the endless runner.
 * The palette is chosen per frame from the dashboard theme, so toggling the
 * global Light/Dark mode re-skins the run immediately without resetting it.
 */

import { GEOMETRY, PLAYER, formatScore } from './engine.js';
import { SPR, SPR_ROBOT } from './sprites.js';
import { strings, format } from '../strings.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SURGE_SCORE = 3500;

const LIGHT = {
  sky: '#CDE0EE',
  hillFar: '#F7F3DC',
  hillNear: '#EAE3C0',
  rock: '#C9BD9C',
  cloud: '#FFFFFF',
  ink: '#0D2838',
  inkSoft: 'rgba(13,40,56,0.55)',
  panel: '#3E6B8A',
  spark: '#E8A33D',
  ground: '#0D2838',
  groundEdge: '#1E3A4C',
  groundSpeck: '#35586E',
  boxTop: '#E2E8F0',
  boxLeft: '#94A3B8',
  boxRight: '#CBD5E1',
  outline: null,
};

const DARK = {
  sky: '#0D2838',
  hillFar: '#E2E8F0',
  hillNear: '#F8FAFC',
  rock: '#CBD5E1',
  cloud: 'rgba(248,250,252,0.10)',
  ink: '#F8FAFC',
  inkSoft: 'rgba(248,250,252,0.55)',
  panel: '#94A3B8',
  spark: '#FDE68A',
  ground: '#F8FAFC',
  groundEdge: '#E2E8F0',
  groundSpeck: '#94A3B8',
  boxTop: '#F8FAFC',
  boxLeft: '#CBD5E1',
  boxRight: '#E2E8F0',
  outline: '#0D2838',
};

/* Deterministic sky decor (fractions of canvas width / fixed pixels). */
const CLOUDS = [
  { x: 90, y: 46, s: 1.0 },
  { x: 340, y: 84, s: 0.78 },
  { x: 580, y: 36, s: 1.15 },
  { x: 830, y: 70, s: 0.9 },
  { x: 1030, y: 52, s: 0.7 },
];
const STARS = [
  { fx: 0.06, fy: 0.09, sp: 1.7, ph: 0.0 },
  { fx: 0.14, fy: 0.3, sp: 2.3, ph: 1.2 },
  { fx: 0.21, fy: 0.12, sp: 1.1, ph: 2.4 },
  { fx: 0.29, fy: 0.38, sp: 2.9, ph: 0.7 },
  { fx: 0.36, fy: 0.07, sp: 1.9, ph: 3.1 },
  { fx: 0.44, fy: 0.27, sp: 1.4, ph: 1.9 },
  { fx: 0.52, fy: 0.11, sp: 2.6, ph: 0.3 },
  { fx: 0.6, fy: 0.33, sp: 1.2, ph: 2.2 },
  { fx: 0.67, fy: 0.06, sp: 2.1, ph: 1.5 },
  { fx: 0.74, fy: 0.24, sp: 1.6, ph: 3.6 },
  { fx: 0.82, fy: 0.1, sp: 2.4, ph: 0.9 },
  { fx: 0.9, fy: 0.3, sp: 1.3, ph: 2.8 },
  { fx: 0.95, fy: 0.16, sp: 2.0, ph: 1.1 },
  { fx: 0.38, fy: 0.2, sp: 2.7, ph: 4.0 },
];

function wrap(v, m) {
  return ((v % m) + m) % m;
}

function drawGrid(ctx, rows, xLeft, yBottom, uX, uY, colors, outline) {
  const h = rows.length;
  if (outline) {
    // Separation pass: a 1px halo in the outline color so light sprites stay
    // readable over the light dune silhouettes of the dark palette.
    ctx.fillStyle = outline;
    for (let r = 0; r < h; r += 1) {
      const row = rows[r];
      for (let c = 0; c < row.length; c += 1) {
        const ch = row[c];
        if (ch === '.' || ch === 'o' || !colors[ch]) continue;
        ctx.fillRect(
          Math.floor(xLeft + c * uX) - 1,
          Math.floor(yBottom - (h - r) * uY) - 1,
          Math.ceil(uX) + 2,
          Math.ceil(uY) + 2,
        );
      }
    }
  }
  for (let r = 0; r < h; r += 1) {
    const row = rows[r];
    for (let c = 0; c < row.length; c += 1) {
      const ch = row[c];
      const color = colors[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(xLeft + c * uX), Math.floor(yBottom - (h - r) * uY), Math.ceil(uX), Math.ceil(uY));
    }
  }
}

function pixelColors(pal) {
  return { '#': pal.ink, '+': pal.panel, '*': pal.spark };
}

/* Draw a grid preserving its aspect ratio, centered inside the given box. */
function drawGridFit(ctx, rows, x, yBottom, w, h, colors, outline) {
  const gw = Math.max(...rows.map((r) => r.length));
  const gh = rows.length;
  const u = Math.min(w / gw, h / gh);
  const xLeft = x + (w - gw * u) / 2;
  const yTop = yBottom - h;
  const yBottomFit = yTop + gh * u;
  drawGrid(ctx, rows, xLeft, yBottomFit, u, u, colors, outline);
}

function isoCube(ctx, cx, baseY, hw, sideH, pal, wire) {
  const q = hw * 0.5;
  const topY = baseY - sideH;
  const A = [cx - hw, topY - q];
  const B = [cx, topY - 2 * q];
  const C = [cx + hw, topY - q];
  const D = [cx, topY];
  const E = [cx - hw, baseY - q];
  const F = [cx + hw, baseY - q];
  const G = [cx, baseY];
  const poly = (pts, fill) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (wire) {
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };
  if (wire) {
    poly([A, B, C, D]);
    poly([A, D, G, E]);
    poly([D, C, F, G]);
  } else {
    poly([A, D, G, E], pal.boxLeft);
    poly([D, C, F, G], pal.boxRight);
    poly([A, B, C, D], pal.boxTop);
  }
}

function isoPyramid(ctx, cx, baseY, hw, h, pal, wire) {
  const q = hw * 0.28;
  const apex = [cx, baseY - h];
  const west = [cx - hw, baseY - q];
  const south = [cx, baseY];
  const east = [cx + hw, baseY - q];
  const north = [cx, baseY - 2 * q];
  const face = (pts, fill) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (wire) {
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };
  face([apex, west, south], pal.boxLeft);
  face([apex, south, east], pal.boxRight);
  if (wire) {
    face([west, north, east, south], null);
  }
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let restartRect = null;

  function draw(view) {
    const { engine: eng, skin, isDark, W, H } = view;
    const pal = isDark ? DARK : LIGHT;
    const wire = isDark && skin === 'box';
    const colors = pixelColors(pal);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = pal.sky;
    ctx.fillRect(0, 0, W, H);

    if (isDark) {
      drawNightSky(ctx, pal, W, eng);
    } else {
      for (const c of CLOUDS) {
        const x = wrap(c.x - eng.distance * 0.12 + eng.animT * 6, W + 260) - 130;
        drawCloud(ctx, pal, x, c.y, c.s, false);
      }
    }

    if (skin === 'box') {
      drawPeaks(ctx, pal, W, wire);
    } else {
      drawDunes(ctx, pal, W, eng);
    }

    drawGround(ctx, pal, W, H, eng);
    for (const o of eng.obstacles) drawObstacle(ctx, o, skin, pal, wire, colors, eng);
    drawTrail(ctx, pal, eng);
    drawPlayer(ctx, eng, skin, pal, wire, colors, isDark);
    drawFx(ctx, pal, eng);
    if (eng.state === 'running' && eng.score >= SURGE_SCORE) drawSpeedLines(ctx, pal, eng);
    drawHud(ctx, pal, eng, W);
    drawOverlay(ctx, pal, eng, W, H, isDark);
  }

  /* ---------- sky ---------- */

  function drawNightSky(ctx, pal, W, eng) {
    for (const s of STARS) {
      const a = 0.3 + 0.6 * Math.abs(Math.sin(eng.animT * s.sp + s.ph));
      ctx.fillStyle = pal.ink;
      ctx.globalAlpha = a;
      const x = s.fx * W;
      const y = s.fy * 300;
      ctx.fillRect(x, y, 2, 2);
      if (a > 0.8) {
        ctx.fillRect(x - 2, y, 6, 1);
        ctx.fillRect(x, y - 2, 1, 6);
      }
    }
    ctx.globalAlpha = 1;
    // crescent moon (kept clear of the player's jump apex column)
    const mx = W * 0.085;
    const my = 44;
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.arc(mx, my, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.sky;
    ctx.beginPath();
    ctx.arc(mx + 7, my - 4, 13, 0, Math.PI * 2);
    ctx.fill();
    // faint outlined clouds
    for (const c of CLOUDS) {
      const x = wrap(c.x - eng.distance * 0.12 + eng.animT * 6, W + 260) - 130;
      drawCloud(ctx, pal, x, c.y, c.s, true);
    }
  }

  function drawCloud(ctx, pal, x, y, s, outline) {
    ctx.beginPath();
    ctx.moveTo(x, y + 10 * s);
    for (const [dx, dy, r] of [
      [14, 6, 12],
      [32, 0, 15],
      [52, 7, 11],
    ]) {
      ctx.arc(x + dx * s, y + dy * s, r * s, Math.PI, 0, false);
    }
    ctx.lineTo(x + 63 * s, y + 10 * s);
    ctx.closePath();
    if (outline) {
      ctx.strokeStyle = 'rgba(248,250,252,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = pal.cloud;
      ctx.fill();
    }
  }

  /* ---------- terrain ---------- */

  function drawDunes(ctx, pal, W, eng) {
    const layer = (base, amp, k, offset, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, GEOMETRY.groundY);
      for (let x = 0; x <= W + 16; x += 16) {
        ctx.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin((x + offset) * k)));
      }
      ctx.lineTo(W + 16, GEOMETRY.groundY);
      ctx.closePath();
      ctx.fill();
    };
    layer(GEOMETRY.groundY - 56, 38, 0.0085, -eng.distance * 0.22, pal.hillFar);
    layer(GEOMETRY.groundY - 20, 26, 0.0122, -eng.distance * 0.42, pal.hillNear);
  }

  function drawPeaks(ctx, pal, W, wire) {
    const layer = (period, off, scale, toneL, toneR) => {
      const first = Math.floor(off / period) - 1;
      const count = Math.ceil(W / period) + 3;
      for (let i = first; i < first + count; i += 1) {
        const cx = i * period - off + period / 2;
        const h = (44 + ((i * 73) % 38)) * scale;
        const hw = period * 0.62;
        if (wire) {
          ctx.strokeStyle = pal.ink;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.moveTo(cx - hw, GEOMETRY.groundY);
          ctx.lineTo(cx, GEOMETRY.groundY - h);
          ctx.lineTo(cx + hw, GEOMETRY.groundY);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = toneL;
          ctx.beginPath();
          ctx.moveTo(cx, GEOMETRY.groundY - h);
          ctx.lineTo(cx - hw, GEOMETRY.groundY);
          ctx.lineTo(cx, GEOMETRY.groundY);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = toneR;
          ctx.beginPath();
          ctx.moveTo(cx, GEOMETRY.groundY - h);
          ctx.lineTo(cx, GEOMETRY.groundY);
          ctx.lineTo(cx + hw, GEOMETRY.groundY);
          ctx.closePath();
          ctx.fill();
        }
      }
    };
    if (wire) {
      layer(170, 0, 1, null, null); // static wireframe ridges
      layer(260, 60, 1.25, null, null);
    } else {
      layer(170, 0, 0.9, '#EAE3C0', '#F2EDD4');
      layer(260, 60, 1.2, '#E2D9B4', '#EAE3C0');
    }
  }

  function drawGround(ctx, pal, W, H, eng) {
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, GEOMETRY.groundY, W, H - GEOMETRY.groundY);
    ctx.fillStyle = pal.groundEdge;
    ctx.fillRect(0, GEOMETRY.groundY, W, 3);
    ctx.fillStyle = pal.groundSpeck;
    for (let i = 0; i < 26; i += 1) {
      const sx = wrap(i * 137 + 61 - eng.distance, W + 60) - 30;
      const sy = GEOMETRY.groundY + 8 + ((i * 53) % 32);
      ctx.fillRect(sx, sy, 6, 2);
    }
  }

  /* ---------- obstacles ---------- */

  function drawObstacle(ctx, o, skin, pal, wire, colors, eng) {
    if (o.kind === 'air') {
      drawAirObstacle(ctx, o, skin, pal, wire, colors, eng);
      return;
    }
    const y = GEOMETRY.groundY;
    if (skin === 'box') {
      const cx = o.x + o.w / 2;
      if (o.type === 'small') {
        isoCube(ctx, cx, y, o.w / 2, o.h - o.w / 4, pal, wire);
      } else if (o.type === 'tall') {
        isoCube(ctx, cx - o.w * 0.08, y, o.w / 2, o.h * 0.58, pal, wire);
        isoCube(ctx, cx + o.w * 0.06, y - o.h * 0.58, o.w * 0.4, o.h * 0.46, pal, wire);
      } else if (o.type === 'cluster') {
        isoCube(ctx, o.x + o.w * 0.24, y, o.w * 0.26, o.h * 0.85, pal, wire);
        isoCube(ctx, o.x + o.w * 0.66, y, o.w * 0.22, o.h * 0.6, pal, wire);
        isoPyramid(ctx, o.x + o.w * 0.92, y, 12, 20, pal, wire);
      } else {
        isoPyramid(ctx, o.x + o.w * 0.2, y, 14, o.h, pal, wire);
        isoPyramid(ctx, o.x + o.w * 0.52, y, 16, o.h * 0.8, pal, wire);
        isoPyramid(ctx, o.x + o.w * 0.82, y, 12, o.h * 0.65, pal, wire);
      }
      return;
    }
    if (o.type === 'small') {
      drawGrid(ctx, SPR.cactusSmall, o.x, y, o.w / 8, o.h / 12, colors, pal.outline);
    } else if (o.type === 'tall') {
      drawGrid(ctx, SPR.cactusTall, o.x, y, o.w / 10, o.h / 16, colors, pal.outline);
    } else if (o.type === 'cluster') {
      const uX = (o.w * 0.3) / 8;
      const uY = o.h / 12;
      drawGrid(ctx, SPR.cactusSmall, o.x, y, uX, uY, colors, pal.outline);
      drawGrid(ctx, SPR.cactusSmall, o.x + o.w * 0.36, y, uX, uY * 1.08, colors, pal.outline);
      drawGrid(ctx, SPR.cactusSmall, o.x + o.w * 0.7, y, uX, uY * 0.92, colors, pal.outline);
    } else {
      ctx.fillStyle = pal.rock;
      for (let i = 0; i < 3; i += 1) {
        const px = o.x + o.w * (0.18 + i * 0.32);
        const ph = o.h * (i === 1 ? 1 : 0.7);
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px + 9, y - ph);
        ctx.lineTo(px + 18, y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawAirObstacle(ctx, o, skin, pal, wire, colors, eng) {
    const bottom = GEOMETRY.groundY - o.clearance;
    if (skin === 'box') {
      drawOrigamiBird(ctx, o, pal, wire, eng);
      return;
    }
    if (skin === 'robot' && o.seed % 2 >= 1) {
      const bob = Math.sin(eng.animT * 5 + o.seed) * 3;
      drawGridFit(ctx, SPR.drone, o.x, bottom + bob, o.w, o.h, colors, pal.outline);
      return;
    }
    const frame = Math.floor(eng.animT * 6 + o.seed) % 2 === 0 ? SPR.pteroA : SPR.pteroB;
    drawGridFit(ctx, frame, o.x, bottom, o.w, o.h, colors, pal.outline);
  }

  function drawOrigamiBird(ctx, o, pal, wire, eng) {
    const cx = o.x + o.w / 2;
    const cy = GEOMETRY.groundY - o.clearance - o.h / 2;
    const flap = Math.sin(eng.animT * 7 + o.seed);
    const path = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      if (wire) {
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = pal.boxLeft;
        ctx.fill();
        ctx.strokeStyle = pal.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };
    // faceted body: beak at left, tail at right
    path([
      [o.x, cy],
      [cx, cy - o.h * 0.18],
      [o.x + o.w, cy - o.h * 0.05],
      [cx, cy + o.h * 0.5],
    ]);
    // two flapping wing facets
    const wy = cy - o.h * 0.1;
    path([
      [cx - o.w * 0.05, wy],
      [cx - o.w * 0.42, wy - o.h * (0.7 * flap + 0.5)],
      [cx + o.w * 0.12, wy + o.h * 0.1],
    ]);
    path([
      [cx + o.w * 0.08, wy],
      [cx + o.w * 0.45, wy - o.h * (0.6 * flap + 0.45)],
      [cx + o.w * 0.22, wy + o.h * 0.12],
    ]);
  }

  /* ---------- player ---------- */

  function drawPlayer(ctx, eng, skin, pal, wire, colors, isDark) {
    const feetY = GEOMETRY.groundY - eng.jumpH;
    const dead = eng.state === 'over';
    if (skin === 'box') {
      const tilt = dead ? 0.5 : Math.max(-0.25, Math.min(0.3, -eng.vy / 3200));
      ctx.save();
      ctx.translate(PLAYER.x + PLAYER.w / 2, feetY);
      ctx.rotate(tilt);
      ctx.translate(-(PLAYER.x + PLAYER.w / 2), -feetY);
      isoCube(ctx, PLAYER.x + PLAYER.w / 2, feetY, 24, 26, pal, wire);
      ctx.restore();
      return;
    }
    let rows;
    if (skin === 'robot') {
      rows = dead
        ? SPR_ROBOT.jump
        : !eng.onGround
          ? SPR_ROBOT.jump
          : eng.state === 'running'
            ? Math.floor(eng.distance / 26) % 2 === 0
              ? SPR_ROBOT.runA
              : SPR_ROBOT.runB
            : SPR_ROBOT.runA;
    } else {
      rows = dead || !eng.onGround ? SPR.dinoJump : eng.state === 'running'
        ? Math.floor(eng.distance / 26) % 2 === 0
          ? SPR.dinoRunA
          : SPR.dinoRunB
        : SPR.dinoRunA;
    }
    const uX = PLAYER.w / 16;
    const uY = PLAYER.h / 16;
    const tilt = dead ? (skin === 'robot' ? -0.32 : 0.1) : 0;
    ctx.save();
    if (tilt) {
      ctx.translate(PLAYER.x + PLAYER.w / 2, feetY);
      ctx.rotate(tilt);
      ctx.translate(-(PLAYER.x + PLAYER.w / 2), -feetY);
    }
    drawGrid(ctx, rows, PLAYER.x, feetY, uX, uY, colors, pal.outline);
    ctx.restore();
    if (dead && skin === 'dino') {
      // X-eye stun overlay on the cutout eye cell (row 1, col 10)
      const ex = PLAYER.x + 10 * uX;
      const ey = feetY - (16 - 1) * uY;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = Math.max(1.5, uX * 0.5);
      const r = uX * 1.1;
      ctx.beginPath();
      ctx.moveTo(ex - r, ey - r);
      ctx.lineTo(ex + r, ey + r);
      ctx.moveTo(ex + r, ey - r);
      ctx.lineTo(ex - r, ey + r);
      ctx.stroke();
    }
    if (skin === 'robot' && !eng.onGround && !dead) {
      // thruster flicker under the hover pose
      const flick = 2 + Math.floor((eng.animT * 30) % 3);
      ctx.fillStyle = pal.spark;
      const bx = PLAYER.x + PLAYER.w / 2;
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(bx - 6 + i * 5, feetY + 1, 3, flick - i);
      }
    }
  }

  /* ---------- fx ---------- */

  function drawTrail(ctx, pal, eng) {
    ctx.fillStyle = pal.inkSoft;
    for (const t of eng.trail) {
      if (t.age > 0.65) continue;
      const x = PLAYER.x + PLAYER.w / 2 - eng.speed * t.age;
      if (x < 2) continue;
      ctx.globalAlpha = (1 - t.age / 0.65) * 0.55;
      ctx.fillRect(x, GEOMETRY.groundY - t.h - PLAYER.h / 2, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawFx(ctx, pal, eng) {
    for (const p of eng.fx) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a * (p.type === 'dust' ? 0.5 : 0.95);
      if (p.type === 'spark') {
        ctx.fillStyle = pal.spark;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.fillRect(p.x - p.vx * 0.02, p.y - p.vy * 0.02, 1.5, 1.5);
      } else {
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = pal.inkSoft;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeedLines(ctx, pal, eng) {
    ctx.strokeStyle = pal.inkSoft;
    ctx.lineWidth = 2;
    const baseY = GEOMETRY.groundY - eng.jumpH - PLAYER.h / 2;
    for (let i = 0; i < 4; i += 1) {
      const y = baseY - 14 + i * 9;
      const len = 24 + ((i * 37 + Math.floor(eng.distance * 2)) % 34);
      ctx.globalAlpha = 0.35 - i * 0.05;
      ctx.beginPath();
      ctx.moveTo(PLAYER.x - 12 - len, y);
      ctx.lineTo(PLAYER.x - 12, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(ctx, pal, eng, W) {
    ctx.font = `600 12.5px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = pal.inkSoft;
    ctx.fillText(format(strings.erCanvasScore, formatScore(eng.score)), W - 14, 12);
  }

  /* ---------- overlays ---------- */

  function drawOverlay(ctx, pal, eng, W, H, isDark) {
    if (eng.state === 'idle') {
      ctx.font = `800 30px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isDark ? 'rgba(248,250,252,0.35)' : 'rgba(13,40,56,0.30)';
      try {
        ctx.letterSpacing = '3px';
      } catch {
        /* letterSpacing unsupported — plain text is fine */
      }
      ctx.fillText(strings.erIdlePrompt, W / 2, H * 0.42);
      try {
        ctx.letterSpacing = '0px';
      } catch {
        /* ignore */
      }
    } else if (eng.state === 'paused') {
      ctx.fillStyle = isDark ? 'rgba(5,10,16,0.45)' : 'rgba(247,247,247,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = `800 26px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.ink;
      ctx.fillText(strings.erPaused, W / 2, H * 0.42);
    } else if (eng.state === 'over') {
      ctx.font = `800 42px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.ink;
      try {
        ctx.letterSpacing = '8px';
      } catch {
        /* ignore */
      }
      ctx.fillText(strings.erGameOver, W / 2, H * 0.36);
      try {
        ctx.letterSpacing = '0px';
      } catch {
        /* ignore */
      }
      const size = 48;
      const bx = W / 2 - size / 2;
      const by = H * 0.36 + 38;
      restartRect = { x: bx, y: by, w: size, h: size };
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.roundRect(bx, by, size, size, 10);
      ctx.fill();
      // circular restart arrow
      const cx = bx + size / 2;
      const cy = by + size / 2;
      ctx.strokeStyle = isDark ? '#0D2838' : '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, 11, -0.5 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      const ax = cx + 11 * Math.cos(0.85 * Math.PI);
      const ay = cy + 11 * Math.sin(0.85 * Math.PI);
      ctx.fillStyle = isDark ? '#0D2838' : '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(ax - 2, ay - 9);
      ctx.lineTo(ax + 8, ay - 2);
      ctx.lineTo(ax - 6, ay + 4);
      ctx.closePath();
      ctx.fill();
      ctx.lineCap = 'butt';
    }
  }

  return {
    draw,
    getRestartRect() {
      return restartRect;
    },
  };
}
