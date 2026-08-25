(() => {
  "use strict";

  const palettes = {
    "ink-resonance": "#e4c878",
    "moonlit-strings": "#c99d3d",
    "landscape-score": "#e5bf61",
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

  const drawInk = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const energy = average(spectrum, 2, 40);
    const centerX = width * 0.5;
    const centerY = height * 0.53;
    const base = Math.min(width, height) * (0.14 + energy * 0.05);
    context.strokeStyle = palettes["ink-resonance"];
    context.lineWidth = 1.1;
    for (let ring = 0; ring < 6; ring += 1) {
      const bin = spectrum[(ring * 5) + 4] / 255;
      context.globalAlpha = 0.14 + bin * 0.55;
      context.beginPath();
      context.ellipse(centerX, centerY, base + ring * 14 + bin * 14, base * 0.5 + ring * 5 + bin * 7, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
  };

  const drawMoon = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const energy = average(spectrum, 3, 42);
    context.strokeStyle = palettes["moonlit-strings"];
    context.shadowColor = "#f6dc8d";
    context.shadowBlur = 3 + energy * 12;
    context.lineWidth = 1.05;
    for (let string = 0; string < 7; string += 1) {
      const y = height * (0.43 + string * 0.052);
      const amplitude = 2 + (spectrum[(string * 5) + 6] / 255) * (11 + energy * 24);
      context.globalAlpha = 0.2 + (spectrum[(string * 5) + 6] / 255) * 0.78;
      context.beginPath();
      context.moveTo(-6, y);
      context.bezierCurveTo(width * 0.29, y - amplitude, width * 0.66, y + amplitude, width + 6, y - amplitude * 0.12);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;
  };

  const drawLandscape = (state, spectrum) => {
    const { context, width, height } = clear(state);
    const centerY = height * 0.56;
    context.strokeStyle = palettes["landscape-score"];
    context.shadowColor = "#f7db86";
    context.shadowBlur = 6;
    context.lineWidth = 1.8;
    context.globalAlpha = 0.84;
    context.beginPath();
    for (let point = 0; point <= 72; point += 1) {
      const value = spectrum[Math.min(spectrum.length - 1, point + 2)] / 255;
      const x = (point / 72) * width;
      const y = centerY - (value - 0.06) * height * 0.5;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.globalAlpha = 1;
    context.shadowBlur = 0;
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
