import { useState } from 'react';
import { Bolt } from 'lucide-react';
import { cn } from './ui';

/**
 * BrandMark — the Control Point logo slot.
 *
 * Sushil is designing the real logo in Canva. Drop the export at
 * `public/logo.png` and it is picked up automatically (no code change);
 * until then the built-in bolt mark renders.
 *
 * Includes the mini BETA badge next to the wordmark (intentionally tiny).
 */
export function BetaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-accent/40 bg-accent/10',
        'px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.14em] text-accent',
        'leading-none select-none',
        className
      )}
      title="Control Point is in beta"
    >
      Beta
    </span>
  );
}

function LogoImage({ className }: { className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div className={cn('bg-accent rounded-2xl flex items-center justify-center gold-glow flex-shrink-0', className)}>
        <Bolt className="text-accent-ink w-6 h-6" strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <img
      src="/logo.png"
      alt="Control Point logo"
      onError={() => setMissing(true)}
      className={cn('object-contain flex-shrink-0', className)}
    />
  );
}

/** Standalone logo image (with bolt fallback) for one-off placements. */
export function BrandLogo({ className }: { className?: string }) {
  return <LogoImage className={className} />;
}

export function BrandMark({
  variant = 'sidebar',
  showSubtitle = true,
}: {
  variant?: 'sidebar' | 'compact' | 'landing';
  showSubtitle?: boolean;
}) {
  if (variant === 'compact') {
    return <LogoImage className="w-10 h-10 rounded-2xl" />;
  }
  if (variant === 'landing') {
    return (
      <div className="flex items-center gap-3">
        <LogoImage className="w-11 h-11 rounded-2xl" />
        <div className="flex items-center gap-2">
          <span className="text-2xl font-display font-bold text-text-base tracking-tight">Control Point</span>
          <BetaBadge className="mt-0.5" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      <LogoImage className="w-10 h-10 rounded-2xl" />
      <div className="whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <h1 className="text-[17px] font-display font-bold text-text-base leading-none tracking-tight">Control Point</h1>
          <BetaBadge />
        </div>
        {showSubtitle && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted mt-1">Team workspace</p>
        )}
      </div>
    </div>
  );
}
