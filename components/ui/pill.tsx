'use client';

import { cn } from '@/lib/utils';

export type PillOption<T extends string> = { value: T; label: string };

// Two-option segmented pill with a thin separator between halves.
// Inactive half uses a lighter shade of the active (primary) bg.
type Variant = 'page' | 'bar';

export function Pill<T extends string>({
  first,
  second,
  value,
  onChange,
  size = 'md',
  variant = 'page',
  ariaLabel,
  className,
}: {
  first: PillOption<T>;
  second: PillOption<T>;
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  variant?: Variant;
  ariaLabel: string;
  className?: string;
}) {
  const separator =
    variant === 'bar' ? 'bg-primary-foreground/30' : 'bg-primary/20';
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex items-stretch overflow-hidden rounded-full',
        className,
      )}
    >
      <PillButton size={size} variant={variant} active={value === first.value} onClick={() => onChange(first.value)}>
        {first.label}
      </PillButton>
      <div aria-hidden className={cn('my-1.5 w-px', separator)} />
      <PillButton size={size} variant={variant} active={value === second.value} onClick={() => onChange(second.value)}>
        {second.label}
      </PillButton>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  size,
  variant,
  children,
}: {
  active: boolean;
  onClick: () => void;
  size: 'sm' | 'md';
  variant: Variant;
  children: React.ReactNode;
}) {
  const palette =
    variant === 'bar'
      ? active
        ? 'bg-primary-foreground text-primary'
        : 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25'
      : active
        ? 'bg-primary text-primary-foreground'
        : 'bg-primary/15 text-foreground hover:bg-primary/25';
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex-1 font-medium transition-colors',
        size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm',
        palette,
      )}
    >
      {children}
    </button>
  );
}
