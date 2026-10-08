import { Glass, type GlassOptics, type GlassSurfaceLens } from '@samasante/liquid-glass';
import { motion } from 'motion/react';
import {
  Component,
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { glassBackground, useGlassEnvironment, type GlassRenderer } from './glass-environment';

export const REGULAR_OPTICS: Partial<GlassOptics> = {
  strength: 0.028,
  depth: 0.48,
  curvature: 0.24,
  bend: 0.45,
  bendWidth: 0.16,
  dispersion: 0.025,
  frost: 3.5,
  sheen: 0.18,
  specular: 0.24,
  brightness: 0.08,
  mapSize: 256
};
type Registration = { element: HTMLElement; usage: 'action' | 'navigation' | 'selection' };
interface GroupContext {
  register: (entry: Registration) => () => void;
  renderer: GlassRenderer;
}
export const GlassGroupContext = createContext<GroupContext | null>(null);
export const useGlassGroup = () => useContext(GlassGroupContext);
interface Geometry {
  width: number;
  height: number;
  lenses: GlassSurfaceLens[];
  rects: Array<{ x: number; y: number; width: number; height: number; radius: number }>;
}

class OpticalBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** One renderer per group. The optical output is clipped; the DOM stays crisp. */
export function GlassGroup({
  children,
  className = '',
  selfSurface,
  disabled = false
}: {
  children: ReactNode;
  className?: string;
  selfSurface?: Registration['usage'];
  disabled?: boolean;
}) {
  const environment = useGlassEnvironment();
  const id = useId().replace(/:/g, '');
  const root = useRef<HTMLDivElement>(null);
  const optical = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => new Set<Registration>(), []);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [failed, setFailed] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [visible, setVisible] = useState(true);
  const [slot, setSlot] = useState(false);
  const [pressed, setPressed] = useState(false);
  const available =
    environment.sourceReady && environment.material !== 'solid' && environment.quality !== 'fallback';
  useEffect(() => {
    if (!available || !visible) return;
    setSlot(environment.acquire(id));
    return () => {
      environment.release(id);
      setSlot(false);
    };
  }, [available, visible, environment.acquire, environment.release, id]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let intersecting = true;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            intersecting = entry.isIntersecting;
            update();
          });
    observer?.observe(node);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  // Resize, pointer springs, scrolling and zoom all use the same actual boxes.
  useEffect(() => {
    const node = root.current;
    if (!node || !visible || !available || !slot) return;
    let raf = 0;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      const scaleX = bounds.width / node.offsetWidth || 1,
        scaleY = bounds.height / node.offsetHeight || 1;
      const targets = selfSurface ? [{ element: node, usage: selfSurface }] : [...entries];
      const rects = targets
        .filter(({ element }) => element.isConnected && element.getClientRects().length)
        .map(({ element }) => {
          const box = element.getBoundingClientRect();
          const radius = Math.min(
            parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
            box.width / 2,
            box.height / 2
          );
          return {
            x: (box.x - bounds.x) / scaleX,
            y: (box.y - bounds.y) / scaleY,
            width: box.width / scaleX,
            height: box.height / scaleY,
            radius
          };
        })
        .filter((r) => r.width > 0 && r.height > 0);
      const width = node.clientWidth,
        height = node.clientHeight;
      if (width > 0 && height > 0) {
        const lenses = rects.map((r) => ({
          x: (r.x + r.width / 2) / width,
          y: (r.y + r.height / 2) / height,
          w: r.width,
          h: r.height,
          radius: r.radius
        }));
        setGeometry((old) =>
          old &&
          JSON.stringify(old.rects) === JSON.stringify(rects) &&
          old.width === width &&
          old.height === height
            ? old
            : { width, height, lenses, rects }
        );
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [entries, selfSurface, visible, available, slot]);
  const renderer: GlassRenderer =
    available && slot && !failed && geometry?.lenses.length ? 'canvas' : environment.material;
  useEffect(() => {
    const host = optical.current;
    if (!host) return;
    const onLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    const onRestored = () => {
      setGeneration((value) => value + 1);
      setFailed(false);
    };
    const inspect = () => {
      // 0.1.1 reports shader failure by hiding its output canvas. Keep this
      // version-specific detail inside the adapter, never in product components.
      const canvas = host.querySelector('canvas');
      if (canvas?.style.display === 'none') setFailed(true);
    };
    host.addEventListener('webglcontextlost', onLost, true);
    host.addEventListener('webglcontextrestored', onRestored, true);
    const observer = new MutationObserver(inspect);
    observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
    inspect();
    return () => {
      observer.disconnect();
      host.removeEventListener('webglcontextlost', onLost, true);
      host.removeEventListener('webglcontextrestored', onRestored, true);
    };
  }, [slot, geometry?.lenses.length, generation]);
  const draw = (ctx: CanvasRenderingContext2D) => {
    const node = root.current,
      frame = glassBackground.canvas;
    if (!node || !frame) return;
    const bounds = node.getBoundingClientRect(),
      source = glassBackground.rect;
    const sx = frame.width / source.width,
      sy = frame.height / source.height;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(
      frame,
      (bounds.x - source.x) * sx,
      (bounds.y - source.y) * sy,
      bounds.width * sx,
      bounds.height * sy,
      0,
      0,
      ctx.canvas.width,
      ctx.canvas.height
    );
    const layers: string[] = [];
    for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) {
      if (parent.matches('.standard-surface, .segmented-glass'))
        layers.unshift(getComputedStyle(parent).backgroundColor);
    }
    for (const fill of layers) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    node.style.setProperty(
      '--glass-adaptive-edge',
      `rgba(255,255,255,${0.42 + glassBackground.luminance * 0.2})`
    );
    ctx.fillStyle = `rgba(255,255,255,${0.06 + (1 - glassBackground.luminance) ** 2 * 0.8})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  };
  const context = useMemo<GroupContext>(
    () => ({
      renderer,
      register: (entry) => {
        entries.add(entry);
        return () => {
          entries.delete(entry);
        };
      }
    }),
    [entries, renderer]
  );
  const canPress = selfSurface === 'action' && !disabled && environment.motion;
  return (
    <motion.div
      ref={root}
      className={`glass-group ${className}`}
      data-glass-renderer={renderer}
      data-glass-quality={environment.quality}
      data-pressed={(pressed && canPress) || undefined}
      data-glass-material={selfSurface ? 'regular' : undefined}
      data-disabled={disabled || undefined}
      onPointerDown={(event) => {
        if (canPress) {
          setPressed(true);
          event.currentTarget.dataset.input = event.pointerType;
        }
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      animate={{ scale: pressed && canPress ? (root.current?.dataset.input === 'touch' ? 0.975 : 0.985) : 1 }}
      transition={environment.motion ? { type: 'spring', stiffness: 520, damping: 34 } : { duration: 0 }}
    >
      <GlassGroupContext.Provider value={context}>
        {selfSurface && <span className="regular-glass-surface" aria-hidden="true" />}
        {available && slot && geometry && geometry.lenses.length > 0 && (
          <div
            ref={optical}
            aria-hidden="true"
            className="glass-optical-output"
            style={{ visibility: failed ? 'hidden' : undefined, clipPath: `url(#glass-clip-${id})` }}
          >
            <svg className="glass-clip-defs">
              <defs>
                <clipPath id={`glass-clip-${id}`} clipPathUnits="userSpaceOnUse">
                  {geometry.rects.map((r, i) => (
                    <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} rx={r.radius} />
                  ))}
                </clipPath>
              </defs>
            </svg>
            <OpticalBoundary key={`${generation}:${environment.quality}`} onFailure={() => setFailed(true)}>
              <Glass
                draw={draw}
                width={geometry.width}
                height={geometry.height}
                lenses={geometry.lenses}
                optics={REGULAR_OPTICS}
                maxDpr={environment.quality === 'high' ? 1.5 : 0.75}
              />
            </OpticalBoundary>
          </div>
        )}
        {children}
      </GlassGroupContext.Provider>
    </motion.div>
  );
}
