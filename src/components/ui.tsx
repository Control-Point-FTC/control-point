import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Shared class-name helper (moved out of App.tsx so dashboard components can use it too).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to get CSS variable values
function getCSSVariable(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
}

// --- Shared primitives (moved out of App.tsx) ---

export const Card = ({ children, className, title, subtitle, icon: Icon, ...rest }: any) => (
  <div className={cn("card-surface p-6 flex flex-col gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)]", className)} {...rest}>
    {(title || Icon) && (
      <div className="flex items-center justify-between mb-1">
        <div>
          {title && <h3 className="text-lg font-display font-bold text-text-base tracking-tight">{title}</h3>}
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="rounded-xl bg-accent/12 p-2.5">
            <Icon className="w-5 h-5 text-accent" />
          </div>
        )}
      </div>
    )}
    {children}
  </div>
);

export const Button = ({ children, className, variant = 'primary', ...props }: any) => {
  const accentColor = getCSSVariable('--color-accent');
  const primaryColor = getCSSVariable('--color-primary');

  const variants: any = {
    primary: {
      className: 'font-bold hover:brightness-105 shadow-[0_4px_16px_rgba(255,199,0,0.25)]',
      style: { backgroundColor: accentColor || '#FFC700', color: '#231A00' }
    },
    secondary: 'bg-elevated text-text-base hover:bg-text-base/10 border border-text-base/10 font-semibold',
    outline: {
      className: 'text-accent hover:opacity-80 border border-current font-bold',
    },
    ghost: 'text-text-muted hover:text-text-base hover:bg-text-base/5 font-semibold',
    danger: 'bg-rose-900/30 text-rose-400 hover:bg-rose-900/50 border border-rose-500/30 font-semibold'
  };

  const variantConfig = variants[variant as keyof typeof variants];
  const isObject = typeof variantConfig === 'object' && !Array.isArray(variantConfig);

  return (
    <button
      className={cn(
        "px-4 py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50",
        isObject ? variantConfig.className : variantConfig,
        className
      )}
      style={isObject ? variantConfig.style : undefined}
      {...props}
    >
      {children}
    </button>
  );
};

export const Input = ({ className, ...props }: any) => (
  <input
    className={cn(
      "w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all",
      className
    )}
    {...props}
  />
);

// Presentational switch track (no button wrapper) — for when the switch visual
// lives inside another interactive element (e.g. the Teaching mode card).
export const SwitchTrack = ({ checked, onClassName, className }: {
  checked: boolean;
  onClassName?: string;
  className?: string;
}) => (
  <span className={cn(
    "block relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
    checked ? (onClassName || "bg-accent") : "bg-text-base/15",
    className
  )}>
    <span className={cn(
      "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
      checked && "translate-x-5"
    )} />
  </span>
);

// Accessible toggle switch. Fixed track/thumb geometry (translate-x, never
// absolute left math), role="switch" for a11y, and a 44px touch target via
// padding so the mobile min-height button rule doesn't stretch the track.
// The role="switch" also opts it out of that rule (see index.css).
export const Switch = ({ checked, onChange, label, disabled, onClassName, className }: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  onClassName?: string;
  className?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "flex-shrink-0 rounded-full p-2.5 -m-2.5 transition-opacity",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      className
    )}
  >
    <SwitchTrack checked={checked} onClassName={onClassName} />
  </button>
);
