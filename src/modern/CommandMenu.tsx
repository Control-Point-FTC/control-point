// ⌘K command menu (Modern). Navigation is built from the same visible nav items
// as the sidebar, so it never offers a page the user can't open.
import { useMemo, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Command } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import { Bot, Inbox, Settings, Sun, Moon, ArrowLeftRight, Layers, Search, CornerDownLeft } from 'lucide-react';
import { cn } from '../components/cn';
import { useTheme } from '../hooks/useTheme';
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

  const item = 'flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-base outline-none data-[selected=true]:bg-text-base/[0.08] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-muted';
  const group = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-text-muted';

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content
          data-esc-owner=""
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-[81] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-elevated shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
        >
          <D.Title className="sr-only">Command menu</D.Title>
          <Command label="Command menu" loop className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-text-muted" />
              <Command.Input
                autoFocus
                placeholder="Search pages and actions…"
                className="h-12 w-full bg-transparent text-sm text-text-base placeholder:text-text-muted/70 outline-none"
              />
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto custom-scrollbar p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-text-muted">No results.</Command.Empty>

              <Command.Group heading="Go to" className={group}>
                {pages.map((p) => {
                  const Icon = p.icon;
                  const label = t(p.labelKey);
                  return (
                    <Command.Item key={p.id} value={`go ${label} ${p.section ?? ''}`} onSelect={() => run(() => onNavigate(`/${p.path}`))} className={item}>
                      <Icon /> <span className="flex-1 truncate">{label}</span>
                      {p.section && <span className="text-xs text-text-muted">{p.section}</span>}
                    </Command.Item>
                  );
                })}
                <Command.Item value="go inbox notifications" onSelect={() => run(onOpenInbox)} className={item}><Inbox /> Inbox</Command.Item>
                <Command.Item value="go bruno ai assistant chat" onSelect={() => run(onOpenBruno)} className={item}><Bot /> Ask Bruno</Command.Item>
              </Command.Group>

              {(['Create', 'Actions'] as const).map((g) => {
                const list = actions.filter((a) => a.group === g);
                if (!list.length) return null;
                return (
                  <Command.Group key={g} heading={g} className={group}>
                    {list.map((a) => (
                      <Command.Item key={a.id} value={`${g} ${a.label} ${(a.keywords ?? []).join(' ')}`} onSelect={() => run(a.run)} className={item}>
                        <a.icon /> {a.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}

              {teams.length > 1 && (
                <Command.Group heading="Switch workspace" className={group}>
                  {teams.filter((tm) => tm.id !== activeTeamId).map((tm) => (
                    <Command.Item key={tm.id} value={`workspace switch ${tm.name}`} onSelect={() => run(() => onSwitchTeam(tm.id))} className={item}>
                      <Layers /> {tm.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Preferences" className={group}>
                <Command.Item value="settings preferences" onSelect={() => run(onOpenSettings)} className={item}><Settings /> Settings</Command.Item>
                <Command.Item value="theme toggle dark light" onSelect={() => run(toggle)} className={item}>
                  {theme === 'light' ? <Moon /> : <Sun />} {theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                </Command.Item>
                <Command.Item value="legacy experience interface old" onSelect={() => run(() => void setMode('legacy'))} className={item}>
                  <ArrowLeftRight /> Switch to Legacy experience
                </Command.Item>
              </Command.Group>
            </Command.List>
            <div className={cn('flex items-center gap-3 border-t border-line px-4 py-2 text-xs text-text-muted')}>
              <span className="flex items-center gap-1"><CornerDownLeft className="size-3" /> to select</span>
              <span>↑↓ to move</span>
              <span className="ml-auto">esc to close</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
