import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RunnerEngine,
  DIFFICULTY_PRESETS,
  PHYS,
  PLAYER,
  speedForScore,
  jumpAirTime,
  computeMinGap,
  insetBox,
  boxesOverlap,
  formatScore,
} from '../js/endless-runner/engine.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bareEngine(difficulty = 'medium', seed = 42) {
  const eng = new RunnerEngine(difficulty, mulberry32(seed));
  eng.spawnObstacle = () => {}; // no hazards: isolate physics/score behaviour
  return eng;
}

test('ER-01 formatScore adds thousands separators and floors', () => {
  assert.equal(formatScore(0), '0');
  assert.equal(formatScore(999), '999');
  assert.equal(formatScore(1420), '1,420');
  assert.equal(formatScore(4850.9), '4,850');
  assert.equal(formatScore(1234567), '1,234,567');
  assert.equal(formatScore(-5), '0');
});

test('ER-02 speedForScore grows with score and respects the cap', () => {
  for (const [name, p] of Object.entries(DIFFICULTY_PRESETS)) {
    assert.equal(speedForScore(0, p), p.baseSpeed, `${name} base`);
    assert.ok(speedForScore(1000, p) > p.baseSpeed, `${name} accelerates`);
    assert.ok(speedForScore(10 ** 9, p) <= p.maxSpeed, `${name} capped`);
  }
  assert.ok(
    speedForScore(1000, DIFFICULTY_PRESETS.hard) > speedForScore(1000, DIFFICULTY_PRESETS.medium),
    'hard faster than medium',
  );
});

test('ER-03 min gap follows jumpAirTime * speed * 1.25', () => {
  for (const speed of [300, 500, 900]) {
    assert.ok(Math.abs(computeMinGap(speed) - jumpAirTime() * speed * 1.25) < 1e-9);
  }
  assert.ok(Math.abs(jumpAirTime() - (2 * PHYS.jumpVelocity) / PHYS.gravity) < 1e-9);
});

test('ER-04 forgiving hitboxes inset by 18%', () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const inset = insetBox(box);
  assert.equal(inset.x, 18);
  assert.equal(inset.y, 18);
  assert.equal(inset.w, 64);
  assert.equal(inset.h, 64);
  // Direct overlap of visual bounds collides…
  assert.ok(boxesOverlap(insetBox(box), insetBox({ x: 50, y: 50, w: 100, h: 100 })));
  // …but a near-miss (clip < 18% on each side) does not.
  assert.ok(!boxesOverlap(insetBox(box), insetBox({ x: 96, y: 96, w: 100, h: 100 })));
});

test('ER-05 jump starts the run and gets airborne', () => {
  const eng = bareEngine();
  assert.equal(eng.state, 'idle');
  assert.ok(eng.jump());
  assert.equal(eng.state, 'running');
  assert.ok(!eng.onGround);
  eng.step(1 / 60);
  assert.ok(eng.jumpH > 0);
});

test('ER-06 variable jump height: early Space release dampens the apex', () => {
  function apex(dt, holdTime) {
    const eng = bareEngine();
    eng.jump();
    let t = 0;
    let top = 0;
    while (!eng.onGround) {
      eng.step(dt);
      t += dt;
      if (t >= holdTime) eng.releaseJump();
      top = Math.max(top, eng.jumpH);
    }
    return top;
  }
  const full = apex(1 / 60, 10);
  const short = apex(1 / 60, 0.12);
  assert.ok(full > 120, `full apex ${full}`);
  assert.ok(short < full * 0.75, `short apex ${short} vs ${full}`);
});

test('ER-07 fast drop lands sooner than a normal jump', () => {
  function airTime(dt, drop) {
    const eng = bareEngine();
    eng.jump();
    let t = 0;
    while (!eng.onGround) {
      if (drop) eng.setFastDrop(true);
      eng.step(dt);
      t += dt;
    }
    return t;
  }
  assert.ok(airTime(1 / 60, true) < airTime(1 / 60, false) * 0.8);
});

test('ER-08 delta-time normalisation: 60Hz and 144Hz physics agree', () => {
  function flightPath(dt) {
    const eng = bareEngine();
    eng.jump();
    const path = [];
    let t = 0;
    while (t < 0.4) {
      eng.step(dt);
      t += dt;
      path.push(eng.jumpH);
    }
    return path;
  }
  const a = flightPath(1 / 60);
  const b = flightPath(1 / 144);
  const heightAt = (path, dt, t) => path[Math.min(path.length - 1, Math.round(t / dt) - 1)];
  for (const t of [0.05, 0.1, 0.2, 0.3, 0.39]) {
    const diff = Math.abs(heightAt(a, 1 / 60, t) - heightAt(b, 1 / 144, t));
    assert.ok(diff < 2, `t=${t}s diverged by ${diff.toFixed(2)}px`);
  }
});

test('ER-09 score climbs and session best tracks it live', () => {
  const eng = bareEngine();
  eng.jump();
  for (let i = 0; i < 300; i += 1) eng.step(1 / 60); // 5s
  assert.ok(eng.score > 300, `score ${eng.score}`);
  assert.equal(eng.best, Math.floor(eng.score));
});

test('ER-10 reset clears the board but keeps session best', () => {
  const eng = bareEngine();
  eng.jump();
  for (let i = 0; i < 120; i += 1) eng.step(1 / 60);
  const bestBefore = eng.best;
  assert.ok(bestBefore > 0);
  eng.reset();
  assert.equal(eng.state, 'idle');
  assert.equal(eng.score, 0);
  assert.equal(eng.obstacles.length, 0);
  assert.equal(eng.best, bestBefore, 'session best survives reset');
});

test('ER-11 collision halts the run and floors the score', () => {
  const eng = new RunnerEngine('medium', mulberry32(7));
  eng.start();
  eng.obstacles.push({ type: 'small', kind: 'ground', x: PLAYER.x + 5, w: 26, h: 44, clearance: 0, seed: 0 });
  eng.step(1 / 60);
  assert.equal(eng.state, 'over');
  assert.equal(eng.score, Math.floor(eng.score));
  // frozen afterwards
  const fx = eng.fx.length;
  eng.step(1 / 60);
  assert.equal(eng.state, 'over');
  assert.equal(eng.fx.length, fx);
});

test('ER-12 near-miss on the 18% inset does not end the run', () => {
  const eng = new RunnerEngine('medium', mulberry32(7));
  eng.start();
  // Grazes the visual bounds only; the obstacle also scrolls ~6px during the
  // step, so the final visual overlap (~9px) stays under the two 18% insets.
  eng.obstacles.push({ type: 'small', kind: 'ground', x: PLAYER.x + PLAYER.w - 3, w: 26, h: 44, clearance: 0, seed: 0 });
  eng.step(1 / 60);
  assert.equal(eng.state, 'running');
});

test('ER-13 spawner keeps every gap jumpable on all difficulties', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const eng = new RunnerEngine(difficulty, mulberry32(difficulty.length * 17 + 3));
    eng.gameOver = () => {}; // spacing audit only — ignore collisions
    eng.start();
    let lastDist = 0;
    let count = 0;
    const dt = 1 / 120;
    for (let i = 0; i < 120 * 45; i += 1) {
      const before = eng.obstacles.length;
      eng.step(dt);
      if (eng.obstacles.length > before) {
        count += 1;
        const travelled = eng.distance - lastDist;
        lastDist = eng.distance;
        if (count > 1) {
          const minGap = computeMinGap(eng.speed);
          assert.ok(
            travelled >= minGap - 1e-6,
            `${difficulty}: gap ${travelled.toFixed(1)} < minGap ${minGap.toFixed(1)} at speed ${eng.speed.toFixed(0)}`,
          );
        }
      }
    }
    assert.ok(count > 10, `${difficulty} spawned ${count} obstacles`);
  }
});

test('ER-14 obstacle mix scales with difficulty', () => {
  const counts = {};
  for (const difficulty of ['easy', 'hard']) {
    const eng = new RunnerEngine(difficulty, mulberry32(99));
    eng.start();
    const dt = 1 / 120;
    for (let i = 0; i < 120 * 40; i += 1) {
      eng.jump(); // keep jumping to dodge as long as possible
      eng.step(dt);
      if (eng.state === 'over') break;
    }
    counts[difficulty] = eng.obstacles.filter((o) => o.kind === 'air').length;
  }
  assert.ok(
    counts.hard >= counts.easy,
    `hard aerial count ${counts.hard} should rival easy ${counts.easy}`,
  );
});

test('ER-15 pause freezes and resume continues', () => {
  const eng = bareEngine();
  eng.jump();
  eng.step(1 / 60);
  eng.pause();
  const score = eng.score;
  const jumpH = eng.jumpH;
  for (let i = 0; i < 30; i += 1) eng.step(1 / 60);
  assert.equal(eng.state, 'paused');
  assert.equal(eng.score, score);
  assert.equal(eng.jumpH, jumpH);
  eng.resume();
  eng.step(1 / 60);
  assert.ok(eng.score > score);
});
