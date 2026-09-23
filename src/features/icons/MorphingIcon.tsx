import { MorphIcon, type IconInput } from 'morphicons/react';

interface MorphingIconProps {
  icon: IconInput;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export function MorphingIcon({
  icon,
  className = '',
  size = 18,
  strokeWidth = 1.8
}: MorphingIconProps) {
  return (
    <MorphIcon
      icon={icon}
      className={`icon morph-icon ${className}`.trim()}
      size={size}
      strokeWidth={strokeWidth}
      reducedMotion="user"
      focusable="false"
    />
  );
}
