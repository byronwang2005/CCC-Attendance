import { animate, motion, useMotionValue } from 'motion/react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent
} from 'react';
import { GlassGroup } from './GlassGroup';
import { GlassIsland } from './GlassIsland';
import { useGlassEnvironment } from './glass-environment';

export interface GlassOption<Value extends string> {
  value: Value;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}
export function SegmentedGlassControl<Value extends string>({
  value,
  onValueChange,
  options,
  className = '',
  ariaLabel
}: {
  value: Value | '';
  onValueChange: (value: Value) => void;
  options: readonly GlassOption<Value>[];
  className?: string;
  ariaLabel: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { motion: allowsMotion } = useGlassEnvironment();
  const x = useMotionValue(0),
    width = useMotionValue(0);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    startX: number;
    horizontal: boolean;
    cancelled: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const selected = options.findIndex((option) => option.value === value);
  const current = useRef(selected);
  current.current = selected;
  const move = useRef<(index: number, immediate?: boolean) => void>(() => {});
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = (index: number, immediate = false) => {
      const option = optionRefs.current[index];
      if (!option) return;
      const bounds = node.getBoundingClientRect(),
        rect = option.getBoundingClientRect();
      const scale = bounds.width / node.clientWidth || 1;
      const target = (rect.x - bounds.x) / scale;
      setBox({ top: (rect.y - bounds.y) / scale, height: rect.height / scale });
      if (immediate || !allowsMotion) {
        x.jump(target);
        width.jump(rect.width / scale);
      } else {
        void animate(x, target, { type: 'spring', stiffness: 450, damping: 36, mass: 0.8 });
        void animate(width, rect.width / scale, { type: 'spring', stiffness: 450, damping: 36, mass: 0.8 });
      }
    };
    move.current = measure;
    measure(current.current, true);
    const observer = new ResizeObserver(() => measure(current.current, true));
    observer.observe(node);
    optionRefs.current.forEach((option) => {
      if (option) observer.observe(option);
    });
    return () => {
      observer.disconnect();
      x.stop();
      width.stop();
    };
  }, [allowsMotion, options.length, x, width]);
  useEffect(() => {
    if (!dragging) move.current(selected);
  }, [selected, dragging]);
  const finish = (event: PointerEvent<HTMLDivElement>, cancel: boolean) => {
    const gesture = pointer.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    pointer.current = null;
    setDragging(false);
    if (cancel || gesture.cancelled) suppressClick.current = true;
    if (gesture.horizontal) {
      suppressClick.current = true;
      if (!cancel && !gesture.cancelled) {
        const nearest = optionRefs.current.reduce(
          (best, option, index) => {
            if (!option || options[index].disabled) return best;
            const rect = option.getBoundingClientRect();
            const distance = Math.abs(event.clientX - rect.x - rect.width / 2);
            return distance < best.distance ? { index, distance } : best;
          },
          { index: -1, distance: Infinity }
        ).index;
        if (nearest >= 0 && options[nearest].value !== value) onValueChange(options[nearest].value);
        optionRefs.current[nearest]?.focus({ preventScroll: true });
      }
      move.current(current.current);
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <GlassGroup className={`segmented-glass ${className}`}>
      <div
        ref={root}
        className="segmented-glass__layout"
        role="radiogroup"
        aria-label={ariaLabel}
        style={{ '--segment-count': options.length } as CSSProperties}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          suppressClick.current = false;
          pointer.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            startX: x.get(),
            horizontal: false,
            cancelled: false
          };
        }}
        onPointerMove={(event) => {
          const gesture = pointer.current;
          if (!gesture || gesture.id !== event.pointerId || gesture.cancelled || selected < 0) return;
          const dx = event.clientX - gesture.x,
            dy = event.clientY - gesture.y;
          if (!gesture.horizontal && Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
            gesture.cancelled = true;
            return;
          }
          if (!gesture.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
            gesture.horizontal = true;
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            x.stop();
          }
          if (gesture.horizontal) {
            const max = Math.max(0, (root.current?.clientWidth ?? 0) - width.get());
            x.set(
              Math.max(
                0,
                Math.min(
                  max,
                  gesture.startX +
                    dx /
                      ((root.current?.getBoundingClientRect().width ?? 1) / (root.current?.clientWidth || 1))
                )
              )
            );
          }
        }}
        onPointerUp={(event) => finish(event, false)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => {
          if (pointer.current) finish(event, true);
        }}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {selected >= 0 && box && (
          <motion.div
            className="segmented-glass__lens-track"
            aria-hidden="true"
            style={{ x, width, top: box.top, height: box.height }}
          >
            <GlassIsland variant="selection" shape="capsule" className="segmented-glass__lens" />
          </motion.div>
        )}
        <div className="segmented-glass__options">
          {options.map((option, index) => (
            <button
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value === option.value}
              disabled={option.disabled}
              tabIndex={selected === index || (selected < 0 && index === 0) ? 0 : -1}
              className={`segment-option ${value === option.value ? 'is-selected' : ''}`}
              onClick={() => {
                if (option.value !== value) onValueChange(option.value);
              }}
              onKeyDown={(event) => {
                const enabled = options.map((o, i) => (!o.disabled ? i : -1)).filter((i) => i >= 0);
                const position = enabled.indexOf(index);
                let target = index;
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
                  target = enabled[(position + 1) % enabled.length];
                else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
                  target = enabled[(position - 1 + enabled.length) % enabled.length];
                else if (event.key === 'Home') target = enabled[0];
                else if (event.key === 'End') target = enabled[enabled.length - 1];
                else return;
                event.preventDefault();
                optionRefs.current[target]?.focus();
                if (options[target].value !== value) onValueChange(options[target].value);
              }}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </GlassGroup>
  );
}
