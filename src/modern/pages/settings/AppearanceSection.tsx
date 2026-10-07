// Settings → Appearance: theme. (Control Point is English-only.)
import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { useTheme, type Theme } from '../../../hooks/useTheme';
import { SettingsGroup, SettingsRow } from './SettingsPage';

export function AppearanceSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <SettingsGroup title="Display">
        <SettingsRow label="Theme" description="Follows you on this device.">
          <ToggleGroup type="single" value={theme} onValueChange={(v) => { if (v) setTheme(v as Theme); }} aria-label="Theme">
            <ToggleGroupItem value="light"><Sun /> {t('settings.lightMode')}</ToggleGroupItem>
            <ToggleGroupItem value="dark"><Moon /> {t('settings.darkMode')}</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}
