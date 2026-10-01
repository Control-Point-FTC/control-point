import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { cn } from './onboarding/onboardingState';

/**
 * Compact light/dark mode toggle for the app header (top right).
 * Styling matches the existing ghost icon buttons: muted icon, white on
 * hover over a subtle wash (both follow the theme via the white/black flip).
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light/dark mode"
      title="Toggle light/dark mode"
      data-onboard="header-theme-toggle"
      className={cn(
        'p-2 rounded-xl text-text-muted hover:text-text-base hover:bg-text-base/10 active:scale-95 transition-all flex-shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        className
      )}
    >
      {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}
