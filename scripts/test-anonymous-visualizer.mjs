import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../backend/moyun_backend/static/anonymous-visualizer.js", import.meta.url), "utf8");

function harness({ unavailable = false, deferred = false } = {}) {
  const frames = new Map();
  const pending = [];
  const events = {};
  let nextFrame = 0;
  let sources = 0;
  let stamps = 0;
  const signal = { amplitude: 45, frequency: 140 };
  const context = () => ({
    marks: [], globalAlpha: 1,
    setTransform() {}, clearRect() { this.marks = []; },
    createRadialGradient() { return { addColorStop() {} }; },
    beginPath() {}, moveTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, fillRect() {},
    drawImage(stamp, ...geometry) { this.marks.push({ alpha: this.globalAlpha, geometry }); },
  });
  const audios = Array.from({ length: 3 }, () => ({
    paused: true, ended: false, muted: false, volume: 1, currentTime: 0, events: {},
    addEventListener(name, callback) { this.events[name] = callback; },
    pause() { if (!this.paused) { this.paused = true; this.events.pause(); } },
  }));
  const canvases = ["ink-resonance", "moonlit-strings", "landscape-score"].map((artwork, i) => ({
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
  const sandbox = {
    document, Uint8Array, Math,
    window: { devicePixelRatio: 3, matchMedia: () => ({ matches: false }),
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

test("real waveform amplitude and frequency alter ink density and expansion", async () => {
  const h = harness(); h.signal.amplitude = 6; h.signal.frequency = 25;
  await h.play(); h.tick();
  const soft = h.canvases[0].context.marks[0];
  h.signal.amplitude = 45; h.signal.frequency = 180; h.tick();
  const loud = h.canvases[0].context.marks[0];
  assert.ok(loud.alpha > soft.alpha);
  assert.ok(loud.geometry[2] > soft.geometry[2]);
  assert.equal(h.stamps, 4, "stamps must not be regenerated each frame");
  assert.equal(h.frames.size, 1);
});

test("silence, mute and pause clear all pigment immediately", async () => {
  const h = harness(); await h.play(); h.tick();
  assert.equal(h.canvases[0].context.marks.length, 4);
  h.signal.amplitude = 0; h.tick(1);
  assert.equal(h.canvases[0].context.marks.length, 0, "stale frequency data cannot animate silence");
  h.signal.amplitude = 45; h.tick();
  h.audios[0].muted = true; h.audios[0].events.volumechange(); h.tick();
  assert.equal(h.canvases[0].context.marks.length, 0);
  h.audios[0].muted = false; h.tick(); h.audios[0].pause();
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvases[0].context.marks.length, 0);
});

test("only one work plays; switching and replay reuse the audio graph", async () => {
  const h = harness(); await h.play(); h.tick();
  await h.play(1); h.tick();
  assert.equal(h.audios[0].paused, true);
  assert.equal(h.canvases[0].context.marks.length, 0);
  assert.equal(h.canvases[1].context.marks.length, 4);
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
  assert.equal(h.canvases[1].context.marks.length, 4);
  assert.equal(h.frames.size, 1);
});

test("unsupported Web Audio leaves native playback running with a clear canvas", async () => {
  const h = harness({ unavailable: true }); await h.play();
  assert.equal(h.audios[0].paused, false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.canvases[0].context.marks.length, 0);
});
