import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';
import { cn } from './onboarding/onboardingState';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

/**
 * Language switcher for the app header (top right), next to the theme toggle.
 * Persists choice to localStorage via the i18n module.
 */
export default function LanguageToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  return (
    <div ref={ref} className={cn('relative flex-shrink-0', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Change language"
        title={`Language: ${current.label}`}
        className="p-2 rounded-xl text-text-muted hover:text-text-base hover:bg-text-base/10 active:scale-95 transition-all flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <Globe className="w-5 h-5" />
        <span className="text-xs font-semibold uppercase">{current.code}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 min-w-[140px] rounded-xl border border-line bg-elevated shadow-xl py-1 z-50">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              type="button"
              onClick={() => { setLanguage(lang.code); setOpen(false); }}
              className={cn(
                'w-full text-left px-4 py-2 text-sm hover:bg-text-base/5 transition-colors',
                lang.code === i18n.language ? 'text-accent font-semibold' : 'text-text-base'
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
