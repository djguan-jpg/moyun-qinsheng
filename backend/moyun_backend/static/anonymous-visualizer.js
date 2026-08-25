(() => {
  "use strict";

  // The three source artworks remain untouched underneath this transparent
  // canvas. A canvas has no resting artwork of its own: every visible facet
  // is derived from the currently playing audio.
  const palettes = {
    "ink-resonance": ["#70d8d1", "#ff8977"],
    "moonlit-strings": ["#91a8ff", "#d8c4ff"],
    "landscape-score": ["#55c7a5", "#ff9c7a"],
  };
  const states = [];
  let audioContext;
  let activeState;
  let frameRequest;

  const average = (values, start, end) => {
    let total = 0;
    const upper = Math.min(values.length, end);
    for (let index = start; index < upper; index += 1) total += values[index];
    return upper > start ? total / ((upper - start) * 255) : 0;
  };

  const band = (spectrum, index, spread = 2) => {
    const start = Math.min(spectrum.length - 1, Math.max(0, index - spread));
    return average(spectrum, start, start + spread * 2 + 1);
  };

  const fit = (state) => {
    const bounds = state.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (width === state.width && height === state.height && ratio === state.ratio) return;
    state.width = width;
    state.height = height;
    state.ratio = ratio;
    state.canvas.width = width * ratio;
    state.canvas.height = height * ratio;
  };

  const clear = (state) => {
    fit(state);
    const { context, ratio, width, height } = state;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  };

  const level = (state, spectrum, slot, index, spread = 2) => {
    const next = band(spectrum, index, spread);
    const previous = state.levels[slot] ?? next;
    const smoothed = previous * 0.76 + next * 0.24;
    state.levels[slot] = smoothed;
    return smoothed;
  };

  const fillFacet = (context, points, color, alpha) => {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
    context.restore();
  };

  // 折聲窗：audio opens a set of central, translucent folding panels.
  const drawFoldingWindows = (state, spectrum, colors) => {
    const { context, width, height } = clear(state);
    const bass = level(state, spectrum, 0, 6, 4);
    for (let index = 0; index < 3; index += 1) {
      const energy = level(state, spectrum, 1 + index, 19 + index * 13, 4);
      const centerX = width * 0.5;
      const gap = width * (0.018 + index * 0.052);
      const reach = width * (0.075 + index * 0.035 + energy * 0.055);
      const halfHeight = height * (0.14 + index * 0.055 + energy * 0.14 + bass * 0.06);
      const lean = height * (0.028 + energy * 0.09);
      const top = height * 0.5 - halfHeight;
      const bottom = height * 0.5 + halfHeight;
      const alpha = 0.1 + energy * 0.25;
      fillFacet(context, [
        { x: centerX - gap, y: top + lean },
        { x: centerX - gap - reach, y: top },
        { x: centerX - gap - reach * 0.66, y: bottom - lean },
        { x: centerX - gap, y: bottom },
      ], colors[index % 2], alpha);
      fillFacet(context, [
        { x: centerX + gap, y: top },
        { x: centerX + gap + reach, y: top + lean },
        { x: centerX + gap + reach * 0.66, y: bottom },
        { x: centerX + gap, y: bottom - lean },
      ], colors[(index + 1) % 2], alpha);
    }
  };

  // 旋頁：a small set of broad facets pivots around the sound's midrange.
  const drawTurningPages = (state, spectrum, colors) => {
    const { context, width, height } = clear(state);
    const centerX = width * 0.5;
    const centerY = height * 0.52;
    for (let index = 0; index < 4; index += 1) {
      const energy = level(state, spectrum, 8 + index, 40 + index * 15, 5);
      const rise = level(state, spectrum, 12 + index, 12 + index * 8, 3);
      const span = width * (0.12 + index * 0.042 + energy * 0.08);
      const depth = height * (0.075 + energy * 0.17);
      const shift = height * (index - 1.5) * 0.055;
      const tilt = height * (rise - 0.5) * 0.13;
      fillFacet(context, [
        { x: centerX - span, y: centerY + shift - tilt },
        { x: centerX + span * 0.16, y: centerY + shift - depth },
        { x: centerX + span, y: centerY + shift + tilt },
        { x: centerX - span * 0.16, y: centerY + shift + depth },
      ], colors[index % 2], 0.11 + energy * 0.27);
    }
  };

  // 層台：offset planes expand and contract at independent frequency bands.
  const drawLayeredStages = (state, spectrum, colors) => {
    const { context, width, height } = clear(state);
    for (let index = 0; index < 4; index += 1) {
      const energy = level(state, spectrum, 16 + index, 73 + index * 12, 5);
      const pulse = level(state, spectrum, 20 + index, 8 + index * 6, 3);
      const y = height * (0.34 + index * 0.105);
      const left = width * (0.14 + index * 0.052 - energy * 0.035);
      const right = width * (0.86 - index * 0.052 + energy * 0.035);
      const depth = height * (0.045 + energy * 0.11);
      const skew = width * (pulse - 0.5) * 0.075;
      fillFacet(context, [
        { x: left + skew, y },
        { x: right + skew, y: y + depth * 0.38 },
        { x: right - skew * 0.45, y: y + depth },
        { x: left - skew * 0.45, y: y + depth * 0.62 },
      ], colors[index % 2], 0.1 + energy * 0.25);
    }
  };

  const draw = (state, spectrum) => {
    const colors = palettes[state.artwork] || palettes["ink-resonance"];
    if (state.artwork === "moonlit-strings") drawTurningPages(state, spectrum, colors);
    else if (state.artwork === "landscape-score") drawLayeredStages(state, spectrum, colors);
    else drawFoldingWindows(state, spectrum, colors);
  };

  const stopFrame = () => {
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = undefined;
  };

  const render = () => {
    if (!activeState || activeState.audio.paused || activeState.audio.ended) {
      stopFrame();
      return;
    }
    activeState.analyser.getByteFrequencyData(activeState.spectrum);
    draw(activeState, activeState.spectrum);
    frameRequest = requestAnimationFrame(render);
  };

  const connect = (state) => {
    if (!window.AudioContext && !window.webkitAudioContext) return false;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (state.analyser) return true;
    state.analyser = audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    state.analyser.smoothingTimeConstant = 0.76;
    state.spectrum = new Uint8Array(state.analyser.frequencyBinCount);
    const source = audioContext.createMediaElementSource(state.audio);
    source.connect(state.analyser);
    state.analyser.connect(audioContext.destination);
    return true;
  };

  const activate = async (state) => {
    states.forEach((otherState) => {
      if (otherState === state) return;
      otherState.audio.pause();
      clear(otherState);
    });
    if (!connect(state)) return;
    try {
      await audioContext.resume();
    } catch (_) {
      return;
    }
    activeState = state;
    stopFrame();
    render();
  };

  const attach = (canvas) => {
    const card = canvas.closest(".work");
    const audio = card?.querySelector("audio");
    const context = canvas.getContext("2d");
    if (!audio || !context) return;
    const state = { canvas, audio, context, artwork: canvas.dataset.artwork, levels: [] };
    states.push(state);
    clear(state);
    audio.addEventListener("play", () => { void activate(state); });
    audio.addEventListener("pause", () => {
      if (activeState === state) activeState = undefined;
      stopFrame();
      clear(state);
    });
    audio.addEventListener("ended", () => clear(state));
    if (window.ResizeObserver) new ResizeObserver(() => clear(state)).observe(canvas);
    else window.addEventListener("resize", () => clear(state));
  };

  document.querySelectorAll(".anonymous-visualizer").forEach(attach);
})();
