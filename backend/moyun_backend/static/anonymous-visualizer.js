(() => {
  "use strict";

  // The artwork is deliberately separate from this transparent canvas. These
  // are responsive gilded "inscription marks", not an ink-flow, glow, or
  // conventional spectrum-bar treatment.
  const palettes = {
    "ink-resonance": "#e7ca73",
    "moonlit-strings": "#a97928",
    "landscape-score": "#d5a846",
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
    context.lineCap = "round";
    context.lineJoin = "round";
    return { context, width, height };
  };

  const inscription = (context, x, y, angle, length, strength, color, thickness = 1) => {
    const alpha = 0.1 + strength * 0.82;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = thickness + strength * 0.9;
    context.beginPath();
    context.moveTo(-length * 0.5, 0);
    context.lineTo(length * 0.5, 0);
    context.stroke();
    // A short counter-mark makes each segment a carved music glyph rather
    // than a conventional equalizer bar.
    context.globalAlpha = alpha * 0.72;
    context.lineWidth = Math.max(0.8, thickness * 0.72);
    context.beginPath();
    context.moveTo(length * 0.2, -3 - strength * 3);
    context.lineTo(length * 0.2, 3 + strength * 3);
    context.stroke();
    context.restore();
  };

  // 墨韻共鳴：central "bronze-inscription seal" strokes suspended in the
  // dark well of the image. The phrase fans outward with the musical bands.
  const drawInk = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const energy = average(spectrum, 2, 44);
    const centerX = width * 0.5;
    const centerY = height * 0.54;
    const scale = Math.min(width, height);
    for (let mark = 0; mark < 15; mark += 1) {
      const strength = band(spectrum, 4 + mark * 5);
      const row = Math.floor(mark / 5);
      const column = mark % 5;
      const x = centerX + (column - 2) * scale * 0.075 + row * scale * 0.008;
      const y = centerY + (row - 1) * scale * 0.105 + (column - 2) * scale * 0.016;
      const angle = -0.28 + row * 0.14 + (column - 2) * 0.08;
      const length = scale * (0.035 + strength * 0.065 + energy * 0.018);
      inscription(context, x, y, angle, length, strength, palettes["ink-resonance"], 0.9);
    }
  };

  // 月下琴弦：a crescent-shaped run of plucked score marks, deliberately not
  // full-width strings or a light halo. Each glyph answers a different band.
  const drawMoon = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const centerX = width * 0.54;
    const centerY = height * 0.56;
    const radiusX = width * 0.25;
    const radiusY = height * 0.17;
    for (let mark = 0; mark < 13; mark += 1) {
      const strength = band(spectrum, 7 + mark * 6);
      const progress = mark / 12;
      const theta = Math.PI * (0.18 + progress * 0.72);
      const x = centerX + Math.cos(theta) * radiusX;
      const y = centerY + Math.sin(theta) * radiusY;
      const tangent = theta + Math.PI * 0.5;
      const length = Math.min(width, height) * (0.038 + strength * 0.052);
      inscription(context, x, y, tangent, length, strength, palettes["moonlit-strings"], 0.85);
    }
  };

  // 山水聲譜：a broken gold route that crosses the valley. Sound changes the
  // weight of consecutive route-glyphs instead of drawing a waveform.
  const drawLandscape = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const energy = average(spectrum, 2, 50);
    const points = 17;
    for (let mark = 0; mark < points; mark += 1) {
      const progress = mark / (points - 1);
      const strength = band(spectrum, 3 + mark * 6);
      const x = width * (0.16 + progress * 0.68);
      const y = height * (0.59 - Math.sin(progress * Math.PI) * 0.13 + (progress - 0.5) * 0.06);
      const angle = -0.21 + Math.cos(progress * Math.PI) * 0.2;
      const length = Math.min(width, height) * (0.026 + strength * 0.052 + energy * 0.012);
      inscription(context, x, y, angle, length, strength, palettes["landscape-score"], 0.9);
    }
  };

  const draw = (state, spectrum) => {
    if (state.artwork === "moonlit-strings") drawMoon(state, spectrum);
    else if (state.artwork === "landscape-score") drawLandscape(state, spectrum);
    else drawInk(state, spectrum);
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
    state.analyser.smoothingTimeConstant = 0.78;
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
    const state = { canvas, audio, context, artwork: canvas.dataset.artwork };
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
