(() => {
  "use strict";

  // Original paintings stay untouched <img> elements. No idle/baked animation.
  // 山水設色：花青、石青、石綠、赭石、淡墨（screen approximations）。
  const palettes = {
    "ink-resonance": ["#385d70", "#638577", "#a18b65", "#344952"],
    "moonlit-strings": ["#355568", "#576f68", "#a18460", "#303b3b"],
    "landscape-score": ["#436b67", "#718b6a", "#9b7952", "#344a50"],
    "river-dawn": ["#385d70", "#638577", "#a18b65", "#344952"],
    "bamboo-rain": ["#3c635b", "#718460", "#9b8864", "#314f54"],
    "ochre-ridge": ["#4c6973", "#69785b", "#987044", "#485654"],
  };
  // Broad travel regions, not fixed centres. Keep the moon itself unobscured.
  const motionBounds = {
    "ink-resonance": [.10, .90, .18, .84],
    "moonlit-strings": [.08, .92, .30, .80],
    "landscape-score": [.08, .92, .20, .82],
    "river-dawn": [.16, .92, .36, .84],
    "bamboo-rain": [.08, .72, .30, .82],
    "ochre-ridge": [.26, .93, .30, .84],
  };
  const states = [];
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let audioContext;
  let activeState;
  let frameRequest;
  let activation = 0;

  const average = (values, start, end) => {
    let total = 0;
    const upper = Math.min(values.length, end);
    for (let index = start; index < upper; index += 1) total += values[index];
    return upper > start ? total / ((upper - start) * 255) : 0;
  };

  const rms = (waveform) => {
    let squares = 0;
    for (const sample of waveform) squares += ((sample - 128) / 128) ** 2;
    return Math.sqrt(squares / waveform.length);
  };

  const fit = (state) => {
    const bounds = state.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (width === state.width && height === state.height && ratio === state.ratio) return;
    Object.assign(state, { width, height, ratio });
    state.canvas.width = width * ratio;
    state.canvas.height = height * ratio;
  };

  const clear = (state) => {
    fit(state);
    state.context.setTransform(state.ratio, 0, 0, state.ratio, 0, 0);
    state.context.clearRect(0, 0, state.width, state.height);
  };

  const reset = (state) => {
    state.energy = 0;
    state.bands = [0, 0, 0];
    state.visibility = 0;
    state.silentFor = 0;
    state.hasSignal = false;
    state.currents = undefined;
    state.parcels = [];
    state.lastTime = undefined;
    clear(state);
  };

  const rgba = (hex, alpha) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  };

  const randomFor = (seed) => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // Feathered pigment stamps are cached once per active card. Displaced nested
  // contours create wet-paper edges and dense interiors without per-frame noise.
  const createPigmentStamp = (color, seed) => {
    const stamp = document.createElement("canvas");
    stamp.width = stamp.height = 256;
    const context = stamp.getContext("2d");
    const random = randomFor(seed);
    const phases = Array.from({ length: 5 }, () => random() * Math.PI * 2);
    const gradient = context.createRadialGradient(115, 131, 5, 128, 128, 116);
    gradient.addColorStop(0, rgba(color, .9));
    gradient.addColorStop(.54, rgba(color, .72));
    gradient.addColorStop(.84, rgba(color, .34));
    gradient.addColorStop(1, rgba(color, 0));
    context.fillStyle = gradient;
    context.shadowColor = rgba(color, .24);
    context.shadowBlur = 3;
    for (let layer = 0; layer < 30; layer += 1) {
      const scale = 1 - layer * .018;
      const points = [];
      for (let index = 0; index < 96; index += 1) {
        const angle = index / 96 * Math.PI * 2;
        const edge = 1 + .15 * Math.sin(angle * 3 + phases[0])
          + .12 * Math.cos(angle * 5 + phases[1])
          + .065 * Math.sin(angle * 9 + phases[2])
          + .035 * Math.cos(angle * 17 + phases[3])
          + (random() - .5) * .065;
        const radius = 82 * scale * edge;
        points.push({ x: 128 + Math.cos(angle) * radius + Math.sin(layer * .7) * 3,
          y: 128 + Math.sin(angle) * radius + Math.cos(layer * .5) * 3 });
      }
      context.globalAlpha = .026 + layer * .0011;
      context.beginPath();
      const last = points[points.length - 1];
      context.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2);
      points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      });
      context.closePath();
      context.fill();
    }
    return stamp;
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smoothstep = (value) => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const randomPoint = (state) => {
    const [left, right, top, bottom] = state.bounds;
    return { x: left + state.random() * (right - left), y: top + state.random() * (bottom - top) };
  };

  const newRoute = (state, current) => {
    const from = { x: current.x, y: current.y };
    let to = randomPoint(state);
    // Reject nearby destinations: "random motion" must not become local wobble.
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const candidate = randomPoint(state);
      if (Math.hypot(candidate.x - from.x, candidate.y - from.y)
        > Math.hypot(to.x - from.x, to.y - from.y)) to = candidate;
      if (Math.hypot(to.x - from.x, to.y - from.y) > .48) break;
    }
    const [left, right, top, bottom] = state.bounds;
    const first = current.route ? {
      x: clamp(from.x + (from.x - current.route.second.x) * .8, left, right),
      y: clamp(from.y + (from.y - current.route.second.y) * .8, top, bottom),
    } : randomPoint(state);
    current.route = { from, first, second: randomPoint(state), to };
    current.progress = 0;
    current.duration = 2.2 + state.random() * 1.4;
  };

  const createCurrent = (state, index) => {
    const current = { ...randomPoint(state), index, emission: .09 };
    newRoute(state, current);
    return current;
  };

  const routePoint = (route, progress) => {
    const t = clamp(progress, 0, 1);
    const u = 1 - t;
    const point = {};
    for (const axis of ["x", "y"]) point[axis] = u ** 3 * route.from[axis]
      + 3 * u ** 2 * t * route.first[axis] + 3 * u * t ** 2 * route.second[axis]
      + t ** 3 * route.to[axis];
    return point;
  };

  const advanceInk = (state, delta, bands) => {
    const motion = reducedMotion?.matches ? 0 : 1;
    if (!state.currents) state.currents = [0, 1, 2].map(index => createCurrent(state, index));
    for (const parcel of state.parcels) {
      parcel.age += delta;
      parcel.x += parcel.vx * delta * motion;
      parcel.y += parcel.vy * delta * motion;
      parcel.angle += parcel.spin * delta * motion;
    }
    state.parcels = state.parcels.filter(parcel => parcel.age < parcel.life);
    for (const current of state.currents) {
      const previous = { x: current.x, y: current.y };
      const response = bands[current.index];
      current.progress += delta * (.45 + state.energy * 1.2 + response * .35) / current.duration * motion;
      Object.assign(current, routePoint(current.route, current.progress));
      if (current.progress >= 1) newRoute(state, current);
      current.emission += delta;
      if (current.emission < .09) continue;
      current.emission %= .09;
      const pigment = current.index === 2 && state.random() < .65 ? 3 : current.index;
      state.parcels.push({
        x: current.x, y: current.y, age: 0, life: 1.6 + state.random() * 1.2,
        vx: delta ? (current.x - previous.x) / delta * .12 : 0,
        vy: delta ? (current.y - previous.y) / delta * .12 : 0,
        angle: state.random() * Math.PI * 2, spin: (state.random() - .5) * .65,
        radius: .055 + state.random() * .045 + response * .024,
        aspect: .72 + state.random() * .55,
        // Pigment density never follows loudness; only its motion/width do.
        opacity: pigment === 2 ? .12 : .29,
        stamp: pigment * 2 + Math.floor(state.random() * 2),
      });
    }
    // A finite number of large translucent wisps, not point particles.
    if (state.parcels.length > 96) state.parcels.splice(0, state.parcels.length - 96);
  };

  const drawInkBloom = (state) => {
    clear(state);
    const now = state.audio.currentTime;
    const delta = Math.max(0, Math.min(.05, now - (state.lastTime ?? now)));
    state.lastTime = now;
    if (state.audio.muted || state.audio.volume === 0) { reset(state); return; }
    const amplitude = rms(state.waveform);
    // Hysteresis prevents low-level audio from repeatedly opening/closing the gate.
    const audible = amplitude >= (state.hasSignal ? .0015 : .003);
    state.hasSignal = audible;
    if (audible) {
      state.silentFor = 0;
      state.visibility += (1 - state.visibility) * (1 - Math.exp(-delta * 3));
      const signal = Math.min(1, amplitude * state.audio.volume * 7);
      const follow = 1 - Math.exp(-delta * 1.8);
      state.energy += (signal - state.energy) * follow;
      const bands = [average(state.spectrum, 1, 7), average(state.spectrum, 7, 32),
        average(state.spectrum, 32, 100)];
      bands.forEach((band, index) => { state.bands[index] += (band - state.bands[index]) * follow; });
      advanceInk(state, delta, state.bands);
    } else {
      // Freeze through short musical gaps; sustained silence only fades existing
      // pigment. Never spawn pigment or advance random routes without real audio.
      state.silentFor += delta;
      state.visibility = Math.min(state.visibility, 1 - smoothstep((state.silentFor - .45) / .9));
      if (state.visibility <= 0) { state.parcels = []; state.energy = 0; state.bands = [0, 0, 0]; return; }
    }
    const { context, width, height } = state;
    context.globalCompositeOperation = "source-over";
    state.parcels.forEach(parcel => {
      const life = parcel.age / parcel.life;
      const size = width * parcel.radius * 2 * (1 + life * .95);
      context.save();
      context.translate(width * parcel.x, height * parcel.y);
      context.rotate(parcel.angle);
      // Gentle birth/death avoids individual stamp flashes; no beat-level alpha.
      context.globalAlpha = parcel.opacity * smoothstep(parcel.age / .35)
        * (1 - smoothstep(life)) * state.visibility;
      context.drawImage(state.stamps[parcel.stamp], -size / 2, -size * parcel.aspect / 2, size, size * parcel.aspect);
      context.restore();
    });
    context.globalAlpha = 1;
  };

  const stopFrame = () => {
    if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    frameRequest = undefined;
  };

  const render = () => {
    if (!activeState || activeState.audio.paused || activeState.audio.ended || document.hidden) {
      stopFrame();
      return;
    }
    activeState.analyser.getByteFrequencyData(activeState.spectrum);
    activeState.analyser.getByteTimeDomainData(activeState.waveform);
    drawInkBloom(activeState);
    frameRequest = requestAnimationFrame(render);
  };

  const connect = (state) => {
    if (!window.AudioContext && !window.webkitAudioContext) return false;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (state.analyser) return true;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = .74;
    const source = audioContext.createMediaElementSource(state.audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    state.analyser = analyser;
    state.spectrum = new Uint8Array(analyser.frequencyBinCount);
    state.waveform = new Uint8Array(analyser.fftSize);
    const colors = palettes[state.artwork] || palettes["ink-resonance"];
    state.stamps = colors.flatMap((color, index) => [0, 1].map(variant =>
      createPigmentStamp(color, 827 + index * 173 + variant * 71)));
    return true;
  };

  const activate = async (state) => {
    const ticket = ++activation;
    states.forEach((other) => {
      if (other === state) return;
      other.audio.pause();
      reset(other);
    });
    try {
      if (!connect(state)) return;
      await audioContext.resume();
    } catch (_) {
      return; // Keep native controls usable when visualisation is unavailable.
    }
    if (ticket !== activation || state.audio.paused || state.audio.ended) return;
    activeState = state;
    state.lastTime = undefined;
    stopFrame();
    render();
  };

  const attach = (canvas) => {
    const audio = canvas.closest(".work")?.querySelector("audio");
    const context = canvas.getContext("2d");
    if (!audio || !context) return;
    const artwork = canvas.dataset.artwork;
    const state = { canvas, audio, context, artwork, energy: 0, parcels: [],
      bands: [0, 0, 0], visibility: 0, silentFor: 0, hasSignal: false,
      bounds: motionBounds[artwork] || motionBounds["ink-resonance"],
      random: randomFor(Math.floor(Math.random() * 4294967296)),
    };
    states.push(state);
    clear(state);
    audio.addEventListener("play", () => { void activate(state); });
    const deactivate = () => {
      if (activeState === state) {
        activeState = undefined;
        stopFrame();
      }
      reset(state);
    };
    audio.addEventListener("pause", deactivate);
    audio.addEventListener("ended", deactivate);
    audio.addEventListener("seeking", () => reset(state));
    audio.addEventListener("volumechange", () => {
      if (audio.muted || audio.volume === 0) reset(state);
    });
    if (window.ResizeObserver) new ResizeObserver(() => clear(state)).observe(canvas);
    else window.addEventListener("resize", () => clear(state));
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopFrame(); states.forEach(clear); }
    else if (activeState && !activeState.audio.paused) { stopFrame(); render(); }
  });
  document.querySelectorAll(".anonymous-visualizer").forEach(attach);
})();
