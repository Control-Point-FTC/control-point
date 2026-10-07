// Modern Settings (phase 5b): one page for everything that used to be split
// across the Settings modal, /profile and /settings. Sections are addressed by
// ?section= so any entry point can deep-link. Laid out like Discord's: User
// Settings, then Workspace Settings (Overview, Members, Roles, Admin) under
// the workspace's name; Esc leaves. Personal sections are for everyone;
// workspace sections follow the same gates as before.
import { useEffect, useRef, type ComponentType } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Bot, Building2, KeyRound, Palette, ShieldCheck, ShieldHalf, UserRound, Users } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Page, PageHeader } from '../../ui/page';
import { ProfileSection } from './ProfileSection';
import { AppearanceSection } from './AppearanceSection';
import { CallsSection } from './CallsSection';
import { BrunoSection } from './BrunoSection';
import { AccountSection } from './AccountSection';
import { WorkspaceSection } from './WorkspaceSection';
import { AdminSection } from './AdminSection';
import { MembersSection, RolesSection } from './PeopleSections';

export type SettingsSectionId = 'profile' | 'appearance' | 'calls' | 'bruno' | 'account' | 'workspace' | 'members' | 'roles' | 'admin';

interface SectionDef { id: SettingsSectionId; label: string; hint: string; icon: ComponentType<{ className?: string }>; group: 'You' | 'Workspace' }

export function SettingsPage(props: any) {
  const { isAdmin, isOwner, hasPerm, activeTeamName } = props;
  const showAdmin = !!(isAdmin || isOwner || hasPerm?.('manage_voice'));
  // Members: anyone who can manage, invite or assign roles. Roles: manage_roles.
  const showMembers = !!(isAdmin || hasPerm?.('manage_members') || hasPerm?.('invite_members') || hasPerm?.('manage_roles'));
  const showRoles = !!hasPerm?.('manage_roles');
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation();
  const k = (key: string) => t(`settingsPage.${key}`);
  const sections: SectionDef[] = [
    { id: 'profile', label: k('profile'), hint: k('profileHint'), icon: UserRound, group: 'You' },
    { id: 'appearance', label: k('appearance'), hint: k('appearanceHint'), icon: Palette, group: 'You' },
    { id: 'calls', label: k('calls'), hint: k('callsHint'), icon: Bell, group: 'You' },
    { id: 'bruno', label: k('bruno'), hint: k('brunoHint'), icon: Bot, group: 'You' },
    { id: 'account', label: k('account'), hint: k('accountHint'), icon: KeyRound, group: 'You' },
    // Team-wide settings. Each card inside keeps its own gate.
    { id: 'workspace', label: k('workspace'), hint: isAdmin ? k('workspaceHintAdmin') : k('workspaceHint'), icon: Building2, group: 'Workspace' },
    ...(showMembers ? [{ id: 'members' as const, label: k('members'), hint: k('membersHint'), icon: Users, group: 'Workspace' as const }] : []),
    ...(showRoles ? [{ id: 'roles' as const, label: k('roles'), hint: k('rolesHint'), icon: ShieldCheck, group: 'Workspace' as const }] : []),
    ...(showAdmin ? [{ id: 'admin' as const, label: k('admin'), hint: k('adminHint'), icon: ShieldHalf, group: 'Workspace' as const }] : []),
  ];
  const requested = params.get('section') as SettingsSectionId | null;
  // Google Calendar's OAuth redirect returns to /settings?cal_linked=1.
  const fallback: SettingsSectionId = params.has('cal_linked') || params.has('cal_error') ? 'workspace' : 'profile';
  const active: SettingsSectionId = sections.some((s) => s.id === requested) ? requested! : fallback;
  const go = (id: SettingsSectionId) => {
    const next = new URLSearchParams(params);
    next.set('section', id);
    next.delete('invite');
    setParams(next, { replace: true });
  };
  const current = sections.find((s) => s.id === active)!;
  // Like Discord: Esc closes Settings (back where you came from), unless a
  // dialog, menu or text field has it.
  const navigate = useNavigate();
  // Is there a page of ours to go back to? The browser router numbers its
  // entries (idx; section switches replace, so they don't count); in-memory
  // routers mark the first entry with the key 'default'.
  const locKey = useLocation().key;
  const histIdx = (window.history.state as { idx?: number } | null)?.idx;
  const canGoBack = typeof histIdx === 'number' ? histIdx > 0 : locKey !== 'default';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]')) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      if (canGoBack) navigate(-1); else navigate('/dashboard');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, canGoBack]);
  // Phones: keep the active chip in view in the scrolling row.
  const navRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && typeof el.scrollIntoView === 'function' && window.matchMedia?.('(max-width: 1023px)').matches) {
      el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [active]);

  return (
    <Page>
      <PageHeader eyebrow={t('settings.title')} title={current.label} description={current.hint} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={k('sections')} className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          {/* Phones: a scrollable chip row. Desktop: a grouped list. */}
          <ul ref={navRef} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
            {sections.map((s, i) => {
              const on = s.id === active;
              const showGroup = i === 0 || sections[i - 1].group !== s.group;
              return (
                <li key={s.id} className="shrink-0">
                  {showGroup && (
                    <p className="mb-1 mt-5 hidden truncate px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0 lg:block">
                      {s.group === 'You' ? k('groupYou') : activeTeamName ? `${activeTeamName} · ${k('groupWorkspace')}` : k('groupWorkspace')}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:rounded-full max-lg:border max-lg:border-border',
                      on ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {on && <motion.span layoutId="settings-active" className="absolute inset-0 rounded-lg bg-muted max-lg:rounded-full" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                    <s.icon className="relative size-4 shrink-0" />
                    <span className="relative whitespace-nowrap font-medium">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
              {active === 'profile' && <ProfileSection {...props} />}
              {active === 'appearance' && <AppearanceSection {...props} />}
              {active === 'calls' && <CallsSection />}
              {active === 'bruno' && <BrunoSection {...props} />}
              {active === 'account' && <AccountSection {...props} />}
              {active === 'workspace' && <WorkspaceSection {...props} onOpenSection={go} />}
              {active === 'members' && <MembersSection {...props} />}
              {active === 'roles' && <RolesSection {...props} />}
              {active === 'admin' && <AdminSection {...props} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Page>
  );
}

/** A titled group of settings rows inside a section. */
export function SettingsGroup({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('mb-8', className)}>
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}

/** One row: label + description on the left, control on the right. */
export function SettingsRow({ label, description, children, htmlFor, stack }: { label: string; description?: string; children?: React.ReactNode; htmlFor?: string; stack?: boolean }) {
  return (
    <div className={cn('flex gap-4 border-b border-border px-4 py-4 last:border-b-0', stack ? 'flex-col' : 'flex-col sm:flex-row sm:items-center sm:justify-between')}>
      <div className="min-w-0">
        {htmlFor ? <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label> : <p className="text-sm font-medium">{label}</p>}
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className={cn('shrink-0', stack && 'w-full')}>{children}</div>}
    </div>
  );
}
