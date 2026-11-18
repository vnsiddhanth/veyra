import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/id';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger/90 text-white hover:bg-danger',
};
const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});

export function IconButton({ label, className, children, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40',
        active && 'bg-surface-3 text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-surface-3 text-muted',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accent-soft text-accent',
  };
  return <span className={cn('inline-flex items-center rounded-sm px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide', tones[tone], className)}>{children}</span>;
}

export function Progress({ value, className, label }: { value: number | null; className?: string; label?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value == null ? undefined : Math.round(value * 100)}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      {value == null ? (
        // Indeterminate: used only while waiting on work that reports no progress (never a fake percentage).
        <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/70" />
      ) : (
        <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${Math.round(value * 100)}%` }} />
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-line-strong bg-surface-2 px-1 font-mono text-2xs text-muted">{children}</kbd>;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="max-w-xs text-xs leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,40%)_1fr] items-baseline gap-3 py-1 text-xs">
      <dt className="truncate text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-mono text-fg tabular">{children}</dd>
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
      <h3 className="text-2xs font-semibold uppercase tracking-wider text-faint">{children}</h3>
      {aside}
    </div>
  );
}
