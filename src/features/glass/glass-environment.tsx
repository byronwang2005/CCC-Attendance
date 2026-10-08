import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react';

export type GlassRenderer = 'canvas' | 'backdrop' | 'solid';
export type GlassQuality = 'high' | 'low' | 'fallback';
export interface GlassCapabilities {
  material: GlassRenderer;
  motion: boolean;
}

export function detectGlassCapabilities(): GlassCapabilities {
  if (typeof window === 'undefined' || !window.matchMedia) return { material: 'solid', motion: false };
  const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const opaque =
    window.matchMedia('(prefers-reduced-transparency: reduce)').matches ||
    window.matchMedia('(forced-colors: active)').matches;
  const backdrop =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));
  return { material: opaque || !backdrop ? 'solid' : 'backdrop', motion };
}

// A single synchronously copied frame: WebGL's drawing buffer is transient.
// Never retain the producer canvas and sample it in a later animation frame.
export const glassBackground = {
  canvas: null as HTMLCanvasElement | null,
  rect: { x: 0, y: 0, width: 1, height: 1 },
  luminance: 0.94,
  available: false
};
const listeners = new Set<() => void>();
let sampleCanvas: HTMLCanvasElement | null = null;
let lastSample = 0;
const notify = () => listeners.forEach((listener) => listener());
export function publishGlassBackground(canvas: HTMLCanvasElement, background: string, now: number) {
  glassBackground.canvas ??= document.createElement('canvas');
  const frame = glassBackground.canvas;
  if (frame.width !== canvas.width || frame.height !== canvas.height) {
    frame.width = canvas.width;
    frame.height = canvas.height;
  }
  const ctx = frame.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  const rect = canvas.getBoundingClientRect();
  glassBackground.rect = { x: rect.x, y: rect.y, width: rect.width || 1, height: rect.height || 1 };
  if (!glassBackground.available || now - lastSample > 150) {
    sampleCanvas ??= document.createElement('canvas');
    sampleCanvas.width = sampleCanvas.height = 4;
    const sample = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (sample) {
      sample.drawImage(frame, 0, 0, 4, 4);
      const pixels = sample.getImageData(0, 0, 4, 4).data;
      let light = 0;
      for (let i = 0; i < pixels.length; i += 4)
        light += (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
      glassBackground.luminance = glassBackground.available
        ? glassBackground.luminance + (light / 16 - glassBackground.luminance) * 0.15
        : light / 16;
    }
    lastSample = now;
  }
  if (!glassBackground.available) {
    glassBackground.available = true;
    notify();
  }
}
export function releaseGlassBackground() {
  glassBackground.available = false;
  glassBackground.canvas = null;
  notify();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => glassBackground.available;

export function nextGlassQuality(quality: GlassQuality, frameTimes: number[]): GlassQuality {
  if (frameTimes.length < 120) return quality;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (quality === 'high' && median > 20) return 'low';
  if (quality === 'low' && median > 28) return 'fallback';
  return quality;
}
interface Environment extends GlassCapabilities {
  quality: GlassQuality;
  sourceReady: boolean;
  acquire: (id: string) => boolean;
  release: (id: string) => void;
}
const GlassContext = createContext<Environment | null>(null);

export function GlassEnvironment({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState(detectGlassCapabilities);
  const [quality, setQuality] = useState<GlassQuality>('high');
  const sourceReady = useSyncExternalStore(subscribe, snapshot, () => false);
  const slots = useMemo(() => new Set<string>(), []);
  useEffect(() => {
    const queries = [
      '(prefers-reduced-motion: reduce)',
      '(prefers-reduced-transparency: reduce)',
      '(forced-colors: active)'
    ].map((q) => window.matchMedia(q));
    const refresh = () => setCapabilities(detectGlassCapabilities());
    queries.forEach((q) => q.addEventListener('change', refresh));
    return () => queries.forEach((q) => q.removeEventListener('change', refresh));
  }, []);
  useEffect(() => {
    if (!sourceReady || quality === 'fallback' || !capabilities.motion) return;
    let raf = 0,
      last = 0;
    let samples: number[] = [];
    let warmup = 60;
    const frame = (now: number) => {
      if (!document.hidden && last) {
        if (warmup > 0) warmup--;
        else samples.push(Math.min(now - last, 250));
        if (samples.length === 120) {
          setQuality((q) => nextGlassQuality(q, samples));
          samples = [];
        }
      } else {
        samples = [];
        warmup = 60;
      }
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sourceReady, quality, capabilities.motion]);
  const value = useMemo<Environment>(
    () => ({
      ...capabilities,
      sourceReady,
      quality,
      acquire: (id) => {
        if (slots.has(id)) return true;
        if (slots.size >= 4) return false;
        slots.add(id);
        return true;
      },
      release: (id) => {
        slots.delete(id);
      }
    }),
    [capabilities, sourceReady, quality, slots]
  );
  return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}
export function useGlassEnvironment(): Environment {
  const context = useContext(GlassContext);
  const fallback = useMemo(
    () => ({
      ...detectGlassCapabilities(),
      quality: 'fallback' as const,
      sourceReady: false,
      acquire: () => false,
      release: () => {}
    }),
    []
  );
  return context ?? fallback;
}
