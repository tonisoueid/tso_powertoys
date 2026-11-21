/*
 * Endless runner simulation: physics, procedural obstacle spawner, collision.
 * Pure logic with no DOM access so it can run under `node --test`.
 * Coordinates: jumpH is the player's height above the ground (0 = grounded,
 * positive = airborne). Obstacle x values are screen-space and scroll left.
 */

export const PHYS = {
  gravity: 3200, // px/s²
  jumpVelocity: 940, // px/s upward
  fastDropGravity: 2.35, // gravity multiplier while fast-dropping
  jumpDamp: 0.45, // upward velocity kept when Space is released early
  hitInset: 0.18, // AABB inset from visual sprite bounds
};

export const GEOMETRY = {
  groundY: 254, // ground line on the 300px-tall canvas
  playerX: 90,
  playerW: 40,
  playerH: 46,
  defaultViewW: 1000,
};

export const PLAYER = { x: GEOMETRY.playerX, w: GEOMETRY.playerW, h: GEOMETRY.playerH };

export const DIFFICULTY_PRESETS = {
  easy: { baseSpeed: 300, accel: 0.02, maxSpeed: 560, gapMult: 1.6, airChance: 0.14, doubleChance: 0.1, scoreRate: 88 },
  medium: { baseSpeed: 360, accel: 0.038, maxSpeed: 760, gapMult: 1.25, airChance: 0.32, doubleChance: 0.22, scoreRate: 100 },
  hard: { baseSpeed: 430, accel: 0.055, maxSpeed: 940, gapMult: 1.0, airChance: 0.46, doubleChance: 0.35, scoreRate: 115 },
};

/* Visual-size catalogue; collision uses the same boxes with an inset. */
export const OBSTACLE_SHAPES = {
  small: { w: 26, h: 44 },
  tall: { w: 30, h: 66 },
  cluster: { w: 58, h: 50 },
  spikes: { w: 52, h: 26 },
  airLow: { w: 46, h: 18, clearance: 26 },
  airMid: { w: 46, h: 17, clearance: 64 },
  airHigh: { w: 42, h: 16, clearance: 104 },
};

export function speedForScore(score, preset) {
  return Math.min(preset.baseSpeed + preset.accel * score, preset.maxSpeed);
}

/** Full jump air time in seconds (up + down at regular gravity). */
export function jumpAirTime() {
  return (2 * PHYS.jumpVelocity) / PHYS.gravity;
}

/** Fair-gap rule from the spec: jumpAirTime * currentSpeed * 1.25. */
export function computeMinGap(speed) {
  return jumpAirTime() * speed * 1.25;
}

/** Inset a box {x, y, w, h} by `inset` (0..0.5) on every side. */
export function insetBox(box, inset = PHYS.hitInset) {
  const dx = box.w * inset;
  const dy = box.h * inset;
  return { x: box.x + dx, y: box.y + dy, w: box.w - 2 * dx, h: box.h - 2 * dy };
}

export function boxesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function formatScore(n) {
  return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Player collision box in the same screen space as obstacles. */
export function playerBox(jumpH) {
  return { x: PLAYER.x, y: GEOMETRY.groundY - jumpH - PLAYER.h, w: PLAYER.w, h: PLAYER.h };
}

function obstacleBox(o) {
  const bottom = o.kind === 'air' ? GEOMETRY.groundY - o.clearance : GEOMETRY.groundY;
  return { x: o.x, y: bottom - o.h, w: o.w, h: o.h };
}

export class RunnerEngine {
  constructor(difficulty = 'medium', rand = Math.random) {
    this.rand = rand;
    this.viewW = GEOMETRY.defaultViewW;
    this.best = 0;
    this.difficulty = difficulty;
    this.reset();
  }

  get preset() {
    return DIFFICULTY_PRESETS[this.difficulty] ?? DIFFICULTY_PRESETS.medium;
  }

  /** Back to the idle board; keeps session best and difficulty. */
  reset() {
    this.state = 'idle';
    this.score = 0;
    this.speed = this.preset.baseSpeed;
    this.distance = 0;
    this.time = 0;
    this.animT = 0;
    this.jumpH = 0;
    this.vy = 0;
    this.onGround = true;
    this.fastDrop = false;
    this.jumpHeld = false;
    this.landT = -1;
    this.obstacles = [];
    this.fx = [];
    this.trail = [];
    this.trailTimer = 0;
    this.spawnDist = 0;
    this.lastKind = null;
    this.lastGap = Infinity;
    this.nextGap = this.rollGap(true);
  }

  setDifficulty(name) {
    if (!DIFFICULTY_PRESETS[name]) return;
    this.difficulty = name;
    if (this.state === 'idle') this.speed = this.preset.baseSpeed;
  }

  /** Begin a run (and let the caller immediately launch the first jump). */
  start() {
    if (this.state !== 'idle') return;
    this.state = 'running';
    this.spawnDist = 0;
    this.nextGap = this.rollGap(true);
  }

  restart() {
    this.reset();
    this.start();
  }

  pause() {
    if (this.state === 'running') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.state = 'running';
  }

  /** Space / canvas tap: jump, start from idle, or restart after game over. */
  jump() {
    if (this.state === 'idle') this.start();
    if (this.state !== 'running') return false;
    if (!this.onGround) return false;
    this.vy = PHYS.jumpVelocity;
    this.onGround = false;
    this.jumpHeld = true;
    this.trailTimer = 0;
    this.burstDust(GEOMETRY.groundY, 7);
    return true;
  }

  /** Releasing Space early dampens the ascent for variable jump height. */
  releaseJump() {
    this.jumpHeld = false;
    if (!this.onGround && this.vy > 0) this.vy *= PHYS.jumpDamp;
  }

  setFastDrop(on) {
    this.fastDrop = on;
  }

  step(dt) {
    this.time += dt;
    if (this.state === 'idle') {
      this.animT += dt; // clouds keep drifting on the idle board
      return;
    }
    if (this.state !== 'running') return; // paused / over freeze the simulation

    this.animT += dt;
    this.speed = speedForScore(this.score, this.preset);
    this.score += dt * this.preset.scoreRate * (this.speed / this.preset.baseSpeed);
    const whole = Math.floor(this.score);
    if (whole > this.best) this.best = whole;
    this.distance += this.speed * dt;

    this.spawnDist += this.speed * dt;
    if (this.spawnDist >= this.nextGap) {
      // Speed (and with it the required fair gap) may have grown since the
      // gap was rolled; defer the spawn until the current minimum is met.
      const minNow = computeMinGap(this.speed);
      if (this.spawnDist >= minNow) {
        this.spawnObstacle();
        this.lastGap = this.spawnDist;
        this.spawnDist = 0;
        this.nextGap = this.rollGap();
      } else {
        this.nextGap = Math.max(this.nextGap, minNow);
      }
    }

    for (const o of this.obstacles) o.x -= this.speed * dt;
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -80);

    if (!this.onGround) {
      if (this.fastDrop && this.vy > 0) this.vy = Math.min(this.vy, 60);
      const g = PHYS.gravity * (this.fastDrop && !this.onGround ? PHYS.fastDropGravity : 1);
      // Exact kinematics per step: identical trajectories at any dt (60Hz vs 120Hz+).
      this.jumpH += this.vy * dt - 0.5 * g * dt * dt;
      this.vy -= g * dt;
      if (this.jumpH <= 0) {
        this.jumpH = 0;
        this.onGround = true;
        this.vy = 0;
        this.landT = this.time;
        this.burstDust(GEOMETRY.groundY, 9);
      } else {
        this.trailTimer += dt;
        if (this.trailTimer >= 0.03) {
          this.trail.push({ age: 0, h: this.jumpH });
          this.trailTimer = 0;
        }
      }
    }

    for (const t of this.trail) t.age += dt;
    if (this.onGround && this.time - this.landT > 0.35) this.trail.length = 0;

    this.updateFx(dt);

    if (this.obstacles.some((o) => boxesOverlap(insetBox(playerBox(this.jumpH)), insetBox(obstacleBox(o))))) {
      this.gameOver();
    }
  }

  gameOver() {
    if (this.state !== 'running') return;
    this.state = 'over';
    this.score = Math.floor(this.score);
    if (this.score > this.best) this.best = this.score;
    const cx = PLAYER.x + PLAYER.w / 2;
    const cy = GEOMETRY.groundY - this.jumpH - PLAYER.h / 2;
    for (let i = 0; i < 16; i += 1) {
      const a = this.rand() * Math.PI * 2;
      const sp = 90 + this.rand() * 220;
      this.fx.push({
        type: 'spark',
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0.65,
        maxLife: 0.65,
        size: 3,
      });
    }
  }

  rollGap(initial = false) {
    const minGap = computeMinGap(this.speed);
    let gap = minGap * this.preset.gapMult * (1 + this.rand() * 0.45);
    if (initial) gap = Math.max(gap, minGap * 1.6);
    return gap;
  }

  spawnObstacle() {
    const r = this.rand();
    let type;
    if (r < this.preset.airChance) {
      type = this.rollAir();
    } else {
      type = this.rollGround();
    }
    const shape = OBSTACLE_SHAPES[type];
    this.obstacles.push({
      type,
      kind: shape.clearance !== undefined ? 'air' : 'ground',
      x: this.viewW + 60,
      w: shape.w,
      h: shape.h,
      clearance: shape.clearance ?? 0,
      seed: this.rand() * 10,
    });
    this.lastKind = shape.clearance !== undefined ? 'air' : 'ground';
  }

  rollGround() {
    const r = this.rand();
    const clusterP = 0.2 + this.preset.doubleChance * 0.6;
    if (r < clusterP) return 'cluster';
    if (r < clusterP + 0.4) return 'small';
    if (r < clusterP + 0.65) return 'tall';
    return 'spikes';
  }

  rollAir() {
    const r = this.rand();
    let variant = r < 0.4 ? 'airLow' : r < 0.75 ? 'airMid' : 'airHigh';
    // A low aerial obstacle right after a ground one can be un-jumpable: keep those apart.
    if (variant === 'airLow' && this.lastKind === 'ground' && this.lastGap < computeMinGap(this.speed) * 1.6) {
      variant = 'airMid';
    }
    return variant;
  }

  burstDust(y, n) {
    for (let i = 0; i < n; i += 1) {
      this.fx.push({
        type: 'dust',
        x: PLAYER.x + 4 + this.rand() * (PLAYER.w - 8),
        y: y - 2 - this.rand() * 5,
        vx: -(40 + this.rand() * 130),
        vy: -(10 + this.rand() * 55),
        life: 0.5,
        maxLife: 0.5,
        size: 2 + Math.round(this.rand() * 2),
      });
    }
  }

  updateFx(dt) {
    for (const p of this.fx) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'spark') p.vy += 900 * dt;
      if (p.type === 'dust') p.vy += 260 * dt;
    }
    this.fx = this.fx.filter((p) => p.life > 0);
  }
}
