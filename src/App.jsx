'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload,
  RotateCcw,
  Video,
  Disc,
  Download,
  Image as ImageIcon,
  Layers,
} from 'lucide-react';

/* ----------------------------- 1. CONFIG ----------------------------- */

const ALGORITHM_CATEGORIES = {
  'Error Diffusion': {
    'Floyd-Steinberg': { divisor: 16, offsets: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
    Atkinson: { divisor: 8, offsets: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
    'Jarvis-Judice-Ninke': {
      divisor: 48,
      offsets: [
        [1, 0, 7], [2, 0, 5],
        [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
        [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1],
      ],
    },
    Stucki: {
      divisor: 42,
      offsets: [
        [1, 0, 8], [2, 0, 4],
        [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
        [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1],
      ],
    },
    Burkes: {
      divisor: 32,
      offsets: [
        [1, 0, 8], [2, 0, 4],
        [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
      ],
    },
    Sierra: {
      divisor: 32,
      offsets: [
        [1, 0, 5], [2, 0, 3],
        [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
        [-1, 2, 2], [0, 2, 3], [1, 2, 2],
      ],
    },
    'Two-Row Sierra': {
      divisor: 16,
      offsets: [
        [1, 0, 4], [2, 0, 3],
        [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1],
      ],
    },
    'Sierra Lite': { divisor: 4, offsets: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
    Ostromoukhov: { type: 'variable', table: true },
  },
  'Ordered (Bitmap)': {
    'Ordered 2x2': 2,
    'Ordered 4x4': 4,
    'Ordered 8x8': 8,
    'Ordered 16x16': 16,
    'Knoll (Clustered)': 'knoll',
    'Horizontal Lines': 'hlines',
    'Vertical Lines': 'vlines',
    'Diagonal Lines': 'dlines',
  },
  Organic: {
    'Blue Noise': 'bluenoise',
    'White Noise': 'whitenoise',
    'Voronoi Stippling': 'voronoi',
    'Stipple Pattern': 'stipple',
  },
  Modulation: {
    'Sine Wave X': { axis: 'x', wave: 'sine' },
    'Sine Wave Y': { axis: 'y', wave: 'sine' },
    'Circular Wave': { axis: 'radial', wave: 'sine' },
    'Square Wave': { axis: 'x', wave: 'square' },
    'Riemersma (Hilbert)': 'riemersma',
  },
  Pattern: {
    Checkerboard: 'checker',
    'Grid Pattern': 'grid',
    'Random Dots': 'random',
    'Interleaved Gradient': 'gradient',
  },
};

const PALETTE_PRESETS = {
  CyberGB: [
    ['#020a00', '#4c7f00', '#9bbc0f', '#e5ff8a'],
    ['#000000', '#9bbc0f', '#e5ff8a'],
  ],
  Print: [['#000000', '#00ffff', '#ff00ff', '#ffff00', '#ffffff']],
};

/* ---------------------------- 2. HELPERS ----------------------------- */

const getBayerMatrix = size => {
  if (size === 2) return [[0, 2], [3, 1]].map(r => r.map(v => v * 64));
  if (size === 4)
    return [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ].map(r => r.map(v => v * 16));
  if (size === 8) {
    const m = [
      [0, 32, 8, 40, 2, 34, 10, 42],
      [48, 16, 56, 24, 50, 18, 58, 26],
      [12, 44, 4, 36, 14, 46, 6, 38],
      [60, 28, 52, 20, 62, 30, 54, 22],
      [3, 35, 11, 43, 1, 33, 9, 41],
      [51, 19, 59, 27, 49, 17, 57, 25],
      [15, 47, 7, 39, 13, 45, 5, 37],
      [63, 31, 55, 23, 61, 29, 53, 21],
    ];
    return m.map(r => r.map(v => v * 4));
  }
  if (size === 16) {
    const m8 = getBayerMatrix(8);
    const m = new Array(16).fill(0).map(() => new Array(16).fill(0));
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        m[y][x] = m8[y % 8][x % 8] + m8[Math.floor(y / 8)][Math.floor(x / 8)] / 64;
      }
    }
    return m;
  }
  return [[0]];
};

const getKnollMatrix = () =>
  [
    [6, 12, 10, 16],
    [8, 4, 14, 2],
    [11, 15, 9, 13],
    [5, 7, 3, 1],
  ].map(r => r.map(v => v * 16));

const generateBlueNoise = (w, h) => {
  const noise = new Uint8ClampedArray(w * h);
  for (let i = 0; i < noise.length; i++) {
    const x = i % w;
    const y = Math.floor(i / w);
    noise[i] = (Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 255;
  }
  return noise;
};

const hexToRgb = hex => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
};

/* ------------------------ 3. IMAGE PROCESSING ------------------------ */

const processImage = (imageData, settings) => {
  const { width, height, data } = imageData;
  const {
    scale,
    style,
    palette,
    lineScale,
    bleed,
    contrast,
    midtones,
    highlights,
    depth,
    invert,
    threshold,
  } = settings;

  const s = Math.max(1, scale);
  const scaledW = Math.max(1, Math.floor(width / s));
  const scaledH = Math.max(1, Math.floor(height / s));
  const gray = new Uint8ClampedArray(scaledW * scaledH);

  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const srcX = Math.floor(x * s);
      const srcY = Math.floor(y * s);
      const srcIdx = (srcY * width + srcX) * 4;
      gray[y * scaledW + x] = Math.floor(
        0.299 * data[srcIdx] + 0.587 * data[srcIdx + 1] + 0.114 * data[srcIdx + 2],
      );
    }
  }

  const adjusted = applyAdjustments(gray, { contrast, midtones, highlights, invert, threshold });
  let dithered = applyDither(adjusted, scaledW, scaledH, style, lineScale, bleed);
  if (depth > 0) dithered = applyDepth(dithered, scaledW, scaledH, depth);
  const colored = applyPalette(dithered, palette);

  const output = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = Math.floor(x / s);
      const srcY = Math.floor(y / s);
      const srcIdx = (srcY * scaledW + srcX) * 3;
      const dstIdx = (y * width + x) * 4;
      if (srcIdx < colored.length) {
        output.data[dstIdx] = colored[srcIdx];
        output.data[dstIdx + 1] = colored[srcIdx + 1];
        output.data[dstIdx + 2] = colored[srcIdx + 2];
        output.data[dstIdx + 3] = 255;
      }
    }
  }
  return output;
};

const applyAdjustments = (gray, { contrast, midtones, highlights, invert, threshold }) => {
  const adjusted = new Uint8ClampedArray(gray);
  const lut = new Uint8ClampedArray(256);
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const bias = 128 - threshold;

  for (let i = 0; i < 256; i++) {
    let v = i + bias;
    if (contrast !== 45) v = contrastFactor * (v - 128) + 128;
    v = Math.max(0, Math.min(255, v));

    let norm = v / 255;
    if (norm < 0.5) norm = norm * (midtones / 50);
    else norm = 0.5 + (norm - 0.5) * (highlights / 50);
    v = norm * 255;

    if (invert) v = 255 - v;
    lut[i] = v;
  }

  for (let i = 0; i < gray.length; i++) adjusted[i] = lut[gray[i]];
  return adjusted;
};

const applyDither = (gray, w, h, style, lineScale, bleed) => {
  let algo = null;
  let category = null;

  for (const [cat, algos] of Object.entries(ALGORITHM_CATEGORIES)) {
    if (algos[style]) {
      algo = algos[style];
      category = cat;
      break;
    }
  }
  if (!algo || !category) return gray;

  if (category === 'Error Diffusion') {
    if (algo.type === 'variable') return applyOstromoukhov(gray, w, h);
    const pixels = new Float32Array(gray);
    const { divisor, offsets } = algo;
    const bleedFactor = 0.5 + bleed / 100;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const oldVal = pixels[idx];
        const newVal = oldVal > 127 ? 255 : 0;
        pixels[idx] = newVal;
        const err = (oldVal - newVal) * bleedFactor;
        for (const [dx, dy, weight] of offsets) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            pixels[ny * w + nx] += (err * weight) / divisor;
          }
        }
      }
    }
    return Uint8ClampedArray.from(pixels.map(v => Math.max(0, Math.min(255, v))));
  }

  if (category === 'Ordered (Bitmap)') {
    const output = new Uint8ClampedArray(w * h);
    const isMatrix = typeof algo === 'number' || algo === 'knoll';
    const matrix = isMatrix ? (typeof algo === 'number' ? getBayerMatrix(algo) : getKnollMatrix()) : null;
    const size = matrix ? matrix.length : 0;

    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      let t = 127;
      if (isMatrix && matrix) t = matrix[y % size][x % size];
      else {
        if (algo === 'hlines') t = y % lineScale < lineScale / 2 ? 20 : 230;
        else if (algo === 'vlines') t = x % lineScale < lineScale / 2 ? 20 : 230;
        else if (algo === 'dlines') t = (x + y) % lineScale < lineScale / 2 ? 20 : 230;
      }
      output[i] = gray[i] > t ? 255 : 0;
    }
    return output;
  }

  if (category === 'Organic') {
    const output = new Uint8ClampedArray(w * h);
    if (algo === 'bluenoise') {
      const noise = generateBlueNoise(w, h);
      for (let i = 0; i < gray.length; i++) output[i] = gray[i] > noise[i] ? 255 : 0;
    } else if (algo === 'whitenoise') {
      for (let i = 0; i < gray.length; i++) output[i] = gray[i] > Math.random() * 255 ? 255 : 0;
    } else {
      for (let i = 0; i < gray.length; i++) output[i] = Math.random() > gray[i] / 255 ? 255 : 0;
    }
    return output;
  }

  if (category === 'Modulation') {
    if (algo === 'riemersma') return applyRiemersma(gray, w, h, lineScale);
    const output = new Uint8ClampedArray(w * h);
    const { axis, wave } = algo;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t = 127;
        const val = lineScale < 1 ? 1 : lineScale;
        if (axis === 'x') {
          t = wave === 'sine' ? 127.5 + 127.5 * Math.sin((x * val) / 10) : (Math.floor(x / val) % 2) * 255;
        } else if (axis === 'y') {
          t = 127.5 + 127.5 * Math.sin((y * val) / 10);
        } else if (axis === 'radial') {
          const dist = Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2);
          t = 127.5 + 127.5 * Math.sin((dist * val) / 10);
        }
        const idx = y * w + x;
        output[idx] = gray[idx] > t ? 255 : 0;
      }
    }
    return output;
  }

  if (category === 'Pattern') {
    const output = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = Math.floor(i / w);
      let k = true;
      if (algo === 'checker') k = (x + y) % 2 === 0;
      else if (algo === 'grid') k = x % lineScale === 0 || y % lineScale === 0;
      else if (algo === 'random') k = Math.random() > 0.5;
      else if (algo === 'gradient') k = gray[i] > ((x * y) % 255);
      output[i] = k ? (gray[i] > 127 ? 255 : 0) : gray[i] > 200 ? 255 : 0;
    }
    return output;
  }

  return gray;
};

const applyOstromoukhov = (gray, w, h) => {
  const pixels = new Float32Array(gray);
  const getCoefficients = val => {
    const v = val / 255;
    if (v < 0.25) return [13, 0, 5];
    if (v < 0.5) return [6, 13, 0];
    if (v < 0.75) return [0, 7, 13];
    return [3, 5, 13];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const oldVal = pixels[idx];
      const newVal = oldVal > 127 ? 255 : 0;
      pixels[idx] = newVal;
      const err = oldVal - newVal;
      const [c1, c2, c3] = getCoefficients(oldVal);
      const sum = c1 + c2 + c3;
      if (x + 1 < w) pixels[y * w + (x + 1)] += (err * c1) / sum;
      if (y + 1 < h && x - 1 >= 0) pixels[(y + 1) * w + (x - 1)] += (err * c2) / sum;
      if (y + 1 < h) pixels[(y + 1) * w + x] += (err * c3) / sum;
    }
  }
  return Uint8ClampedArray.from(pixels.map(v => Math.max(0, Math.min(255, v))));
};

const applyRiemersma = (gray, w, h, intensity) => {
  const output = new Uint8ClampedArray(gray);
  const pixels = new Float32Array(gray);
  let error = 0;
  const damping = Math.max(0.1, Math.min(0.9, intensity / 20));

  for (let y = 0; y < h; y++) {
    const isEven = y % 2 === 0;
    for (let x = 0; x < w; x++) {
      const realX = isEven ? x : w - 1 - x;
      const idx = y * w + realX;
      const val = pixels[idx] + error;
      const out = val > 127 ? 255 : 0;
      output[idx] = out;
      error = (val - out) * damping;
    }
  }
  return output;
};

const applyDepth = (dithered, w, h, depth) => {
  const output = new Uint8ClampedArray(dithered);
  const offset = Math.floor(depth);
  if (offset === 0) return dithered;
  for (let y = 0; y < h; y++) {
    for (let x = offset; x < w; x++) {
      if (dithered[y * w + x] === 0) output[y * w + (x - offset)] = 0;
    }
  }
  return output;
};

const applyPalette = (gray, colors) => {
  const output = new Uint8ClampedArray(gray.length * 3);
  const stops = Math.max(1, colors.length - 1);
  for (let i = 0; i < gray.length; i++) {
    const pos = (gray[i] / 255) * stops;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const c1 = colors[Math.min(idx, stops)] || [0, 0, 0];
    const c2 = colors[Math.min(idx + 1, stops)] || [0, 0, 0];
    output[i * 3] = c1[0] + (c2[0] - c1[0]) * frac;
    output[i * 3 + 1] = c1[1] + (c2[1] - c1[1]) * frac;
    output[i * 3 + 2] = c1[2] + (c2[2] - c1[2]) * frac;
  }
  return output;
};

/* --------------------------- 4. MAIN APP ----------------------------- */

export default function App() {
  const [mediaType, setMediaType] = useState(null); // 'image' | 'video'
  const [sourceUrl, setSourceUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [mediaDims, setMediaDims] = useState(null); // {w,h}

  const [scale, setScale] = useState(4);
  const [style, setStyle] = useState('Atkinson');
  const [selectedCategory, setSelectedCategory] = useState('Error Diffusion');

  const [paletteCategory, setPaletteCategory] = useState('CyberGB');
  const [paletteIdx, setPaletteIdx] = useState(0);

  const [contrast, setContrast] = useState(45);
  const [midtones, setMidtones] = useState(50);
  const [highlights, setHighlights] = useState(50);
  const [threshold, setThreshold] = useState(128);
  const [blur, setBlur] = useState(0);

  const [lineScale, setLineScale] = useState(4);
  const [bleed, setBleed] = useState(50);
  const [depth, setDepth] = useState(0);
  const [invert, setInvert] = useState(false);

  const canvasRef = useRef(null);
  const hiddenVideoRef = useRef(null);
  const hiddenImageRef = useRef(null);
  const fileInputRef = useRef(null);
  const workspaceRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const availableStyles = useMemo(
    () => Object.keys(ALGORITHM_CATEGORIES[selectedCategory] || {}),
    [selectedCategory],
  );

  const currentPalette = useMemo(() => {
    const cat = PALETTE_PRESETS[paletteCategory] || PALETTE_PRESETS.CyberGB;
    const raw = cat[paletteIdx] || cat[0];
    return raw.map(hexToRgb);
  }, [paletteCategory, paletteIdx]);

  useEffect(() => {
    if (availableStyles.length > 0 && !availableStyles.includes(style)) {
      setStyle(availableStyles[0]);
    }
  }, [availableStyles, style]);

  const handleFileUpload = file => {
    if (!file) return;
    setIsPlaying(false);
    setIsRecording(false);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    setMediaDims(null);
    if (file.type.startsWith('video')) {
      setMediaType('video');
      setIsPlaying(true);
    } else {
      setMediaType('image');
      setIsPlaying(false);
    }
  };

  const onFileInputChange = e => {
    handleFileUpload(e.target.files?.[0] || null);
  };

  // auto-fit render size: NO zoom, just fit inside workspace
  const computeRenderSize = useCallback(
    (intrinsicW, intrinsicH) => {
      const workspace = workspaceRef.current;
      if (!workspace) return { w: intrinsicW, h: intrinsicH };
      const padding = 32;
      const maxW = Math.max(200, workspace.clientWidth - padding);
      const maxH = Math.max(200, workspace.clientHeight - padding);
      const scale = Math.min(maxW / intrinsicW, maxH / intrinsicH, 1);
      const w = Math.max(1, Math.floor(intrinsicW * scale));
      const h = Math.max(1, Math.floor(intrinsicH * scale));
      return { w, h };
    },
    [],
  );

  const processFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let srcW, srcH, source;

    if (mediaType === 'video') {
      const video = hiddenVideoRef.current;
      if (!video || video.readyState < 2) return;
      srcW = video.videoWidth;
      srcH = video.videoHeight;
      source = video;
    } else {
      const img = hiddenImageRef.current;
      if (!img) return;
      srcW = img.naturalWidth || img.width;
      srcH = img.naturalHeight || img.height;
      source = img;
    }

    if (!srcW || !srcH || !source) return;

    if (!mediaDims || mediaDims.w !== srcW || mediaDims.h !== srcH) {
      setMediaDims({ w: srcW, h: srcH });
    }

    const { w, h } = computeRenderSize(srcW, srcH);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, w, h);
    ctx.filter = 'none';

    const imageData = ctx.getImageData(0, 0, w, h);

    const result = processImage(imageData, {
      scale,
      style,
      palette: currentPalette,
      lineScale,
      bleed,
      contrast,
      midtones,
      highlights,
      depth,
      invert,
      threshold,
    });

    ctx.putImageData(result, 0, 0);
  }, [
    mediaType,
    mediaDims,
    scale,
    style,
    currentPalette,
    lineScale,
    bleed,
    contrast,
    midtones,
    highlights,
    depth,
    invert,
    threshold,
    blur,
    computeRenderSize,
  ]);

  // main render loop
  useEffect(() => {
    if (!mediaType || !sourceUrl) return;

    if (mediaType === 'image') {
      processFrame();
      return;
    }

    const video = hiddenVideoRef.current;
    if (!video) return;

    if (isPlaying) {
      let id;
      const loop = () => {
        processFrame();
        id = requestAnimationFrame(loop);
      };
      video
        .play()
        .catch(() => {})
        .finally(() => {
          loop();
        });
      return () => {
        if (id) cancelAnimationFrame(id);
      };
    } else {
      video.pause();
      processFrame();
    }
  }, [mediaType, sourceUrl, isPlaying, processFrame]);

  // re-fit on window resize
  useEffect(() => {
    const onResize = () => {
      if (sourceUrl) processFrame();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sourceUrl, processFrame]);

  const handleDrop = e => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files?.[0] || null);
  };

  const toggleRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      alert('Recording is not supported in this browser.');
      return;
    }

    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const stream = canvas.captureStream(30);
    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }

    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;
    recordedChunksRef.current = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ex-dithera-session.webm';
      a.click();
      URL.revokeObjectURL(url);
    };
    mediaRecorder.start();
    setIsRecording(true);
    if (mediaType === 'video' && !isPlaying) setIsPlaying(true);
  };

  const handleStaticExport = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'ex-dithera-frame.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleReset = () => {
    setScale(4);
    setContrast(45);
    setThreshold(128);
    setBlur(0);
    setBleed(50);
    setDepth(0);
    setInvert(false);
    setSelectedCategory('Error Diffusion');
    setStyle('Atkinson');
    setPaletteCategory('CyberGB');
    setPaletteIdx(0);
    setMidtones(50);
    setHighlights(50);
    setLineScale(4);
  };

  const ControlGroup = ({ label, value, min, max, onChange, highlight }) => (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-[11px]">
        <span className={highlight ? 'text-[#9bbc0f] font-semibold' : 'text-slate-400'}>{label}</span>
        <span className="font-mono text-slate-500">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded bg-slate-900 accent-[#9bbc0f]"
      />
    </div>
  );

  const paletteNames = Object.keys(PALETTE_PRESETS);

  return (
    <div className="flex h-screen flex-col bg-black text-slate-100 selection:bg-[#9bbc0f] selection:text-black">
      {/* hidden media */}
      <img
        ref={hiddenImageRef}
        src={mediaType === 'image' ? sourceUrl ?? '' : ''}
        className="hidden"
        onLoad={e => {
          const img = e.currentTarget;
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          setMediaDims({ w, h });
          processFrame();
        }}
        alt="source"
      />
      <video
        ref={hiddenVideoRef}
        src={mediaType === 'video' ? sourceUrl ?? '' : ''}
        className="hidden"
        loop
        muted
        playsInline
        onLoadedMetadata={e => {
          const video = e.currentTarget;
          const w = video.videoWidth;
          const h = video.videoHeight;
          setMediaDims({ w, h });
          if (isPlaying) processFrame();
        }}
      />

      {/* HEADER */}
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-[#9bbc0f]/25 bg-gradient-to-r from-black via-slate-950/70 to-black px-5">
        <div className="flex items-center gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded border border-[#9bbc0f]/70 bg-black shadow-[0_0_25px_rgba(155,188,15,0.7)]">
            <span className="text-[11px] font-black tracking-widest text-[#9bbc0f]">EX</span>
          </div>
          <div className="flex flex-col">
            <span className="bg-gradient-to-r from-[#9bbc0f] via-lime-300 to-emerald-300 bg-clip-text text-xs font-black tracking-[0.35em] text-transparent">
              EX DITHERA
            </span>
            <span className="mt-0.5 text-[10px] text-slate-500">
              Adaptive error–diffusion lab for stills &amp; video.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span>GPU</span>
          <div className="h-1.5 w-20 overflow-hidden rounded bg-slate-800">
            <div className="h-full w-4/5 bg-[#9bbc0f]" />
          </div>
          <span className="font-mono text-[#9bbc0f]">80%</span>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* CENTER WORKSPACE */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-gradient-to-b from-black via-slate-950 to-black">
          <div
            ref={workspaceRef}
            className="relative flex min-h-0 flex-1 overflow-auto px-4 pb-4 pt-4"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="m-auto">
              {sourceUrl ? (
                <div className="inline-block rounded border border-[#9bbc0f]/40 bg-black/80 p-2 shadow-[0_0_35px_rgba(15,23,42,0.8)]">
                  <canvas
                    ref={canvasRef}
                    className="block max-h-[80vh] max-w-full rounded"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              ) : (
                <div className="flex max-w-lg flex-col items-center rounded border border-dashed border-[#9bbc0f]/50 bg-black/80 px-10 py-12 text-center text-[11px] text-slate-400">
                  <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-[#9bbc0f]/70 bg-black shadow-[0_0_30px_rgba(155,188,15,0.65)]">
                    <Upload size={30} className="text-[#9bbc0f]" />
                  </div>
                  <p className="font-semibold uppercase tracking-[0.4em] text-[#9bbc0f]">
                    Drop Media
                  </p>
                  <p className="mt-2">
                    Drag an image or video here, or use the <span className="text-[#9bbc0f]">Import</span>{' '}
                    button.
                  </p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    PNG, JPG, GIF, MP4, WEBM supported.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT CONTROL PANEL */}
        <aside className="flex min-h-0 w-80 flex-shrink-0 flex-col border-l border-[#9bbc0f]/25 bg-gradient-to-b from-black via-slate-950 to-black">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-[#9bbc0f]/25 px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-slate-500">
            <span>Controls</span>
            <span className="text-[#9bbc0f]">Core</span>
          </div>

          <div className="flex-1 overflow-auto px-4 py-3 text-[11px]">
            {/* IMPORT / EXPORT */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                onChange={onFileInputChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded border border-[#9bbc0f]/70 bg-black/80 px-3 py-2 font-semibold text-[#9bbc0f] shadow-[0_0_20px_rgba(155,188,15,0.45)]"
              >
                <ImageIcon size={13} /> Import
              </button>
              <button
                onClick={mediaType === 'video' ? toggleRecording : handleStaticExport}
                disabled={!sourceUrl}
                className={`flex items-center justify-center gap-2 rounded border px-3 py-2 font-semibold ${
                  mediaType === 'video'
                    ? isRecording
                      ? 'border-red-500 bg-red-500 text-black animate-pulse'
                      : sourceUrl
                      ? 'border-[#9bbc0f]/50 bg-black text-slate-100 hover:bg-[#9bbc0f]/10'
                      : 'border-slate-800 bg-black text-slate-600'
                    : sourceUrl
                    ? 'border-[#9bbc0f]/50 bg-black text-slate-100 hover:bg-[#9bbc0f]/10'
                    : 'border-slate-800 bg-black text-slate-600'
                }`}
              >
                {mediaType === 'video' ? (
                  isRecording ? (
                    <>
                      <Disc size={12} /> Stop
                    </>
                  ) : (
                    <>
                      <Video size={12} /> Record
                    </>
                  )
                ) : (
                  <>
                    <Download size={12} /> Export
                  </>
                )}
              </button>
            </div>

            {/* DITHER ENGINE */}
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9bbc0f]">
                <Layers size={12} /> Dither Engine
              </div>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="mb-2 w-full rounded border border-slate-800 bg-black/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-[#9bbc0f] focus:ring-1 focus:ring-[#9bbc0f]"
              >
                {Object.keys(ALGORITHM_CATEGORIES).map(cat => (
                  <option key={cat}>{cat}</option>
                ))}
              </select>
              <select
                value={style}
                onChange={e => setStyle(e.target.value)}
                className="w-full rounded border border-slate-800 bg-black/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-[#9bbc0f] focus:ring-1 focus:ring-[#9bbc0f]"
              >
                {availableStyles.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* BASIC CONTROLS */}
            <ControlGroup label="Pixel Scale" value={scale} min={1} max={20} onChange={setScale} highlight />
            <ControlGroup
              label="Pattern Scale"
              value={lineScale}
              min={1}
              max={50}
              onChange={setLineScale}
            />

            {/* PALETTE */}
            <div className="mt-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9bbc0f]">
              Color Pipeline
            </div>
            <select
              value={paletteCategory}
              onChange={e => {
                setPaletteCategory(e.target.value);
                setPaletteIdx(0);
              }}
              className="mb-3 w-full rounded border border-slate-800 bg-black/80 px-3 py-2 text-xs text-slate-100 outline-none focus:border-[#9bbc0f] focus:ring-1 focus:ring-[#9bbc0f]"
            >
              {paletteNames.map(p => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <div className="mb-4 space-y-2">
              {(PALETTE_PRESETS[paletteCategory] || []).map((pal, idx) => (
                <button
                  key={idx}
                  onClick={() => setPaletteIdx(idx)}
                  className={`relative flex h-7 w-full overflow-hidden rounded border ${
                    paletteIdx === idx
                      ? 'border-[#9bbc0f] shadow-[0_0_20px_rgba(155,188,15,0.6)]'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="absolute inset-0 flex">
                    {pal.map((c, i) => (
                      <div key={i} style={{ background: c }} className="flex-1" />
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* TONE SHAPING */}
            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9bbc0f]">
              <span>Tone Shaping</span>
              <button
                onClick={() => setInvert(i => !i)}
                className={`rounded px-2 py-0.5 text-[9px] ${
                  invert
                    ? 'bg-[#9bbc0f] text-black'
                    : 'border border-slate-700 bg-black text-slate-400'
                }`}
              >
                Invert
              </button>
            </div>

            <ControlGroup label="Threshold" value={threshold} min={0} max={255} onChange={setThreshold} />
            <ControlGroup label="Pre-Blur" value={blur} min={0} max={20} onChange={setBlur} />
            <ControlGroup label="Contrast" value={contrast} min={0} max={100} onChange={setContrast} />
            <ControlGroup label="Midtones" value={midtones} min={0} max={100} onChange={setMidtones} />
            <ControlGroup
              label="Highlights"
              value={highlights}
              min={0}
              max={100}
              onChange={setHighlights}
            />
            <ControlGroup label="Bleed" value={bleed} min={0} max={100} onChange={setBleed} />
            <ControlGroup label="Depth" value={depth} min={0} max={20} onChange={setDepth} />

            {/* RESET */}
            <button
              onClick={handleReset}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-red-500/50 bg-black/80 px-3 py-2 text-[11px] font-semibold text-red-300 hover:bg-red-500/10"
            >
              <RotateCcw size={12} /> Reset
            </button>

            <div className="mt-3 pb-2 text-center text-[9px] text-slate-600">
              EX DITHERA • Minimal HUD
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
