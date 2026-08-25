(() => {
  "use strict";

  const themes = {
    "ink-resonance": { ink: "#0c1918", paper: "#263937", gold: "#dcc27c", mist: "#91a89a" },
    "moonlit-strings": { ink: "#183331", paper: "#f2e5c1", gold: "#d2a848", mist: "#69877c" },
    "landscape-score": { ink: "#102927", paper: "#dbe2cf", gold: "#e0bd65", mist: "#4e7569" },
  };
  const emptySpectrum = new Uint8Array(128);
  const states = [];
  let audioContext;
  let activeState;
  let animationFrame;

  const average = (data, start, end) => {
    let total = 0;
    const upper = Math.min(data.length, end);
    for (let index = start; index < upper; index += 1) total += data[index];
    return upper > start ? total / ((upper - start) * 255) : 0;
  };

  const resize = (state) => {
    const bounds = state.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (state.width === width && state.height === height && state.ratio === ratio) return;
    state.width = width;
    state.height = height;
    state.ratio = ratio;
    state.canvas.width = width * ratio;
    state.canvas.height = height * ratio;
  };

  const begin = (state) => {
    resize(state);
    const { context, ratio, width, height } = state;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
  };

  const drawInk = (state, spectrum) => {
    const { context, width, height } = begin(state);
    const theme = state.theme;
    const energy = average(spectrum, 2, 40);
    const centerX = width * 0.5;
    const centerY = height * 0.54;
    const radius = Math.min(width, height) * (0.17 + energy * 0.08);
    const wash = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.72);
    wash.addColorStop(0, "#1b302d");
    wash.addColorStop(0.58, theme.ink);
    wash.addColorStop(1, "#081110");
    context.fillStyle = wash;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#d9c47c";
    context.globalAlpha = 0.24 + energy * 0.5;
    context.lineWidth = 1;
    for (let ring = 0; ring < 6; ring += 1) {
      const bin = spectrum[(ring * 6) + 4] / 255;
      context.beginPath();
      context.ellipse(centerX, centerY, radius + ring * 16 + bin * 18, radius * 0.48 + ring * 7 + bin * 9, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = "#081211";
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = theme.gold;
    context.globalAlpha = 0.72;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  };

  const drawMoon = (state, spectrum) => {
    const { context, width, height } = begin(state);
    const theme = state.theme;
    const energy = average(spectrum, 3, 42);
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#f6ebc9");
    sky.addColorStop(1, "#a9b8a4");
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#fff6d5";
    context.shadowColor = "#f6df94";
    context.shadowBlur = 20 + energy * 36;
    context.beginPath();
    context.arc(width * 0.25, height * 0.32, Math.min(width, height) * 0.15, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "#31514a";
    context.globalAlpha = 0.72;
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(width * 0.15, height * 0.6);
    context.lineTo(width * 0.35, height * 0.78);
    context.lineTo(width * 0.56, height * 0.48);
    context.lineTo(width * 0.78, height * 0.72);
    context.lineTo(width, height * 0.43);
    context.lineTo(width, height);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = theme.gold;
    context.lineWidth = 1.15;
    for (let string = 0; string < 7; string += 1) {
      const y = height * (0.48 + string * 0.055);
      const amplitude = 3 + (spectrum[(string * 5) + 5] / 255) * (14 + energy * 26);
      context.beginPath();
      context.moveTo(-8, y);
      context.bezierCurveTo(width * 0.31, y - amplitude, width * 0.62, y + amplitude, width + 8, y - amplitude * 0.16);
      context.stroke();
    }
  };

  const drawLandscape = (state, spectrum) => {
    const { context, width, height } = begin(state);
    const theme = state.theme;
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, theme.paper);
    sky.addColorStop(1, "#173c38");
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    context.fillStyle = theme.mist;
    context.globalAlpha = 0.38;
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(width * 0.12, height * 0.35);
    context.lineTo(width * 0.26, height * 0.63);
    context.lineTo(width * 0.48, height * 0.27);
    context.lineTo(width * 0.7, height * 0.68);
    context.lineTo(width * 0.88, height * 0.34);
    context.lineTo(width, height * 0.61);
    context.lineTo(width, height);
    context.closePath();
    context.fill();
    context.globalAlpha = 1;
    const centerY = height * 0.57;
    context.strokeStyle = theme.gold;
    context.shadowColor = "#f5dea0";
    context.shadowBlur = 7;
    context.lineWidth = 2;
    context.beginPath();
    for (let point = 0; point <= 72; point += 1) {
      const value = spectrum[Math.min(spectrum.length - 1, point + 2)] / 255;
      const x = (point / 72) * width;
      const y = centerY - (value - 0.08) * height * 0.56;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.shadowBlur = 0;
  };

  const draw = (state, spectrum = emptySpectrum) => {
    if (state.artwork === "moonlit-strings") drawMoon(state, spectrum);
    else if (state.artwork === "landscape-score") drawLandscape(state, spectrum);
    else drawInk(state, spectrum);
  };

  const stopAnimation = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
  };

  const render = () => {
    if (!activeState || activeState.audio.paused || activeState.audio.ended) {
      stopAnimation();
      return;
    }
    activeState.analyser.getByteFrequencyData(activeState.spectrum);
    draw(activeState, activeState.spectrum);
    animationFrame = requestAnimationFrame(render);
  };

  const connectAnalyser = (state) => {
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
      draw(otherState);
    });
    if (!connectAnalyser(state)) return;
    try {
      await audioContext.resume();
    } catch (_) {
      return;
    }
    activeState = state;
    stopAnimation();
    render();
  };

  const attach = (canvas) => {
    const card = canvas.closest(".work");
    const audio = card?.querySelector("audio");
    const context = canvas.getContext("2d");
    if (!audio || !context) return;
    const state = { canvas, audio, context, artwork: canvas.dataset.artwork, theme: themes[canvas.dataset.artwork] || themes["ink-resonance"] };
    states.push(state);
    draw(state);
    audio.addEventListener("play", () => { void activate(state); });
    audio.addEventListener("pause", () => {
      if (activeState !== state) return;
      activeState = undefined;
      stopAnimation();
      draw(state);
    });
    audio.addEventListener("ended", () => draw(state));
    if (window.ResizeObserver) new ResizeObserver(() => draw(state)).observe(canvas);
    else window.addEventListener("resize", () => draw(state));
  };

  document.querySelectorAll(".anonymous-visualizer").forEach(attach);
})();
