// Settings → Appearance: theme and language.
import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useTheme, type Theme } from '../../../hooks/useTheme';
import { SUPPORTED_LANGUAGES, setLanguage } from '../../../i18n';
import { notify } from '../../../components/dialog';
import { SettingsGroup, SettingsRow } from './SettingsPage';

export function AppearanceSection() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <SettingsGroup title="Display">
        <SettingsRow label="Theme" description="Follows you on this device.">
          <ToggleGroup type="single" value={theme} onValueChange={(v) => { if (v) setTheme(v as Theme); }} aria-label="Theme">
            <ToggleGroupItem value="light" className="px-3 max-sm:h-10"><Sun /> {t('settings.lightMode')}</ToggleGroupItem>
            <ToggleGroupItem value="dark" className="px-3 max-sm:h-10"><Moon /> {t('settings.darkMode')}</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
        <SettingsRow label="Language" description="Menus and labels. Your content isn’t translated.">
          <Select
            value={SUPPORTED_LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : 'en'}
            onValueChange={(code) => { setLanguage(code); notify(t('settings.languageChanged'), 'success'); }}
          >
            <SelectTrigger className="w-44 max-sm:h-11" aria-label="Language"><SelectValue /></SelectTrigger>
            <SelectContent>{SUPPORTED_LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
