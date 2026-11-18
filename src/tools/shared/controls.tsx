/** Small form controls shared by the tool pages. All are labelled for screen readers. */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { cn } from '@/utils/id';

const box = 'h-9 w-full rounded-md border border-line bg-surface-2 px-2 text-sm';

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
}: {
  label: string;
  value: T;
  onChange(v: NoInfer<T>): void;
  options: readonly (readonly [NoInfer<T>, string] | { value: NoInfer<T>; label: string; disabled?: boolean })[];
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="mb-1 block text-xs text-muted">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={box} disabled={disabled}>
        {options.map((o) => {
          const [v, l, d] = Array.isArray(o) ? [o[0], o[1], false] : [(o as { value: T }).value, (o as { label: string }).label, (o as { disabled?: boolean }).disabled];
          return (
            <option key={v} value={v} disabled={d}>
              {l}
            </option>
          );
        })}
      </select>
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </div>
  );
}

/** Number input that commits on blur/Enter so typing intermediate values is not clamped away. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
}: {
  label: string;
  value: number;
  onChange(v: number): void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: ReactNode;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n)) return setText(String(value));
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    onChange(c);
    setText(String(c));
  };
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted">
        {label}
        {unit && <span className="text-faint"> ({unit})</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className={cn(box, 'font-mono tabular')}
      />
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  onChange(v: number): void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono tabular text-fg">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--c-accent)]" aria-label={label} />
    </label>
  );
}

export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  name,
}: {
  label: string;
  value: T;
  onChange(v: NoInfer<T>): void;
  options: readonly (readonly [NoInfer<T>, string, string?])[];
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l, hint]) => (
          <label key={v} className={cn('flex min-w-[8rem] flex-1 cursor-pointer gap-2 rounded-md border p-2.5 text-sm', value === v ? 'border-accent bg-accent-soft/40' : 'border-line')}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="mt-0.5 accent-[var(--c-accent)]" />
            <span>
              <span className="block font-medium">{l}</span>
              {hint && <span className="block text-xs text-muted">{hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange(v: boolean): void; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[var(--c-accent)]" />
      <span>
        {label}
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line bg-surface-2" aria-label={label} />
        <span className="font-mono text-xs text-muted">{value}</span>
      </span>
    </label>
  );
}

export function TextField({ label, value, onChange, multiline, placeholder }: { label: string; value: string; onChange(v: string): void; multiline?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="mb-1 block text-xs text-muted">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded-md border border-line bg-surface-2 p-2 text-sm" />
      ) : (
        <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={box} />
      )}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-3', className)}>{children}</div>;
}
