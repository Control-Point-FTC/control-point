import { Button as KitButton } from './ui-kit/button';
import { Input as KitInput } from './ui-kit/basic';

import { cn } from './cn';

// Shared class-name helper (lives in ./cn so the UI kit can use it without a cycle).
export { cn };

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

// Legacy Button/Input API (variant names used across the app), rendered with
// the shadcn-based kit in ./ui-kit so every screen shares one implementation.
const LEGACY_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'> = {
  primary: 'default', secondary: 'secondary', outline: 'outline', ghost: 'ghost', danger: 'destructive',
};

export const Button = ({ children, className, variant = 'primary', ...props }: any) => (
  <KitButton
    variant={LEGACY_VARIANT[variant] ?? 'default'}
    // Old callers size buttons with padding, not a fixed height.
    className={cn('h-auto py-2', variant === 'outline' && 'border-accent/50 text-accent hover:bg-accent/10', className)}
    {...props}
  >
    {children}
  </KitButton>
);

export const Input = ({ className, ...props }: any) => (
  <KitInput className={cn('h-auto px-4 py-2.5', className)} {...props} />
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
