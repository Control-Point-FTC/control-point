// Modern Experience shell (2026 redesign). Replaces the Legacy sidebar, header
// bar, footer and mobile tab bar. Pages render through the same routes and the
// same App state; screens without a Modern page yet render their Legacy page
// inside this shell.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  Search, Inbox, Bot, ChevronDown, ChevronsLeft, ChevronsRight, Settings, LogOut, Sun, Moon,
  Sparkles, MessageSquareHeart, Compass, Check, Copy, Menu, Home, MessageSquare, CheckSquare, Layers, Plus, ArrowLeftRight,
} from 'lucide-react';
import { cn } from '../components/cn';
import { assetUrl } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { PRESENCE_META, PRESENCE_SETTINGS, PRESENCE_SETTING_META, PresenceDot } from '../components/presence';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  Sheet, SheetContent, SheetTitle, SheetDescription, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, Badge, Toaster,
} from '../components/ui-kit';
import { buildModernNav, isActive, type ModernNavItem, type NavItemLike } from './nav';
import { CommandMenu, type CommandAction } from './CommandMenu';
import { useInterfaceMode } from './interfaceMode';

export interface ModernShellProps {
  visibleTabs: NavItemLike[];
  activeTab: string;
  pageTitle: string;
  onNavigate: (path: string) => void;
  content: ReactNode;
  /** Full-bleed routes (Messages, Bruno full view) manage their own scrolling. */
  immersive: boolean;
  isMobile: boolean;
  user: any;
  teams: any[];
  activeTeam: any;
  activeTeamName: string;
  isAdmin: boolean;
  onSwitchTeam: (teamId: number) => void;
  unreadMentions: number;
  notifications: any[];
  onOpenSettings: () => void;
  onLogout: () => void;
  onOpenBruno: () => void;
  botName: string;
  onOpenFeedback: () => void;
  onSetupGuide: () => void;
  onOpenWhatsNew: () => void;
  onStatusPick: (status: string) => void;
  predictSeen: boolean;
  /** Extra command-menu actions (create task, check in, …). */
  actions: CommandAction[];
}

const COLLAPSE_KEY = 'cp-modern-sidebar-collapsed';
const SECTIONS_KEY = 'cp-modern-sections-closed';

function readJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export function ModernAvatar({ user, className }: { user: any; className?: string }) {
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={cn('relative inline-flex shrink-0 size-7 rounded-full overflow-hidden bg-accent text-accent-ink items-center justify-center text-xs font-bold', className)}>
      {user?.avatar_url ? <img src={assetUrl(user.avatar_url)} alt="" className="size-full object-cover" /> : initial}
    </span>
  );
}

export function ModernShell(props: ModernShellProps) {
  const { isMobile, immersive, content } = props;
  const [collapsed, setCollapsed] = useState<boolean>(() => readJSON(COLLAPSE_KEY, false));
  const [cmdOpen, setCmdOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => writeJSON(COLLAPSE_KEY, collapsed), [collapsed]);

  // ⌘K / Ctrl+K: command menu. ⌘J / Ctrl+J: Bruno.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); setCmdOpen((o) => !o); }
      else if (k === 'j') { e.preventDefault(); props.onOpenBruno(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onOpenBruno]);

  // Close the mobile menu after navigating.
  useEffect(() => { setMenuOpen(false); }, [props.activeTab]);

  const unreadInbox = props.notifications.filter((n) => !n.is_read).length;
  const sidebar = (inSheet = false) => {
    // In the mobile menu sheet, every action first closes the sheet so the
    // screen or dialog it opens (Settings, Inbox, search…) isn't covered by it.
    const then = <A extends unknown[]>(fn: (...a: A) => void) => (inSheet ? (...a: A) => { setMenuOpen(false); fn(...a); } : fn);
    return (
      <SidebarContent
        inSheet={inSheet}
        {...props}
        onOpenSettings={then(props.onOpenSettings)}
        onOpenBruno={then(props.onOpenBruno)}
        onOpenFeedback={then(props.onOpenFeedback)}
        onSetupGuide={then(props.onSetupGuide)}
        onOpenWhatsNew={then(props.onOpenWhatsNew)}
        onLogout={then(props.onLogout)}
        onSwitchTeam={then(props.onSwitchTeam)}
        onNavigate={then(props.onNavigate)}
        collapsed={!isMobile && collapsed}
        unreadInbox={unreadInbox}
        onOpenSearch={then(() => setCmdOpen(true))}
        onOpenInbox={then(() => props.onNavigate('/inbox'))}
        onToggleCollapsed={isMobile ? undefined : () => setCollapsed((c) => !c)}
      />
    );
  };

  return (
    // reducedMotion="user": Motion springs (the sliding nav pill) follow the OS setting.
    <MotionConfig reducedMotion="user">
    <TooltipProvider>
      <div className="modern-shell flex h-dvh w-full overflow-hidden bg-primary text-text-base" data-ui-shell="modern">
        {!isMobile && (
          <aside
            aria-label="Sidebar"
            className={cn(
              'hidden md:flex flex-col shrink-0 border-r border-line bg-secondary/60 transition-[width] duration-150 ease-out',
              collapsed ? 'w-[60px]' : 'w-[248px]',
            )}
          >
            {sidebar()}
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            title={props.pageTitle}
            teamName={props.activeTeamName}
            isMobile={isMobile}
            onOpenSearch={() => setCmdOpen(true)}
            onOpenBruno={props.onOpenBruno}
          />
          <main
            id="main"
            className={cn(
              'relative flex min-h-0 flex-1 flex-col',
              immersive
                ? 'overflow-hidden pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0'
                : 'm-canvas overflow-y-auto overflow-x-clip custom-scrollbar px-4 pt-8 pb-28 sm:px-6 md:pb-12 lg:px-8',
            )}
          >
            {/* Keyed by route: each page mounts fresh and plays its own entrance motion. */}
            <motion.div
              key={props.activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              // Immersive pages (chat, Bruno) manage their own scrolling.
              className={cn('flex min-w-0 grow flex-col', immersive && 'min-h-0')}
            >
              {content}
            </motion.div>
          </main>
        </div>

        {isMobile && (
          <MobileTabBar
            {...props}
            onOpenMenu={() => setMenuOpen(true)}
          />
        )}
        {isMobile && (
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 gap-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">All sections of Control Point</SheetDescription>
              {sidebar(true)}
            </SheetContent>
          </Sheet>
        )}

        <Toaster />
        <CommandMenu
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          visibleTabs={props.visibleTabs}
          onNavigate={props.onNavigate}
          teams={props.teams}
          activeTeamId={props.activeTeam?.id}
          onSwitchTeam={props.onSwitchTeam}
          onOpenBruno={props.onOpenBruno}
          onOpenSettings={props.onOpenSettings}
          onOpenInbox={() => props.onNavigate('/inbox')}
          actions={props.actions}
        />

      </div>
    </TooltipProvider>
    </MotionConfig>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function SidebarContent(props: ModernShellProps & {
  /** Rendered inside the mobile menu sheet (leave room for its close button). */
  inSheet?: boolean;
  collapsed: boolean;
  unreadInbox: number;
  onOpenSearch: () => void;
  onOpenInbox: () => void;
  onToggleCollapsed?: () => void;
}) {
  const { t } = useTranslation();
  const { collapsed } = props;
  const nav = useMemo(() => buildModernNav(props.visibleTabs), [props.visibleTabs]);
  const [closed, setClosed] = useState<string[]>(() => readJSON(SECTIONS_KEY, []));
  useEffect(() => writeJSON(SECTIONS_KEY, closed), [closed]);
  const toggleSection = (id: string) => setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div className="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top)]">
      <div className={cn('flex items-center gap-1 p-2', collapsed && 'flex-col', props.inSheet && 'pr-12')}>
        <WorkspaceSwitcher {...props} />
        {props.onToggleCollapsed && (
          <IconAction label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={props.onToggleCollapsed} collapsed={collapsed}>
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          </IconAction>
        )}
      </div>

      <div className="px-2 pb-2">
        <NavButton collapsed={collapsed} icon={Search} label="Search" onClick={props.onOpenSearch} hint="⌘K" />
      </div>

      <nav aria-label="Primary" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-3">
        <div className="space-y-0.5">
          {nav.primary.map((item) => (
            <NavLink key={item.id} item={item} {...props} label={t(item.labelKey)}
              count={item.id === 'chat' ? props.unreadMentions : 0} />
          ))}
          <NavButton collapsed={collapsed} icon={Inbox} label="Inbox" onClick={props.onOpenInbox} count={props.unreadInbox} active={props.activeTab === 'inbox'} />
          <NavButton collapsed={collapsed} icon={Bot} label={props.botName} onClick={props.onOpenBruno} hint="⌘J" onboard="header-bruno" />
        </div>

        {nav.sections.map((sec) => {
          // The compact rail has no section headers to reopen, so it always shows every icon.
          const isClosed = !collapsed && closed.includes(sec.id) && !sec.items.some((i) => isActive(i, props.activeTab));
          return (
            <div key={sec.id} className="mt-4">
              {collapsed ? (
                <div className="mx-2 mb-1 h-px bg-line" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  aria-expanded={!isClosed}
                  className="group flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted/80 hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  {sec.label}
                  <ChevronDown className={cn('size-3.5 opacity-0 transition group-hover:opacity-100', isClosed && '-rotate-90 opacity-100')} />
                </button>
              )}
              {!isClosed && (
                <div className="mt-0.5 space-y-0.5">
                  {sec.items.map((item) => <NavLink key={item.id} item={item} {...props} label={t(item.labelKey)} />)}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <UserMenu {...props} />
      </div>
    </div>
  );
}

function rowClass(active: boolean, collapsed: boolean) {
  return cn(
    'group relative flex w-full items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-accent/60',
    collapsed ? 'size-10 justify-center mx-auto' : 'h-8 px-2.5',
    active ? 'text-text-base' : 'text-text-muted hover:bg-text-base/[0.05] hover:text-text-base',
  );
}

function WithTip({ collapsed, label, children }: { collapsed: boolean; label: string; children: ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavLink({ item, label, activeTab, onNavigate, collapsed, predictSeen, count = 0 }: ModernShellProps & {
  item: ModernNavItem; label: string; collapsed: boolean; count?: number;
}) {
  const active = isActive(item, activeTab);
  const Icon = item.icon;
  return (
    <WithTip collapsed={collapsed} label={label}>
      <a
        href={`/${item.path}`}
        onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onNavigate(`/${item.path}`); }}
        aria-current={active ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        data-onboard={`nav-${item.id}`}
        className={rowClass(active, collapsed)}
      >
        {/* The active pill slides between items. */}
        {active && <motion.span layoutId="m-nav-active" transition={{ type: 'spring', stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-lg bg-text-base/[0.08]" aria-hidden="true" />}
        <Icon className={cn('relative size-4 shrink-0', active ? 'text-accent' : 'text-text-muted group-hover:text-text-base')} />
        {!collapsed && <span className="relative truncate">{label}</span>}
        {!collapsed && item.badge === 'beta' && (
          <span className="relative ml-auto flex items-center gap-1">
            {!predictSeen && <Badge variant="new">New</Badge>}
            <Badge variant="beta">Beta</Badge>
          </span>
        )}
        {count > 0 && (
          collapsed
            ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" aria-hidden="true" />
            : <span className="relative ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">{count > 99 ? '99+' : count}</span>
        )}
        {collapsed && item.badge === 'beta' && !predictSeen && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" aria-hidden="true" />}
      </a>
    </WithTip>
  );
}

function NavButton({ collapsed, icon: Icon, label, onClick, hint, count = 0, onboard, active = false }: {
  collapsed: boolean; icon: typeof Search; label: string; onClick: () => void; hint?: string; count?: number; onboard?: string; active?: boolean;
}) {
  return (
    <WithTip collapsed={collapsed} label={label}>
      <button type="button" onClick={onClick} aria-label={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} data-onboard={onboard} className={rowClass(active, collapsed)}>
        {active && <motion.span layoutId="m-nav-active" transition={{ type: 'spring', stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-lg bg-text-base/[0.08]" aria-hidden="true" />}
        <Icon className={cn('relative size-4 shrink-0', active ? 'text-accent' : 'text-text-muted group-hover:text-text-base')} />
        {!collapsed && <span className="relative truncate">{label}</span>}
        {!collapsed && hint && count === 0 && <kbd className="ml-auto hidden md:inline rounded border border-line px-1.5 text-[11px] font-medium text-text-muted">{hint}</kbd>}
        {count > 0 && (
          collapsed
            ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" aria-hidden="true" />
            : <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">{count > 99 ? '99+' : count}</span>
        )}
      </button>
    </WithTip>
  );
}

function IconAction({ label, onClick, collapsed, children }: { label: string; onClick: () => void; collapsed: boolean; children: ReactNode }) {
  return (
    <WithTip collapsed={collapsed} label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-text-base/[0.06] hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 [&_svg]:size-4"
      >
        {children}
      </button>
    </WithTip>
  );
}

function WorkspaceSwitcher({ collapsed, teams, activeTeam, activeTeamName, onSwitchTeam, isAdmin, onOpenSettings, onNavigate }: ModernShellProps & { collapsed: boolean }) {
  const [copied, setCopied] = useState(false);
  const code = activeTeam?.access_code as string | undefined;
  const copy = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Workspace: ${activeTeamName}`}
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-lg text-left outline-none transition-colors hover:bg-text-base/[0.06] focus-visible:ring-2 focus-visible:ring-accent/60',
            collapsed ? 'size-10 justify-center' : 'h-10 flex-1 px-2',
          )}
        >
          <img src="/logo.png?v=3" alt="" className="size-6 shrink-0 rounded-md" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-base">{activeTeamName || 'Control Point'}</span>
              <ChevronDown className="size-4 shrink-0 text-text-muted" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {teams.map((tm: any) => (
          <DropdownMenuItem key={tm.id} onSelect={() => { if (tm.id !== activeTeam?.id) onSwitchTeam(tm.id); }}>
            <Layers />
            <span className="min-w-0 flex-1 truncate">{tm.name}</span>
            {tm.id === activeTeam?.id && <Check className="text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => onNavigate('/teams')}>
          <Plus /> Create or join a workspace
        </DropdownMenuItem>
        {isAdmin && code && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void copy(); }}>
              {copied ? <Check className="text-emerald-500" /> : <Copy />}
              <span className="flex-1">Copy invite code</span>
              <span className="font-mono text-xs text-text-muted">{code}</span>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenSettings}><Settings /> Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ collapsed, user, onOpenSettings, onLogout, onOpenFeedback, onSetupGuide, onOpenWhatsNew, onStatusPick }: ModernShellProps & { collapsed: boolean }) {
  const { theme, toggle } = useTheme();
  const { setMode } = useInterfaceMode();
  const presence = user?.presence || 'offline';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-onboard="nav-settings-gear"
          aria-label="Account menu"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg text-left outline-none transition-colors hover:bg-text-base/[0.06] focus-visible:ring-2 focus-visible:ring-accent/60',
            collapsed ? 'size-10 justify-center mx-auto' : 'h-11 px-2',
          )}
        >
          <span className="relative">
            <ModernAvatar user={user} />
            <PresenceDot presence={presence} className="absolute -bottom-0.5 -right-0.5 size-2.5 ring-2 ring-secondary" />
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-text-base">{user?.name}</span>
              <span className="block truncate text-xs text-text-muted">{PRESENCE_META[presence]?.label || user?.role}</span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><PresenceDot presence={presence} className="size-2.5" /> Set status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuRadioGroup value={user?.presence_status || 'online'} onValueChange={onStatusPick}>
              {PRESENCE_SETTINGS.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>{PRESENCE_SETTING_META[s]?.label ?? s}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenSettings}><Settings /> Settings</DropdownMenuItem>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggle(); }}>
          {theme === 'light' ? <Moon /> : <Sun />} {theme === 'light' ? 'Dark theme' : 'Light theme'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void setMode('legacy')}><ArrowLeftRight /> Switch to Legacy experience</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenWhatsNew}><Sparkles /> What's new</DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenFeedback}><MessageSquareHeart /> Send feedback</DropdownMenuItem>
        <DropdownMenuItem onSelect={onSetupGuide}><Compass /> Setup guide</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onLogout}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Top bar + mobile tab bar
// ---------------------------------------------------------------------------

function TopBar({ title, teamName, isMobile, onOpenSearch, onOpenBruno }: {
  title: string; teamName: string; isMobile: boolean; onOpenSearch: () => void; onOpenBruno: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-8 md:pt-0">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {!isMobile && <span className="truncate text-text-muted">{teamName}</span>}
        {!isMobile && <span className="text-text-muted/50" aria-hidden="true">/</span>}
        <h1 className="truncate font-semibold text-text-base">{title}</h1>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search"
          className="flex h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-text-muted transition-colors hover:border-text-base/20 hover:text-text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden md:inline text-[11px]">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={onOpenBruno}
          aria-label="Ask Bruno"
          className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-text-base/[0.06] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <Bot className="size-4" />
        </button>
      </div>
    </header>
  );
}

const MOBILE_TABS: { id: string; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'chat', label: 'Messages', icon: MessageSquare },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
];

function MobileTabBar({ visibleTabs, activeTab, onNavigate, onOpenBruno, onOpenMenu, unreadMentions }: ModernShellProps & { onOpenMenu: () => void }) {
  const tabs = MOBILE_TABS.filter((tab) => visibleTabs.some((v) => v.id === tab.id));
  const btn = 'relative flex flex-1 flex-col items-center justify-center gap-1 min-h-[60px] text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60';
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-secondary/95 backdrop-blur-lg md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button key={tab.id} type="button" data-onboard={`mtab-${tab.id}`} aria-current={active ? 'page' : undefined}
            onClick={() => onNavigate(`/${tab.id}`)} className={cn(btn, active ? 'text-accent' : 'text-text-muted')}>
            <tab.icon className="size-5" />
            {tab.label}
            {tab.id === 'chat' && unreadMentions > 0 && <span className="absolute right-[calc(50%-18px)] top-2 size-2 rounded-full bg-red-500" aria-hidden="true" />}
          </button>
        );
      })}
      <button type="button" onClick={onOpenBruno} className={cn(btn, 'text-text-muted')}>
        <Bot className="size-5" /> Bruno
      </button>
      <button type="button" data-onboard="mtab-more" onClick={onOpenMenu} aria-label="Menu" className={cn(btn, 'text-text-muted')}>
        <Menu className="size-5" /> Menu
      </button>
    </nav>
  );
}
