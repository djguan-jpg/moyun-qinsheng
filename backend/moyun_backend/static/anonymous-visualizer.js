(() => {
  "use strict";

  // The three source artworks remain untouched underneath this transparent
  // canvas. While paused the canvas is empty; during playback the audio's
  // waveform lifts one soft, continuous silk-like veil over the image.
  const palettes = {
    "ink-resonance": ["#71c9bf", "#e7a197"],
    "moonlit-strings": ["#aebbe7", "#d7c7df"],
    "landscape-score": ["#82bbaa", "#ddb09f"],
  };
  const compositions = {
    "ink-resonance": { center: 0.54, slope: -0.035, thickness: 0.085, amplitude: 0.1, echo: 0.11 },
    "moonlit-strings": { center: 0.51, slope: 0.075, thickness: 0.072, amplitude: 0.082, echo: -0.105 },
    "landscape-score": { center: 0.56, slope: -0.055, thickness: 0.078, amplitude: 0.088, echo: 0.095 },
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
    const smoothed = previous * 0.82 + next * 0.18;
    state.levels[slot] = smoothed;
    return smoothed;
  };

  const waveformAt = (waveform, progress) => {
    const center = Math.round(progress * (waveform.length - 1));
    let total = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const index = Math.max(0, Math.min(waveform.length - 1, center + offset));
      total += (waveform[index] - 128) / 128;
      count += 1;
    }
    return total / count;
  };

  const rgba = (hex, alpha) => {
    const value = hex.slice(1);
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  };

  const smoothPath = (context, points, move = true) => {
    const first = points[0];
    if (move) context.moveTo(first.x, first.y);
    else context.lineTo(first.x, first.y);
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) * 0.5, (current.y + next.y) * 0.5);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
  };

  const fillSilkBand = (context, geometry, colors, alpha) => {
    const gradient = context.createLinearGradient(0, 0, geometry.width, geometry.height);
    gradient.addColorStop(0, rgba(colors[0], 0));
    gradient.addColorStop(0.24, rgba(colors[0], 0.72));
    gradient.addColorStop(0.58, rgba(colors[1], 0.68));
    gradient.addColorStop(1, rgba(colors[1], 0));
    context.save();
    context.globalAlpha = alpha;
    context.globalCompositeOperation = "screen";
    context.fillStyle = gradient;
    context.shadowColor = rgba(colors[0], 0.3);
    context.shadowBlur = Math.max(8, geometry.height * 0.045);
    context.beginPath();
    smoothPath(context, geometry.upper);
    const lower = [...geometry.lower].reverse();
    smoothPath(context, lower, false);
    context.closePath();
    context.fill();
    context.restore();
  };

  const silkGeometry = (state, waveform, options) => {
    const { width, height } = state;
    const upper = [];
    const lower = [];
    const samples = 34;
    for (let index = 0; index <= samples; index += 1) {
      const progress = index / samples;
      const waveformLift = waveformAt(waveform, progress) * options.amplitude;
      const slowLift = Math.sin(progress * Math.PI * 2 + options.phase) * options.drift;
      const center = height * (
        options.center
        + options.slope * (progress - 0.5)
        + waveformLift
        + slowLift
      );
      const taper = 0.34 + Math.sin(progress * Math.PI) * 0.66;
      const half = height * options.thickness * taper;
      upper.push({ x: width * progress, y: center - half });
      lower.push({ x: width * progress, y: center + half });
    }
    return { width, height, upper, lower };
  };

  const drawSoundVeil = (state, spectrum, waveform) => {
    const { context } = clear(state);
    const bass = level(state, spectrum, 0, 7, 5);
    const mid = level(state, spectrum, 1, 34, 9);
    const treble = level(state, spectrum, 2, 78, 12);
    const activity = Math.min(1, Math.max(0, (bass * 0.48 + mid * 0.38 + treble * 0.14 - 0.018) * 3.1));
    if (activity < 0.018) return;

    const colors = palettes[state.artwork] || palettes["ink-resonance"];
    const composition = compositions[state.artwork] || compositions["ink-resonance"];
    const phase = state.audio.currentTime * (0.72 + treble * 0.5);
    const primary = silkGeometry(state, waveform, {
      center: composition.center,
      slope: composition.slope,
      thickness: composition.thickness * (0.72 + bass * 0.58),
      amplitude: composition.amplitude * (0.38 + mid * 1.25),
      drift: activity * 0.012,
      phase,
    });
    fillSilkBand(context, primary, colors, 0.055 + activity * 0.16);

    const echo = silkGeometry(state, waveform, {
      center: composition.center + composition.echo,
      slope: -composition.slope * 0.65,
      thickness: composition.thickness * (0.34 + treble * 0.28),
      amplitude: composition.amplitude * (0.16 + treble * 0.45),
      drift: activity * 0.008,
      phase: phase + 1.8,
    });
    fillSilkBand(context, echo, [colors[1], colors[0]], 0.025 + activity * 0.07);
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
    activeState.analyser.getByteTimeDomainData(activeState.waveform);
    drawSoundVeil(activeState, activeState.spectrum, activeState.waveform);
    frameRequest = requestAnimationFrame(render);
  };

  const connect = (state) => {
    if (!window.AudioContext && !window.webkitAudioContext) return false;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (state.analyser) return true;
    state.analyser = audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    state.analyser.smoothingTimeConstant = 0.82;
    state.spectrum = new Uint8Array(state.analyser.frequencyBinCount);
    state.waveform = new Uint8Array(state.analyser.fftSize);
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
