import { useRef, type KeyboardEvent } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '../hooks/useTheme';
import { cn } from './onboarding/onboardingState';

/**
 * Light/Dark choice for Settings → Appearance. The header ThemeToggle is
 * hidden on phones, so this is the way to switch there (and works
 * everywhere). A proper radio group: one tab stop, arrow keys move + select.
 */
export default function ThemePicker() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const refs = useRef<Record<Theme, HTMLButtonElement | null>>({ light: null, dark: null });
  const options = [
    { value: 'light', label: t('settings.lightMode'), Icon: Sun },
    { value: 'dark', label: t('settings.darkMode'), Icon: Moon },
  ] as const;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    // Two options: any arrow moves to the other one.
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    refs.current[next]?.focus();
  };

  return (
    <div>
      <h3 className="text-sm font-bold text-text-base mb-2">{t('settings.theme')}</h3>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('settings.theme')} onKeyDown={onKeyDown}>
        {options.map(({ value, label, Icon }) => (
          <button
            key={value}
            ref={(el) => { refs.current[value] = el; }}
            type="button"
            role="radio"
            aria-checked={theme === value}
            tabIndex={theme === value ? 0 : -1}
            onClick={() => setTheme(value)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              theme === value
                ? 'bg-accent text-accent-ink border-accent'
                : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-text-base/25 hover:text-text-base'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
