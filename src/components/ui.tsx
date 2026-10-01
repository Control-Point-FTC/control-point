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
