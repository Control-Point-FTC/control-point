import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Users, Crown, Pencil, CalendarCheck, CheckSquare, Wallet, Globe, Newspaper, Mail, X, ChevronRight, ChevronDown, Plus, AtSign, TrendingUp, MessageSquare, Lock, Calendar, UserCheck, Zap, Trash2, Bolt, Code2, Check, ShieldCheck, UserX, Copy, Sparkles, Save, Trophy, Layers, Box, FileBox, ClipboardCheck, Package, ChevronUp, Phone, Video, ScanLine, Keyboard, BadgeCheck, Loader2, CheckCircle2, Clock3, ListTodo } from 'lucide-react';
import { ContextMenuProvider, useContextMenu } from './components/contextmenu/ContextMenuProvider';
import { motion } from 'motion/react';
// Heavy libraries stay out of the initial bundle: recharts (via TaskAnalytics),
// Monaco (via CodeView), and three.js (via CadModelViewer, already lazy).
const TaskAnalytics = React.lazy(() => import('./components/TaskAnalytics'));
const CodePage = React.lazy(() => import('./modern/pages/code/CodePage').then(m => ({ default: m.CodePage })));
// Route-level code splitting: each page downloads when first opened (the
// dashboard stays in the main bundle so the first screen paints at once).
const OwnerPage = React.lazy(() => import('./modern/pages/owner/OwnerPage').then((m) => ({ default: m.OwnerPage })));
const CheckinPage = React.lazy(() => import('./modern/pages/attendance/CheckinPage').then((m) => ({ default: m.CheckinPage })));
const PredictPage = React.lazy(() => import('./modern/pages/predict/PredictPage').then((m) => ({ default: m.PredictPage })));
const TeamStatsPage = React.lazy(() => import('./modern/pages/stats/TeamStatsPage').then((m) => ({ default: m.TeamStatsPage })));
const InboxPage = React.lazy(() => import('./modern/pages/InboxPage').then((m) => ({ default: m.InboxPage })));
const TasksPage = React.lazy(() => import('./modern/pages/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const CalendarPage = React.lazy(() => import('./modern/pages/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const AttendancePage = React.lazy(() => import('./modern/pages/attendance/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const PeoplePage = React.lazy(() => import('./modern/pages/people/PeoplePage').then((m) => ({ default: m.PeoplePage })));
const CommunicationPage = React.lazy(() => import('./modern/pages/communication/CommunicationPage').then((m) => ({ default: m.CommunicationPage })));
const MessagesPage = React.lazy(() => import('./modern/pages/messages/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const BrunoPage = React.lazy(() => import('./modern/pages/bruno/BrunoPage').then((m) => ({ default: m.BrunoPage })));
const SettingsPage = React.lazy(() => import('./modern/pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const BudgetPage = React.lazy(() => import('./modern/pages/budget/BudgetPage').then((m) => ({ default: m.BudgetPage })));
const InventoryPage = React.lazy(() => import('./modern/pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const OutreachPage = React.lazy(() => import('./modern/pages/outreach/OutreachPage').then((m) => ({ default: m.OutreachPage })));
const ResourcesPage = React.lazy(() => import('./modern/pages/resources/ResourcesPage').then((m) => ({ default: m.ResourcesPage })));
const CadPage = React.lazy(() => import('./modern/pages/cad/CadPage').then((m) => ({ default: m.CadPage })));

/** Lightweight placeholder while a heavy lazy chunk (charts, code editor) loads. */
function ChartLoadingFallback({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-text-muted animate-pulse" aria-busy="true">
      {label}
    </div>
  );
}
import { BRUNO_OPEN_EVENT, clearScreenContext, setScreenEntity, setScreenRoute } from './services/brunoContext';
import { SetupChecklist, fetchOnboardingState, saveOnboardingState, defaultOnboardingState, shouldShowWelcome, shouldShowChecklist, firstIncompleteWizardStep, resolveTourSteps, type OnboardingState } from './components/onboarding';
import { clearFtcCache } from './components/ftcCache';
import { clearScoutCache } from './services/ftcScoutApi';
import { clearPredictCache } from './services/predictApi';
import { format } from 'date-fns';
import { useWhatsNewAutoOpen } from './components/WhatsNewModal';
import { WhatsNewDialog } from './modern/pages/WhatsNewDialog';
import { InterfaceModeProvider } from './modern/interfaceMode';
import { ModernShell } from './modern/ModernShell';
import { CookieBar, FeedbackDialog, InstallBanner, MentionToastCard } from './modern/overlays/Overlays';
import { CallDock, CallStage, IncomingCall } from './modern/overlays/CallUi';
import { WelcomeDialog } from './modern/pages/onboarding/WelcomeDialog';
import { SetupDialog } from './modern/pages/onboarding/SetupDialog';
import { TourCard } from './modern/pages/onboarding/TourCard';
import { clearSetupDrafts } from './components/onboarding/useSetupWizard';
import { clearTourDraft } from './components/onboarding/useWalkthrough';
import { ModernLanding } from './modern/pages/auth/ModernLanding';
import { OAuthSignupPage, RolePage, SignInPage, SignupPage, VerifyEmailPage } from './modern/pages/auth/AuthPages';
import { CodeRevealDialog } from './modern/pages/auth/CodeRevealDialog';
import { TeamlessPage } from './modern/pages/auth/TeamlessPage';
import { JoinInvitePage } from './modern/pages/join/JoinInvitePage';
import { clearInvite, inviteTokenFromPath, joinWithCodeOrLink, peekInvite, stashInvite } from './modern/pages/join/joinLink';
import { JOIN_REQUESTS_EVENT } from './modern/pages/people/JoinRequestsCard';
import { notifMeta } from './modern/notifications';
import { HomePage } from './modern/pages/HomePage';
import { CompletionDialog } from './modern/pages/tasks/TaskDialogs';
import { BrunoPanelSwitch } from './modern/BrunoDock';
import { useMyWork } from './components/dashboard/useMyWork';
import { useTasksController } from './components/tasks/useTasksController';
import { parseOutreachRows } from './components/outreach/parseOutreachRows';
import type { CommandAction } from './modern/CommandMenu';
import type { NotificationActions } from './modern/notifications';
import { clearDrafts } from './modern/drafts';

import { Team, Member, AttendanceRecord, Task, BudgetItem, OutreachEvent, Communication, CalendarEvent } from './types';
import { streamAttendanceInsights, streamActivitySummary } from './services/aiService';
import { clearOfflineData, warmOfflineSession } from './services/offlineData';
import { apiFetch, assetUrl } from './services/api';
import { DialogHost, confirmDialog, promptDialog, notify } from './components/dialog';
import { VoiceProvider, useVoice, type VoiceContextValue } from './voice';
import LegalPage from './Legal';
import { cn, Card, Button, Input } from './components/ui';
import DashboardView from './components/dashboard/DashboardView';
import { useTranslation } from 'react-i18next';
import { applyPulseOrigins, readPulseOrigins } from './utils/gridPulse';

// Only accept real 6-digit hex colors. A junk string saved as a theme color
// (e.g. "null", " ", "#") would make var(--color-accent) invalid and silently
// strip the volt yellow from the whole UI, so invalid values fall back.
function validHex(v: any): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

// "#22c55e" -> "34 197 94" — the space-separated form rgb(var(--x) / a) needs.
// Callers pass a validHex() value.
function hexToRgbTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// The team grid colour is cached per session so the next load paints it
// before the team list arrives — and never leaks to another account.
const GRID_RGB_CACHE_KEY = 'controlpoint-grid-rgb';
// The session token itself lives only in an HttpOnly cookie the page can't
// read. The page keeps a random per-sign-in tag instead (not a credential):
// it says "signed in on this device" and keys per-session caches.
const SESSION_TAG_KEY = 'cp-session-tag';
/** Pre-cookie builds stored the real token here; read once to migrate, then removed. */
const LEGACY_SESSION_KEY = 'sessionId';
function readStoredSessionId(): string | null {
  try { return localStorage.getItem(SESSION_TAG_KEY); } catch { return null; }
}
function newSessionTag(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
function forgetStoredSession() {
  try { localStorage.removeItem(SESSION_TAG_KEY); localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* storage unavailable */ }
}
/**
 * The boot-time session check, shared by every caller on this page load.
 * A pre-cookie token is single-use (the server rotates it into the cookie
 * and retires it), so a second concurrent check — e.g. React re-running the
 * mount effect — must reuse this one rather than send the token again.
 */
let restoreSessionPromise: Promise<any> | null = null;
function restoreSessionOnce(): Promise<any> {
  if (!restoreSessionPromise) {
    let legacy: string | null = null;
    try { legacy = localStorage.getItem(LEGACY_SESSION_KEY); } catch { /* storage unavailable */ }
    restoreSessionPromise = apiFetch('/api/auth/me', legacy ? { headers: { 'X-Session-ID': legacy } } : {})
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (legacy) { try { localStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* ignore */ } }
        return data;
      });
  }
  return restoreSessionPromise;
}
// Short non-reversible tag of the session id, so the cache doesn't hold a
// second copy of the token — it only needs to tell sessions apart.
function sessionTag(sid: string): string {
  let h = 5381;
  for (let i = 0; i < sid.length; i++) h = ((h << 5) + h + sid.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function readCachedGridRgb(): string | null {
  try {
    const c = JSON.parse(localStorage.getItem(GRID_RGB_CACHE_KEY) || 'null');
    const sid = readStoredSessionId();
    return c && sid && c.sid === sessionTag(sid) && /^\d{1,3} \d{1,3} \d{1,3}$/.test(c.rgb) ? c.rgb : null;
  } catch { return null; }
}
function writeCachedGridRgb(rgb: string | null): void {
  try {
    const sid = readStoredSessionId();
    if (rgb && sid) localStorage.setItem(GRID_RGB_CACHE_KEY, JSON.stringify({ sid: sessionTag(sid), rgb }));
    else localStorage.removeItem(GRID_RGB_CACHE_KEY);
  } catch {}
}

// --- Components ---
// (Input lives in ./components/ui — shared with standalone auth screens.)

const Select = ({ className, options, ...props }: any) => (
  <ThemedSelect 
    className={cn(
      "w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all",
      className
    )}
    {...props}
  >
    {options.map((opt: any) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </ThemedSelect>
);

// Multi-select dropdown for task assignees — checkbox list with avatar chips.
const AssigneeMultiSelect = ({ members, selected, onChange }: any) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open ]);
  const sel = Array.isArray(selected) ? selected : [];
  const toggle = (id: number) => {
    onChange(sel.includes(id) ? sel.filter((x: number) => x !== id) : [...sel, id]);
  };
  const selMembers = members.filter((m: any) => sel.includes(m.id));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-left text-text-base focus:outline-none focus:border-accent/60 transition-all flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-1.5 flex-wrap min-h-[24px]">
          {selMembers.length === 0 ? (
            <span className="text-text-muted">Assign to…</span>
          ) : selMembers.map((m: any) => (
            <span key={m.id} className="inline-flex items-center gap-1 bg-accent/15 text-accent text-xs font-semibold rounded-full pl-1 pr-2 py-0.5">
              {m.avatar_url
                ? <img src={assetUrl(m.avatar_url)} alt="" className="w-5 h-5 rounded-full object-cover" />
                : <span className="w-5 h-5 rounded-full bg-accent/25 flex items-center justify-center text-[10px]">{m.name?.charAt(0)}</span>}
              {m.name}
            </span>
          ))}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-text-muted shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-text-base/10 bg-elevated shadow-xl shadow-black/30">
          {members.length === 0 && <div className="px-4 py-3 text-sm text-text-muted">No members</div>}
          {members.map((m: any) => (
            <label key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-text-base/[0.05] cursor-pointer">
              <input
                type="checkbox"
                checked={sel.includes(m.id)}
                onChange={() => toggle(m.id)}
                className="w-4 h-4 accent-[#FFC700]"
              />
              {m.avatar_url
                ? <img src={assetUrl(m.avatar_url)} alt="" className="w-6 h-6 rounded-full object-cover" />
                : <span className="w-6 h-6 rounded-full bg-text-base/10 flex items-center justify-center text-xs font-bold">{m.name?.charAt(0)}</span>}
              <span className="text-sm text-text-base">{m.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
import { Select as ThemedSelect } from './components/Select';

// --- Voice calling: socket bridge ---
// The app owns exactly one WebSocket (connectSocket below). The voice engine
// never opens its own socket — this bridge renders INSIDE <VoiceProvider> and
// hands the provider's socket API (attach/detach/handleSocketMessage, plus
// leave for team-switch/logout teardown) to the App-level socket handlers
// through a stable ref. All four are stable useCallbacks, so reassignment is
// a no-op after the first mount.
type VoiceSocketApi = Pick<
  VoiceContextValue,
  'attachSocket' | 'detachSocket' | 'handleSocketMessage' | 'leave'
>;

function VoiceSocketBridge({ voiceRef }: { voiceRef: { current: VoiceSocketApi | null } }) {
  const voice = useVoice();
  useEffect(() => {
    voiceRef.current = {
      attachSocket: voice.attachSocket,
      detachSocket: voice.detachSocket,
      handleSocketMessage: voice.handleSocketMessage,
      leave: voice.leave,
    };
  }, [voice, voiceRef]);
  // Unmounted (signed out / teamless): don't leave a stale API behind.
  useEffect(() => () => { voiceRef.current = null; }, [voiceRef]);
  return null;
}

// --- Main App ---

// Static nav model: lives at module scope so it can be referenced anywhere in
// the component (including above its old declaration site) without TDZ issues.
// Sidebar navigation. `pinned` items stay at the top; everything else is grouped
// under a section label. The Teams & Members entry expands into a submenu
// (Members / Roles) instead of Roles being a top-level tab.
// Labels use i18n keys — translated at render time via getNavItems(t).
const navItems = [
  { id: 'dashboard', path: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, pinned: true },
  { id: 'chat', path: 'chat', labelKey: 'nav.messaging', icon: MessageSquare, pinned: true },
  { id: 'stats', path: 'stats', labelKey: 'nav.teamStats', icon: Trophy, group: 'Compete' },
  { id: 'predict', path: 'predict', labelKey: 'nav.predict', icon: Sparkles, group: 'Compete', badge: 'beta' },
  {
    id: 'teams', path: 'teams', labelKey: 'nav.teamsMembers', icon: Users, group: 'Team',
    children: [
      { id: 'teams', path: 'teams', labelKey: 'nav.members', icon: Users },
      { id: 'roles', path: 'roles', labelKey: 'nav.roles', icon: ShieldCheck, perm: 'manage_roles' },
    ],
  },
  { id: 'attendance', path: 'attendance', labelKey: 'nav.attendance', icon: CalendarCheck, scope: 'attendance', group: 'Team' },
  { id: 'calendar', path: 'calendar', labelKey: 'nav.calendar', icon: Calendar, group: 'Team' },
  { id: 'comm', path: 'comm', labelKey: 'nav.communication', icon: Mail, group: 'Team' },
  { id: 'tasks', path: 'tasks', labelKey: 'nav.tasks', icon: CheckSquare, group: 'Engineering' },
  { id: 'inventory', path: 'inventory', labelKey: 'nav.inventory', icon: Zap, scope: 'inventory', group: 'Engineering' },
  {
    id: 'cad', path: 'cad', labelKey: 'nav.cad', icon: Box, group: 'Engineering',
    children: [
      { id: 'cad', path: 'cad', labelKey: 'nav.cadDashboard', icon: Box },
      { id: 'cad-docs', path: 'cad-docs', labelKey: 'nav.onshapeDocs', icon: FileBox },
      { id: 'cad-reviews', path: 'cad-reviews', labelKey: 'nav.designReviews', icon: ClipboardCheck },
      { id: 'cad-snapshots', path: 'cad-snapshots', labelKey: 'nav.snapshots', icon: Layers },
      { id: 'cad-parts', path: 'cad-parts', labelKey: 'nav.partsList', icon: Package },
    ],
  },
  { id: 'code', path: 'code', labelKey: 'nav.code', icon: Code2, scope: 'code', group: 'Engineering' },
  { id: 'outreach', path: 'outreach', labelKey: 'nav.outreach', icon: Globe, group: 'Outreach' },
  { id: 'budget', path: 'budget', labelKey: 'nav.budget', icon: Wallet, scope: 'budget', group: 'Outreach' },
  { id: 'resources', path: 'resources', labelKey: 'nav.resources', icon: Newspaper, group: 'Outreach' },
  { id: 'owner', path: 'owner', labelKey: 'nav.owner', icon: Crown, ownerOnly: true, pinned: true },
];
// NOTE: 'profile' and 'settings' are intentionally not nav items anymore —
// they live in the Discord-style settings popup (gear button by the user card).
// Their routes still work for deep links.
// Header titles for routes that aren't nav items (otherwise the header would
// fall back to "Dashboard").
const ROUTE_TITLE_KEYS: Record<string, string> = {
  inbox: 'nav.inbox',
  profile: 'nav.profile',
  settings: 'nav.teamSettings',
};

// Reactive mobile breakpoint (md breakpoint, 768px). Replaces direct
// window.innerWidth reads so the layout responds to rotation/resize.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

// Sequence for refreshAttendance's latest-wins check (App is a singleton).
let attendanceRefreshSeq = 0;

/** Shown for the moment a page's code is downloading (first visit only). */
function PageLoadingFallback() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      Loading…
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  // Initialize grid appearance settings from localStorage
  useEffect(() => {
    const root = document.documentElement;
    const get = (k: string, d: string) => {
      try { return localStorage.getItem(k) ?? d; } catch { return d; }
    };
    if (get('controlpoint-grid-enabled', '1') === '0') root.classList.add('grid-off');
    if (get('controlpoint-grid-pulse', '1') === '0') root.classList.add('grid-pulse-off');
    if (get('controlpoint-grid-glow', '1') === '0') root.classList.add('grid-glow-off');
    root.style.setProperty('--grid-size', `${get('controlpoint-grid-size', '32')}px`);
    root.style.setProperty('--grid-opacity', get('controlpoint-grid-opacity', '0.12'));
    root.style.setProperty('--grid-pulse-speed', `${get('controlpoint-grid-pulse-speed', '6')}s`);
    root.style.setProperty('--grid-pulse-opacity', get('controlpoint-grid-pulse-opacity', '0.22'));
    applyPulseOrigins(root, readPulseOrigins(get('controlpoint-grid-pulse-origins', 'center,edges,corners')));
    // Team branding grid colour cached for this session (refreshed once teams load).
    const cachedGridRgb = readCachedGridRgb();
    if (cachedGridRgb) root.style.setProperty('--grid-rgb', cachedGridRgb);
    root.style.setProperty('--grid-glow-size', `${get('controlpoint-grid-glow-size', '280')}px`);
    root.style.setProperty('--grid-glow-opacity', get('controlpoint-grid-glow-opacity', '0.25'));
  }, []);
  // Reactive volt grid: track cursor over the main content area so the grid
  // ignites around it, like the landing page hero. Keyed on the <main>
  // element itself (callback ref) — it isn't mounted yet on first render
  // (loading splash / auth), so a run-once effect would never attach.
  const [voltMain, setVoltMain] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const main = voltMain;
    if (!main) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = main.getBoundingClientRect();
        main.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(1)}px`);
        main.style.setProperty('--my', `${(e.clientY - r.top).toFixed(1)}px`);
        main.classList.add('grid-hot');
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      main.classList.remove('grid-hot');
    };
    main.addEventListener('mousemove', onMove);
    main.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      main.removeEventListener('mousemove', onMove);
      main.removeEventListener('mouseleave', onLeave);
    };
  }, [voltMain]);
  // Real URL routing — every section is its own route, so refresh keeps you where you are
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname.split('/')[1] || 'dashboard';
  const setActiveTab = (id: string) => navigate(`/${id}`);
  const activeNav = navItems.find((t) => t.id === activeTab)
    || navItems.flatMap((t) => (t as any).children || []).find((c: any) => c.id === activeTab);
  // Messaging is immersive: no top bar, no footer — the chat fills the whole content area
  const isChatRoute = activeTab === 'chat';
  // Bruno gets the same immersive full-height treatment as chat: no app
  // header/footer, no outer scroll — the conversation fills the viewport.
  const isBrunoRoute = activeTab === 'bruno';
  const isImmersiveRoute = isChatRoute || isBrunoRoute;
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const isMobile = useIsMobile();
  // Teams & Members submenu (Members / Roles), Discord-style settings popup,
  // and the presence status picker live here so the sidebar owns them.
  const [teamsNavOpen, setTeamsNavOpen] = useState(false);
  const [cadNavOpen, setCadNavOpen] = useState(false);
  // Collapsible sidebar section groups (Compete/Team/Engineering/Outreach).
  // Persisted so an outreach person can hide Engineering, etc.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('cp-collapsed-nav-groups') || '{}');
    } catch {
      return {};
    }
  });
  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem('cp-collapsed-nav-groups', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  // Auto-expand the Teams submenu when we're on one of its pages.
  useEffect(() => {
    if (activeTab === 'teams' || activeTab === 'roles') setTeamsNavOpen(true);
    if (activeTab === 'cad' || activeTab === 'cad-docs' || activeTab === 'cad-reviews' || activeTab === 'cad-snapshots' || activeTab === 'cad-parts') setCadNavOpen(true);
  }, [activeTab]);

  /** Change my presence status (online / idle / dnd / invisible).
   *  Optimistic: the dot updates instantly; the server PATCH runs in the
   *  background and we roll back only if it fails. */
  // Settings entry points open the Settings page (optionally at a section).
  const openSettings = (section?: string) => {
    navigate(section ? `/settings?section=${section}` : '/settings');
  };

  const handleStatusPick = async (status: string) => {
    if (!currentUser) return;
    setStatusPickerOpen(false);
    const prev = currentUser.presence_status;
    if (prev === status) return;
    setCurrentUser({ ...currentUser, presence_status: status });
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentUser.name, role: currentUser.role || '', presence_status: status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        setCurrentUser((u: any) => (u ? { ...u, ...data.user, presence_status: data.user.presence_status || status } : u));
      } else {
        setCurrentUser((u: any) => (u ? { ...u, presence_status: prev } : u));
        notify(data.error || 'Could not update status.', 'error');
      }
    } catch {
      setCurrentUser((u: any) => (u ? { ...u, presence_status: prev } : u));
      notify('Could not update status.', 'error');
    }
  };

  // Keep the sidebar/drawer state in sync when crossing the mobile breakpoint
  // (drawer on phones, docked sidebar on larger screens).
  useEffect(() => {
    setIsSidebarOpen(!isMobile);
  }, [isMobile]);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    if (isMobile) setIsSidebarOpen(false);
  }, [location.pathname, isMobile]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  // Dismiss header dropdowns (notifications / team / account) when the user
  // scrolls the page — no need to tap the button again to close them.
  useEffect(() => {
    const dismiss = () => {
      setShowNotifications(false);
      setShowUserMenu(false);
      setShowTeamMenu(false);
    };
    window.addEventListener('scroll', dismiss, { passive: true });
    return () => window.removeEventListener('scroll', dismiss);
  }, []);
  const [brunoPanelOpen, setBrunoPanelOpen] = useState(false);
  // The sidebar panel's active chat, so "expand" can land the full view on
  // the same conversation instead of an unrelated chat. Ref, not state —
  // it's only read at expand time.
  const brunoPanelChatRef = useRef<number | null>(null);
  // Pages (Team Stats → Analyze, "Scout with Bruno") can open the sidebar.
  useEffect(() => {
    const open = () => setBrunoPanelOpen(true);
    window.addEventListener(BRUNO_OPEN_EVENT, open);
    return () => window.removeEventListener(BRUNO_OPEN_EVENT, open);
  }, []);

  // ---- Onboarding (welcome, tour, setup wizard, dashboard checklist) ----
  // Persisted per account (email-keyed) on the server so progress survives
  // refresh, logout/login, and team switches.
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  // A closed tour starts at its own start step next time (the draft only bridges a look switch).
  useEffect(() => { if (!tourOpen) clearTourDraft(); }, [tourOpen]);
  const [tourStartStep, setTourStartStep] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  // A closed setup starts fresh next time (its drafts only bridge a look switch).
  useEffect(() => { if (!wizardOpen) clearSetupDrafts(); }, [wizardOpen]);
  const [wizardStartStep, setWizardStartStep] = useState<0 | 1 | 2 | 3>(0);
  const tourSaveTimer = useRef<number | null>(null);
  const tourStepRef = useRef(0);

  // Single click → Copilot-style side panel, instantly. (The panel's own
  // expand button reaches the full /bruno view, so no double-click wait.)
  const handleBrunoButton = () => {
    setBrunoPanelOpen(true);
  };
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewAuto, setWhatsNewAuto] = useWhatsNewAutoOpen();
  const closeWhatsNew = () => { setWhatsNewOpen(false); setWhatsNewAuto(false); };
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // True once the initial session check has finished. Until then we show a
  // minimal splash — never the landing page — so a refresh never flashes the
  // marketing homepage before the app shell appears.
  const [authReady, setAuthReady] = useState(false);
  const [authScreen, setAuthScreen] = useState<'landing' | 'login' | 'role' | 'signup-admin' | 'signup-student' | 'code-reveal'>('landing');
  // Invite links (/join/<token>): the team the link leads to (for the signup
  // heading) and, after a signup that needs approval, the team asked.
  const [inviteTeamName, setInviteTeamName] = useState<string | null>(null);
  const [invitePendingTeam, setInvitePendingTeam] = useState<string | null>(null);
  // Email+password signups must verify ownership before getting a session.
  const [verifyState, setVerifyState] = useState<{ email: string; mode: 'admin' | 'student' | 'login' | 'setup' } | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  // Password-less accounts (OAuth / roster) set a first password through the
  // emailed code: the forgot-password flow opens straight at the code step.
  const [forgotStartAtCode, setForgotStartAtCode] = useState(false);
  // Landing / auth look: this device's last interface mode (phase 9b).
  const [signupTeam, setSignupTeam] = useState<{ id: number; name: string; access_code: string } | null>(null);

  // Data State
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Shared task-completion proof dialog: every Done transition (dashboard,
  // Tasks list, Kanban, context menu) opens this — the server rejects direct
  // PATCH transitions to done, so nothing may bypass it.
  const [completingTask, setCompletingTask] = useState<any | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [completionFiles, setCompletionFiles] = useState<File[]>([]);
  const [completing, setCompleting] = useState(false);
  const openCompleteDialog = (task: any) => {
    if (!task || task.status === 'done') return;
    setCompletingTask(task);
    setCompletionNotes('');
    setCompletionFiles([]);
  };
  const closeCompleteDialog = () => {
    setCompletingTask(null);
    setCompletionNotes('');
    setCompletionFiles([]);
  };
  const handleCompleteTask = async () => {
    if (!completingTask || completing) return;
    setCompleting(true);
    try {
      const form = new FormData();
      form.append('notes', completionNotes.trim());
      for (const f of completionFiles.slice(0, 5)) form.append('images', f);
      const res = await apiFetch(`/api/tasks/${completingTask.id}/complete`, {
        method: 'POST',
        body: form,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not complete task');
      // Optimistic update; the WS broadcast confirms it for everyone.
      if (d.task) {
        setTasks((ts: any[]) => ts.map((t: any) => (t.id === d.task.id ? d.task : t)));
      } else {
        refresh.tasks();
      }
      notify('Task marked done.', 'success');
      closeCompleteDialog();
    } catch (e: any) {
      notify(e?.message || 'Could not complete task.', 'error');
    } finally {
      setCompleting(false);
    }
  };
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [outreach, setOutreach] = useState<OutreachEvent[]>([]);
  const [socialProfiles, setSocialProfiles] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [documentation, setDocumentation] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  // Per-channel message cache so switching channels feels instant: show the
  // cached list immediately, then revalidate in the background.
  const msgCache = useRef(new Map<number, any[]>());
  // Per-channel flag: true once we've fetched the oldest messages (no more to load).
  const msgExhausted = useRef(new Map<number, boolean>());  // Discord-style text channels (no servers — channels live inside the team)
  const [channels, setChannels] = useState<any[]>([]);
  const [chatCategories, setChatCategories] = useState<any[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);

  const fetchJsonStandalone = async (url: string) => {
    try {
      const res = await apiFetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  // Load the team's channels once signed in; remember the active channel.
  useEffect(() => {
    if (!currentUser || !currentUser.team_id) return;
    (async () => {
      // Fetch channels and categories concurrently — they don't depend on each other.
      const [ch, cats] = await Promise.all([
        fetchJsonStandalone('/api/chat/channels'),
        fetchJsonStandalone('/api/chat/categories').catch(() => null),
      ]);
      if (Array.isArray(ch) && ch.length > 0) {
        setChannels(ch);
        setActiveChannelId((prev) => {
          if (prev && ch.some((c: any) => c.id === prev)) return prev;
          const general = ch.find((c: any) => c.name === 'general') || ch[0];
          return general ? general.id : null;
        });
      }
      if (Array.isArray(cats)) setChatCategories(cats);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.team_id]);

  // Load this channel's messages whenever it changes.
  useEffect(() => {
    if (!currentUser || !activeChannelId) return;
    const cached = msgCache.current.get(activeChannelId);
    if (cached) setMessages(cached);
    (async () => {
      const msgs = await fetchJsonStandalone(`/api/messages?channel_id=${activeChannelId}`);
      if (Array.isArray(msgs)) {
        msgCache.current.set(activeChannelId, msgs);
        // A short first page means we've already got the oldest message.
        if (msgs.length < 100) msgExhausted.current.set(activeChannelId, true);
        else msgExhausted.current.delete(activeChannelId);
        if (activeChannelIdRef.current === activeChannelId) setMessages(msgs);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, currentUser?.id]);

  // The socket connects once per login, so mirror the active channel in a ref
  // for the (stale-closure) onmessage handler.
  const activeChannelIdRef = useRef<number | null>(null);
  useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);
  // Voice engine socket API (populated by <VoiceSocketBridge> inside
  // <VoiceProvider>): the one app WebSocket routes voice:* messages here and
  // attaches the engine's send callback on (re)connect.
  const voiceApiRef = useRef<VoiceSocketApi | null>(null);
  // Tracks whether the app WebSocket has connected before, so onopen can
  // tell an initial connect from a reconnect (presence may have decayed
  // while disconnected — refresh the roster on reconnect).
  const socketWasConnected = useRef(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifMenu, setNotifMenu] = useState<{ x: number; y: number; id: number; isRead: boolean } | null>(null);
  // Slide-in mention toast: { notification } | null. Shown when a mention
  // arrives for a channel the user isn't currently viewing.
  const [mentionToast, setMentionToast] = useState<any | null>(null);
  const mentionToastTimer = useRef<any>(null);
  /** Parsed JSON metadata on a notification (channel_id / message_id for mentions). */
  const unreadMentions = useMemo(
    () => notifications.filter((n: any) => !n.is_read && n.type === 'mention').length,
    [notifications]
  );
  const dismissMentionToast = () => {
    setMentionToast(null);
    if (mentionToastTimer.current) { clearTimeout(mentionToastTimer.current); mentionToastTimer.current = null; }
  };
  const showMentionToast = (notification: any) => {
    dismissMentionToast();
    setMentionToast(notification);
    mentionToastTimer.current = setTimeout(() => setMentionToast(null), 7000);
  };
  const [hiddenDates, setHiddenDates] = useState<string[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [insights, setInsights] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);
  // Background refresh indicator: after the first full load, fetchData()
  // refreshes silently so everyday actions never blank the screen with the
  // full "Synchronizing club data..." overlay.
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);
  const refreshCount = useRef(0);
  // First-load failure: show a retry panel instead of spinning forever.
  const [loadError, setLoadError] = useState<string | null>(null);
  // First load must never hang the "Synchronizing club data..." overlay
  // forever (flaky mobile networks, server restarts mid-load).
  const FIRST_LOAD_TIMEOUT_MS = 45000;
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiLoadingTarget, setAiLoadingTarget] = useState<string | null>(null);
  const [colorVersion, setColorVersion] = useState(0);

  // Session State
  const [sessionId, setSessionId] = useState<string | null>(() => readStoredSessionId());
  const [streamSessions, setStreamSessions] = useState<Map<string, { streamId?: string; position: number }>>(new Map());

  // --- Components ---

  const ThinkingIndicator = () => {
    const text = "Thinking...";
    return (
      <div className="flex gap-1 items-center">
        {text.split('').map((char, i) => (
          <motion.span
            key={i}
            animate={{ 
              opacity: [0.3, 1, 0.3],
              scale: [0.95, 1.05, 0.95]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: "easeInOut"
            }}
            className="text-accent font-bold"
          >
            {char}
          </motion.span>
        ))}
      </div>
    );
  };

  // WebSocket
  const [socket, setSocket] = useState<WebSocket | null>(null);
  // Tell the server which channel we're viewing so @here pings reach the
  // right people.
  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN && activeChannelId != null) {
      try { socket.send(JSON.stringify({ type: 'viewing', channel_id: activeChannelId })); } catch {}
    }
  }, [socket, activeChannelId]);

  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [youtubeEnabled, setYoutubeEnabled] = useState(false);
  const [tiktokEnabled, setTiktokEnabled] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthSignup, setOauthSignup] = useState<{ token: string; intent: 'admin_signup' | 'student_signup' | 'signup'; provider: 'google' | 'discord' | 'github' } | null>(null);

  const OAUTH_ERROR_MESSAGES: Record<string, string> = {
    not_invited: 'This account is not registered yet — create an account to get started.',
    email_unverified: 'We need a verified email from that provider — verify your email there and try again.',
    account_removed: 'This account was removed — contact your team admin.',
    invalid_state: 'Sign-in expired — please try again.',
  };

  // Handle OAuth callbacks (?oauth=ok / ?oauth_error= / ?oauth_signup=, plus legacy google_* params)
  useEffect(() => {
    apiFetch('/api/auth/config')
      .then(r => r.json())
      .then(d => {
        setGoogleEnabled(!!d.googleEnabled);
        setDiscordEnabled(!!d.discordEnabled);
        setGithubEnabled(!!d.githubEnabled);
        setYoutubeEnabled(!!d.youtubeEnabled);
        setTiktokEnabled(!!d.tiktokEnabled);
      })
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    // OAuth finished: the server already set the session cookie.
    const oauthDone = params.get('oauth') === 'ok';
    const ge = params.get('oauth_error') || params.get('google_error');
    const gsu = params.get('oauth_signup') || params.get('google_signup');
    const gi = params.get('intent');
    const gp = params.get('provider');
    const provider = gp === 'discord' || gp === 'github' ? gp : 'google';
    if (ge) {
      setOauthError(OAUTH_ERROR_MESSAGES[ge] || 'Sign-in failed. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (gsu && (gi === 'admin_signup' || gi === 'student_signup' || gi === 'signup')) {
      setOauthSignup({ token: gsu, intent: gi, provider });
      window.history.replaceState({}, '', window.location.pathname);
    }
    // Restore the session from the cookie. A device signed in before the
    // cookie switch still holds its old token in localStorage: it is sent
    // once (a header, never a URL) so the server rotates it into the cookie,
    // then forgotten.
    restoreSessionOnce()
      .then(data => {
        if (data.user) {
          const tag = readStoredSessionId() || newSessionTag();
          try { localStorage.setItem(SESSION_TAG_KEY, tag); } catch { /* ignore */ }
          setSessionId(tag);
          setCurrentUser(data.user);
          setIsLoggedIn(true);
        } else {
          forgetStoredSession();
          if (oauthDone) setOauthError('Sign-in failed. Please try again.');
        }
      })
      .catch(() => { if (oauthDone) setOauthError('Sign-in failed. Please try again.'); })
      .finally(() => {
        if (oauthDone) window.history.replaceState({}, '', window.location.pathname);
        setAuthReady(true);
      });
  }, []);

  // If any API call gets a 401 (expired/revoked session), the api layer
  // clears the stored session and fires this — return to signed-out state.
  useEffect(() => {
    const onUnauthorized = () => {
      clearDrafts(); // a half-written form never follows a session to the next user
      clearOfflineData();
      setIsLoggedIn(false);
      setCurrentUser(null);
      setSessionId(null);
      setTeams([]);
      setTeamsLoaded(false);
      disconnectSocket();
    };
    window.addEventListener('cp:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cp:unauthorized', onUnauthorized);
  }, []);

  // Apply the custom accent color. Only the accent override is applied —
  // surfaces and text come from the theme tokens (index.css) so light/dark
  // mode always stays coherent. Re-applies on theme toggles.
  useEffect(() => {
    const applyColors = () => {
      const root = document.documentElement;
      const clear = () => root.style.removeProperty('--color-accent');
      if (isLoggedIn && currentUser) {
        const myTeam = teams.find(t => t.id === currentUser.team_id);
        const accent = [currentUser.accent_color, myTeam?.accent_color].find(validHex)?.trim();
        if (accent) root.style.setProperty('--color-accent', accent);
        else clear();
        // Background grid + pulse follow the team branding (admin-set on
        // Teams & Members), not a member's personal accent.
        // Only act once we actually know the team's colour: the team row
        // is loaded, or the account is genuinely teamless (team_id null →
        // volt). teamsLoaded alone isn't enough — it's also set when the
        // /api/teams fetch fails, and that must not wipe the cached colour.
        if (teamsLoaded && (myTeam || !currentUser.team_id)) {
          const gridRgb = validHex(myTeam?.accent_color) ? hexToRgbTriplet(myTeam!.accent_color.trim()) : null;
          if (gridRgb) root.style.setProperty('--grid-rgb', gridRgb);
          else root.style.removeProperty('--grid-rgb');
          writeCachedGridRgb(gridRgb);
        }
      } else {
        clear();
        // On boot this branch runs before the session check, so keep the
        // session-scoped cached colour; once the session is really gone
        // (logout / expiry), drop it so the next account starts on volt.
        if (!readStoredSessionId()) {
          root.style.removeProperty('--grid-rgb');
          writeCachedGridRgb(null);
        }
      }
    };
    applyColors();
    // useTheme() dispatches this whenever the theme toggles.
    window.addEventListener('cp-theme-change', applyColors);
    return () => window.removeEventListener('cp-theme-change', applyColors);
  }, [currentUser, teams, teamsLoaded, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
    socketWanted.current = true;
    connectSocket();
    return () => disconnectSocket();
  }, [isLoggedIn]);

  // Presence reconciliation: computed presence decays server-side
  // (online -> idle after 3 min quiet, offline after 15), so re-read the
  // lightweight presence map every minute while signed in. Dots stay
  // truthful without a full roster fetch.
  useEffect(() => {
    if (!isLoggedIn) return;
    let stopped = false;
    const pollPresence = async () => {
      try {
        const r = await apiFetch('/api/members/presence');
        if (!r.ok || stopped) return;
        const d = await r.json().catch(() => ({}));
        const map = d?.presence || {};
        setMembers((prev: any[]) => prev.map((m: any) =>
          (map[m.id] !== undefined && map[m.id] !== m.presence) ? { ...m, presence: map[m.id] } : m));
      } catch { /* presence is best-effort — the next poll retries */ }
    };
    const t = setInterval(pollPresence, 60000);
    return () => { stopped = true; clearInterval(t); };
  }, [isLoggedIn]);

  // Bruno structured actions (calendar/outreach inserts) refresh team data
  // without a page reload — event-driven, no polling.
  useEffect(() => {
    if (!isLoggedIn) return;
    const handler = () => { fetchData(); };
    window.addEventListener('bruno-data-changed', handler);
    return () => window.removeEventListener('bruno-data-changed', handler);
  }, [isLoggedIn]);


  // One live socket while signed in. It authenticates with the session
  // cookie sent on the upgrade, so it is reopened whenever the session
  // changes (team switch), closed for good on sign-out, and reconnects with
  // backoff + jitter after drops.
  const socketRef = useRef<WebSocket | null>(null);
  const socketWanted = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);

  function disconnectSocket() {
    socketWanted.current = false;
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    const ws = socketRef.current;
    socketRef.current = null;
    socketWasConnected.current = false;
    voiceApiRef.current?.detachSocket();
    if (ws) { try { ws.close(); } catch { /* already closed */ } }
    setSocket(null);
  }

  /** Reopen the socket now (the session cookie changed, e.g. team switch). */
  function reopenSocket() {
    if (!socketWanted.current) return;
    const ws = socketRef.current;
    socketRef.current = null;
    voiceApiRef.current?.detachSocket();
    if (ws) { try { ws.close(); } catch { /* already closed */ } }
    reconnectAttempt.current = 0;
    connectSocket();
  }

  const connectSocket = () => {
    if (!socketWanted.current) return;
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      if (socketRef.current !== ws) return;
      reconnectAttempt.current = 0;
      // The server identifies the socket from the session cookie.
      ws.send(JSON.stringify({ type: 'hello' }));
      // Reconnect: anything sent while the socket was down (messages, tasks,
      // notifications, presence) was missed — resync everything.
      if (socketWasConnected.current) fetchData();
      socketWasConnected.current = true;
      // Voice signaling rides this socket — attach the engine's send path.
      // (Re-attached on every reconnect; attachSocket re-announces state.)
      voiceApiRef.current?.attachSocket((m) => {
        try { ws.send(JSON.stringify(m)); } catch { /* socket gone */ }
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Voice engine first: handleSocketMessage returns true for any
        // voice:* type so the branches below never see them.
        if (voiceApiRef.current?.handleSocketMessage(msg)) return;
        if (msg.type === 'chat') {
          const cur = activeChannelIdRef.current;
          setMessages(prev => {
            // Reconcile: replace our optimistic message with the server echo.
            if (msg.client_id && prev.some((m: any) => m.client_id === msg.client_id)) {
              const next = prev.map((m: any) => (m.client_id === msg.client_id ? { ...msg, pending: false } : m));
              if (cur != null && (msg.channel_id === cur || msg.channel_id == null)) msgCache.current.set(cur, next);
              return next;
            }
            if (prev.some((m: any) => m.id === msg.id)) return prev;
            if (cur != null && msg.channel_id !== cur && msg.channel_id != null) return prev;
            const next = [...prev, msg];
            if (cur != null && (msg.channel_id === cur || msg.channel_id == null)) msgCache.current.set(cur, next);
            return next;
          });
        } else if (msg.type === 'chat_denied') {
          if (msg.client_id) setMessages(prev => prev.filter((m: any) => m.client_id !== msg.client_id));
          notify(msg.error || 'You cannot post in that channel.', 'error');
        } else if (msg.type === 'channel_created') {
          setChannels(prev => (prev.some((c: any) => c.id === msg.channel.id) ? prev : [...prev, msg.channel]));
        } else if (msg.type === 'channel_updated') {
          setChannels(prev => prev.map((c: any) => (c.id === msg.channel.id ? msg.channel : c)));
        } else if (msg.type === 'channel_deleted') {
          setChannels(prev => prev.filter((c: any) => c.id !== msg.channelId));
          setActiveChannelId(prev => (prev === msg.channelId ? msg.movedTo : prev));
        } else if (msg.type === 'category_created') {
          setChatCategories(prev => (prev.some((c: any) => c.id === msg.category.id) ? prev : [...prev, msg.category]));
        } else if (msg.type === 'category_updated') {
          setChatCategories(prev => prev.map((c: any) => (c.id === msg.category.id ? msg.category : c)));
        } else if (msg.type === 'category_deleted') {
          setChatCategories(prev => prev.filter((c: any) => c.id !== msg.categoryId));
          setChannels(prev => prev.map((c: any) => (c.category_id === msg.categoryId ? { ...c, category_id: null } : c)));
        } else if (msg.type === 'message_deleted') {
          const cur = activeChannelIdRef.current;
          const applyDel = (prev: any[]) => {
            const next = msg.deleted_permanently
              ? prev.filter(m => m.id !== msg.id)
              : prev.map(m => m.id === msg.id ? { ...m, deleted_at: msg.deleted_at } : m);
            if (cur != null) msgCache.current.set(cur, next);
            return next;
          };
          setMessages(applyDel);
        } else if (msg.type === 'notification') {
          if (currentUser && msg.notification.user_id === currentUser.id) {
            setNotifications(prev => [msg.notification, ...prev]);
            // Slide-in mention toast — only when the user isn't already
            // looking at the mentioned channel.
            if (msg.notification.type === 'mention') {
              let meta: any = {};
              try { meta = msg.notification.meta ? JSON.parse(msg.notification.meta) : {}; } catch {}
              const onChatRoute = window.location.pathname.split('/')[1] === 'chat';
              const viewingIt = onChatRoute && meta.channel_id != null && Number(activeChannelIdRef.current) === Number(meta.channel_id);
              if (!viewingIt) showMentionToast(msg.notification);
            }
          }
        } else if (msg.type === 'message:reaction') {
          // Live reaction update: swap in the server's canonical reaction list.
          const cur = activeChannelIdRef.current;
          setMessages((prev: any[]) => {
            const next = prev.map((m: any) => (m.id === msg.messageId ? { ...m, reactions: msg.reactions } : m));
            if (cur != null) msgCache.current.set(cur, next);
            return next;
          });
        } else if (msg.type === 'task_created') {
          // Live mission control: another user created a task — add it, no refresh.
          if (msg.task && msg.task.id) {
            setTasks((prev: any[]) => (prev.some((t: any) => t.id === msg.task.id) ? prev : [...prev, msg.task]));
          }
        } else if (msg.type === 'task_updated') {
          if (msg.task && msg.task.id) {
            setTasks((prev: any[]) => prev.map((t: any) => (t.id === msg.task.id ? { ...t, ...msg.task } : t)));
          }
        } else if (msg.type === 'task_deleted') {
          setTasks((prev: any[]) => prev.filter((t: any) => t.id !== msg.id));
        } else if (msg.type === 'tasks_changed') {
          // Bulk import: simplest correct update is a refetch.
          refresh.tasks();
        } else if (msg.type === 'member_joined') {
          if (msg.member && msg.member.id) {
            setMembers((prev: any[]) => (prev.some((m: any) => m.id === msg.member.id) ? prev : [...prev, msg.member]));
          }
        } else if (msg.type === 'member_updated') {
          if (msg.member && msg.member.id) {
            setMembers((prev: any[]) => prev.map((m: any) => (m.id === msg.member.id ? { ...m, ...msg.member } : m)));
          }
        } else if (msg.type === 'member_removed') {
          setMembers((prev: any[]) => prev.filter((m: any) => m.id !== msg.id));
        } else if (msg.type === 'join_requests_changed') {
          window.dispatchEvent(new CustomEvent(JOIN_REQUESTS_EVENT));
        } else if (msg.type === 'resources_changed') {
          // ResourcesView owns its list — nudge it to refetch.
          window.dispatchEvent(new CustomEvent('resources-changed'));
        } else if (msg.type === 'attendance_changed') {
          // Another user marked attendance — refresh it live.
          refresh.attendance();
        } else if (msg.type === 'budget_changed') {
          // Someone logged/edited/deleted a transaction — money must never be stale.
          refresh.budget();
        } else if (msg.type === 'events_changed') {
          refresh.events();
        } else if (msg.type === 'member_roles_changed') {
          // Someone's roles changed — refresh the roster everywhere and
          // re-read my own permissions so the new role applies live.
          refresh.members();
          window.dispatchEvent(new CustomEvent('roles-changed'));
          refreshMe();
        } else if (msg.type === 'roles_changed') {
          // A role was created/edited/deleted — its holders' effective
          // permissions may have changed, so re-read mine too.
          refresh.members();
          window.dispatchEvent(new CustomEvent('roles-changed'));
          refreshMe();
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    };

    ws.onclose = () => {
      if (socketRef.current !== ws) return; // replaced or closed on purpose
      socketRef.current = null;
      // Detach the voice engine's send path — it re-attaches on the new socket.
      voiceApiRef.current?.detachSocket();
      if (!socketWanted.current) return;
      // Exponential backoff with jitter (1s → 30s), so a server restart
      // doesn't get every client reconnecting in the same instant.
      const n = reconnectAttempt.current++;
      const delay = Math.min(30000, 1000 * 2 ** n) * (0.5 + Math.random() / 2);
      reconnectTimer.current = setTimeout(connectSocket, delay);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    };

    setSocket(ws);
  };

  const updateInsights = async () => {
    if (attendance.length === 0 || members.length === 0) return;
    setIsAiLoading(true);
    setAiLoadingTarget('insights');
    setInsights("");
    let aggInsights = '';
    try {
      await streamAttendanceInsights(attendance, members, (chunk) => {
        aggInsights += chunk;
        setInsights(aggInsights);
      });
    } catch (err) {
      console.error('Error updating insights:', err);
      setInsights('Failed to generate insights.');
    } finally {
      setIsAiLoading(false);
      setAiLoadingTarget(null);
    }
  };

  const updateSummary = async (force: boolean = false) => {
    const CACHE_KEY = 'ftcSummaryCache';
    const TS_KEY = 'ftcSummaryTimestamp';
    const COUNT_KEY = 'ftcSummaryItemCount';

    const currentItemCount = (tasks?.length || 0) + (messages?.length || 0) + (budget?.length || 0);

    if (!force && typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY);
      const ts = localStorage.getItem(TS_KEY);
      const prevCount = parseInt(localStorage.getItem(COUNT_KEY) || '0', 10);
      
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        const newItemCount = currentItemCount - prevCount;
        
        // Cache for 10 minutes unless 3+ new items arrived
        if (age < 10 * 60 * 1000 && newItemCount < 3) {
          setSummary(cached);
          return;
        }
      }
    }

    if (!currentUser) return;

    setIsAiLoading(true);
    setAiLoadingTarget('summary');
    setSummary("");
    try {
      let aggSummary = '';
      await streamActivitySummary({ 
        tasks, 
        messages, 
        budget,
        inventory,
        userScope: { role: currentUser.role, is_board: currentUser.is_board, scopes: currentUser.scopes }
      }, (chunk) => {
        aggSummary += chunk;
        setSummary(aggSummary);
      });

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, aggSummary);
        localStorage.setItem(TS_KEY, Date.now().toString());
        localStorage.setItem(COUNT_KEY, currentItemCount.toString());
      }
    } catch (err) {
      console.error('Error updating summary:', err);
      setSummary('Failed to generate summary.');
    } finally {
      setIsAiLoading(false);
      setAiLoadingTarget(null);
    }
  };

  // Per-resource refreshers: mutations refetch only what they changed instead
  // of re-pulling all ~14 endpoints. fetchData() (full refresh) is kept for
  // initial load, team switch, and socket reconnect.
  const fetchJson = async (url: string) => {
    const res = await apiFetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`Fetch failed for ${url}: ${res.status}`);
      return null;
    }
    try {
      return await res.json();
    } catch (e) {
      console.warn(`Failed to parse JSON for ${url}`);
      return null;
    }
  };

  const refreshTeams = async () => {
    const t = await fetchJson('/api/teams');
    if (Array.isArray(t)) setTeams(t);
  };
  const refreshMembers = async () => {
    const m = await fetchJson('/api/members');
    if (Array.isArray(m)) {
      setMembers(m);
      if (currentUser) {
        const updatedUser = m.find((member: any) => member.id === currentUser.id);
        if (updatedUser) setCurrentUser(updatedUser);
      }
    }
  };
  // Latest-wins: overlapping refreshes (save + socket broadcast) can resolve
  // out of order; an older response must never overwrite a newer snapshot.
  const refreshAttendance = async () => {
    const req = ++attendanceRefreshSeq;
    const a = await fetchJson('/api/attendance');
    if (req !== attendanceRefreshSeq) return;
    if (Array.isArray(a)) setAttendance(a);
  };
  const refreshTasks = async () => {
    const tk = await fetchJson('/api/tasks');
    if (Array.isArray(tk)) setTasks(tk);
  };
  const refreshBudget = async () => {
    const b = await fetchJson('/api/budget');
    if (Array.isArray(b)) setBudget(b);
  };
  const refreshOutreach = async () => {
    const o = await fetchJson('/api/outreach');
    if (Array.isArray(o)) setOutreach(o);
  };
  const refreshSocialProfiles = async () => {
    const soc = await fetchJson('/api/outreach/social');
    if (Array.isArray(soc)) setSocialProfiles(soc);
  };
  const refreshInventory = async () => {
    const inv = await fetchJson('/api/inventory');
    if (Array.isArray(inv)) setInventory(inv);
  };
  const refreshCommunications = async () => {
    const c = await fetchJson('/api/communications');
    if (Array.isArray(c)) setCommunications(c);
  };
  const refreshMessages = async () => {
    const msgs = await fetchJson('/api/messages');
    if (Array.isArray(msgs)) setMessages(msgs);
  };
  const refreshSettings = async () => {
    const s = await fetchJson('/api/settings');
    if (s && Array.isArray(s)) {
      setSettings(s.reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {}));
    }
  };
  const refreshHiddenDates = async () => {
    const h = await fetchJson('/api/hidden-dates');
    if (Array.isArray(h)) setHiddenDates(h);
  };
  const refreshDocumentation = async () => {
    const d = await fetchJson('/api/documentation');
    if (Array.isArray(d)) setDocumentation(d);
  };
  const refreshEvents = async () => {
    const ev = await fetchJson('/api/events');
    if (Array.isArray(ev)) setEvents(ev);
  };
  const refreshNotifications = async () => {
    if (currentUser) {
      const notes = await fetchJson(`/api/notifications/${currentUser.id}`);
      if (Array.isArray(notes)) setNotifications(notes);
    }
  };
  // Targeted refresh helpers passed to views via viewProps.
  const refresh = {
    teams: refreshTeams,
    members: refreshMembers,
    attendance: refreshAttendance,
    tasks: refreshTasks,
    budget: refreshBudget,
    outreach: refreshOutreach,
    socialProfiles: refreshSocialProfiles,
    inventory: refreshInventory,
    communications: refreshCommunications,
    messages: refreshMessages,
    settings: refreshSettings,
    hiddenDates: refreshHiddenDates,
    documentation: refreshDocumentation,
    events: refreshEvents,
    notifications: refreshNotifications,
  };

  const fetchData = async () => {
    // First load blocks with the full-screen spinner; every later refresh
    // runs in the background with a slim top progress bar instead.
    const silent = hasLoadedOnce.current;
    if (silent) {
      refreshCount.current += 1;
      setRefreshing(true);
    } else {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const work = (async () => {
        await Promise.all([
          refreshTeams(),
          refreshMembers(),
          refreshAttendance(),
          refreshTasks(),
          refreshBudget(),
          refreshOutreach(),
          refreshSocialProfiles(),
          refreshInventory(),
          refreshCommunications(),
          refreshMessages(),
          refreshSettings(),
          refreshHiddenDates(),
          refreshDocumentation(),
          refreshEvents(),
        ]);
        await refreshNotifications();

        // Background updates
        // Insights and Summary are now manual or context-specific
        if (currentUser) {
          updateSummary();
        }
      })();
      if (silent) {
        await work;
      } else {
        // Never leave the first-load spinner up forever: if the initial sync
        // hangs (dead network, server restarting), surface a retry panel.
        await Promise.race([
          work,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timed out while syncing — check your connection and try again.")), FIRST_LOAD_TIMEOUT_MS)
          ),
        ]);
      }
    } catch (err) {
      console.error("Error in fetchData:", err);
      if (!silent) setLoadError(err instanceof Error ? err.message : "Couldn't load your data.");
    } finally {
      if (silent) {
        refreshCount.current = Math.max(0, refreshCount.current - 1);
        if (refreshCount.current === 0) setRefreshing(false);
      } else {
        setLoading(false);
        hasLoadedOnce.current = true;
      }
      setTeamsLoaded(true);
    }
  };

  /** A sign-in or session change happened; the server already set the
   *  HttpOnly cookie (the token never reaches page code). */
  const persistSession = (_sid: unknown, user: any) => {
    clearDrafts(); // every sign-in (or account switch) starts with no drafts
    const tag = newSessionTag();
    try { localStorage.setItem(SESSION_TAG_KEY, tag); } catch { /* storage unavailable */ }
    setSessionId(tag);
    setCurrentUser(user);
    setIsLoggedIn(true);
    // An open socket is still authenticated as the previous session (e.g.
    // the old team) — reopen it under the new cookie.
    reopenSocket();
    // Save who is signed in now for offline reloads (the old copy was cleared).
    warmOfflineSession();
  };

  // Re-read the signed-in user (used after teamless transitions).
  const refreshMe = async () => {
    try {
      const res = await apiFetch('/api/auth/me');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) setCurrentUser(data.user);
    } catch { /* best effort */ }
  };

  // ——— Multi-team management ———
  // Team-scoped client caches live in localStorage under fixed keys; drop them
  // so the newly active team's data is fetched fresh.
  const clearTeamCaches = () => {
    clearOfflineData(); // the service worker's offline copy of this workspace's data
    clearFtcCache();
    clearScoutCache();
    clearScreenContext();
    clearPredictCache();
    clearDrafts(); // unsent input never follows you into another workspace
    if (typeof localStorage === 'undefined') return;
    [
      'ftcSummaryCache', 'ftcSummaryTimestamp', 'ftcSummaryItemCount',
    ].forEach((k) => localStorage.removeItem(k));
  };

  const handleSwitchTeam = async (teamId: number) => {
    if (teamId === currentUser?.team_id) return;
    // End any active call cleanly before switching teams — no ghost
    // participants on the old team's sessions.
    try { await voiceApiRef.current?.leave(); } catch { /* best effort — the switch must proceed */ }
    setLoading(true);
    try {
      const res = await apiFetch('/api/teams/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not switch teams');
      clearTeamCaches();
      persistSession(data.sessionId, data.user);
      await fetchData();
      notify(`Switched to ${data.team?.name || 'team'}`, 'success');
    } catch (e: any) {
      notify(e.message || 'Could not switch teams', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Join a workspace with an invite link or an access code. Approval links
  // only file a request; otherwise the session moves to the joined team.
  const applyJoin = async (data: any) => {
    if (data.pendingApproval) {
      notify(`Request sent — someone on ${data.team?.name || 'the team'} will approve you`, 'success');
      return;
    }
    clearTeamCaches();
    persistSession(data.sessionId, data.user);
    setTeams((data.user as any)?.teams || []);
    await fetchData();
    notify(data.joined === false ? `You're already in ${data.team?.name || 'that team'} — switched to it` : `Joined ${data.team?.name || 'the team'}`, 'success');
  };
  const handleJoinTeam = async (input: string) => {
    try { await voiceApiRef.current?.leave(); } catch { /* best effort */ }
    await applyJoin(await joinWithCodeOrLink(input));
  };

  // Create a brand-new team for this account; the server switches the session to it.
  // FTC number first (`{ ftc_number }`), or a plain name. A taken number
  // rejects with `err.data.ftcTaken` so the form can offer "Ask to join".
  const handleAddTeam = async (input: string | { ftc_number?: string; name?: string }) => {
    const res = await apiFetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(typeof input === 'string' ? { name: input } : input)
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || 'Could not create team'), { data });
    clearTeamCaches();
    persistSession(data.sessionId, data.user);
    setTeams((data.user as any)?.teams || []);
    await fetchData();
    return data;
  };

  // Delete a team after typed confirmation. Any admin can delete any of their
  // teams, including the last one — the server keeps the session alive and it
  // becomes teamless. If the active team was deleted the server hands back a
  // replacement session on another of the account's teams.
  const handleDeleteTeam = async (team: any) => {
    const isLast = teams.length <= 1;
    const ok = await promptDialog({
      title: 'Delete team?',
      message: isLast
        ? `This permanently deletes "${team.name}" — members, tasks, attendance, chat, budget, inventory, and everything else in this workspace. This is your only team, so you will be left with no teams. This cannot be undone.`
        : `This permanently deletes "${team.name}" — members, tasks, attendance, chat, budget, inventory, and everything else in this workspace. This cannot be undone.`,
      expected: team.name,
      confirmLabel: 'Delete team',
      cancelLabel: 'Keep team',
      danger: true
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/teams/${team.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete team');
      clearTeamCaches();
      if (data.switched) {
        // The deleted team was the active one — adopt the replacement session.
        persistSession(data.switched.sessionId, data.switched.user);
        notify(`"${team.name}" deleted — switched to another team`, 'success');
      } else if (data.teamless) {
        setTeams([]);
        await refreshMe();
        notify(`"${team.name}" deleted — you now have no teams`, 'info');
      } else {
        notify(`"${team.name}" deleted`, 'success');
      }
      setTeams((data.user as any)?.teams || (data.teamless ? [] : teams.filter((t: any) => t.id !== team.id)));
      await fetchData();
    } catch (e: any) {
      notify(e.message || 'Could not delete team', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Leave a team (non-admin path). The server blocks leaving as the last admin.
  const handleLeaveTeam = async (team: any) => {
    const isLast = teams.length <= 1;
    const ok = await confirmDialog({
      title: 'Leave team?',
      message: isLast
        ? `Leave "${team.name}"? You will be left with no teams. Your past messages and work stay with the team.`
        : `Leave "${team.name}"? Your past messages and work stay with the team.`,
      confirmLabel: 'Leave team',
      danger: true
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/teams/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: team.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not leave team');
      clearTeamCaches();
      if (data.switched) {
        persistSession(data.switched.sessionId, data.switched.user);
        notify(`Left "${team.name}" — switched to another team`, 'success');
      } else if (data.teamless) {
        setTeams([]);
        await refreshMe();
        notify(`Left "${team.name}" — you now have no teams`, 'info');
      } else {
        notify(`Left "${team.name}"`, 'success');
      }
      await fetchData();
    } catch (e: any) {
      notify(e.message || 'Could not leave team', 'error');
    } finally {
      setLoading(false);
    }
  };

  const currentTeamId = currentUser?.team_id;
  // Resolve the active team from the freshly-fetched teams list — never from
  // currentUser.teams, which is absent after a team switch (the switch endpoint
  // returns a bare member row). The old fallback to teams[0] made the NavGPT
  // qualification stick to the first team after switching workspaces.
  const activeTeam = teams.find((t: any) => t.id === currentTeamId);
  const activeTeamName = (activeTeam as any)?.name || teams[0]?.name || 'My team';
  // Secret persona: NavGPT ❤️ — only exists for 4215 Hypnotic Robotics (default ON).
  // For every other team the chatbot is always Bruno.
  const navGptQualified = /hypnotic/i.test(activeTeamName || '') || /4215/.test(activeTeamName || '');
  const navGptActive = navGptQualified && (activeTeam?.navgpt_enabled ?? 0) === 1;
  const botName = navGptActive ? 'NavGPT ❤️' : 'Bruno';
  // Bruno screen context: the page the user is on (same title as the header).
  const pageTitle = activeTab === 'bruno' ? botName : activeNav ? t(activeNav.labelKey) : ROUTE_TITLE_KEYS[activeTab] ? t(ROUTE_TITLE_KEYS[activeTab]) : t('nav.dashboard');
  useEffect(() => {
    setScreenRoute(`${location.pathname}${location.search}`, pageTitle);
  }, [location.pathname, location.search, pageTitle]);
  useEffect(() => {
    setScreenEntity('channelId', isChatRoute ? activeChannelId : null);
  }, [isChatRoute, activeChannelId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Login failed');
      if (data.needsVerification) {
        setVerifyState({ email: data.email, mode: 'login' });
        return;
      }
      if (data.needsPasswordSetup) {
        // No session yet: the account proves its email with the code we just sent.
        setLoginPassword('');
        if (data.email) setLoginEmail(data.email);
        setForgotStartAtCode(true);
        setShowForgotPassword(true);
        notify('This account has no password yet — we emailed you a code to set one', 'info');
      } else if (data.user) {
        persistSession(data.sessionId, data.user);
        setNeedsSetup(false);
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed — try again');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSignup = async (payload: any) => {
    const res = await apiFetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    // `data` rides along so the form can react (e.g. a taken FTC number).
    if (!res.ok) throw Object.assign(new Error(data.error || "Signup failed"), { data });
    if (data.needsVerification) {
      setVerifyState({ email: data.email, mode: payload.accountType === 'admin' ? 'admin' : 'student' });
      return data;
    }
    // An approval link or "ask to join": no account or session yet.
    if (data.pendingApproval) return data;
    persistSession(data.sessionId, data.user);
    return data;
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentUser?.email, password: loginPassword })
    });
    const data = await res.json();
    if (data.needsVerification) {
      setVerifyState({ email: data.email || currentUser?.email, mode: 'setup' });
      return;
    }
    if (data.user) {
      persistSession(data.sessionId, data.user);
      setNeedsSetup(false);
    }
  };

  const handleLogout = async () => {
    // End any active call cleanly — the server's reconnect grace covers
    // blips, but an explicit logout must not leave a ghost participant.
    try { await voiceApiRef.current?.leave(); } catch { /* best effort — still sign out locally */ }
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch { /* best effort — still sign out locally */ }
    hasLoadedOnce.current = false;
    refreshCount.current = 0;
    setRefreshing(false);
    setIsLoggedIn(false);
    setCurrentUser(null);
    setSessionId(null);
    setTeams([]);
    setTeamsLoaded(false);
    // Team-specific client caches (FTC data, forecasts, Bruno screen context).
    clearTeamCaches();
    forgetStoredSession();
    disconnectSocket();
  };

  const markNotificationsRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    
    await apiFetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unreadIds })
    });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  /** Jump to a mention's channel from the slide-in toast. */
  const jumpToMention = (n: any) => {
    const meta = notifMeta(n);
    dismissMentionToast();
    if (meta.channel_id != null) {
      navigate('/chat');
      setActiveChannelId(Number(meta.channel_id));
    }
  };

  // Mention clearing: opening a channel marks its unread mentions read.
  // (The bell still marks everything read — this just clears what you've seen.)
  useEffect(() => {
    if (!isLoggedIn || activeChannelId == null) return;
    const ids = notifications
      .filter((n: any) => !n.is_read && n.type === 'mention' && Number(notifMeta(n).channel_id) === Number(activeChannelId))
      .map((n: any) => n.id);
    if (!ids.length) return;
    apiFetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    setNotifications((prev: any[]) => prev.map((n: any) => (ids.includes(n.id) ? { ...n, is_read: 1 } : n)));
  }, [isLoggedIn, activeChannelId, notifications]);

  const isAdmin = (currentUser as any)?.account_type === 'admin';

  // Effective role permissions from /api/auth/me (falls back to legacy account_type)
  const userPerms: string[] = (() => {
    try {
      const p = (currentUser as any)?.permissions;
      if (Array.isArray(p)) return p;
      if ((currentUser as any)?.account_type === 'admin') return ['*'];
      return [];
    } catch { return []; }
  })();
  const hasPerm = (perm: string) => userPerms.includes('*') || userPerms.includes(perm);

  // Map legacy scope names to the closest role permission
  const SCOPE_TO_PERM: Record<string, string> = {
    admin: 'manage_members',
    attendance: 'manage_attendance',
    budget: 'manage_budget',
    tasks: 'manage_tasks',
    inventory: 'manage_inventory',
    code: 'manage_code',
    calendar: 'manage_calendar',
    outreach: 'manage_outreach',
    documentation: 'manage_documentation',
    communications: 'manage_communications',
  };

  // What the server enforces is the member's roles (H-2): a title like
  // "President", the Board flag or the old per-member scopes used to unlock
  // admin screens here that the server then refused. Only permissions count.
  const hasScope = (scope: string) => {
    if (!currentUser) return false;
    if (isAdmin) return true;
    const perm = SCOPE_TO_PERM[scope];
    return !!perm && hasPerm(perm);
  };

  // Students get a focused personal workspace; admins get everything
  const studentTabIds = ['dashboard', 'teams', 'stats', 'predict', 'attendance', 'tasks', 'calendar', 'budget', 'inventory', 'outreach', 'comm', 'chat', 'cad', 'cad-docs', 'cad-reviews', 'cad-snapshots', 'cad-parts', 'resources'];
  const tabVisible = (t: any): boolean => {
    if (t.ownerOnly) return isOwner;
    if (t.perm) return hasPerm(t.perm);
    if (isAdmin) return !t.scope || hasScope(t.scope);
    return studentTabIds.includes(t.id);
  };
  // "NEW" badge on Predict until the user first opens it (per browser).
  const [predictSeen, setPredictSeen] = useState(() => {
    try { return localStorage.getItem('cp-predict-seen') === '1'; } catch { return false; }
  });
  useEffect(() => {
    if (activeTab !== 'predict' || predictSeen) return;
    setPredictSeen(true);
    try { localStorage.setItem('cp-predict-seen', '1'); } catch { /* storage unavailable */ }
  }, [activeTab, predictSeen]);

  const visibleTabs = navItems
    .map((t) => {
      const kids = (t as any).children?.filter(tabVisible);
      return { ...t, children: kids };
    })
    .filter((t) => {
      if (!tabVisible(t)) return false;
      // Hide a parent whose submenu is entirely invisible
      if ((t as any).children && (t as any).children.length === 0) return false;
      return true;
    });

  // Bottom tab bar on phones: the student-critical destinations first, plus a
  // "More" button that opens the full sidebar as a drawer. Admins keep every
  // section reachable through the drawer.
  const mobileTabIds = ['dashboard', 'attendance', 'chat', 'tasks'];
  const mobileTabShortLabels: Record<string, string> = {
    dashboard: 'Home',
    attendance: 'Check in',
    chat: 'Chat',
    tasks: 'Tasks',
  };
  const mobileTabs = mobileTabIds
    .map((id) => visibleTabs.find((t) => t.id === id))
    .filter((t): t is (typeof visibleTabs)[number] => Boolean(t));

  // Keep students (and scope-restricted users) on tabs they can actually see
  // (Bruno is intentionally not a nav tab — reachable via the header button)
  // Note: profile/settings/roles are reachable pages even when they aren't
  // top-level sidebar items (settings + profile live in the settings popup;
  // roles is nested under Teams & Members).
  const allVisibleTabIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of visibleTabs) {
      ids.add(t.id);
      for (const c of (t as any).children || []) ids.add(c.id);
    }
    ids.add('profile');
    ids.add('settings');
    ids.add('inbox'); // Modern page; Legacy redirects it to the dashboard
    return ids;
  }, [visibleTabs]);
  useEffect(() => {
    if (isLoggedIn && activeTab !== 'bruno' && !allVisibleTabIds.has(activeTab)) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoggedIn, currentUser, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Owner status drives the Owner tab; only Sushil's email(s) qualify
  useEffect(() => {
    if (isLoggedIn) {
      apiFetch('/api/owner/me').then(r => r.json()).then(d => setIsOwner(!!d.isOwner)).catch(() => setIsOwner(false));
    } else {
      setIsOwner(false);
    }
  }, [isLoggedIn]);

  // An invite link: kept for this tab while signed out, used once signed in
  // (teamless accounts too — this is how they get their first team).
  // Stashed once per visit to the link, so a used (cleared) link isn't
  // picked up again while the address bar still shows it.
  const joinPath = inviteTokenFromPath(location.pathname);
  const stashedJoinPath = useRef<string | null>(null);
  if (joinPath && stashedJoinPath.current !== joinPath) {
    stashedJoinPath.current = joinPath;
    stashInvite(joinPath);
  }
  useEffect(() => {
    if (!isLoggedIn || !teamsLoaded) return;
    const token = peekInvite();
    if (!token) {
      // Already used (e.g. by the signup it started): just leave the page.
      if (joinPath) navigate('/dashboard', { replace: true });
      return;
    }
    clearInvite();
    setInviteTeamName(null);
    // Like a manual join or switch: end any call before the session moves
    // (teamless accounts have none; never let cleanup hold up the join).
    const leaveCall = teams.length && voiceApiRef.current
      ? Promise.race([voiceApiRef.current.leave(), new Promise((r) => setTimeout(r, 3000))])
      : Promise.resolve();
    Promise.resolve(leaveCall).catch(() => { /* best effort */ })
      .then(() => joinWithCodeOrLink(token))
      .then(applyJoin)
      .catch((e) => notify(e.message || 'Could not use that invite link', 'error'))
      .finally(() => { if (inviteTokenFromPath(window.location.pathname)) navigate('/dashboard', { replace: true }); });
  }, [isLoggedIn, teamsLoaded, joinPath]);

  // A scanned QR deep link opened while logged out: after login, bounce back
  // to the check-in page to finish checking in.
  useEffect(() => {
    if (isLoggedIn && typeof sessionStorage !== 'undefined') {
      const t = sessionStorage.getItem('pendingCheckinToken');
      if (t) {
        sessionStorage.removeItem('pendingCheckinToken');
        navigate(`/checkin/${t}`);
      }
    }
  }, [isLoggedIn]);

  // ---- Onboarding orchestration ----
  // Load the account's onboarding state once per login. On any failure we
  // fail silent (no onboarding UI) rather than blocking the app.
  useEffect(() => {
    if (!isLoggedIn) {
      setOnboarding(null);
      setOnboardingReady(false);
      setShowWelcome(false);
      setTourOpen(false);
      setWizardOpen(false);
      return;
    }
    let cancelled = false;
    setOnboardingReady(false);
    fetchOnboardingState()
      .then((s) => {
        if (cancelled) return;
        setOnboarding(s);
        setOnboardingReady(true);
        setShowWelcome(shouldShowWelcome(s));
      })
      .catch(() => {
        if (cancelled) return;
        setOnboarding(defaultOnboardingState());
        setOnboardingReady(true);
      });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const patchOnboarding = async (patch: Record<string, unknown>): Promise<OnboardingState> => {
    const next = await saveOnboardingState(patch);
    setOnboarding(next);
    return next;
  };

  const handleWelcomeGetStarted = async () => {
    try {
      const next = await patchOnboarding({ welcomeSeen: true });
      setWizardStartStep(firstIncompleteWizardStep(next));
    } catch {
      /* non-fatal: still open the wizard locally */
    }
    setShowWelcome(false);
    setWizardOpen(true);
  };

  const handleWelcomeSkip = async () => {
    try {
      await patchOnboarding({ welcomeSeen: true, dismissed: true });
    } catch {
      /* non-fatal */
    }
    setShowWelcome(false);
  };

  /** Open the setup wizard at the first incomplete step (account menu, checklist). */
  const openSetupGuide = () => {
    const s = onboarding || defaultOnboardingState();
    setWizardStartStep(firstIncompleteWizardStep(s));
    setWizardOpen(true);
  };

  const startTour = (fromStep = 0) => {
    setWizardOpen(false);
    tourStepRef.current = fromStep;
    setTourStartStep(fromStep);
    setTourOpen(true);
  };

  // Memoized so the Walkthrough's effects don't re-fire on every App render.
  const tourSteps = useMemo(() => resolveTourSteps(isAdmin), [isAdmin]);

  /** Persist the tour's resume position (lightly debounced). */
  const handleTourStepChange = (index: number) => {
    tourStepRef.current = index;
    // Auto-open the Bruno panel when its tour step is shown, close otherwise.
    // This gives users a live preview of the AI assistant during onboarding.
    const step = tourSteps[index];
    if (step?.id === 'bruno') {
      setBrunoPanelOpen(true);
    } else {
      setBrunoPanelOpen(false);
    }
    if (tourSaveTimer.current) window.clearTimeout(tourSaveTimer.current);
    tourSaveTimer.current = window.setTimeout(() => {
      patchOnboarding({ walkthrough: { lastStep: index } }).catch(() => {});
    }, 600);
  };

  const handleTourExit = async () => {
    if (tourSaveTimer.current) window.clearTimeout(tourSaveTimer.current);
    setTourOpen(false);
    setBrunoPanelOpen(false);
    // Persist the resume position; the tour stays resumable from the account menu.
    try {
      await patchOnboarding({ walkthrough: { lastStep: tourStepRef.current } });
    } catch {
      /* non-fatal */
    }
  };

  const handleTourFinish = async (next: 'setup' | 'explore') => {
    if (tourSaveTimer.current) window.clearTimeout(tourSaveTimer.current);
    setTourOpen(false);
    setBrunoPanelOpen(false);
    const now = new Date().toISOString();
    try {
      const s = await patchOnboarding({
        walkthrough: { completed: true, lastStep: 0 },
        steps: { tour: { status: 'done', updatedAt: now } },
      });
      if (next === 'setup') {
        setWizardStartStep(s.steps.profile.status === 'done' ? 3 : 0);
        setWizardOpen(true);
      }
    } catch {
      if (next === 'setup') setWizardOpen(true);
    }
  };

  const handleChecklistDismiss = async () => {
    try {
      await patchOnboarding({ checklistDismissed: true });
    } catch {
      /* non-fatal */
    }
  };

  const handleWizardSaveProfile = async (patch: { name: string; role: string }) => {
    const res = await apiFetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Could not save your profile. Please try again.');
    }
  };

  const renderContent = () => {
    const settingsCallbacks = {
      onUserSaved: (u: any) => setCurrentUser((prev: any) => (prev ? { ...prev, ...u } : u)),
      onTeamSaved: (t: any) => setTeams((prev) => prev.map((x: any) => (x.id === t.id ? { ...x, ...t } : x))),
      onStatusPick: handleStatusPick,
    };
    const viewProps = {
      teams, members, attendance, tasks, budget, outreach, socialProfiles, youtubeEnabled, tiktokEnabled, inventory, communications, events,
      messages, settings, hiddenDates, currentUser, onRefresh: fetchData, refresh, setLoading,
      // ChatView gates channel create/delete UI on this — it was missing, so
      // the + button never rendered for anyone.
      isAdmin,
      // setters for optimistic UI (instant-feeling mutations with rollback on error)
      setTasks, setEvents, setOutreach, setInventory, setBudget, setAttendance, setMembers,
      setMessages, msgCache, setSocialProfiles, setCommunications,
      insights, summary, socket, hasScope,
      isAiLoading, setIsAiLoading, ThinkingIndicator, aiLoadingTarget,
      colorVersion, setColorVersion,
      // multi-team: switcher, add/delete/leave, active team name
      onSwitchTeam: handleSwitchTeam, onAddTeam: handleAddTeam, onDeleteTeam: handleDeleteTeam, onLeaveTeam: handleLeaveTeam,
      onJoinTeam: handleJoinTeam,
      activeTeamName, activeTeamId: currentTeamId, botName, navGptQualified, navGptActive,
      // app owner (OWNER_EMAILS) — gates owner-only UI like AI limit config
      isOwner,
      updateInsights,
      updateSummary: () => updateSummary(true),
      // onboarding: dashboard checklist + resume entry points
      onboardingState: onboarding,
      onContinueSetup: openSetupGuide,
      onDismissChecklist: handleChecklistDismiss,
      // Discord-style chat channels
      channels, setChannels, activeChannelId, setActiveChannelId,
      msgExhausted,      chatCategories,
      // Shared task-completion proof dialog — every Done transition opens it.
      onRequestComplete: openCompleteDialog,
      handleCreateChannel: async (name: string, topic: string, categoryId?: number | null) => {
        const res = await apiFetch('/api/chat/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, topic, category_id: categoryId ?? null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { notify(data.error || 'Could not create channel.', 'error'); return null; }
        if (data.channel) {
          setChannels((prev) => (prev.some((c: any) => c.id === data.channel.id) ? prev : [...prev, data.channel]));
          setActiveChannelId(data.channel.id);
        }
        return data.channel;
      },
      handleCreateCategory: async (name: string) => {
        const res = await apiFetch('/api/chat/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { notify(data.error || 'Could not create category.', 'error'); return null; }
        if (data.category) {
          setChatCategories((prev) => (prev.some((c: any) => c.id === data.category.id) ? prev : [...prev, data.category]));
        }
        return data.category;
      },
      handleRenameCategory: async (id: number, name: string) => {
        const res = await apiFetch(`/api/chat/categories/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { notify(data.error || 'Could not rename category.', 'error'); return null; }
        if (data.category) {
          setChatCategories((prev) => prev.map((c: any) => (c.id === data.category.id ? data.category : c)));
        }
        return data.category;
      },
      handleDeleteCategory: async (id: number, name: string) => {
        const ok = await confirmDialog({ title: `Delete "${name}"?`, message: "Its channels stay, ungrouped. This can't be undone.", confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        const res = await apiFetch(`/api/chat/categories/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { notify(data.error || 'Could not delete category.', 'error'); return; }
        setChatCategories((prev) => prev.filter((c: any) => c.id !== id));
        setChannels((prev) => prev.map((c: any) => (c.category_id === id ? { ...c, category_id: null } : c)));
        notify('Category deleted.', 'success');
      },
      handleMoveChannel: async (id: number, categoryId: number | null) => {
        const res = await apiFetch(`/api/chat/channels/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category_id: categoryId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { notify(data.error || 'Could not move channel.', 'error'); return null; }
        if (data.channel) {
          setChannels((prev) => prev.map((c: any) => (c.id === data.channel.id ? data.channel : c)));
        }
        return data.channel;
      },
      handleDeleteChannel: async (id: number) => {
        const ok = await confirmDialog({ title: 'Delete this channel?', message: "Its messages move to #general. This can't be undone.", confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        const res = await apiFetch(`/api/chat/channels/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { notify(data.error || 'Could not delete channel.', 'error'); return; }
        setChannels((prev) => prev.filter((c: any) => c.id !== id));
        setActiveChannelId((prev) => (prev === id ? data.movedTo : prev));
        notify('Channel deleted.', 'success');
      },
    };
    const dashboardEl = isAdmin
      ? <DashboardView {...viewProps} teams={teams} data={{ attendance, tasks, budget, outreach, insights, summary, members, events }} />
      : <StudentDashboardView {...viewProps} />;
    return (
      <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<HomePage {...viewProps} notifications={notifications} unreadMentions={unreadMentions} />} />
        {/* Inbox is a Modern page; Legacy keeps its bell dropdown. */}
        <Route path="/inbox" element={<InboxPage notifications={notifications} actions={notificationActions} onOpenChannel={(id) => setActiveChannelId(id)} />} />
        <Route path="/stats" element={<TeamStatsPage />} />
        <Route path="/predict" element={<PredictPage />} />
        <Route path="/teams" element={<PeoplePage {...viewProps} hasPerm={hasPerm} />} />
        <Route path="/roles" element={<PeoplePage {...viewProps} hasPerm={hasPerm} />} />
        <Route path="/attendance" element={<AttendancePage {...viewProps} />} />
        <Route path="/tasks" element={<TasksPage {...viewProps} />} />
        <Route path="/calendar" element={<CalendarPage {...viewProps} />} />
        <Route path="/budget" element={<BudgetPage {...viewProps} />} />
        <Route path="/inventory" element={<InventoryPage {...viewProps} />} />
        <Route path="/outreach" element={<OutreachPage {...viewProps} />} />
        <Route path="/code" element={<CodePage {...viewProps} />} />
        <Route path="/cad" element={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />
        <Route path="/cad-docs" element={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />
        <Route path="/cad-reviews" element={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />
        <Route path="/cad-snapshots" element={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />
        <Route path="/cad-parts" element={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />
        <Route path="/comm" element={<CommunicationPage {...viewProps} />} />
        <Route path="/chat" element={<MessagesPage {...viewProps} memberMenuItems={memberMenuItems} />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/bruno" element={<BrunoPage key={currentUser?.team_id ?? 'none'} {...viewProps} />} />
        <Route path="/profile" element={<Navigate to="/settings?section=profile" replace />} />
        <Route path="/settings" element={<SettingsPage {...viewProps} {...settingsCallbacks} hasPerm={hasPerm} />} />
        <Route path="/owner" element={<OwnerPage />} />
        <Route path="/checkin/:token" element={<CheckinPage currentUser={currentUser} onRefresh={fetchData} />} />
        {/* The invite effect joins and then leaves this page. */}
        <Route path="/join/:token" element={<p className="p-8 text-sm text-muted-foreground">Joining workspace…</p>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
    );
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center animate-pulse">
          <Bolt className="text-accent-ink w-8 h-8" strokeWidth={2.5} />
        </div>
      </div>
    );
  }

  // Public legal pages — reachable without login so OAuth app reviewers
  // (TikTok, Google) can verify them. Rendered outside the auth flow.
  if (location.pathname === '/privacy' || location.pathname === '/terms') {
    return <LegalPage page={location.pathname === '/privacy' ? 'privacy' : 'terms'} />;
  }

  if (!isLoggedIn) {
    // A scanned QR deep link (/checkin/:token) opened while logged out: stash
    // the token so the post-login effect can bounce back to finish check-in.
    const deepLink = location.pathname.match(/^\/checkin\/([A-Za-z0-9]+)/);
    if (deepLink && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('pendingCheckinToken', deepLink[1]);
    }
    // A brand-new OAuth user just finished sign-in — collect their last signup
    // step first. This must come before the landing screen or the callback
    // bounces them back to the homepage.
    // Unverified email+password account: prove ownership before any session.
    const providers = { google: googleEnabled, discord: discordEnabled, github: githubEnabled };
    if (verifyState) {
      const onVerified = (data: any) => {
        persistSession(data.sessionId, data.user);
        setVerifyState(null);
        if (verifyState.mode === 'admin' && data?.team?.access_code) setSignupTeam(data.team);
        if (verifyState.mode === 'setup') setNeedsSetup(false);
      };
      return <VerifyEmailPage email={verifyState.email} onBack={() => setVerifyState(null)} onVerified={onVerified} />;
    }
    if (oauthSignup) {
      const onBack = () => { setOauthSignup(null); setAuthScreen('landing'); };
      const onDone = (data: any) => {
        clearInvite();
        if (data?.pendingApproval) {
          setOauthSignup(null);
          setInvitePendingTeam(data.team?.name || 'the team');
          setAuthScreen('landing');
          return;
        }
        persistSession(data.sessionId, data.user);
        setOauthSignup(null);
        if (data?.team?.access_code) setSignupTeam(data.team);
      };
      const invite = peekInvite();
      return (
        <OAuthSignupPage
          token={oauthSignup.token} intent={oauthSignup.intent} provider={oauthSignup.provider} onBack={onBack} onDone={onDone}
          invite={invite ? { token: invite, teamName: inviteTeamName || undefined } : null}
        />
      );
    }
    const pendingInvite = peekInvite();
    if (authScreen === 'landing' && (pendingInvite || invitePendingTeam)) {
      const dismiss = () => { clearInvite(); setInvitePendingTeam(null); setInviteTeamName(null); navigate('/', { replace: true }); };
      return (
        <JoinInvitePage
          token={pendingInvite || ''}
          pendingTeam={invitePendingTeam}
          onCreateAccount={(teamName) => { setInviteTeamName(teamName); setAuthScreen('signup-student'); }}
          onSignIn={() => { setInvitePendingTeam(null); setAuthScreen('login'); }}
          onDismiss={dismiss}
        />
      );
    }
    if (authScreen === 'landing') {
      return <ModernLanding onSignIn={() => setAuthScreen('login')} onGetStarted={() => setAuthScreen('role')} />;
    }
    if (authScreen === 'role') {
      const onSelect = (m: 'admin' | 'student') => setAuthScreen(m === 'admin' ? 'signup-admin' : 'signup-student');
      return <RolePage providers={providers} onBack={() => setAuthScreen('landing')} onSelect={onSelect} />;
    }

    if (authScreen === 'signup-admin' || authScreen === 'signup-student') {
      const mode = authScreen === 'signup-admin' ? 'admin' : 'student';
      const invite = mode === 'student' ? peekInvite() : null;
      const onDone = (data: any) => {
        // The membership (or the request) exists now; nothing left to use.
        if (invite) clearInvite();
        // An approval link, or "ask to join" a team that's already here.
        if (data?.pendingApproval) { setInvitePendingTeam(data.team?.name || 'the team'); setAuthScreen('landing'); return; }
        if (mode === 'admin' && data?.team?.access_code) setSignupTeam(data.team);
      };
      return (
        <SignupPage
          mode={mode} onBack={() => setAuthScreen(invite ? 'landing' : 'role')} onSignup={handleSignup} onDone={onDone} onSignIn={() => setAuthScreen('login')}
          invite={invite ? { token: invite, teamName: inviteTeamName || 'your team' } : null}
        />
      );
    }
    return (
        <SignInPage
          email={loginEmail} setEmail={setLoginEmail}
          password={loginPassword} setPassword={setLoginPassword}
          needsSetup={needsSetup} error={loginError} busy={loggingIn}
          onSubmit={needsSetup ? handleSetup : handleLogin}
          oauthError={oauthError} providers={providers}
          showForgot={showForgotPassword}
          setShowForgot={(v: boolean) => { setShowForgotPassword(v); if (!v) setForgotStartAtCode(false); }}
          forgotStartAtCode={forgotStartAtCode}
          onPasswordReset={() => {
            setShowForgotPassword(false);
            setForgotStartAtCode(false);
            setLoginPassword('');
            notify('Password updated — sign in with your new password', 'success');
          }}
          onBack={() => setAuthScreen('landing')}
          onCreateAccount={() => { setNeedsSetup(false); setAuthScreen('role'); }}
        />
      );
  }

  // Zero-team empty state: create, join, or delete account.
  if (isLoggedIn && teamsLoaded && teams.length === 0) {
    // Outside the interface-mode provider (no workspace yet): follow this
    // device's look, like the signed-out screens.
    const teamless = {
      user: currentUser,
      onCreateTeam: async (input: { ftc_number?: string; name?: string }) => {
        const data = await handleAddTeam(input);
        notify(`Team "${data.team?.name || 'created'}" created`, 'success');
      },
      onJoinTeam: handleJoinTeam,
      onDeleteAccount: async () => {
        const res = await apiFetch('/api/auth/account', { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not delete your account.');
        forgetStoredSession();
        window.location.reload();
      },
      onSignOut: handleLogout,
    };
    return <TeamlessPage {...teamless} />;
  }


  // Inbox actions for the Modern shell (same endpoints as the Legacy bell).
  const notificationActions: NotificationActions = {
    markRead: async (ids) => {
      if (!ids.length) return;
      const res = await apiFetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      if (res.ok) setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: 1 } : n)));
    },
    markUnread: async (ids) => {
      const res = await apiFetch('/api/notifications/unread', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      if (res.ok) setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: 0 } : n)));
    },
    remove: async (id) => {
      const res = await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) setNotifications((prev) => prev.filter((x) => x.id !== id));
      else notify('Could not delete notification', 'error');
    },
    clearAll: async () => {
      if (!(await confirmDialog({ title: 'Clear all notifications?', message: 'This will delete all your notifications.', confirmLabel: 'Clear all' }))) return;
      const res = await apiFetch('/api/notifications', { method: 'DELETE' });
      if (res.ok) { setNotifications([]); notify('Notifications cleared', 'success'); }
      else notify('Could not clear notifications', 'error');
    },
    open: (n) => {
      const meta = notifMeta(n);
      if (n.type === 'mention' && meta.channel_id != null) {
        navigate('/chat');
        setActiveChannelId(Number(meta.channel_id));
        return true;
      }
      return false;
    },
  };

  // Command-menu actions (Modern). Only actions the user can already take.
  const commandActions: CommandAction[] = [
    ...(visibleTabs.some((t) => t.id === 'attendance') ? [{ id: 'checkin', label: 'Check in', group: 'Actions' as const, icon: CalendarCheck, keywords: ['attendance', 'qr', 'here'], run: () => navigate('/attendance') }] : []),
    { id: 'whats-new', label: "What's new", group: 'Actions', icon: Sparkles, run: () => setWhatsNewOpen(true) },
    { id: 'feedback', label: 'Send feedback', group: 'Actions', icon: MessageSquare, run: () => setShowFeedback(true) },
    { id: 'setup', label: 'Setup guide', group: 'Actions', icon: LayoutDashboard, run: () => openSetupGuide() },
  ];

  // Routed page content (or the sync spinner / error). Shared by both shells.
  const mainContent = loading ? (
    loadError ? (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
        <p className="text-text-base font-bold">Couldn't sync your data</p>
        <p className="text-text-muted text-sm max-w-sm">{loadError}</p>
        <button
          onClick={() => { hasLoadedOnce.current = false; fetchData(); }}
          className="px-5 py-2.5 rounded-xl bg-accent text-accent-ink font-bold text-sm hover:brightness-110 transition"
        >
          Try again
        </button>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted animate-pulse">Synchronizing club data...</p>
      </div>
    )
  ) : renderContent();

  return (
    <VoiceProvider
      memberId={currentUser?.id ?? null}
      memberName={currentUser?.name}
      memberAvatar={(currentUser as any)?.avatar_url ?? null}
      hasPerm={hasPerm}
    >
      <VoiceSocketBridge voiceRef={voiceApiRef} />
      <ContextMenuProvider>
      <InterfaceModeProvider
        user={currentUser}
        team={activeTeam}
        onUserSaved={(u: any) => setCurrentUser((prev: any) => (prev ? { ...prev, ...u } : u))}
      >
    <div className="flex h-dvh overflow-hidden bg-primary">
      <DialogHost />
      {completingTask && (
        <CompletionDialog
          task={completingTask}
          notes={completionNotes}
          onNotesChange={setCompletionNotes}
          files={completionFiles}
          onFilesChange={setCompletionFiles}
          completing={completing}
          onSubmit={handleCompleteTask}
          onClose={closeCompleteDialog}
        />
      )}
      {/* Slide-in mention toast: appears when someone pings you in a channel
          you aren't viewing. Click jumps to the channel. */}
      <MentionToastCard
            toast={mentionToast}
            channelName={mentionToast ? notifMeta(mentionToast).channel_name : null}
            canJump={!!mentionToast && notifMeta(mentionToast).channel_id != null}
            onJump={() => mentionToast && jumpToMention(mentionToast)}
            onDismiss={dismissMentionToast}
          />
      {/* Slim non-blocking refresh indicator (background fetchData after first load). */}
      {refreshing && !loading && (
        <div className="fixed top-0 left-0 right-0 z-[120] h-[3px] pointer-events-none" aria-hidden="true">
          <div className="cp-refresh-bar h-full bg-accent" />
        </div>
      )}
      {signupTeam && (
        <CodeRevealDialog team={signupTeam} onEnter={() => setSignupTeam(null)} />
      )}
      <ModernShell
            visibleTabs={visibleTabs as any}
            activeTab={activeTab}
            pageTitle={activeTab === 'settings' ? t('settings.title') : pageTitle}
            onNavigate={(path) => navigate(path)}
            content={mainContent}
            immersive={isImmersiveRoute}
            isMobile={isMobile}
            user={currentUser}
            teams={teams}
            activeTeam={activeTeam}
            activeTeamName={activeTeamName || ''}
            isAdmin={isAdmin}
            onSwitchTeam={(id) => void handleSwitchTeam(id)}
            unreadMentions={unreadMentions}
            notifications={notifications}
            onOpenSettings={() => openSettings()}
            onLogout={() => void handleLogout()}
            onOpenBruno={handleBrunoButton}
            botName={botName}
            onOpenFeedback={() => setShowFeedback(true)}
            onSetupGuide={openSetupGuide}
            onOpenWhatsNew={() => setWhatsNewOpen(true)}
            onStatusPick={(st) => void handleStatusPick(st)}
            predictSeen={predictSeen}
            actions={commandActions}
          />

      {showFeedback && <FeedbackDialog onClose={() => setShowFeedback(false)} />}
      {/* One "seen this version" state for both looks, so switching never re-opens it. */}
      <WhatsNewDialog open={whatsNewOpen || whatsNewAuto} onClose={closeWhatsNew} />
      {/* Voice calling surfaces — all driven by VoiceProvider context state.
          CallBar is fixed-bottom (above the mobile nav) and survives route
          navigation because it lives outside the routed views. */}
      <CallDock onOpenSettings={() => openSettings()} />
      <IncomingCall />
      <CallStage onOpenSettings={() => openSettings()} />
      <CookieBar />
      <InstallBanner />
      <BrunoPanelSwitch
        key={currentUser?.team_id ?? 'none'}
        open={brunoPanelOpen}
        onClose={() => setBrunoPanelOpen(false)}
        onExpand={() => { setBrunoPanelOpen(false); navigate('/bruno', { state: { chatId: brunoPanelChatRef.current } }); }}
        onActiveChatId={(id) => { brunoPanelChatRef.current = id; }}
        currentUser={currentUser}
        botName={botName}
        onUserSaved={(u: any) => setCurrentUser((prev: any) => (prev ? { ...prev, ...u } : u))}
      />

      {/* ---- Onboarding overlays ---- */}
      {showWelcome && onboarding && (
        <WelcomeDialog userName={currentUser?.name} onGetStarted={() => void handleWelcomeGetStarted()} onSkip={() => void handleWelcomeSkip()} />
      )}
      {tourOpen && (() => {
        const tour = {
          steps: tourSteps,
          initialStep: Math.min(tourStartStep, Math.max(0, tourSteps.length - 1)),
          onStepChange: handleTourStepChange,
          onFinish: (next: 'setup' | 'explore') => void handleTourFinish(next),
          onExit: () => void handleTourExit(),
        };
        return <TourCard {...tour} />;
      })()}
      {wizardOpen && onboarding && currentUser && (() => {
        const setup = {
          user: { name: currentUser.name, role: currentUser.role },
          initialStep: wizardStartStep,
          state: onboarding,
          onPatchState: patchOnboarding,
          onSaveProfile: handleWizardSaveProfile,
          onProfileChanged: (name: string, role: string) => setCurrentUser((u) => (u ? { ...u, name, role } : u)),
          onStartTour: (fromStep?: number) => startTour(fromStep ?? Math.max(0, onboarding.walkthrough.lastStep || 0)),
          onClose: () => setWizardOpen(false),
        };
        return <SetupDialog {...setup} />;
      })()}
    </div>
      </InterfaceModeProvider>
    </ContextMenuProvider>
    </VoiceProvider>
  );
}

// --- View Components ---

/** Discord-style member menu — no friending, no DMs, no private calls.
 *  "Call" starts a PUBLIC team voice channel anyone can join (the app's
 *  established call model) and rings the member. Each surface registers its
 *  own data-cm-type and passes only the callbacks it actually has. */
function memberMenuItems(opts: {
  m: any;
  isSelf: boolean;
  canCall: boolean;
  onCall?: (memberId: number, media: 'audio' | 'video') => void;
  onMention?: () => void;
  onEdit?: () => void;
  onEditScopes?: () => void;
  onToggleBoard?: () => void;
  onRemove?: () => void;
}): any[] {
  const { m, isSelf } = opts;
  const items: any[] = [];
  if (opts.canCall && !isSelf && opts.onCall) {
    const call = opts.onCall;
    items.push({ label: 'Voice Call', icon: Phone, action: () => call(m.id, 'audio') });
    items.push({ label: 'Video Call', icon: Video, action: () => call(m.id, 'video') });
  }
  if (opts.onMention) {
    items.push({ label: 'Mention', icon: AtSign, action: opts.onMention });
  }
  items.push({
    label: 'Copy Member ID',
    icon: Copy,
    action: async () => {
      try {
        await navigator.clipboard.writeText(String(m.id));
        notify('Member ID copied', 'success');
      } catch {
        notify('Could not copy — try again.', 'error');
      }
    },
  });
  const adminItems: any[] = [];
  if (opts.onEditScopes) adminItems.push({ label: 'Edit scopes', icon: ShieldCheck, action: opts.onEditScopes });
  if (opts.onEdit) adminItems.push({ label: 'Edit member', icon: Pencil, action: opts.onEdit });
  if (opts.onToggleBoard) {
    adminItems.push({
      label: m.is_board ? 'Remove board status' : 'Make board member',
      icon: BadgeCheck,
      action: opts.onToggleBoard,
    });
  }
  if (opts.onRemove) adminItems.push({ label: 'Remove from team', icon: UserX, danger: true, action: opts.onRemove });
  if (adminItems.length > 0) {
    items.push({ separator: true });
    items.push(...adminItems);
  }
  return items;
}

// Personal dashboard for students: my tasks, my attendance, upcoming events
// Personal dashboard for students: check-in, my tasks, upcoming events, my attendance.
// Deliberately focused — no budget, access codes, admin AI, team-wide metrics, or FTC details.
function StudentDashboardView({ teams, members, attendance, tasks, setTasks, events, currentUser, onRefresh, setLoading, onboardingState, onContinueSetup, onDismissChecklist, onRequestComplete }: any) {
  const navigate = useNavigate();
  const myTeam = teams?.find((t: any) => t.id === currentUser?.team_id);
  // Shared "my work" logic (also used by the Modern Home).
  const {
    today, myTasks, openTasks, myAttendance, todayRecord, checkedIn, presentCount, lateCount,
    excusedCount, attendanceRate, upcomingEvents, toggleTask, dayLabel,
  } = useMyWork({ tasks, setTasks, attendance, events, currentUser, onRequestComplete });

  return (
    <>
    {onboardingState && shouldShowChecklist(onboardingState) && (
      <div className="mb-4 sm:mb-6">
        <SetupChecklist
          state={onboardingState}
          onContinue={onContinueSetup}
          onDismiss={onDismissChecklist}
        />
      </div>
    )}
    <div className="mb-3 sm:mb-4">
      <h2 className="text-xl sm:text-2xl font-display font-bold text-text-base tracking-tight">
        Welcome back, {currentUser?.name?.split(' ')[0]}
      </h2>
      <p className="text-xs text-text-muted mt-0.5">
        {myTeam?.name ? `${myTeam.name} \u00b7 ` : ''}{format(new Date(), 'EEE, MMM d, yyyy')}
      </p>
    </div>

    {/* Today's check-in */}
    <Card className="mb-3 sm:mb-4" icon={CalendarCheck} title="Today&apos;s check-in">
      {checkedIn ? (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-base">You are checked in</p>
            <p className="text-xs text-text-muted">{todayRecord.status === 'L' ? 'Marked late' : 'Marked present'}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px]">
            <p className="text-sm font-bold text-text-base">You are not checked in</p>
            <p className="text-xs text-text-muted mt-0.5">Scan the QR code your admin projected, or enter today&apos;s code.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/attendance')} className="text-xs">
              <ScanLine className="w-4 h-4" /> Scan QR
            </Button>
            <Button variant="secondary" onClick={() => navigate('/attendance')} className="text-xs">
              <Keyboard className="w-4 h-4" /> Enter code
            </Button>
          </div>
        </div>
      )}
    </Card>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
      <Card title="My tasks" icon={CheckSquare} subtitle={openTasks.length === 0 ? 'All caught up' : `${openTasks.length} open`}>
        {myTasks.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">No tasks assigned to you yet. Nice work \u2014 you&apos;re all caught up.</p>
        ) : (
          <div className="space-y-2">
            {myTasks.map((task: any) => (
              <button
                key={task.id}
                onClick={() => toggleTask(task)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-text-base/[0.03] border border-text-base/5 hover:border-text-base/15 transition-all text-left"
              >
                <span className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                  task.status === 'done' ? "bg-accent border-accent" : "border-text-base/25"
                )}>
                  {task.status === 'done' && <Check className="w-3.5 h-3.5 text-accent-ink" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn("block text-sm font-semibold truncate", task.status === 'done' ? "text-text-muted line-through" : "text-text-base")}>
                    {task.title}
                  </span>
                  {task.due_date && <DueDateLabel task={task} />}
                </span>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md",
                  task.status === 'done' ? "bg-emerald-400/15 text-emerald-400" : task.status === 'in-progress' ? "bg-blue-400/15 text-blue-400" : "bg-text-base/10 text-text-muted"
                )}>
                  {task.status === 'done' ? 'Done' : task.status === 'in-progress' ? 'In progress' : 'To do'}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Upcoming events" icon={Calendar}>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">No upcoming events scheduled.</p>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((e: any) => (
              <button key={e.id} onClick={() => navigate('/calendar')} className="w-full flex gap-3 text-left group">
                <div className="w-11 shrink-0 rounded-xl bg-accent/10 border border-accent/20 flex flex-col items-center justify-center py-1.5">
                  <span className="text-[10px] font-bold text-accent uppercase">{format(new Date(e.date + 'T12:00:00'), 'MMM')}</span>
                  <span className="text-lg font-display font-bold text-text-base leading-none">{format(new Date(e.date + 'T12:00:00'), 'd')}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted group-hover:text-accent transition-colors">{dayLabel(e.date)}</p>
                  <p className="text-sm font-semibold text-text-base truncate">{e.title}</p>
                  <p className="text-xs text-text-muted truncate">{[e.time, e.location].filter(Boolean).join(' \u00b7 ')}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>

    <Card className="mt-3 sm:mt-4" title="My attendance" icon={UserCheck}>
      <p className="text-2xl font-display font-bold text-text-base">
        {attendanceRate === null ? '\u2014' : `${attendanceRate}%`}
        <span className="text-sm font-normal text-text-muted ml-2">
          &middot; {presentCount} present &middot; {lateCount} late
        </span>
      </p>
    </Card>
    </>
  );
}

// Default a creation form's team to the user's currently-selected team, so the
// "Select Team" dropdown in New Task / Log Transaction / Add Part modals is
// already set when you're working inside a team.

export function TasksView({ tasks, setTasks, teams, members, onRefresh, refresh, currentUser, hasScope, onRequestComplete }: any) {
  // All Tasks state + handlers are shared with the Modern Tasks page.
  const {
    isAdmin, canManageTasks,
    showAddTask, editingTaskId, newTask, setNewTask, isBoardTask, setIsBoardTask,
    openNewTask, openEditTask, closeTaskModal, handleAddTask,
    showAnalytics, setShowAnalytics, filterTeam, setFilterTeam, pendingIds, filteredTasks,
    showBulk, setShowBulk, bulkText, setBulkText, bulkParsing, bulkPreview, bulkRoster, bulkError,
    bulkSaving, handleBulkParse, updateBulkRow, removeBulkRow, handleBulkSave, closeBulkModal,
    aiTaskOpen, setAiTaskOpen, aiTaskText, setAiTaskText, aiTaskBusy, aiTaskNote, setAiTaskNote, aiTaskProposals, setAiTaskProposals,
    resetAiTask, applyAiTaskToForm, handleAiTaskParse,
    updateStatus, handleDeleteTask,
    completionTrends, memberCapacity, avgCompletionTime,
  } = useTasksController({ tasks, setTasks, teams, members, refresh, currentUser, hasScope, onRequestComplete });

  // Right-click menu on task cards: edit, quick status moves, add, delete.
  useContextMenu('task', (el) => {
    if (!canManageTasks) return null;
    const id = Number(el.dataset.cmId);
    const task = tasks.find((t: any) => t.id === id);
    if (!task) return null;
    const items: { label?: string; icon?: any; danger?: boolean; separator?: boolean; action?: () => void }[] = [];
    items.push({ label: 'Edit task', icon: Pencil, action: () => openEditTask(task) });
    if (task.status !== 'done') items.push({ label: 'Mark done', icon: CheckCircle2, action: () => updateStatus(id, 'done') });
    if (task.status !== 'in-progress') items.push({ label: 'Mark in progress', icon: Clock3, action: () => updateStatus(id, 'in-progress') });
    if (task.status !== 'todo') items.push({ label: 'Move to To-Do', icon: ListTodo, action: () => updateStatus(id, 'todo') });
    items.push({ label: 'Add task', icon: Plus, action: () => openNewTask('todo') });
    items.push({ separator: true });
    items.push({ label: 'Delete task', icon: Trash2, danger: true, action: () => handleDeleteTask(id) });
    return items;
  });

  // Right-click a column's blank area: add a task straight into that status.
  useContextMenu('task-column', (el) => {
    if (!canManageTasks) return null;
    const status = el.dataset.cmStatus || 'todo';
    const label = status === 'todo' ? 'To-Do' : status === 'in-progress' ? 'In Progress' : 'Done';
    return [
      { label: `Add task to ${label}`, icon: Plus, action: () => openNewTask(status) },
    ];
  });

  // Deep link from a notification (/tasks?task=ID): managers get the task's
  // editor; everyone else gets the card scrolled into view and highlighted.
  const [taskParams, setTaskParams] = useSearchParams();
  const linkedTaskId = Number(taskParams.get('task')) || null;
  const [flashTaskId, setFlashTaskId] = useState<number | null>(null);
  useEffect(() => {
    if (!linkedTaskId) return;
    const task = tasks.find((t: any) => t.id === linkedTaskId);
    if (!task) return;
    if (canManageTasks) openEditTask(task);
    else {
      setFlashTaskId(task.id);
      requestAnimationFrame(() => document.querySelector(`[data-cm-type="task"][data-cm-id="${task.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      window.setTimeout(() => setFlashTaskId(null), 2400);
    }
    const next = new URLSearchParams(taskParams);
    next.delete('task');
    setTaskParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedTaskId, tasks]);

  const columns = [
    { id: 'todo', label: 'To Do', color: 'bg-slate-500' },
    { id: 'in-progress', label: 'In Progress', color: 'bg-blue-400' },
    { id: 'done', label: 'Done', color: 'bg-emerald-400' }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Tasks</h3>
        <p className="text-sm text-text-muted mt-1">Everything the team needs to get done — assign it, track it, finish it.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <Select 
            className="w-full sm:w-48"
            options={[
              { label: 'All Teams', value: 'all' },
              ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id.toString() }))
            ]}
            value={filterTeam} 
            onChange={(e: any) => setFilterTeam(e.target.value)}
          />
          <Button variant="secondary" onClick={() => setShowAnalytics(!showAnalytics)} className="w-full sm:w-auto">
            <TrendingUp className="w-4 h-4 mr-2" />
            {showAnalytics ? "Board View" : "Analytics"}
          </Button>
        </div>
        {canManageTasks && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={() => setShowBulk(true)} className="w-full sm:w-auto"><Sparkles className="w-4 h-4" /> Bruno</Button>
            <Button onClick={() => openNewTask('todo')} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> New Task</Button>
          </div>
        )}
      </div>

      {showAnalytics ? (
        <Suspense fallback={<ChartLoadingFallback />}>
          <TaskAnalytics
            completionTrends={completionTrends}
            memberCapacity={memberCapacity}
            avgCompletionTime={avgCompletionTime}
            tasks={tasks}
          />
        </Suspense>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 h-auto min-h-[600px] md:h-[calc(100vh-250px)]">
        {columns.map(col => (
          <div key={col.id} data-cm-type="task-column" data-cm-status={col.id} className="bg-elevated rounded-2xl p-4 flex flex-col gap-4 border border-text-base/5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-2 h-2 rounded-full", col.color)} />
              <h4 className="text-sm font-bold text-text-base uppercase tracking-wider">{col.label}</h4>
              <span className="ml-auto text-xs text-text-muted/70">{tasks.filter((t: any) => t.status === col.id).length}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {filteredTasks.filter((t: any) => t.status === col.id).map((task: any) => (
                <div key={task.id}
                  data-cm-type="task"
                  data-cm-id={task.id}
                  className={cn(
                  "bg-elevated p-4 rounded-xl border group shadow-sm transition-shadow",
                  task.is_board ? "border-accent/30" : "border-text-base/10",
                  flashTaskId === task.id && "ring-2 ring-accent"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-sm font-bold text-text-base">{task.title}</h5>
                    <div className="flex items-center gap-2">
                      {task.is_board && <Lock className="w-3 h-3 text-accent" />}
                      {canManageTasks && (
                        <button onClick={() => handleDeleteTask(task.id)} className="text-text-muted hover:text-rose-400 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-text-muted line-clamp-2 mb-3">{task.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const ids = Array.isArray(task.assignee_ids) && task.assignee_ids.length > 0
                          ? task.assignee_ids
                          : (task.assigned_to ? [task.assigned_to] : []);
                        const assignees = ids.map((id: number) => members.find((m: any) => m.id === id)).filter(Boolean);
                        if (assignees.length === 0) {
                          return (
                            <div className="w-6 h-6 rounded-full bg-text-base/10 flex items-center justify-center text-[10px] font-bold text-text-muted">
                              ?
                            </div>
                          );
                        }
                        return (
                          <div className="flex -space-x-1.5">
                            {assignees.slice(0, 4).map((a: any) => (
                              a?.avatar_url ? (
                                <img key={a.id} src={assetUrl(a.avatar_url)} alt={a.name} title={a.name} className="w-6 h-6 rounded-full object-cover ring-2 ring-card" />
                              ) : (
                                <div key={a.id} title={a.name} className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-ink ring-2 ring-card">
                                  {a?.name.charAt(0) || '?'}
                                </div>
                              )
                            ))}
                            {assignees.length > 4 && (
                              <div className="w-6 h-6 rounded-full bg-text-base/15 flex items-center justify-center text-[9px] font-bold text-text-muted ring-2 ring-card">
                                +{assignees.length - 4}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <DueDateLabel task={task} className={isOverdue(task) ? 'text-[10px] font-semibold text-amber-400' : 'text-[10px] text-text-muted/70'} />
                    </div>
                    <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {col.id !== 'todo' && <button onClick={() => updateStatus(task.id, 'todo')} aria-label="Move back" className="p-1.5 md:p-1 hover:text-accent active:scale-90 transition-transform"><ChevronRight className="w-4 h-4 rotate-180" /></button>}
                      {col.id !== 'done' && <button onClick={() => updateStatus(task.id, col.id === 'todo' ? 'in-progress' : 'done')} aria-label="Move forward" className="p-1.5 md:p-1 hover:text-accent active:scale-90 transition-transform"><ChevronRight className="w-4 h-4" /></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}

      {showAddTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={editingTaskId ? 'Edit Task' : 'New Task'} className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
              {!editingTaskId && (
                <div className="rounded-xl border border-accent/20 bg-accent/[0.04] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAiTaskOpen(!aiTaskOpen)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
                  >
                    <Sparkles className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-sm font-bold text-text-base flex-1">AI quick-add</span>
                    <span className="text-[11px] text-text-muted">Describe it, Bruno fills the form</span>
                    {aiTaskOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                  </button>
                  {aiTaskOpen && (
                    <div className="px-4 pb-4 space-y-2.5">
                      <textarea
                        className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base text-sm focus:outline-none focus:border-accent/50 transition-colors h-20"
                        placeholder="e.g. Finish robot CAD by Friday, assign to Sushil and Heman"
                        value={aiTaskText}
                        onChange={(e: any) => setAiTaskText(e.target.value)}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-text-muted">Same Bruno AI, right here in the form.</p>
                        <Button variant="secondary" className="!text-xs !py-1.5" onClick={handleAiTaskParse} disabled={aiTaskBusy || !aiTaskText.trim()}>
                          {aiTaskBusy ? 'Bruno is reading…' : 'Parse with Bruno'}
                        </Button>
                      </div>
                      {aiTaskNote && <p className="text-xs text-text-base/80">{aiTaskNote}</p>}
                      {aiTaskProposals.length > 1 && (
                        <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                          {aiTaskProposals.map((t: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-text-base/[0.04] border border-text-base/10 px-3 py-1.5">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-text-base truncate">{t.title}</p>
                                <p className="text-[11px] text-text-muted">
                                  {t.due_date || 'No due date'}{t.assignee_name ? ` • ${t.assignee_name}` : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  applyAiTaskToForm(t);
                                  setAiTaskProposals([]);
                                  setAiTaskNote('Bruno filled in the form below — review it and hit Create Task.');
                                  setAiTaskOpen(false);
                                }}
                                className="text-xs font-bold text-accent hover:underline shrink-0"
                              >
                                Use
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Select 
                options={[
                  { label: 'Select Team', value: '' },
                  ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id }))
                ]} 
                value={newTask.team_id}
                onChange={(e: any) => setNewTask({...newTask, team_id: e.target.value})}
              />
              <Input placeholder="Task Title" value={newTask.title} onChange={(e: any) => setNewTask({...newTask, title: e.target.value})} />
              <textarea 
                className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base focus:outline-none focus:border-accent/50 transition-colors h-24"
                placeholder="Description"
                value={newTask.description}
                onChange={(e: any) => setNewTask({...newTask, description: e.target.value})}
              />
              <AssigneeMultiSelect
                members={members}
                selected={newTask.assignee_ids}
                onChange={(ids: number[]) => setNewTask({...newTask, assignee_ids: ids})}
              />
              <Input type="date" value={newTask.due_date} onChange={(e: any) => setNewTask({...newTask, due_date: e.target.value})} />
              
              {isAdmin && (
                <label className="flex items-center gap-2 text-sm text-text-base/80">
                  <input type="checkbox" checked={isBoardTask} onChange={(e) => setIsBoardTask(e.target.checked)} />
                  Private Board Task
                </label>
              )}

              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeTaskModal}>Cancel</Button>
                <Button onClick={handleAddTask} disabled={pendingIds.has(-1)}>{pendingIds.has(-1) ? (editingTaskId ? 'Saving…' : 'Creating…') : (editingTaskId ? 'Save Changes' : 'Create Task')}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Bruno" className="w-full max-w-2xl max-h-[90dvh] flex flex-col min-w-0">
            <p className="text-xs text-text-muted -mt-2">Paste meeting notes, chat logs, or a to-do dump — Bruno pulls out each task, guesses assignees and due dates. Edit before saving.</p>
            <textarea
              value={bulkText}
              onChange={(e: any) => setBulkText(e.target.value)}
              rows={5}
              placeholder={"Paste tasks here…\n- Design intake prototype, test with pollen samples by Wed — assign to build team\n- Order 2x goBILDA 5203 motors before the weekend\n- Sushil to review autonomous pathing code, fix odometry drift\n- Schedule design review for Thursday 6pm"}
              className="w-full min-w-0 bg-elevated border border-text-base/10 rounded-xl px-4 py-3 text-sm text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all resize-y min-h-[110px]"
            />
            <div className="flex justify-end">
              <Button onClick={handleBulkParse} disabled={!bulkText.trim() || bulkParsing} className="shrink-0">
                {bulkParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {bulkParsing ? 'Bruno is reading…' : 'Extract tasks'}
              </Button>
            </div>
            {bulkError ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-sm text-rose-200/90">{bulkError}</div>
            ) : null}
            {bulkPreview && bulkPreview.length > 0 ? (
              <div className="space-y-2 min-h-0">
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Preview — edit before saving ({bulkPreview.length})</p>
                <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                  {bulkPreview.map((row: any, i: number) => (
                    <div key={i} className="rounded-xl border border-text-base/10 bg-text-base/[0.02] p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2 min-w-0">
                          <Input
                            value={row.title}
                            onChange={(e: any) => updateBulkRow(i, { title: e.target.value })}
                            placeholder="Task title"
                            className="!py-1.5 !text-sm font-semibold"
                          />
                          <Input
                            value={row.description || ''}
                            onChange={(e: any) => updateBulkRow(i, { description: e.target.value })}
                            placeholder="Description (optional)"
                            className="!py-1.5 !text-sm"
                          />
                        </div>
                        <button
                          onClick={() => removeBulkRow(i)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <ThemedSelect
                          value={row.status || 'todo'}
                          onChange={(e: any) => updateBulkRow(i, { status: e.target.value })}
                          className="sm:w-36 bg-elevated border border-text-base/10 rounded-xl px-3 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent/60"
                        >
                          <option value="todo">To Do</option>
                          <option value="in-progress">In Progress</option>
                          <option value="done">Done</option>
                        </ThemedSelect>
                        <ThemedSelect
                          value={row.assigned_to || ''}
                          onChange={(e: any) => updateBulkRow(i, { assigned_to: e.target.value ? Number(e.target.value) : null })}
                          className="flex-1 min-w-0 bg-elevated border border-text-base/10 rounded-xl px-3 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent/60"
                        >
                          <option value="">Unassigned</option>
                          {bulkRoster.map((m: any) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </ThemedSelect>
                        <Input
                          type="date"
                          value={row.due_date || ''}
                          onChange={(e: any) => updateBulkRow(i, { due_date: e.target.value || null })}
                          className="!py-1.5 !text-sm sm:w-40"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="secondary" onClick={closeBulkModal} disabled={bulkSaving}>Discard</Button>
                  <Button onClick={handleBulkSave} disabled={bulkSaving || bulkPreview.length === 0}>
                    {bulkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {bulkSaving ? 'Saving…' : `Save all ${bulkPreview.length}`}
                  </Button>
                </div>
              </div>
            ) : null}
            {(!bulkPreview || bulkPreview.length === 0) && (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={closeBulkModal}>Close</Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// Overdue logic — shared everywhere due dates are shown.
// A task is overdue when its due date is before today (local) and it isn't done.
// Overdue items render in orange/amber, never red (red = destructive/error).
function isOverdue(task: { due_date?: string | null; status?: string }): boolean {
  if (!task.due_date || task.status === 'done') return false;
  const due = new Date(task.due_date + 'T00:00:00');
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

// Consistent due-date label: orange "Overdue" when overdue, muted "Due" otherwise.
// Returns null when there's no due date.
function DueDateLabel({ task, className }: { task: { due_date?: string | null; status?: string }; className?: string }) {
  if (!task.due_date) return null;
  const overdue = isOverdue(task);
  return (
    <span className={className || (overdue ? 'text-[11px] font-semibold text-amber-400' : 'text-[11px] text-text-muted')}>
      {overdue ? `Overdue · ${task.due_date}` : `Due ${task.due_date}`}
    </span>
  );
}

// Bulk outreach paste parser (shared with Modern Outreach); re-exported for its tests.
export { parseOutreachRows };
