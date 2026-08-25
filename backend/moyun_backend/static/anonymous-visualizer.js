(() => {
  "use strict";

  // The artwork is deliberately separate from this transparent canvas. These
  // are responsive gilded sound threads, not an ink-flow, glow, or
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

  const level = (state, spectrum, slot, index) => {
    const next = band(spectrum, index);
    const previous = state.levels[slot] ?? next;
    const smoothed = previous * 0.79 + next * 0.21;
    state.levels[slot] = smoothed;
    return smoothed;
  };

  const strokeThread = (context, points, color, alpha, width) => {
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) * 0.5, (current.y + next.y) * 0.5);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
    context.stroke();
    context.restore();
  };

  const threadPoints = (state, spectrum, slotOffset, count, pointAt) => (
    Array.from({ length: count }, (_, index) => pointAt(index / (count - 1), level(state, spectrum, slotOffset + index, 3 + index * 5)))
  );

  // 墨韻共鳴：three restrained seal-like threads in the dark centre. They
  // breathe with the music without becoming marks, crosses, or particle dots.
  const drawInk = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const energy = average(spectrum, 2, 44);
    for (let lane = 0; lane < 3; lane += 1) {
      const baseY = height * (0.45 + lane * 0.075);
      const points = threadPoints(state, spectrum, lane * 28, 25, (progress, strength) => ({
        x: width * (0.29 + progress * 0.42),
        y: baseY + Math.sin(progress * Math.PI * 1.2 + lane * 0.55) * height * 0.021 - strength * height * (0.035 + energy * 0.03),
      }));
      strokeThread(context, points, palettes["ink-resonance"], 0.22 + energy * 0.36, 0.85 + lane * 0.12);
    }
  };

  // 月下琴弦：short, fine qin strings in the open sky. Each line moves as one
  // whole thread, rather than breaking into isolated visualizer symbols.
  const drawMoon = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const energy = average(spectrum, 3, 46);
    for (let string = 0; string < 5; string += 1) {
      const baseY = height * (0.47 + string * 0.06);
      const points = threadPoints(state, spectrum, 90 + string * 28, 25, (progress, strength) => ({
        x: width * (0.26 + progress * 0.53),
        y: baseY + Math.sin(progress * Math.PI) * (height * 0.007 + strength * height * (0.038 + energy * 0.025)),
      }));
      strokeThread(context, points, palettes["moonlit-strings"], 0.2 + energy * 0.38, 0.72 + string * 0.08);
    }
  };

  // 山水聲譜：one unbroken gold thread following a gentle mountain pass. It is
  // continuous on purpose: a visual line for the score, never a flight path.
  const drawLandscape = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const energy = average(spectrum, 2, 50);
    const points = threadPoints(state, spectrum, 230, 37, (progress, strength) => ({
      x: width * (0.13 + progress * 0.74),
      y: height * (0.59 - Math.sin(progress * Math.PI) * 0.105 + (progress - 0.5) * 0.028) - strength * height * (0.035 + energy * 0.028),
    }));
    strokeThread(context, points, palettes["landscape-score"], 0.36 + energy * 0.42, 1.15 + energy * 0.7);
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
