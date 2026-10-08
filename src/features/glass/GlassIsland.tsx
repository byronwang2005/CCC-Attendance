import { motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode, type MouseEventHandler } from 'react';
import { GlassGroup, useGlassGroup } from './GlassGroup';
import { useGlassEnvironment } from './glass-environment';

export type GlassShape = 'capsule' | 'panel';
export function GlassIsland({
  variant = 'interactive',
  shape,
  disabled = false,
  className = '',
  children
}: {
  variant?: 'interactive' | 'navigation' | 'selection';
  shape: GlassShape;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const group = useGlassGroup();
  const environment = useGlassEnvironment();
  const element = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);
  const [touch, setTouch] = useState(false);
  const usage = variant === 'interactive' ? 'action' : variant;
  const register = group?.register;
  useEffect(() => {
    if (register && element.current) return register({ element: element.current, usage });
  }, [register, usage]);
  const classes = `glass-island glass-island--${variant} glass-island--${shape} ${disabled ? 'is-disabled' : ''} ${className}`;
  const content = <div className="glass-island__content">{children}</div>;
  if (!group)
    return (
      <GlassGroup className={classes} selfSurface={usage} disabled={disabled}>
        {content}
      </GlassGroup>
    );
  return (
    <motion.div
      ref={element}
      className={classes}
      data-glass-material="regular"
      data-glass-renderer={group.renderer}
      data-pressed={(pressed && !disabled && environment.motion) || undefined}
      data-disabled={disabled || undefined}
      onPointerDown={(event) => {
        if (!disabled) {
          setTouch(event.pointerType === 'touch');
          setPressed(true);
        }
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      animate={{ scale: pressed && !disabled && environment.motion ? (touch ? 0.975 : 0.985) : 1 }}
      transition={environment.motion ? { type: 'spring', stiffness: 520, damping: 34 } : { duration: 0 }}
    >
      <span className="regular-glass-surface" aria-hidden="true" />
      {content}
    </motion.div>
  );
}

/** Standard content surfaces deliberately have no optical layer. */
export function StaticGlassIsland({
  shape,
  className = '',
  children,
  onClick
}: {
  shape: GlassShape;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={`standard-surface glass-island--${shape} ${className}`}
      data-glass-material="standard"
      onClick={onClick}
    >
      <div className="glass-island__content">{children}</div>
    </div>
  );
}
