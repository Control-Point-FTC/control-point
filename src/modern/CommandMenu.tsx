// ⌘K command menu (Modern) — shadcn CommandDialog. Navigation is built from the
// same visible nav items as the sidebar, so it never offers a page the user
// can't open.
import { useMemo, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Inbox, Settings, Sun, Moon, ArrowLeftRight, Layers, CornerDownLeft } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from '../components/ui-kit';
import { buildModernNav, flattenNav, type NavItemLike } from './nav';
import { useInterfaceMode } from './interfaceMode';

export interface CommandAction {
  id: string;
  label: string;
  group: 'Create' | 'Actions';
  icon: ComponentType<{ className?: string }>;
  keywords?: string[];
  run: () => void;
}

export function CommandMenu({ open, onOpenChange, visibleTabs, onNavigate, teams, activeTeamId, onSwitchTeam, onOpenBruno, onOpenSettings, onOpenInbox, actions }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  visibleTabs: NavItemLike[];
  onNavigate: (path: string) => void;
  teams: any[];
  activeTeamId?: number;
  onSwitchTeam: (id: number) => void;
  onOpenBruno: () => void;
  onOpenSettings: () => void;
  onOpenInbox: () => void;
  actions: CommandAction[];
}) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const { setMode } = useInterfaceMode();
  const pages = useMemo(() => flattenNav(buildModernNav(visibleTabs)), [visibleTabs]);
  const run = (fn: () => void) => { onOpenChange(false); fn(); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command menu" description="Search pages and actions">
      <CommandInput autoFocus placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Go to">
          {pages.map((p) => {
            const Icon = p.icon;
            const label = t(p.labelKey);
            return (
              <CommandItem key={p.id} value={`go ${label} ${p.section ?? ''}`} onSelect={() => run(() => onNavigate(`/${p.path}`))}>
                <Icon /> <span className="flex-1 truncate">{label}</span>
                {p.section && <span className="text-xs text-muted-foreground">{p.section}</span>}
              </CommandItem>
            );
          })}
          <CommandItem value="go inbox notifications" onSelect={() => run(onOpenInbox)}><Inbox /> Inbox</CommandItem>
          <CommandItem value="go bruno ai assistant chat" onSelect={() => run(onOpenBruno)}><Bot /> Ask Bruno <CommandShortcut>⌘J</CommandShortcut></CommandItem>
        </CommandGroup>

        {(['Create', 'Actions'] as const).map((g) => {
          const list = actions.filter((a) => a.group === g);
          if (!list.length) return null;
          return (
            <CommandGroup key={g} heading={g}>
              {list.map((a) => (
                <CommandItem key={a.id} value={`${g} ${a.label} ${(a.keywords ?? []).join(' ')}`} onSelect={() => run(a.run)}>
                  <a.icon /> {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {teams.length > 1 && (
          <CommandGroup heading="Switch workspace">
            {teams.filter((tm) => tm.id !== activeTeamId).map((tm) => (
              <CommandItem key={tm.id} value={`workspace switch ${tm.name}`} onSelect={() => run(() => onSwitchTeam(tm.id))}>
                <Layers /> {tm.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem value="settings preferences" onSelect={() => run(onOpenSettings)}><Settings /> Settings</CommandItem>
          <CommandItem value="theme toggle dark light" onSelect={() => run(toggle)}>
            {theme === 'light' ? <Moon /> : <Sun />} {theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          </CommandItem>
          <CommandItem value="legacy experience interface old" onSelect={() => run(() => void setMode('legacy'))}>
            <ArrowLeftRight /> Switch to Legacy experience
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><CornerDownLeft className="size-3" /> to select</span>
        <span>↑↓ to move</span>
        <span className="ml-auto">esc to close</span>
      </div>
    </CommandDialog>
  );
}
