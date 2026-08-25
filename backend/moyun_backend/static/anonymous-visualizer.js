(() => {
  "use strict";

  // Original paintings stay untouched <img> elements. No idle/baked animation.
  // 山水設色：花青、石青、石綠、赭石、淡墨（screen approximations）。
  const palettes = {
    "ink-resonance": ["#638b91", "#73927d", "#b19b76", "#385b61"],
    "moonlit-strings": ["#355568", "#576f68", "#a18460", "#303b3b"],
    "landscape-score": ["#436b67", "#718b6a", "#9b7952", "#344a50"],
  };
  // Overlapping washes in negative space, clear of the moon and foreground.
  const compositions = {
    "ink-resonance": [[.43, .49, .25, .83], [.57, .54, .22, .94], [.52, .64, .14, .71], [.39, .58, .16, .69]],
    "moonlit-strings": [[.42, .44, .23, .69], [.58, .48, .20, .79], [.52, .57, .14, .62], [.35, .50, .14, .74]],
    "landscape-score": [[.40, .49, .23, .68], [.56, .52, .22, .78], [.61, .59, .13, .67], [.35, .56, .15, .71]],
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
    state.wetness = 0;
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

  const drawInkBloom = (state) => {
    clear(state);
    const amplitude = rms(state.waveform);
    // Smoothed frequency bins must never create fake movement during silence.
    if (amplitude < .003 || state.audio.muted || state.audio.volume === 0) {
      state.energy = 0;
      state.lastTime = state.audio.currentTime;
      return;
    }
    const now = state.audio.currentTime;
    const delta = Math.max(0, Math.min(.05, now - (state.lastTime ?? now)));
    state.lastTime = now;
    const signal = Math.min(1, amplitude * state.audio.volume * 7);
    const follow = 1 - Math.exp(-delta * (signal > state.energy ? 9 : 3));
    state.energy += (signal - state.energy) * follow;
    // Diffusion advances only with integrated sound energy, not wall-clock time.
    state.wetness += delta * state.energy * .36;
    const bass = average(state.spectrum, 1, 7);
    const mid = average(state.spectrum, 7, 32);
    const high = average(state.spectrum, 32, 100);
    const bands = [bass, mid, high, (bass + mid) * .5];
    const composition = compositions[state.artwork] || compositions["ink-resonance"];
    const movement = reducedMotion?.matches ? 0 : 1;
    const { context, width, height } = state;
    context.globalCompositeOperation = "source-over";
    composition.forEach(([x, y, radius, aspect], index) => {
      const response = bands[index];
      const diffusion = Math.sin(state.wetness + index * .9) * .06 * movement;
      const size = width * radius * 2 * (.76 + state.energy * .32 + response * .12 + diffusion);
      const shift = Math.sin(state.wetness * .65 + index) * width * .012 * movement;
      const pigmentStrength = [.94, .72, .28, .58][index];
      context.globalAlpha = Math.min(.88, state.energy * pigmentStrength);
      context.drawImage(state.stamps[index], width * x - size / 2 + shift,
        height * y - size * aspect / 2, size, size * aspect);
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
    state.stamps = colors.map((color, index) => createPigmentStamp(color, 827 + index * 173));
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
    const state = { canvas, audio, context, artwork: canvas.dataset.artwork, energy: 0, wetness: 0 };
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
