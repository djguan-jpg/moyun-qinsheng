import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../backend/moyun_backend/static/anonymous-visualizer.js", import.meta.url), "utf8");

function harness({ unavailable = false, deferred = false, reduced = false, seed = 8127,
  artworkKeys = ["ink-resonance", "moonlit-strings", "landscape-score"] } = {}) {
  const frames = new Map();
  const pending = [];
  const events = {};
  let nextFrame = 0;
  let sources = 0;
  let stamps = 0;
  const signal = { amplitude: 45, frequency: 140 };
  const context = () => ({
    marks: [], globalAlpha: 1, tx: 0, ty: 0, stack: [],
    setTransform() {}, clearRect() { this.marks = []; },
    save() { this.stack.push([this.tx, this.ty, this.globalAlpha]); },
    restore() { [this.tx, this.ty, this.globalAlpha] = this.stack.pop(); },
    translate(x, y) { this.tx += x; this.ty += y; }, rotate() {},
    createRadialGradient() { return { addColorStop() {} }; },
    beginPath() {}, moveTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, fillRect() {},
    drawImage(stamp, ...geometry) { this.marks.push({ alpha: this.globalAlpha, geometry, center: [this.tx, this.ty] }); },
  });
  const audios = Array.from({ length: artworkKeys.length }, () => ({
    paused: true, ended: false, muted: false, volume: 1, currentTime: 0, events: {},
    addEventListener(name, callback) { this.events[name] = callback; },
    pause() { if (!this.paused) { this.paused = true; this.events.pause(); } },
  }));
  const canvases = artworkKeys.map((artwork, i) => ({
    dataset: { artwork }, context: context(),
    getContext() { return this.context; },
    getBoundingClientRect() { return { width: 358, height: 226 }; },
    closest() { return { querySelector: () => audios[i] }; },
  }));
  class AudioContext {
    destination = {};
    createAnalyser() {
      return { fftSize: 1024, frequencyBinCount: 512, connect() {},
        getByteFrequencyData(data) { data.fill(signal.frequency); },
        getByteTimeDomainData(data) { for (let i = 0; i < data.length; i++) data[i] = 128 + (i % 2 ? signal.amplitude : -signal.amplitude); },
      };
    }
    createMediaElementSource() { sources++; return { connect() {} }; }
    resume() { return deferred ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(); }
  }
  const document = {
    hidden: false,
    querySelectorAll: () => canvases,
    addEventListener(name, callback) { events[name] = callback; },
    createElement() { stamps++; return { getContext: () => context() }; },
  };
  const seededMath = Object.create(Math);
  seededMath.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const sandbox = {
    document, Uint8Array, Math: seededMath,
    window: { devicePixelRatio: 3, matchMedia: () => ({ matches: reduced }),
      AudioContext: unavailable ? undefined : AudioContext, ResizeObserver: class { observe() {} },
    },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  vm.runInNewContext(source, sandbox);
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  const play = async (i = 0) => { audios[i].paused = false; audios[i].ended = false; audios[i].events.play(); await flush(); };
  const tick = (count = 30) => {
    for (let n = 0; n < count; n++) {
      audios.forEach(a => { if (!a.paused) a.currentTime += 1 / 60; });
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
    }
  };
  return { audios, canvases, frames, signal, play, tick, document, events, pending, flush,
    get sources() { return sources; }, get stamps() { return stamps; } };
}

test("idle canvases are empty and pigment textures are lazy, with bounded DPR", () => {
  const h = harness();
  assert.equal(h.frames.size, 0);
  assert.equal(h.stamps, 0);
  assert.ok(h.canvases.every(c => c.context.marks.length === 0));
  assert.equal(h.canvases[0].width, 716);
});

test("rapid loudness changes cannot pulse pigment opacity", async () => {
  // Suppress travel to isolate density from spatial overlap / random route changes.
  const steady = harness({ reduced: true }); const pulsed = harness({ reduced: true });
  await steady.play(); await pulsed.play();
  for (let frame = 0; frame < 240; frame++) {
    pulsed.signal.amplitude = frame % 12 < 3 ? 60 : 2;
    steady.tick(1); pulsed.tick(1);
    assert.deepEqual(pulsed.canvases[0].context.marks.map(m => m.alpha),
      steady.canvases[0].context.marks.map(m => m.alpha), "opacity must be independent of amplitude");
  }
  assert.equal(pulsed.stamps, 8, "stamps must not be regenerated each frame");
  assert.equal(pulsed.frames.size, 1);
});

test("short musical gaps hold ink; sustained silence fades smoothly without motion", async () => {
  const h = harness(); await h.play(); h.tick(180);
  const before = structuredClone(h.canvases[0].context.marks);
  h.signal.amplitude = 0; h.tick(12);
  assert.deepEqual(h.canvases[0].context.marks, before, "a 200ms gap must not clear or move ink");
  let previous = before.reduce((sum, mark) => sum + mark.alpha, 0);
  const initial = previous;
  for (let frame = 0; frame < 90; frame++) {
    h.tick(1);
    const current = h.canvases[0].context.marks.reduce((sum, mark) => sum + mark.alpha, 0);
    assert.ok(current <= previous + 1e-10, "silent pigment may only fade");
    assert.ok(previous - current < initial * .035, "no abrupt silence-gate flash");
    previous = current;
  }
  assert.equal(h.canvases[0].context.marks.length, 0);
});

test("initial silence never draws pigment; mute and pause still clear immediately", async () => {
  const h = harness(); h.signal.amplitude = 0; await h.play(); h.tick(180);
  assert.equal(h.canvases[0].context.marks.length, 0, "stale frequency data cannot animate silence");
  h.signal.amplitude = 45; h.tick();
  h.audios[0].muted = true; h.audios[0].events.volumechange(); h.tick();
  assert.equal(h.canvases[0].context.marks.length, 0);
  h.audios[0].muted = false; h.tick(); h.audios[0].pause();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvases[0].context.marks.length, 0);
});

test("new pigment fades in instead of appearing at full density", async () => {
  const h = harness(); await h.play(); h.tick();
  assert.ok(h.canvases[0].context.marks.length > 0);
  assert.ok(h.canvases[0].context.marks.slice(-3).every(mark => mark.alpha < .02));
  assert.ok(h.canvases[0].context.marks.slice(0,3).some(mark => mark.alpha > .05));
});

test("only one work plays; switching and replay reuse the audio graph", async () => {
  const h = harness(); await h.play(); h.tick();
  await h.play(1); h.tick();
  assert.equal(h.audios[0].paused, true);
  assert.equal(h.canvases[0].context.marks.length, 0);
  assert.ok(h.canvases[1].context.marks.length > 0);
  h.audios[1].pause(); await h.play(1); h.tick();
  assert.equal(h.sources, 2);
  assert.equal(h.frames.size, 1);
});

test("ended and background pages stop rendering, foreground resumes safely", async () => {
  const h = harness(); await h.play(); h.tick();
  h.document.hidden = true; h.events.visibilitychange();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvases[0].context.marks.length, 0);
  h.document.hidden = false; h.events.visibilitychange(); h.tick();
  assert.equal(h.frames.size, 1);
  h.audios[0].ended = true; h.audios[0].events.ended();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvases[0].context.marks.length, 0);
});

test("a slow AudioContext resume cannot reactivate a previous work", async () => {
  const h = harness({ deferred: true });
  await h.play(0); await h.play(1);
  h.pending[1](); await h.flush(); h.tick();
  h.pending[0](); await h.flush(); h.tick();
  assert.equal(h.canvases[0].context.marks.length, 0);
  assert.ok(h.canvases[1].context.marks.length > 0);
  assert.equal(h.frames.size, 1);
});

test("unsupported Web Audio leaves native playback running with a clear canvas", async () => {
  const h = harness({ unavailable: true }); await h.play();
  assert.equal(h.audios[0].paused, false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvases[0].context.marks.length, 0);
});

test("ink heads actually travel across the canvas, not just grow at a fixed centre", async () => {
  const h = harness(); await h.play();
  const headPositions = [];
  for (let frame = 0; frame < 600; frame++) {
    h.tick(1);
    const marks = h.canvases[0].context.marks;
    if (marks.length >= 3) headPositions.push(marks.at(-3).center);
    assert.ok(marks.length <= 96, "trail count must stay bounded on phones");
  }
  const span = axis => Math.max(...headPositions.map(p => p[axis])) - Math.min(...headPositions.map(p => p[axis]));
  assert.ok(span(0) > 120, `horizontal travel was only ${span(0)}px`);
  assert.ok(span(1) > 45, `vertical travel was only ${span(1)}px`);
});

test("separate sessions take different random routes", async () => {
  const a = harness({ seed: 123 }); const b = harness({ seed: 456 });
  await a.play(); await b.play(); a.tick(120); b.tick(120);
  assert.notDeepEqual(a.canvases[0].context.marks.at(-3).center, b.canvases[0].context.marks.at(-3).center);
});

test("frequency response changes travel and width at equal loudness", async () => {
  const low = harness(); const high = harness();
  low.signal.frequency = 15; high.signal.frequency = 220;
  await low.play(); await high.play(); low.tick(120); high.tick(120);
  const a = low.canvases[0].context.marks.at(-3);
  const b = high.canvases[0].context.marks.at(-3);
  assert.ok(b.geometry[2] > a.geometry[2]);
  assert.notDeepEqual(a.center, b.center);
});

test("reduced-motion preference suppresses spatial travel", async () => {
  const h = harness({ reduced: true }); await h.play(); h.tick(30);
  const first = h.canvases[0].context.marks.at(-3).center;
  h.tick(300);
  assert.deepEqual(h.canvases[0].context.marks.at(-3).center, first);
});

test("silent playback cannot advance the random path", async () => {
  const h = harness(); await h.play(); h.tick(60);
  const before = h.canvases[0].context.marks.at(-3).center;
  h.signal.amplitude = 0; h.tick(300);
  assert.equal(h.canvases[0].context.marks.length, 0);
  h.signal.amplitude = 45; h.tick(6);
  const after = h.canvases[0].context.marks.at(-3).center;
  assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) < 15);
});

for (const artwork of ["river-dawn", "bamboo-rain", "ochre-ridge"]) {
  test(`${artwork} keeps audio-driven movement across its new composition`, async () => {
    const h = harness({ artworkKeys: [artwork] }); await h.play();
    const positions = [];
    for (let frame = 0; frame < 600; frame++) {
      h.tick(1);
      const marks = h.canvases[0].context.marks;
      if (marks.length >= 3) positions.push(marks.at(-3).center);
      assert.ok(marks.length <= 96);
    }
    const span = axis => Math.max(...positions.map(p => p[axis])) - Math.min(...positions.map(p => p[axis]));
    assert.ok(span(0) > 90, `${artwork} x travel: ${span(0)}`);
    assert.ok(span(1) > 25, `${artwork} y travel: ${span(1)}`);
    h.audios[0].pause();
    assert.equal(h.canvases[0].context.marks.length, 0);
  });
}
