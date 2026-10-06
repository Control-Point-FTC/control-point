import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { 
  LayoutDashboard, 
  Users, 
  Crown,
  MessageSquareHeart,
  Pencil,
  CalendarCheck, 
  CheckSquare, 
  Wallet, 
  Globe, 
  Newspaper,
  Play,
  ExternalLink,
  Mail,
  MailOpen,
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  AtSign,
  ImagePlus,
  Paperclip,
  TrendingUp,
  Clock,
  Award,
  MessageSquare,
  Send,
  Bell,
  LogOut,
  Lock,
  Search,
  EyeOff,
  Eye,
  Edit2,
  FolderPlus,
  FolderInput,
  Calendar,
  User,
  UserCheck,
  UserCircle,
  Zap,
  Trash2,
  FileUp,
  FileText,
  Tags,
  MapPin,
  Download,
  Bolt,
  Code2,
  Check,
  ShieldCheck,
  ShieldAlert,
  Ban,
  AlertTriangle,
  UserX,
  GraduationCap,
  KeyRound,
  Copy,
  Reply,
  Forward,
  Sparkles,
  ClipboardPaste,
  Save,
  Trophy,
  Flag,
  Cog,
  Medal,
  Layers,
  Box,
  FileBox,
  ClipboardCheck,
  Package,
  Hash,
  ChevronUp,
  Music2,
  Youtube,
  Pin,
  Bot,
  Phone,
  PhoneCall,
  Video,
  QrCode,
  ScanLine,
  Maximize2,
  Timer,
  Keyboard,
  Camera,
  LayoutGrid,
  BadgeCheck,
  Loader2,
  CheckCircle2,
  Clock3,
  ListTodo,
  Smile,
  ImageOff,
  Menu
} from 'lucide-react';
import { ContextMenuProvider, useContextMenu } from './components/contextmenu/ContextMenuProvider';
import { motion, AnimatePresence } from 'motion/react';
// Heavy libraries stay out of the initial bundle: recharts (via TaskAnalytics),
// Monaco (via CodeView), and three.js (via CadModelViewer, already lazy).
const TaskAnalytics = React.lazy(() => import('./components/TaskAnalytics'));
const CodeView = React.lazy(() => import('./components/CodeView').then(m => ({ default: m.CodeView })));
const CodePage = React.lazy(() => import('./modern/pages/code/CodePage').then(m => ({ default: m.CodePage })));
const AttendanceTrendChart = React.lazy(() => import('./components/dashboard/AttendanceTrend').then(m => ({ default: m.AttendanceTrendChart })));
const AiUsageChart = React.lazy(() => import('./components/owner/AiUsageChart'));

/** Lightweight placeholder while a heavy lazy chunk (charts, code editor) loads. */
function ChartLoadingFallback({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-text-muted animate-pulse" aria-busy="true">
      {label}
    </div>
  );
}

/**
 * Chat attachment image with a graceful fallback. Uploads live on the host's
 * ephemeral disk, so a file can vanish after a redeploy/restart while the
 * message row (in the DB) survives — show "no longer available" instead of a
 * broken-image icon in that case.
 */
function ChatImage({ src, href, alt }: { src: string | null | undefined; href: string | null | undefined; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src) return null;
  if (failed) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg max-w-xs border border-text-base/10 bg-text-base/5 text-text-muted">
        <ImageOff className="w-4 h-4 shrink-0" />
        <span className="text-xs">This image is no longer available — it was removed when the server restarted. Ask the sender to re-upload it.</span>
      </div>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <img
        src={src}
        alt={alt}
        onError={() => setFailed(true)}
        className="rounded-lg max-w-xs max-h-64 object-cover border border-text-base/10 shadow-sm hover:opacity-95 transition-opacity"
      />
    </a>
  );
}
import Markdown from 'react-markdown';
import BrunoView from './components/BrunoView';
import { BRUNO_OPEN_EVENT, clearScreenContext, setScreenEntity, setScreenRoute } from './services/brunoContext';
import BrunoIcon from './components/BrunoIcon';
import FeedbackIcon from './components/FeedbackIcon';
import EmailImportModal from './components/EmailImport';
import BrunoQuickAdd from './components/BrunoQuickAdd';
import TaskCompletionDialog from './components/TaskCompletionDialog';
import {
  WelcomeScreen,
  Walkthrough,
  SetupWizard,
  SetupChecklist,
  fetchOnboardingState,
  saveOnboardingState,
  defaultOnboardingState,
  shouldShowWelcome,
  shouldShowChecklist,
  firstIncompleteWizardStep,
  resolveTourSteps,
  type OnboardingState,
} from './components/onboarding';
import { useFtcTeam, seasonLabel, TeamStatsView } from './components/FtcStats';
import { PredictView } from './components/predict/PredictView';
import { PredictPage } from './modern/pages/predict/PredictPage';
import { TeamStatsPage } from './modern/pages/stats/TeamStatsPage';
import { clearFtcCache } from './components/ftcCache';
import { clearScoutCache } from './services/ftcScoutApi';
import { clearPredictCache } from './services/predictApi';
import { format } from 'date-fns';
import { InstallPrompt } from './components/InstallPrompt';
import { WhatsNewAutoPopup, WhatsNewModal } from './components/WhatsNewModal';
import { InterfaceModeProvider } from './modern/interfaceMode';
import { ShellSwitch, TryModernBanner } from './modern/ShellSwitch';
import { ModernShell } from './modern/ModernShell';
import { ByMode } from './modern/ByMode';
import { useSignedOutMode } from './modern/signedOut';
import { ModernLanding } from './modern/pages/auth/ModernLanding';
import { OAuthSignupPage, RolePage, SignInPage, SignupPage, VerifyEmailPage } from './modern/pages/auth/AuthPages';
import { CodeRevealDialog } from './modern/pages/auth/CodeRevealDialog';
import { notifMeta } from './modern/notifications';
import { HomePage } from './modern/pages/HomePage';
import { InboxPage } from './modern/pages/InboxPage';
import { TasksPage } from './modern/pages/tasks/TasksPage';
import { CompletionDialog } from './modern/pages/tasks/TaskDialogs';
import { CalendarPage } from './modern/pages/calendar/CalendarPage';
import { AttendancePage } from './modern/pages/attendance/AttendancePage';
import { PeoplePage } from './modern/pages/people/PeoplePage';
import { CommunicationPage } from './modern/pages/communication/CommunicationPage';
import { MessagesPage } from './modern/pages/messages/MessagesPage';
import { BrunoPage } from './modern/pages/bruno/BrunoPage';
import { BrunoPanelSwitch } from './modern/BrunoDock';
import { SettingsPage } from './modern/pages/settings/SettingsPage';
import { useMyWork } from './components/dashboard/useMyWork';
import { useTasksController, defaultTeamId } from './components/tasks/useTasksController';
import { useBudgetController } from './components/budget/useBudgetController';
import { useInventoryController, INVENTORY_CATEGORIES } from './components/inventory/useInventoryController';
import { BudgetPage } from './modern/pages/budget/BudgetPage';
import { InventoryPage } from './modern/pages/inventory/InventoryPage';
import { useOutreachController, OUTREACH_PRESETS } from './components/outreach/useOutreachController';
import { parseOutreachRows } from './components/outreach/parseOutreachRows';
import { OutreachPage } from './modern/pages/outreach/OutreachPage';
import { useCalendarController, toDateKey, fmtTime } from './components/calendar/useCalendarController';
import { useMembersController } from './components/people/useMembersController';
import { useCommunicationController } from './components/communication/useCommunicationController';
import { useChatController } from './components/chat/useChatController';
import { useQrScanner } from './components/attendance/useQrScanner';
import { useAttendanceController, useQrSession, useStudentCheckin, QR_DURATIONS, parseLocalDate, weekdayOf, formatCountdown } from './components/attendance/useAttendanceController';
import type { CommandAction } from './modern/CommandMenu';
import type { NotificationActions } from './modern/notifications';
import { useDraft, clearDrafts } from './modern/drafts';

import { Team, Member, AttendanceRecord, Task, BudgetItem, OutreachEvent, Communication, CalendarEvent } from './types';
import { getAttendanceInsights, streamAttendanceInsights, getActivitySummary, streamActivitySummary, streamBuildHelper, extractActionProposals, applyActionProposals, notifyBrunoDataChanged, type ActionProposal } from './services/aiService';
import { apiFetch, apiUrl, assetUrl, apiBase, oauthUrl } from './services/api';
import { CadView } from './components/CadView';
import ResourcesView from './components/ResourcesView';
import { ResourcesPage } from './modern/pages/resources/ResourcesPage';
import { CadPage } from './modern/pages/cad/CadPage';
import MessageReactions, { postReactionToggle } from './components/MessageReactions';
import ReactionPicker from './components/ReactionPicker';
import { DialogHost, confirmDialog, promptDialog, notify } from './components/dialog';
import RolesView, { RoleBadge } from './components/RolesView';
import {
  VoiceSettingsSection,
  VoiceChannelList,
  UserVoiceControls,
  CallBar,
  IncomingCallModal,
  CallView,
} from './components/voice';
import { VoiceProvider, useVoice, type VoiceContextValue } from './voice';
import SettingsModal from './components/SettingsModal';
import Landing from './Landing';
import LegalPage from './Legal';
import { cn, Card, Button, Input, Switch } from './components/ui';
import { AuthShell } from './components/auth/AuthShell';
import VerifyEmailScreen from './components/auth/VerifyEmailScreen';
import ForgotPasswordScreen from './components/auth/ForgotPasswordScreen';
import { useOAuthSignup, useSignupForm, useTeamLookup } from './components/auth/useAuthForms';
import { DiscordIcon, GithubIcon, GoogleIcon } from './components/auth/ProviderIcons';
import { BrandMark, BrandLogo, BetaBadge } from './components/BrandMark';
import DashboardView from './components/dashboard/DashboardView';
import ThemeToggle from './components/ThemeToggle';
import { useTranslation } from 'react-i18next';
import { useTheme } from './hooks/useTheme';
import { applyPulseOrigins, readPulseOrigins } from './utils/gridPulse';

// Helper to get CSS variable values
function getCSSVariable(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
}

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
function readStoredSessionId(): string | null {
  try { return localStorage.getItem('sessionId'); } catch { return null; }
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

// Avatar: profile picture when set, otherwise the user's initial
const Avatar = ({ user, size = 'md', className }: any) => {
  const sizes: any = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-16 h-16 text-2xl',
    xl: 'w-24 h-24 text-3xl',
  };
  const cls = cn(
    'rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden',
    sizes[size] || sizes.md,
    user?.avatar_url ? '' : 'bg-accent text-accent-ink',
    className
  );
  if (user?.avatar_url) {
    return <img src={assetUrl(user.avatar_url)} alt={user?.name || 'avatar'} className={cn(cls, 'object-cover')} />;
  }
  return <div className={cls}>{(user?.name || '?').charAt(0).toUpperCase()}</div>;
};

import { PRESENCE_META, PresenceDot, PresencePicker } from './components/presence';
import { Select as ThemedSelect } from './components/Select';

// --- Presence (Discord-style online / idle / dnd / invisible) ---
// Display values live in ./components/presence (shared with the settings modal).
const AvatarWithPresence = ({ user, size = 'md', presence, dotClassName }: any) => (
  <span className="relative inline-flex flex-shrink-0">
    <Avatar user={user} size={size} />
    <PresenceDot
      presence={presence || user?.presence || 'offline'}
      className={cn('absolute bottom-0 right-0', dotClassName || 'w-3 h-3')}
    />
  </span>
);

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
  return null;
}

// --- Role choice + signup screens ---

// (AuthShell lives in ./components/auth/AuthShell so auth screens can be tested standalone.)

const RoleScreen = ({ onBack, onSelect, googleEnabled, discordEnabled, githubEnabled }: { onBack: () => void; onSelect: (mode: 'admin' | 'student') => void; googleEnabled: boolean; discordEnabled: boolean; githubEnabled: boolean }) => (
  <AuthShell>
    <button
      onClick={onBack}
      className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-base transition-colors"
    >
      <ChevronLeft className="w-4 h-4" /> Back to home
    </button>
    <Card className="p-8">
      <div className="flex flex-col items-center gap-3 mb-6 text-center">
        <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center gold-glow">
          <Bolt className="text-accent-ink w-8 h-8" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-display font-bold text-text-base tracking-tight">Create your account</h1>
        <p className="text-text-muted text-sm">How will you use Control Point?</p>
      </div>
      <div className="grid gap-3">
        <button
          onClick={() => onSelect('admin')}
          className="group text-left rounded-2xl border border-text-base/10 bg-elevated p-5 hover:border-accent/60 hover:bg-text-base/5 transition-all active:scale-[0.99]"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-accent/15 p-3 shrink-0">
              <ShieldCheck className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="font-bold text-text-base text-[15px]">I'm a Team Admin</p>
              <p className="text-sm text-text-muted mt-1 leading-relaxed">
                Create a workspace for your robotics team. You'll get an access code to share with your students.
              </p>
            </div>
          </div>
        </button>
        <button
          onClick={() => onSelect('student')}
          className="group text-left rounded-2xl border border-text-base/10 bg-elevated p-5 hover:border-accent/60 hover:bg-text-base/5 transition-all active:scale-[0.99]"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-sky-400/15 p-3 shrink-0">
              <GraduationCap className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <p className="font-bold text-text-base text-[15px]">I'm a Student</p>
              <p className="text-sm text-text-muted mt-1 leading-relaxed">
                Join your team's workspace with the access code from your admin.
              </p>
            </div>
          </div>
        </button>
      </div>
      {(googleEnabled || discordEnabled || githubEnabled) && (
        <>
          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px bg-text-base/10" />
            <span className="text-xs text-text-muted">or</span>
            <div className="flex-1 h-px bg-text-base/10" />
          </div>
          <div className="mt-4 space-y-2.5">
            {googleEnabled && (
              <a href={oauthUrl('/api/auth/google?intent=signup')} className="flex items-center justify-center gap-2 rounded-xl border border-text-base/10 bg-elevated px-3 py-3 text-sm font-semibold text-text-base hover:border-accent/60 hover:bg-text-base/5 transition-all">
                <GoogleIcon /> Continue with Google
              </a>
            )}
            {discordEnabled && (
              <a href={oauthUrl('/api/auth/discord?intent=signup')} className="flex items-center justify-center gap-2 rounded-xl border border-text-base/10 bg-elevated px-3 py-3 text-sm font-semibold text-text-base hover:border-accent/60 hover:bg-text-base/5 transition-all">
                <DiscordIcon /> Continue with Discord
              </a>
            )}
            {githubEnabled && (
              <a href={oauthUrl('/api/auth/github?intent=signup')} className="flex items-center justify-center gap-2 rounded-xl border border-text-base/10 bg-elevated px-3 py-3 text-sm font-semibold text-text-base hover:border-accent/60 hover:bg-text-base/5 transition-all">
                <GithubIcon /> Continue with GitHub
              </a>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-text-muted">You'll pick Admin or Student right after signing in.</p>
        </>
      )}
      <p className="mt-6 text-center text-xs text-text-muted">
        Already have an account?{' '}
        <button onClick={onBack} className="text-accent font-semibold hover:underline">Back to home</button>
      </p>
    </Card>
  </AuthShell>
);

 // Admin signup: FTC team number is verified against the official FTC record and
// the team name is auto-filled from it — no manual team name needed. Falls back
// to a manual name field when the number isn't an FTC team.
const AdminTeamFields = ({ teamNumber, setTeamNumber, teamName, setTeamName, label }: {
  teamNumber: string; setTeamNumber: (v: string) => void;
  teamName: string; setTeamName: (v: string) => void;
  label: (t: string) => React.ReactNode;
}) => {
  const { lookup, foundName, foundSchool, manual, setManual, onNumChange, retry } = useTeamLookup({ teamNumber, setTeamNumber, teamName, setTeamName });

  return (
    <>
      <div className="space-y-1.5">
        {label('FTC team number')}
        <Input
          required
          inputMode="numeric"
          value={teamNumber}
          onChange={(e: any) => onNumChange(e.target.value)}
          placeholder="e.g. 4215"
        />
        {lookup === 'loading' && (
          <p className="text-xs text-text-muted flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up your team…
          </p>
        )}
        {lookup === 'found' && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-base truncate">{foundName}</p>
              {foundSchool && <p className="text-xs text-text-muted truncate">{foundSchool}</p>}
              <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">Verified FTC team — you're all set</p>
            </div>
          </div>
        )}
        {(lookup === 'notfound' || lookup === 'error') && !manual && (
          <div className="rounded-xl border border-text-base/10 bg-text-base/[0.03] px-3 py-2.5">
            <p className="text-xs text-text-muted">
              {lookup === 'notfound'
                ? "Couldn't find that number in the FTC database."
                : "Couldn't reach the team lookup right now."}{" "}
              <button type="button" onClick={() => setManual(true)} className="text-accent font-semibold hover:underline">
                Enter your team name manually
              </button>
            </p>
          </div>
        )}
      </div>
      {manual && (
        <div className="space-y-1.5">
          {label('Team name')}
          <Input required value={teamName} onChange={(e: any) => setTeamName(e.target.value)} placeholder="e.g. Circuit Breakers" />
        </div>
      )}
      {manual && lookup !== 'idle' && (
        <p className="text-xs text-text-muted -mt-2">
          <button type="button" onClick={retry} className="text-accent font-semibold hover:underline">
            Try the team number lookup again
          </button>
        </p>
      )}
    </>
  );
};

const SignupScreen = ({ mode, onBack, onDone, onSignup }: {
  mode: 'admin' | 'student';
  onBack: () => void;
  onDone: (data: any) => void;
  onSignup: (payload: any) => Promise<any>;
}) => {
  const {
    name, setName, email, setEmail, password, setPassword, showPw, setShowPw,
    teamName, setTeamName, teamNumber, setTeamNumber, accessCode, setAccessCode,
    error, busy, submit,
  } = useSignupForm({ mode, onSignup, onDone });

  const label = (t: string) => (
    <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">{t}</label>
  );

  return (
    <AuthShell>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-base transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Choose a different role
      </button>
      <Card className="p-8">
        <div className="flex flex-col items-center gap-3 mb-6 text-center">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", mode === 'admin' ? "bg-accent gold-glow" : "bg-sky-400/20")}>
            {mode === 'admin'
              ? <ShieldCheck className="text-accent-ink w-8 h-8" strokeWidth={2.5} />
              : <GraduationCap className="text-sky-400 w-8 h-8" strokeWidth={2.5} />}
          </div>
          <h1 className="text-2xl font-display font-bold text-text-base tracking-tight">
            {mode === 'admin' ? 'Create your workspace' : 'Join your team'}
          </h1>
          <p className="text-text-muted text-sm">
            {mode === 'admin'
              ? 'Set up your team and get an access code for your students.'
              : 'Enter the access code from your team admin to join.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">{label('Full name')}<Input required value={name} onChange={(e: any) => setName(e.target.value)} placeholder="John Smith" /></div>
          <div className="space-y-1.5">{label('Email')}<Input type="email" required value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="you@team.org" /></div>
          <div className="space-y-1.5">
            {label('Password')}
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} required minLength={6} value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="6+ characters" className="pr-11" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-base">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {mode === 'admin' ? (
            <AdminTeamFields teamNumber={teamNumber} setTeamNumber={setTeamNumber} teamName={teamName} setTeamName={setTeamName} label={label} />
          ) : (
            <div className="space-y-1.5">
              {label('Team access code')}
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <Input required value={accessCode} onChange={(e: any) => setAccessCode(e.target.value)} placeholder="CP-XXXX-XXXX" className="pl-10 uppercase font-mono tracking-wider" />
              </div>
              <p className="text-xs text-text-muted">Ask your team admin for this code.</p>
            </div>
          )}
          {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full py-3 mt-2 text-[15px]">
            {busy ? 'Creating account…' : mode === 'admin' ? 'Create workspace' : 'Join team'}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
};

// After OAuth: the identity is verified, now collect the role-specific details
const OAuthSignupScreen = ({ token, intent, provider, onBack, onDone }: {
  token: string; intent: 'admin_signup' | 'student_signup' | 'signup'; provider: 'google' | 'discord' | 'github';
  onBack: () => void; onDone: (data: any) => void;
}) => {
  const {
    needsRole, pickedRole, setPickedRole, isAdmin,
    teamName, setTeamName, teamNumber, setTeamNumber, accessCode, setAccessCode,
    error, busy, submit,
  } = useOAuthSignup({ token, intent, provider, onDone });

  const label = (t: string) => (
    <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">{t}</label>
  );

  return (
    <AuthShell>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-base transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to home
      </button>
      <Card className="p-8">
        <div className="flex flex-col items-center gap-3 mb-6 text-center">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", isAdmin ? "bg-accent gold-glow" : "bg-sky-400/20")}>
            {isAdmin
              ? <ShieldCheck className="text-accent-ink w-8 h-8" strokeWidth={2.5} />
              : <GraduationCap className="text-sky-400 w-8 h-8" strokeWidth={2.5} />}
          </div>
          <h1 className="text-2xl font-display font-bold text-text-base tracking-tight">Almost done</h1>
          <p className="text-text-muted text-sm flex items-center gap-2">
            {provider === 'discord' ? <DiscordIcon /> : provider === 'github' ? <GithubIcon /> : <GoogleIcon />}
            {' '}Signed in with {provider === 'discord' ? 'Discord' : provider === 'github' ? 'GitHub' : 'Google'} — one more step.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {needsRole && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPickedRole('admin')}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  pickedRole === 'admin' ? "border-accent bg-accent/10" : "border-text-base/10 bg-elevated hover:border-text-base/25"
                )}
              >
                <ShieldCheck className={cn("w-5 h-5 mb-2", pickedRole === 'admin' ? "text-accent" : "text-text-muted")} />
                <p className="text-sm font-bold text-text-base">Team Admin</p>
                <p className="text-xs text-text-muted mt-1">Create a workspace</p>
              </button>
              <button
                type="button"
                onClick={() => setPickedRole('student')}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  pickedRole === 'student' ? "border-accent bg-accent/10" : "border-text-base/10 bg-elevated hover:border-text-base/25"
                )}
              >
                <GraduationCap className={cn("w-5 h-5 mb-2", pickedRole === 'student' ? "text-accent" : "text-text-muted")} />
                <p className="text-sm font-bold text-text-base">Student</p>
                <p className="text-xs text-text-muted mt-1">Join with a code</p>
              </button>
            </div>
          )}
          {isAdmin ? (
            <AdminTeamFields teamNumber={teamNumber} setTeamNumber={setTeamNumber} teamName={teamName} setTeamName={setTeamName} label={label} />
          ) : (
            <div className="space-y-1.5">
              {label('Team access code')}
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <Input required value={accessCode} onChange={(e: any) => setAccessCode(e.target.value)} placeholder="CP-XXXX-XXXX" className="pl-10 uppercase font-mono tracking-wider" />
              </div>
              <p className="text-xs text-text-muted">Ask your team admin for this code.</p>
            </div>
          )}
          {error && <p className="text-sm text-rose-400 text-center">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full py-3 mt-2 text-[15px]">
            {busy ? 'Creating account…' : isAdmin ? 'Create workspace' : 'Join team'}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
};

// Shown to a new admin right after signup so they can share their access code
const CodeRevealScreen = ({ team, onEnter }: { team: { name: string; access_code: string; verified?: boolean }; onEnter: () => void }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(team.access_code); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
        <Card className="p-8 text-center">
          <div className="mx-auto w-14 h-14 bg-accent rounded-2xl flex items-center justify-center gold-glow mb-5">
            <Sparkles className="text-accent-ink w-8 h-8" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-display font-bold text-text-base tracking-tight">Workspace ready</h1>
          <p className="text-text-muted text-sm mt-2 leading-relaxed">
            <span className="text-text-base font-semibold">{team.name}</span> is set up.
            {team.verified && (
              <span className="inline-flex items-center gap-1 ml-1.5 text-emerald-400 font-semibold text-sm align-middle">
                <BadgeCheck className="w-4 h-4" /> Verified FTC team
              </span>
            )}{" "}
            Share this access code with your students — they'll enter it when they sign up to join automatically.
          </p>
          <button
            onClick={copy}
            className="mt-6 w-full rounded-2xl border-2 border-dashed border-accent/50 bg-accent/10 px-6 py-5 hover:bg-accent/15 transition-colors"
          >
            <p className="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1">Team access code</p>
            <p className="text-2xl sm:text-3xl font-mono font-bold text-accent tracking-[0.15em] break-all">{team.access_code}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted">
              {copied ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Tap to copy</>}
            </p>
          </button>
          <Button onClick={onEnter} className="w-full py-3 mt-6 text-[15px]">Enter workspace</Button>
        </Card>
      </motion.div>
    </div>
  );
};

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
  // Settings entry points: Modern opens the Settings page, Legacy the modal.
  // (The mode lives in InterfaceModeProvider below App; it mirrors onto <html>.)
  const openSettings = (section?: string) => {
    if (typeof document !== 'undefined' && document.documentElement.dataset.ui === 'modern') {
      navigate(section ? `/settings?section=${section}` : '/settings');
    } else {
      setSettingsOpen(true);
    }
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
  const [tourStartStep, setTourStartStep] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // True once the initial session check has finished. Until then we show a
  // minimal splash — never the landing page — so a refresh never flashes the
  // marketing homepage before the app shell appears.
  const [authReady, setAuthReady] = useState(false);
  const [authScreen, setAuthScreen] = useState<'landing' | 'login' | 'role' | 'signup-admin' | 'signup-student' | 'code-reveal'>('landing');
  // Email+password signups must verify ownership before getting a session.
  const [verifyState, setVerifyState] = useState<{ email: string; mode: 'admin' | 'student' | 'login' | 'setup' } | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  // Landing / auth look: this device's last interface mode (phase 9b).
  const [signedOutMode, setSignedOutMode] = useSignedOutMode(isLoggedIn);
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
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('sessionId');
    }
    return null;
  });
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

  // Handle OAuth callbacks (?oauth_session= / ?oauth_error= / ?oauth_signup=, plus legacy google_* params)
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
    const gs = params.get('oauth_session') || params.get('google_session');
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
    if (gs) {
      localStorage.setItem('sessionId', gs);
      setSessionId(gs);
      fetch(apiUrl(`/api/auth/me?sessionId=${encodeURIComponent(gs)}`))
        .then(r => r.json())
        .then(data => {
          if (data.user) {
            setCurrentUser(data.user);
            setIsLoggedIn(true);
          } else {
            setOauthError('Sign-in failed. Please try again.');
          }
        })
        .catch(() => setOauthError('Sign-in failed. Please try again.'))
        .finally(() => {
          window.history.replaceState({}, '', window.location.pathname);
          setAuthReady(true);
        });
    } else {
      // Restore a saved password-login session, if any
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null;
      if (saved) {
        fetch(apiUrl(`/api/auth/me?sessionId=${encodeURIComponent(saved)}`))
          .then(r => r.json())
          .then(data => {
            if (data.user) {
              setSessionId(saved);
              setCurrentUser(data.user);
              setIsLoggedIn(true);
            } else {
              localStorage.removeItem('sessionId');
            }
          })
          .catch(() => {})
          .finally(() => setAuthReady(true));
      } else {
        setAuthReady(true);
      }
    }
  }, []);

  // If any API call gets a 401 (expired/revoked session), the api layer
  // clears the stored session and fires this — return to signed-out state.
  useEffect(() => {
    const onUnauthorized = () => {
      clearDrafts(); // a half-written form never follows a session to the next user
      setIsLoggedIn(false);
      setCurrentUser(null);
      setSessionId(null);
      setTeams([]);
      setTeamsLoaded(false);
      setSocket(null);
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
    if (isLoggedIn) {
      fetchData();
      connectSocket();
    }
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


  const connectSocket = () => {
    const api = apiBase();
    const wsUrl = api
      ? api.replace(/^http/, 'ws') // mirror build: socket lives on the API origin
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log("WebSocket connected");
      const sid = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null;
      if (sid) ws.send(JSON.stringify({ type: 'hello', sessionId: sid }));
      // Reconnect: re-read the roster — computed presence may have decayed
      // (online -> idle -> offline) while the socket was down.
      if (socketWasConnected.current) refreshMembers();
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
        } else if (msg.type === 'resources_changed') {
          // ResourcesView owns its list — nudge it to refetch.
          window.dispatchEvent(new CustomEvent('resources-changed'));
        } else if (msg.type === 'attendance_changed') {
          // Another user marked attendance — refresh it live.
          refresh.attendance();
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
      console.log("WebSocket disconnected, retrying in 3s...");
      // Detach the voice engine's send path — it re-attaches on the new socket.
      voiceApiRef.current?.detachSocket();
      setTimeout(connectSocket, 3000);
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

  const persistSession = (sid: string, user: any) => {
    clearDrafts(); // every sign-in (or account switch) starts with no drafts
    if (typeof localStorage !== 'undefined') localStorage.setItem('sessionId', sid);
    setSessionId(sid);
    setCurrentUser(user);
    setIsLoggedIn(true);
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

  // Create a brand-new team for this account; the server switches the session to it.
  const handleAddTeam = async (name: string) => {
    const res = await apiFetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create team');
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
      if (data.needsSetup) {
        setNeedsSetup(true);
        setCurrentUser(data.user);
        if (data.sessionId) {
          if (typeof localStorage !== 'undefined') localStorage.setItem('sessionId', data.sessionId);
          setSessionId(data.sessionId);
        }
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
    if (!res.ok) throw new Error(data.error || "Signup failed");
    if (data.needsVerification) {
      setVerifyState({ email: data.email, mode: payload.accountType === 'admin' ? 'admin' : 'student' });
      return data;
    }
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
    if (typeof localStorage !== 'undefined') localStorage.removeItem('sessionId');
    setSocket(null);
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

  const hasScope = (scope: string) => {
    if (!currentUser) return false;
    if (isAdmin) return true;
    if (currentUser.role === 'President') return true;
    if (scope === 'admin' && currentUser.is_board) return true;
    const perm = SCOPE_TO_PERM[scope];
    if (perm && hasPerm(perm)) return true;
    try {
      let scopes = currentUser.scopes;
      // Handle double-stringification if it somehow happened in the DB
      while (typeof scopes === 'string') {
        const parsed = JSON.parse(scopes);
        if (typeof parsed === 'string') scopes = parsed;
        else { scopes = parsed; break; }
      }
      return Array.isArray(scopes) ? scopes.includes(scope) : false;
    } catch {
      return false;
    }
  };

  // Students get a focused personal workspace; admins get everything
  const studentTabIds = ['dashboard', 'stats', 'predict', 'attendance', 'tasks', 'calendar', 'budget', 'inventory', 'outreach', 'comm', 'chat', 'cad', 'cad-docs', 'cad-reviews', 'cad-snapshots', 'cad-parts', 'resources'];
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
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<ByMode legacy={dashboardEl} modern={<HomePage {...viewProps} notifications={notifications} unreadMentions={unreadMentions} />} />} />
        {/* Inbox is a Modern page; Legacy keeps its bell dropdown. */}
        <Route path="/inbox" element={<ByMode legacy={<Navigate to="/dashboard" replace />} modern={<InboxPage notifications={notifications} actions={notificationActions} onOpenChannel={(id) => setActiveChannelId(id)} />} />} />
        <Route path="/stats" element={<ByMode legacy={<TeamStatsView />} modern={<TeamStatsPage />} />} />
        <Route path="/predict" element={<ByMode legacy={<PredictView />} modern={<PredictPage />} />} />
        <Route path="/teams" element={<ByMode legacy={<TeamsView {...viewProps} />} modern={<PeoplePage {...viewProps} hasPerm={hasPerm} />} />} />
        <Route path="/roles" element={<ByMode legacy={<RolesView members={members} currentUser={currentUser} onRefresh={fetchData} />} modern={<PeoplePage {...viewProps} hasPerm={hasPerm} />} />} />
        <Route path="/attendance" element={<ByMode legacy={<AttendanceView {...viewProps} />} modern={<AttendancePage {...viewProps} />} />} />
        <Route path="/tasks" element={<ByMode legacy={<TasksView {...viewProps} />} modern={<TasksPage {...viewProps} />} />} />
        <Route path="/calendar" element={<ByMode legacy={<CalendarView {...viewProps} />} modern={<CalendarPage {...viewProps} />} />} />
        <Route path="/budget" element={<ByMode legacy={<BudgetView {...viewProps} />} modern={<BudgetPage {...viewProps} />} />} />
        <Route path="/inventory" element={<ByMode legacy={<InventoryView {...viewProps} />} modern={<InventoryPage {...viewProps} />} />} />
        <Route path="/outreach" element={<ByMode legacy={<OutreachView {...viewProps} />} modern={<OutreachPage {...viewProps} />} />} />
        <Route path="/code" element={<ByMode legacy={<Suspense fallback={<ChartLoadingFallback label="Loading code editor…" />}><CodeView {...viewProps} /></Suspense>} modern={<Suspense fallback={<ChartLoadingFallback label="Loading code editor…" />}><CodePage {...viewProps} /></Suspense>} />} />
        <Route path="/cad" element={<ByMode legacy={<CadView activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} modern={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />} />
        <Route path="/cad-docs" element={<ByMode legacy={<CadView activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} modern={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />} />
        <Route path="/cad-reviews" element={<ByMode legacy={<CadView activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} modern={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />} />
        <Route path="/cad-snapshots" element={<ByMode legacy={<CadView activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} modern={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />} />
        <Route path="/cad-parts" element={<ByMode legacy={<CadView activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} modern={<CadPage activeTab={activeTab} currentUser={currentUser} isAdmin={isAdmin} />} />} />
        <Route path="/comm" element={<ByMode legacy={<CommunicationView {...viewProps} />} modern={<CommunicationPage {...viewProps} />} />} />
        <Route path="/chat" element={<ByMode legacy={<ChatView {...viewProps} />} modern={<MessagesPage {...viewProps} memberMenuItems={memberMenuItems} />} />} />
        <Route path="/resources" element={<ByMode legacy={<ResourcesView />} modern={<ResourcesPage />} />} />
        <Route path="/bruno" element={<ByMode legacy={<BrunoView key={currentUser?.team_id ?? 'none'} {...viewProps} />} modern={<BrunoPage key={currentUser?.team_id ?? 'none'} {...viewProps} />} />} />
        <Route path="/profile" element={<ByMode legacy={<ProfileView {...viewProps} />} modern={<Navigate to="/settings?section=profile" replace />} />} />
        <Route path="/settings" element={<ByMode legacy={<SettingsView {...viewProps} hasPerm={hasPerm} />} modern={<SettingsPage {...viewProps} {...settingsCallbacks} hasPerm={hasPerm} />} />} />
        <Route path="/owner" element={<ByMode legacy={<OwnerView {...viewProps} />} />} />
        <Route path="/checkin/:token" element={<ByMode legacy={<QrCheckinPage currentUser={currentUser} onRefresh={fetchData} />} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
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
    const modernOut = signedOutMode === 'modern';
    const toClassic = () => setSignedOutMode('legacy');
    const providers = { google: googleEnabled, discord: discordEnabled, github: githubEnabled };
    if (verifyState) {
      const onVerified = (data: any) => {
        persistSession(data.sessionId, data.user);
        setVerifyState(null);
        if (verifyState.mode === 'admin' && data?.team) setSignupTeam(data.team);
        if (verifyState.mode === 'setup') setNeedsSetup(false);
      };
      return modernOut
        ? <VerifyEmailPage email={verifyState.email} onBack={() => setVerifyState(null)} onVerified={onVerified} onClassic={toClassic} />
        : <VerifyEmailScreen email={verifyState.email} onBack={() => setVerifyState(null)} onVerified={onVerified} />;
    }
    if (oauthSignup) {
      const onBack = () => { setOauthSignup(null); setAuthScreen('landing'); };
      const onDone = (data: any) => {
        persistSession(data.sessionId, data.user);
        setOauthSignup(null);
        if (data?.team) setSignupTeam(data.team);
      };
      return modernOut
        ? <OAuthSignupPage token={oauthSignup.token} intent={oauthSignup.intent} provider={oauthSignup.provider} onBack={onBack} onDone={onDone} onClassic={toClassic} />
        : <OAuthSignupScreen token={oauthSignup.token} intent={oauthSignup.intent} provider={oauthSignup.provider} onBack={onBack} onDone={onDone} />;
    }
    if (authScreen === 'landing') {
      return modernOut
        ? <ModernLanding onSignIn={() => setAuthScreen('login')} onGetStarted={() => setAuthScreen('role')} onClassic={toClassic} />
        : <Landing onSignIn={() => setAuthScreen('login')} onGetStarted={() => setAuthScreen('role')} />;
    }
    if (authScreen === 'role') {
      const onSelect = (m: 'admin' | 'student') => setAuthScreen(m === 'admin' ? 'signup-admin' : 'signup-student');
      return modernOut
        ? <RolePage providers={providers} onBack={() => setAuthScreen('landing')} onSelect={onSelect} onClassic={toClassic} />
        : <RoleScreen googleEnabled={googleEnabled} discordEnabled={discordEnabled} githubEnabled={githubEnabled} onBack={() => setAuthScreen('landing')} onSelect={onSelect} />;
    }

    if (authScreen === 'signup-admin' || authScreen === 'signup-student') {
      const mode = authScreen === 'signup-admin' ? 'admin' : 'student';
      const onDone = (data: any) => {
        if (mode === 'admin' && data?.team) setSignupTeam(data.team);
      };
      return modernOut
        ? <SignupPage mode={mode} onBack={() => setAuthScreen('role')} onSignup={handleSignup} onDone={onDone} onSignIn={() => setAuthScreen('login')} onClassic={toClassic} />
        : (
          <SignupScreen
            mode={mode}
            onBack={() => setAuthScreen('role')}
            onSignup={handleSignup}
            onDone={onDone}
          />
        );
    }
    if (modernOut) {
      return (
        <SignInPage
          email={loginEmail} setEmail={setLoginEmail}
          password={loginPassword} setPassword={setLoginPassword}
          needsSetup={needsSetup} error={loginError} busy={loggingIn}
          onSubmit={needsSetup ? handleSetup : handleLogin}
          oauthError={oauthError} providers={providers}
          showForgot={showForgotPassword} setShowForgot={setShowForgotPassword}
          onPasswordReset={() => {
            setShowForgotPassword(false);
            setLoginPassword('');
            notify('Password updated — sign in with your new password', 'success');
          }}
          onBack={() => setAuthScreen('landing')}
          onCreateAccount={() => { setNeedsSetup(false); setAuthScreen('role'); }}
          onClassic={toClassic}
        />
      );
    }
    return (
      <div className="min-h-dvh bg-primary flex items-center justify-center p-4 relative overflow-hidden">
        <div className="hero-grid absolute inset-0" />
        <div className="hero-glow absolute inset-0" />
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
          <button
            onClick={() => setAuthScreen('landing')}
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-base transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to home
          </button>
          <Card className="p-8">
            <div className="flex flex-col items-center gap-4 mb-8">
              <BrandLogo className="w-16 h-16 rounded-2xl" />
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-display font-bold text-text-base tracking-tight">Control Point</h1>
                <BetaBadge className="mt-1" />
              </div>
              <p className="text-text-muted text-center text-sm">
                {needsSetup ? "Set your new password to continue" : "Welcome back. Sign in to your workspace."}
              </p>
            </div>

            <form onSubmit={needsSetup ? handleSetup : handleLogin} className="space-y-4">
              {!needsSetup && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Email</label>
                  <Input type="email" required value={loginEmail} onChange={(e: any) => setLoginEmail(e.target.value)} placeholder="you@team.org" />
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Password</label>
                  {!needsSetup && (
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-[11px] font-semibold text-accent hover:brightness-110"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input type="password" required value={loginPassword} onChange={(e: any) => setLoginPassword(e.target.value)} placeholder="••••••••" />
              </div>
              {loginError && (
                <p className="text-sm text-rose-400 text-center" role="alert">{loginError}</p>
              )}
              <Button type="submit" disabled={loggingIn} className="w-full py-3 mt-2 text-[15px]">
                {loggingIn ? 'Signing in…' : needsSetup ? "Complete Setup" : "Sign In"}
              </Button>
            </form>
            {showForgotPassword && !needsSetup && (
              <ForgotPasswordScreen
                initialEmail={loginEmail}
                onBack={() => setShowForgotPassword(false)}
                onDone={() => {
                  setShowForgotPassword(false);
                  setLoginPassword('');
                  notify('Password updated — sign in with your new password', 'success');
                }}
              />
            )}
            {oauthError && !needsSetup && (
              <p className="text-sm text-rose-400 text-center mt-4">{oauthError}</p>
            )}
            {(googleEnabled || discordEnabled || githubEnabled) && !needsSetup && (
              <>
                <div className="flex items-center gap-3 mt-6">
                  <div className="flex-1 h-px bg-text-base/10" />
                  <span className="text-xs text-text-muted">or</span>
                  <div className="flex-1 h-px bg-text-base/10" />
                </div>
                <div className="mt-6 space-y-2.5">
                  {googleEnabled && (
                    <a href={oauthUrl('/api/auth/google?intent=login')} className="block">
                      <Button variant="secondary" className="w-full py-3" type="button">
                        <GoogleIcon />
                        Continue with Google
                      </Button>
                    </a>
                  )}
                  {discordEnabled && (
                    <a href={oauthUrl('/api/auth/discord?intent=login')} className="block">
                      <Button variant="secondary" className="w-full py-3" type="button">
                        <DiscordIcon />
                        Continue with Discord
                      </Button>
                    </a>
                  )}
                  {githubEnabled && (
                    <a href={oauthUrl('/api/auth/github?intent=login')} className="block">
                      <Button variant="secondary" className="w-full py-3" type="button">
                        <GithubIcon />
                        Continue with GitHub
                      </Button>
                    </a>
                  )}
                </div>
              </>
            )}
          </Card>
          <p className="mt-6 text-center text-xs text-text-muted">
            Mission control for robotics teams.
          </p>
          <p className="mt-3 text-center text-sm text-text-muted">
            New to Control Point?{' '}
            <button onClick={() => { setNeedsSetup(false); setAuthScreen('role'); }} className="text-accent font-semibold hover:underline">
              Create an account
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  // Zero-team empty state: create, join, or delete account.
  if (isLoggedIn && teamsLoaded && teams.length === 0) {
    return (
      <TeamlessScreen
        user={currentUser}
        onCreateTeam={async (name: string) => {
          const data = await handleAddTeam(name);
          notify(`Team "${data.team?.name || 'created'}" created — code ${data.team?.access_code}`, 'success');
        }}
        onJoinTeam={async (accessCode: string) => {
          const res = await apiFetch('/api/teams/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_code: accessCode })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not join team');
          clearTeamCaches();
          persistSession(data.sessionId, data.user);
          setTeams((data.user as any)?.teams || []);
          await fetchData();
          notify(`Joined "${data.team?.name || 'team'}"`, 'success');
        }}
        onDeleteAccount={async () => {
          const res = await apiFetch('/api/auth/account', { method: 'DELETE' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Could not delete your account.');
          if (typeof localStorage !== 'undefined') localStorage.removeItem('sessionId');
          window.location.reload();
        }}
        onSignOut={handleLogout}
      />
    );
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
        <ByMode
          legacy={<TaskCompletionDialog
          task={completingTask}
          notes={completionNotes}
          onNotesChange={setCompletionNotes}
          files={completionFiles}
          onFilesChange={setCompletionFiles}
          completing={completing}
          onSubmit={handleCompleteTask}
          onClose={closeCompleteDialog}
        />}
          modern={<CompletionDialog
          task={completingTask}
          notes={completionNotes}
          onNotesChange={setCompletionNotes}
          files={completionFiles}
          onFilesChange={setCompletionFiles}
          completing={completing}
          onSubmit={handleCompleteTask}
          onClose={closeCompleteDialog}
        />}
        />
      )}
      {/* Slide-in mention toast: appears when someone pings you in a channel
          you aren't viewing. Click jumps to the channel. */}
      <AnimatePresence>
        {mentionToast && (
          <motion.div
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed bottom-5 right-5 z-[90] w-[320px] max-w-[calc(100vw-2.5rem)] glass rounded-2xl border border-accent/30 shadow-2xl overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                  <AtSign className="w-4 h-4 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-text-base">
                    Mentioned{notifMeta(mentionToast).channel_name ? ` in #${notifMeta(mentionToast).channel_name}` : ''}
                  </p>
                  <p className="text-xs text-text-muted leading-relaxed mt-0.5 line-clamp-3">{mentionToast.content}</p>
                </div>
                <button onClick={dismissMentionToast} className="p-1 text-text-muted hover:text-text-base shrink-0" aria-label="Dismiss">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {notifMeta(mentionToast).channel_id != null && (
                <Button className="w-full mt-3 !py-2 text-xs" onClick={() => jumpToMention(mentionToast)}>
                  Jump to #{notifMeta(mentionToast).channel_name || 'chat'}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Slim non-blocking refresh indicator (background fetchData after first load). */}
      {refreshing && !loading && (
        <div className="fixed top-0 left-0 right-0 z-[120] h-[3px] pointer-events-none" aria-hidden="true">
          <div className="cp-refresh-bar h-full bg-accent" />
        </div>
      )}
      {signupTeam && (
        <ByMode
          legacy={<CodeRevealScreen team={signupTeam} onEnter={() => setSignupTeam(null)} />}
          modern={<CodeRevealDialog team={signupTeam} onEnter={() => setSignupTeam(null)} />}
        />
      )}
      <ShellSwitch
        legacy={<>
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && isMobile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: !isMobile && !isSidebarOpen ? 80 : 280
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "bg-secondary border-r border-text-base/5 flex flex-col",
          // On phones the drawer must sit ABOVE the bottom tab bar (z-40),
          // otherwise the user card + settings gear hide underneath it.
          isMobile ? "fixed inset-y-0 left-0 shadow-xl z-50" : "relative z-40"
        )}
        style={{
          transform: isMobile && !isSidebarOpen ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.3s ease-in-out'
        }}
      >
        <div className="px-4 sm:px-5 pt-5 pb-4 flex items-center gap-3 flex-shrink-0">
          {isSidebarOpen ? (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 }}
            >
              <BrandMark variant="sidebar" />
            </motion.div>
          ) : (
            <BrandMark variant="compact" />
          )}
        </div>

        <nav className="flex-1 px-3 sm:px-4 space-y-1 mt-2 overflow-y-auto custom-scrollbar pb-4">
          {(() => {
            const pinned = visibleTabs.filter((t) => (t as any).pinned);
            const groups: { label: string; items: typeof visibleTabs }[] = [];
            for (const t of visibleTabs.filter((t) => !(t as any).pinned)) {
              const label = (t as any).group || 'More';
              let g = groups.find((x) => x.label === label);
              if (!g) { g = { label, items: [] }; groups.push(g); }
              g.items.push(t);
            }
            const renderItem = (item: any, depth = 0) => {
              const isActive = activeTab === item.id;
              const kids = item.children as any[] | undefined;
              if (kids && kids.length > 0) {
                const childActive = kids.some((k) => k.id === activeTab);
                const open = (item.id === 'cad' ? cadNavOpen : teamsNavOpen) || childActive;
                return (
                  <div key={item.id}>
                    <button
                      data-onboard={`nav-${item.id}`}
                      onClick={() => (isSidebarOpen ? (item.id === 'cad' ? setCadNavOpen(!cadNavOpen) : setTeamsNavOpen(!teamsNavOpen)) : navigate(`/${item.path}`))}
                      title={!isSidebarOpen ? t(item.labelKey) : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative text-sm",
                        childActive
                          ? "bg-accent text-accent-ink font-bold shadow-[0_4px_16px_rgba(255,199,0,0.3)]"
                          : "text-text-muted hover:bg-text-base/[0.06] hover:text-text-base font-medium"
                      )}
                    >
                      <item.icon className={cn("w-[18px] h-[18px] shrink-0", childActive ? "text-accent-ink" : "text-accent/80 group-hover:text-accent")} strokeWidth={2.25} />
                      {isSidebarOpen && (
                        <>
                          <span className="truncate flex-1 text-left">{t(item.labelKey)}</span>
                          <ChevronDown className={cn("w-4 h-4 flex-shrink-0 transition-transform", open && "rotate-180")} />
                        </>
                      )}
                    </button>
                    {isSidebarOpen && open && (
                      <div className="ml-5 mt-1 space-y-1 border-l border-text-base/10 pl-2">
                        {kids.map((k) => {
                          const kActive = activeTab === k.id;
                          return (
                            <button
                              key={k.id}
                              data-onboard={`nav-${k.id}`}
                              onClick={() => navigate(`/${k.path}`)}
                              className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all group relative text-[13px]",
                                kActive
                                  ? "bg-accent/20 text-accent font-bold"
                                  : "text-text-muted hover:bg-text-base/[0.06] hover:text-text-base font-medium"
                              )}
                            >
                              <k.icon className={cn("w-4 h-4 shrink-0", kActive ? "text-accent" : "text-accent/70 group-hover:text-accent")} strokeWidth={2.25} />
                              <span className="truncate">{t(k.labelKey)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={item.id}
                  data-onboard={`nav-${item.id}`}
                  onClick={() => navigate(`/${item.path}`)}
                  title={!isSidebarOpen ? t(item.labelKey) : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative text-sm",
                    depth > 0 && "py-2 text-[13px]",
                    isActive
                      ? "bg-accent text-accent-ink font-bold shadow-[0_4px_16px_rgba(255,199,0,0.3)]"
                      : "text-text-muted hover:bg-text-base/[0.06] hover:text-text-base font-medium"
                  )}
                >
                  <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive ? "text-accent-ink" : "text-accent/80 group-hover:text-accent")} strokeWidth={2.25} />
                  {isSidebarOpen && <span className="truncate">{t(item.labelKey)}</span>}
                  {(item as any).badge === 'beta' && (isSidebarOpen ? (
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      {!predictSeen && <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black tracking-wider leading-none">NEW</span>}
                      <span className="px-1.5 py-0.5 rounded-full bg-sky-500 text-white text-[9px] font-black tracking-wider leading-none">BETA</span>
                    </span>
                  ) : !predictSeen && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-secondary" aria-label="New" />
                  ))}
                  {item.id === 'chat' && unreadMentions > 0 && (
                    <span
                      className={cn(
                        "flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold leading-none",
                        isSidebarOpen ? "ml-auto" : "absolute -top-1 -right-1"
                      )}
                      title={`${unreadMentions} unread mention${unreadMentions === 1 ? '' : 's'}`}
                    >
                      {unreadMentions > 99 ? '99+' : unreadMentions}
                    </span>
                  )}
                </button>
              );
            };
            return (
              <>
                {pinned.filter((t) => t.id !== 'owner').map((t) => renderItem(t))}
                {groups.map((g) => (
                  <div key={g.label}>
                    {isSidebarOpen && (
                      <p className="px-3 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">{g.label}</p>
                    )}
                    <div className="space-y-1">{g.items.map((t) => renderItem(t))}</div>
                  </div>
                ))}
                {pinned.filter((t) => t.id === 'owner').map((t) => renderItem(t))}
              </>
            );
          })()}
        </nav>

        <div
          className="p-3 sm:p-4 border-t border-text-base/[0.06] flex-shrink-0 space-y-1.5"
          // Clear the iPhone home indicator so the user card is fully tappable.
          style={isMobile ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' } : undefined}
        >
          {/* Voice controls sit with the user card, Discord-style (presence picker untouched) */}
          <UserVoiceControls className={cn(!isSidebarOpen && 'justify-center')} onOpenSettings={() => openSettings()} />
          {/* Discord-style user card: avatar w/ presence, name, status picker, settings gear */}
          <div className="relative">
            {statusPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setStatusPickerOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 w-64 z-50 bg-elevated border border-text-base/10 rounded-2xl shadow-2xl overflow-hidden">
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">Set status</p>
                  <PresencePicker value={currentUser?.presence_status || 'online'} onPick={handleStatusPick} />
                </div>
              </>
            )}
            <div className={cn("flex items-center gap-3 rounded-xl bg-text-base/[0.04] border border-text-base/[0.06]", isSidebarOpen ? "p-2.5" : "p-2 justify-center")}>
              <button
                onClick={() => setStatusPickerOpen(!statusPickerOpen)}
                className="hover:ring-2 hover:ring-accent/50 transition-all rounded-full flex-shrink-0"
                title={`Status: ${PRESENCE_META[currentUser?.presence]?.label || 'Offline'} — click to change`}
              >
                <AvatarWithPresence user={currentUser} size="md" presence={currentUser?.presence} />
              </button>
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-text-base truncate leading-tight">{currentUser?.name}</p>
                  <p className="text-[11px] text-text-muted truncate">{PRESENCE_META[currentUser?.presence]?.label || currentUser?.role}</p>
                </div>
              )}
              {isSidebarOpen && (
                <>
                  <button onClick={() => openSettings()} aria-label="Settings" data-onboard="nav-settings-gear" className="p-2 text-text-muted hover:text-text-base transition-colors flex-shrink-0" title="Settings">
                    <Settings className="w-4 h-4" />
                  </button>
                  <button onClick={handleLogout} aria-label="Sign out" className="p-2 text-text-muted hover:text-rose-400 transition-colors flex-shrink-0" title="Sign out">
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full hidden md:flex items-center gap-3 px-3 py-2 text-text-muted hover:text-text-base rounded-xl hover:bg-text-base/[0.06] transition-colors text-sm font-medium"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isSidebarOpen ? <ChevronLeft className="w-[18px] h-[18px] flex-shrink-0" /> : <ChevronRight className="w-[18px] h-[18px] flex-shrink-0" />}
            {isSidebarOpen && <span>Collapse</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main ref={setVoltMain} className="flex-1 flex flex-col min-h-0 min-w-0 bg-primary relative h-dvh app-volt-grid grid-pulse">
        {/* Background effects (see index.css): pulse glow layers — static
            gradients with only opacity animated — and the cursor glow. */}
        <div className="grid-pulse-layer grid-pulse-center" aria-hidden="true" />
        <div className="grid-pulse-layer grid-pulse-edges" aria-hidden="true" />
        <div className="grid-pulse-layer grid-pulse-corners" aria-hidden="true" />
        <div className="grid-reactive-spot" aria-hidden="true" />
        {!isImmersiveRoute && (
        <header className={cn("flex-shrink-0 glass px-4 sm:px-6 lg:px-8 py-3 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between",
          // Raise the header above page content only while one of its
          // dropdowns is open (otherwise content modals must cover it).
          // Needs `!`: the unlayered `.app-volt-grid > *` rule in index.css
          // pins every <main> child to z-index:1 and beats plain utilities,
          // which left these menus painted under — and unclickable behind —
          // the page content.
          (showUserMenu || showNotifications || showTeamMenu) && "!z-[60]")}>
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-display font-bold text-text-base capitalize truncate">{pageTitle}</h2>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0">
            {/* Hidden on phones: lives in the account menu instead, so the
                page title always has room to breathe. */}
            <button
              onClick={() => setShowFeedback(true)}
              className="hidden sm:block p-2 text-text-muted hover:text-text-base transition-colors"
              title="Send feedback to Sushil"
            >
              <FeedbackIcon className="w-5 h-5" />
            </button>
            <div className="relative">
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) markNotificationsRead();
                }}
                className="relative p-2 text-text-muted hover:text-text-base transition-colors"
              >
                <Bell className="w-5 h-5" />
                {notifications.some(n => !n.is_read) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full border-2 border-primary" />
                )}
              </button>

              {showNotifications && (
                <button
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setShowNotifications(false)}
                  aria-label="Close notifications"
                />
              )}
              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={cn(
                      "dropdown-surface rounded-2xl border border-text-base/10 shadow-2xl overflow-hidden z-50",
                      isMobile
                        ? "fixed left-3 right-3 top-[calc(60px+env(safe-area-inset-top))] w-auto"
                        : "absolute right-0 mt-2 w-80"
                    )}
                  >
                    <div className="p-4 border-b border-text-base/10 bg-text-base/5 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-text-base">Notifications</h4>
                      {notifications.length > 0 && (
                        <button
                          onClick={async () => {
                            if (!(await confirmDialog({ title: 'Clear all notifications?', message: 'This will delete all your notifications.', confirmLabel: 'Clear all' }))) return;
                            const res = await apiFetch('/api/notifications', { method: 'DELETE' });
                            if (res.ok) {
                              setNotifications([]);
                              notify('Notifications cleared', 'success');
                            } else {
                              notify('Could not clear notifications', 'error');
                            }
                          }}
                          className="text-[11px] font-semibold text-text-muted hover:text-rose-400 transition-colors"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {notifications.length > 0 ? (
                        notifications.map(n => (
                          <div
                            key={n.id}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setNotifMenu({ x: e.clientX, y: e.clientY, id: n.id, isRead: !!n.is_read });
                            }}
                            className={cn("p-4 border-b border-text-base/5 hover:bg-text-base/5 transition-colors", !n.is_read && "bg-accent/5")}
                          >
                            <p className="text-xs text-text-base leading-relaxed">{n.content}</p>
                            <p className="text-[10px] text-text-muted/70 mt-1">{format(new Date(n.timestamp), 'MMM d, h:mm a')}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center">
                          <p className="text-xs text-text-muted/70">No notifications yet</p>
                        </div>
                      )}
                    </div>
                    {/* Right-click menu for notifications */}
                    {notifMenu && (
                      <>
                        <button
                          className="fixed inset-0 z-[60] cursor-default"
                          onClick={() => setNotifMenu(null)}
                          aria-label="Close menu"
                        />
                        <div
                          className="fixed z-[61] min-w-[180px] rounded-xl border border-text-base/10 bg-elevated shadow-xl shadow-black/40 overflow-hidden"
                          style={{ left: Math.min(notifMenu.x, window.innerWidth - 190), top: Math.min(notifMenu.y, window.innerHeight - 120) }}
                        >
                          <button
                            onClick={async () => {
                              const res = await apiFetch(notifMenu.isRead ? '/api/notifications/unread' : '/api/notifications/read', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ids: [notifMenu.id] }),
                              });
                              if (res.ok) {
                                setNotifications(prev => prev.map(x => x.id === notifMenu.id ? { ...x, is_read: notifMenu.isRead ? 0 : 1 } : x));
                              }
                              setNotifMenu(null);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-text-base hover:bg-text-base/[0.06] transition-colors flex items-center gap-2"
                          >
                            {notifMenu.isRead ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
                            {notifMenu.isRead ? 'Mark as unread' : 'Mark as read'}
                          </button>
                          <button
                            onClick={async () => {
                              const res = await apiFetch(`/api/notifications/${notifMenu.id}`, { method: 'DELETE' });
                              if (res.ok) {
                                setNotifications(prev => prev.filter(x => x.id !== notifMenu.id));
                              } else {
                                notify('Could not delete notification', 'error');
                              }
                              setNotifMenu(null);
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {teams.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowTeamMenu(!showTeamMenu)}
                  className="flex items-center gap-1.5 px-2.5 py-2 bg-text-base/5 rounded-full border border-text-base/10 hover:border-accent/40 hover:bg-text-base/[0.08] transition-all cursor-pointer max-w-[140px] sm:max-w-[200px]"
                  aria-label="Switch team"
                  title="Switch team"
                >
                  <Layers className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="hidden sm:block text-xs font-bold text-text-base truncate">{activeTeamName}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                </button>
                {showTeamMenu && (
                  <>
                    <button
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setShowTeamMenu(false)}
                      aria-label="Close team menu"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className={cn(
                        "dropdown-surface rounded-2xl border border-text-base/10 shadow-2xl overflow-hidden z-50",
                        isMobile
                          ? "fixed left-3 right-3 top-[calc(60px+env(safe-area-inset-top))] w-auto"
                          : "absolute right-0 mt-2 w-56"
                      )}
                    >
                      <div className="p-3 border-b border-text-base/10 bg-text-base/5">
                        <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">My teams</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto custom-scrollbar">
                        {teams.map((t: any) => (
                          <button
                            key={t.id}
                            onClick={() => { setShowTeamMenu(false); handleSwitchTeam(t.id); }}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-text-base/5",
                              t.id === currentTeamId ? "bg-accent/10" : ""
                            )}
                          >
                            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
                              <Layers className="w-4 h-4 text-accent" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-text-base truncate flex items-center gap-1.5">
                                <span className="truncate">{t.name}</span>
                                {t.ftc_team_number ? (
                                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : null}
                              </p>
                              <p className="text-[11px] text-text-muted font-mono">Code: {t.access_code}</p>
                            </div>
                            {t.id === currentTeamId && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </div>
            )}
            <ThemeToggle className="hidden sm:block" />
            <button
              onClick={handleBrunoButton}
              data-onboard="header-bruno"
              title={`${botName} — click for quick chat, double-click for full view`}
              aria-label={`Open ${botName}`}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] border border-accent/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center flex-shrink-0 shadow-[0_2px_10px_rgba(255,199,0,0.25)]"
            >
              <BrunoIcon className="w-6 h-6 text-accent-ink" animate thinking={isAiLoading} />
            </button>
            {currentUser && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-3 p-1.5 sm:px-4 sm:py-2 bg-text-base/5 rounded-full border border-text-base/10 hover:border-accent/40 hover:bg-text-base/[0.08] transition-all cursor-pointer"
                  aria-label="Account menu"
                >
                  <Avatar user={currentUser} size="sm" />
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-bold text-text-base">{currentUser.name}</p>
                    <p className="text-[10px] text-text-muted">{currentUser.role}</p>
                  </div>
                  <LogOut className="w-4 h-4 text-text-muted/70" />
                </button>

                {showUserMenu && (
                  <>
                    <button
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setShowUserMenu(false)}
                      aria-label="Close account menu"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className={cn(
                        "dropdown-surface rounded-2xl border border-text-base/10 shadow-2xl overflow-hidden z-50",
                        isMobile
                          ? "fixed left-3 right-3 top-[calc(60px+env(safe-area-inset-top))] w-auto"
                          : "absolute right-0 mt-2 w-52"
                      )}
                    >
                      <div className="p-3 border-b border-text-base/10 bg-text-base/5">
                        <p className="text-sm font-bold text-text-base truncate">{currentUser.name}</p>
                        <p className="text-[11px] text-text-muted truncate">{currentUser.email || currentUser.role}</p>
                      </div>
                      <div className="p-1.5">
                        <button
                          onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-base hover:bg-text-base/[0.06] transition-colors"
                        >
                          <UserCircle className="w-[18px] h-[18px] text-accent" />
                          My Profile
                        </button>
                        <button
                          onClick={() => { setShowUserMenu(false); openSetupGuide(); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-base hover:bg-text-base/[0.06] transition-colors"
                        >
                          <Sparkles className="w-[18px] h-[18px] text-accent" />
                          Setup guide
                        </button>
                        {/* Mobile-only: the header feedback button is hidden on
                            phones to give the page title room. */}
                        <button
                          onClick={() => { setShowUserMenu(false); setShowFeedback(true); }}
                          className="sm:hidden w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-base hover:bg-text-base/[0.06] transition-colors"
                        >
                          <FeedbackIcon className="w-[18px] h-[18px] text-accent" />
                          Send feedback
                        </button>
                        {/* Personal settings popup (appearance, voice, Bruno…) — for
                            everyone; on phones this is the only easy way in. */}
                        <button
                          onClick={() => { setShowUserMenu(false); openSettings(); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-base hover:bg-text-base/[0.06] transition-colors"
                        >
                          <Settings className="w-[18px] h-[18px] text-accent" />
                          {t('settings.title')}
                        </button>
                        {(currentUser as any)?.account_type === 'admin' && (
                          <button
                            onClick={() => { setShowUserMenu(false); navigate('/settings'); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-base hover:bg-text-base/[0.06] transition-colors"
                          >
                            <ShieldCheck className="w-[18px] h-[18px] text-accent" />
                            {t('nav.teamSettings')}
                          </button>
                        )}
                        <div className="my-1.5 border-t border-text-base/[0.06]" />
                        <button
                          onClick={() => { setShowUserMenu(false); handleLogout(); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <LogOut className="w-[18px] h-[18px]" />
                          Sign out
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </div>
            )}
          </div>
        </header>
        )}

        <div className={cn(
          "flex flex-col flex-1 min-h-0 min-w-0",
          isImmersiveRoute ? "overflow-hidden pb-[calc(62px+env(safe-area-inset-bottom))] md:pb-0" : "px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 pb-28 md:pb-8 overflow-y-auto overflow-x-clip custom-scrollbar"
        )}>
          {!isImmersiveRoute && <TryModernBanner />}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              // grow + shrink-0 + basis-auto (NOT flex-1): flex-1's
              // flex-basis:0% makes Chromium under-report this wrapper's
              // height, so the scroller's scrollHeight misses the bottom
              // padding and the last content hides behind the mobile nav.
              className="flex flex-col grow shrink-0 basis-auto min-w-0"
            >
              {mainContent}
            </motion.div>
          </AnimatePresence>
        </div>
        {!isImmersiveRoute && (
        <AppFooter
          links={visibleTabs.filter((t) => ['dashboard', 'stats', 'resources', 'calendar', 'chat', 'tasks'].includes(t.id))}
          teamName={activeTeamName}
        />
        )}
      </main>

      {/* Mobile bottom tab bar — the student-first navigation on phones */}
      {isMobile && (
        <nav
          aria-label="Primary"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-text-base/10 bg-secondary/95 backdrop-blur-lg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex">
            {mobileTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-onboard={`mtab-${tab.id}`}
                  onClick={() => navigate(`/${tab.path}`)}
                  aria-current={isActive ? 'page' : undefined}
                  className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[62px] active:scale-95 transition-transform"
                >
                  <Icon className={cn('w-6 h-6', isActive ? 'text-accent' : 'text-text-muted')} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={cn('text-[10px] font-bold leading-none', isActive ? 'text-accent' : 'text-text-muted')}>
                    {mobileTabShortLabels[tab.id] || t(tab.labelKey)}
                  </span>
                  {isActive && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-accent" />}
                </button>
              );
            })}
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="More sections"
              data-onboard="mtab-more"
              className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[62px] active:scale-95 transition-transform"
            >
              <LayoutGrid className="w-6 h-6 text-text-muted" strokeWidth={2} />
              <span className="text-[10px] font-bold leading-none text-text-muted">More</span>
            </button>
          </div>
        </nav>
      )}

        </>}
        modern={() => (
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
        )}
      />

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      {/* Voice calling surfaces — all driven by VoiceProvider context state.
          CallBar is fixed-bottom (above the mobile nav) and survives route
          navigation because it lives outside the routed views. */}
      <CallBar onOpenSettings={() => openSettings()} />
      <IncomingCallModal />
      <CallView onOpenSettings={() => openSettings()} />
      <CookieConsent />
      <InstallPrompt />
      <WhatsNewAutoPopup />
      <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
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
        <WelcomeScreen
          userName={currentUser?.name}
          onGetStarted={() => void handleWelcomeGetStarted()}
          onSkip={() => void handleWelcomeSkip()}
        />
      )}
      {tourOpen && (
        <Walkthrough
          steps={tourSteps}
          initialStep={Math.min(tourStartStep, Math.max(0, tourSteps.length - 1))}
          onStepChange={handleTourStepChange}
          onFinish={(next) => void handleTourFinish(next)}
          onExit={() => void handleTourExit()}
        />
      )}
      {wizardOpen && onboarding && currentUser && (
        <SetupWizard
          user={{ name: currentUser.name, role: currentUser.role }}
          initialStep={wizardStartStep}
          state={onboarding}
          onPatchState={patchOnboarding}
          onSaveProfile={handleWizardSaveProfile}
          onProfileChanged={(name, role) => setCurrentUser((u) => (u ? { ...u, name, role } : u))}
          onStartTour={(fromStep) => startTour(fromStep ?? Math.max(0, onboarding.walkthrough.lastStep || 0))}
          onClose={() => setWizardOpen(false)}
        />
      )}
      {/* Discord-style settings popup (gear by the user card) */}
      {settingsOpen && currentUser && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          user={currentUser}
          team={activeTeam}
          isAdmin={isAdmin}
          onUserSaved={(u) => setCurrentUser((prev) => (prev ? { ...prev, ...u } : u))}
          onTeamSaved={(t) => setTeams((prev) => prev.map((x: any) => (x.id === t.id ? { ...x, ...t } : x)))}
          onOpenRoles={() => { setSettingsOpen(false); navigate('/roles'); }}
          onStatusPick={handleStatusPick}
        />
      )}
    </div>
      </InterfaceModeProvider>
    </ContextMenuProvider>
    </VoiceProvider>
  );
}

// Site footer for the app shell: quick navigation, data credit, copyright.
function AppFooter({ links, teamName }: { links: { id: string; path: string; labelKey: string }[]; teamName?: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <footer className="hidden md:block flex-shrink-0 border-t border-text-base/[0.06] bg-secondary/60">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
            <Bolt className="text-accent-ink w-3.5 h-3.5" strokeWidth={2.5} />
          </div>
          <p className="text-xs text-text-muted truncate">
            <span className="font-bold text-text-base">Control Point</span>
            {teamName ? <span> · {teamName}</span> : null}
          </p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 flex-1">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => navigate(`/${l.path}`)}
              className="text-xs text-text-muted hover:text-accent transition-colors font-medium"
            >
              {t(l.labelKey)}
            </button>
          ))}
        </nav>
        <p className="text-[10px] text-text-muted/70 text-center sm:text-right leading-relaxed">
          Match data: ftcscout.org<br className="sm:hidden" /> · © 2026 Control Point
        </p>
      </div>
    </footer>
  );
}

// Cookie / local-storage consent. Control Point only uses first-party storage:
// a session token to keep you signed in, your theme colors, and this choice.
// No trackers, no ads, no third-party cookies.
function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [functional, setFunctional] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cp-consent');
      if (!saved) setVisible(true);
      else {
        const parsed = JSON.parse(saved);
        setFunctional(parsed.functional !== false);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  // Allow reopening from anywhere: window.dispatchEvent(new Event('cp:cookie-settings'))
  useEffect(() => {
    const open = () => { setCustomizing(true); setVisible(true); };
    window.addEventListener('cp:cookie-settings', open);
    return () => window.removeEventListener('cp:cookie-settings', open);
  }, []);

  const save = (choice: { necessary: true; functional: boolean }) => {
    try { localStorage.setItem('cp-consent', JSON.stringify({ ...choice, savedAt: new Date().toISOString() })); } catch {}
    setFunctional(choice.functional);
    setVisible(false);
    setCustomizing(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 pointer-events-none">
      <div className="glass rounded-2xl border border-text-base/10 max-w-2xl mx-auto p-5 sm:p-6 shadow-2xl pointer-events-auto">
        {!customizing ? (
          <>
            <h3 className="text-base font-display font-bold text-text-base mb-2">How Control Point stores data</h3>
            <p className="text-sm text-text-muted mb-4">
              We use only first-party storage on your device: a session token to keep you signed in,
              your theme colors, and this preference. No advertising trackers, no third-party cookies.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => save({ necessary: true, functional: true })} className="flex-1">Accept all</Button>
              <Button variant="secondary" onClick={() => save({ necessary: true, functional: false })} className="flex-1">Essential only</Button>
              <Button variant="ghost" onClick={() => setCustomizing(true)} className="flex-1">Customize</Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-display font-bold text-text-base mb-4">Storage preferences</h3>
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-text-base/10 p-3">
                <div>
                  <p className="text-sm font-bold text-text-base">Essential</p>
                  <p className="text-xs text-text-muted">Sign-in session and security. Always on.</p>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Always on</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-text-base/10 p-3">
                <div>
                  <p className="text-sm font-bold text-text-base">Preferences</p>
                  <p className="text-xs text-text-muted">Theme colors and UI choices, saved on this device.</p>
                </div>
                <Switch
                  checked={functional}
                  onChange={setFunctional}
                  label="Toggle preference storage"
                />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={() => save({ necessary: true, functional })} className="flex-1">Save my choice</Button>
              <Button variant="ghost" onClick={() => setCustomizing(false)} className="flex-1">Back</Button>
            </div>
          </>
        )}
      </div>
    </div>
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

/** Shared "remove member from team" used by member context menus. */
async function removeMemberFromTeam(m: any, onRefresh: () => void) {
  if (!(await confirmDialog({
    title: 'Remove member',
    message: `Remove ${m.name} from the team? They'll lose access immediately.`,
    confirmLabel: 'Remove',
    danger: true,
  }))) return;
  const res = await apiFetch(`/api/members/${m.id}`, { method: 'DELETE' });
  if (res.ok) {
    notify('Member removed', 'success');
    onRefresh();
  } else {
    const data = await res.json().catch(() => ({} as any));
    notify(data.error || 'Could not remove member — try again.', 'error');
  }
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


function TeamsView({ teams, members, onRefresh, refresh, currentUser, hasScope, onAddTeam, onSwitchTeam, onDeleteTeam, onLeaveTeam }: any) {
  // Members + workspace state/handlers are shared with the Modern People page.
  const {
    isAdmin, activeTeamId,
    showAddMember, editingMember, newMember, setNewMember, openNewMember, openEditMember, closeMemberEditor, handleAddMember,
    memberToRemove, setMemberToRemove, askRemoveMember, removeError, removingMember, handleDeleteMember, handleResetPassword,
    showAddTeam, editingTeam, newTeam, setNewTeam, openNewTeam, openEditTeam, closeTeamEditor, handleAddTeam,
  } = useMembersController({ members, refresh, onRefresh, currentUser, hasScope, onAddTeam });
  const voice = useVoice();

  // Right-click a member in the roster: call, copy ID, edit, remove.
  // (No friending/DMs — calls open a public team voice channel.)
  useContextMenu('member-team', (el) => {
    const id = Number(el.dataset.cmId);
    const m = (members || []).find((x: any) => x.id === id);
    if (!m) return null;
    return memberMenuItems({
      m,
      isSelf: m.id === currentUser?.id,
      canCall: true,
      onCall: (memberId, media) => voice.startCall([memberId], media),
      onEdit: isAdmin ? () => openEditMember(m) : undefined,
      onRemove: isAdmin && m.id !== currentUser?.id ? () => askRemoveMember(m) : undefined,
    });
  });

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Teams</h3>
          <p className="text-sm text-text-muted mt-1">Your workspaces — create teams, tweak their look, and share access codes so students can join.</p>
        </div>
        {isAdmin && (
          <Button onClick={openNewTeam}><Plus className="w-4 h-4" /> Add Team</Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {teams.map((team: any) => (
          <Card key={team.id} title={`${team.name} #${team.number}`} icon={Award}>
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  {team.id === activeTeamId && (
                    <span className="px-2 py-0.5 bg-accent/15 text-accent text-[10px] font-bold rounded-md uppercase tracking-wider border border-accent/30">Active</span>
                  )}
                  <span className="text-[11px] text-text-muted font-mono">Code: <span className="font-bold text-text-base">{team.access_code}</span></span>
                </div>
                <p className="text-xs text-text-muted uppercase font-bold">Members ({team.member_count ?? 0})</p>
                {team.id === activeTeamId ? (
                  <div className="flex flex-wrap gap-2">
                    {members.filter((m: any) => m.team_id === team.id).map((m: any) => (
                      <div key={m.id} className="px-3 py-1 bg-text-base/5 rounded-full border border-text-base/10 text-xs text-text-base">
                        {m.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted/70">Switch to this team to manage its members.</p>
                )}
                {team.accent_color && (
                  <div className="pt-2">
                    <p className="text-[10px] text-text-muted/70 uppercase font-bold mb-1">Team Branding</p>
                    <div className="flex gap-2">
                      <div className="w-4 h-4 rounded-full border border-text-base/10" style={{ backgroundColor: team.accent_color }} title="Accent" />
                    </div>
                  </div>
                )}
              </div>
              {isAdmin ? (
                <div className="flex gap-2 pt-4 border-t border-text-base/5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 h-8 text-[10px]"
                    onClick={() => openEditTeam(team)}
                  >
                    <Edit2 className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 h-8 text-[10px]"
                    onClick={() => onSwitchTeam(team.id)}
                    disabled={team.id === activeTeamId}
                  >
                    Switch
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                    onClick={() => onDeleteTeam(team)}
                    title="Delete team"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 pt-4 border-t border-text-base/5">
                  {team.id !== activeTeamId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 h-8 text-[10px]"
                      onClick={() => onSwitchTeam(team.id)}
                    >
                      Switch
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    onClick={() => onLeaveTeam(team)}
                    title="Leave team"
                  >
                    <LogOut className="w-3 h-3 mr-1" /> Leave
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between mt-12">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">All Members</h3>
          <p className="text-sm text-text-muted mt-1">Everyone on this team — manage the roster, roles, and permissions.</p>
        </div>
        <Button onClick={openNewMember}><Plus className="w-4 h-4" /> Add Member</Button>
      </div>

      {/* Mobile: stacked cards. A wide table inside an overflow-x container
          traps vertical swipe gestures on touch, making the page feel
          unscrollable. */}
      <div className="md:hidden space-y-3">
        {members.map((m: any) => (
          <div key={m.id} data-cm-type="member-team" data-cm-id={m.id} className="card-surface p-4">
            <div className="flex items-center gap-3">
              <AvatarWithPresence user={m} size="sm" presence={m.presence} />
              <div className="min-w-0 flex-1">
                <p className="text-text-base font-semibold truncate">{m.name}</p>
                <span className="inline-flex items-center gap-1.5 text-xs text-text-muted mt-0.5">
                  <PresenceDot presence={m.presence} className="w-2 h-2 !border-0" />
                  {PRESENCE_META[m.presence]?.label || 'Offline'}
                </span>
              </div>
              {isAdmin && (
                <div className="flex gap-0.5 shrink-0">
                  <button
                    onClick={() => openEditMember(m)}
                    className="p-2.5 text-text-muted/70 hover:text-accent transition-colors"
                    title="Edit Member"
                    aria-label="Edit member"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleResetPassword(m.email)}
                    className="p-2.5 text-text-muted/70 hover:text-accent transition-colors"
                    title="Reset Password"
                    aria-label="Reset password"
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => askRemoveMember(m)}
                    className="p-2.5 text-text-muted/70 hover:text-rose-400 transition-colors"
                    title="Remove Member"
                    aria-label="Remove member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {(m.roles || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {(m.roles || []).map((r: any) => (
                  <RoleBadge key={r.id} role={r} />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-text-muted">
              <span>Team <span className="text-text-base/80 font-medium">{m.team_name || 'N/A'}</span></span>
              <span>Role <span className="text-text-base/80 font-medium">{m.role}</span></span>
              <span>Board <span className="text-text-base/80 font-medium">{m.is_board ? 'Yes' : 'No'}</span></span>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden md:block card-surface overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-text-base/5 border-b border-text-base/10">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Name</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Team</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Board</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Scopes</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-text-base/5">
            {members.map((m: any) => (
              <tr key={m.id} data-cm-type="member-team" data-cm-id={m.id} className="hover:bg-text-base/5 transition-colors">
                <td className="px-6 py-4 text-sm text-text-base font-medium">
                  <span className="flex items-center gap-2.5">
                    <AvatarWithPresence user={m} size="sm" presence={m.presence} />
                    <span>
                      {m.name}
                      {(m.roles || []).length > 0 && (
                        <span className="flex flex-wrap gap-1 mt-1.5">
                          {(m.roles || []).map((r: any) => (
                            <RoleBadge key={r.id} role={r} />
                          ))}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-2 text-xs text-text-muted">
                    <PresenceDot presence={m.presence} className="w-2.5 h-2.5 !border-0" />
                    {PRESENCE_META[m.presence]?.label || 'Offline'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-text-muted">{m.team_name || 'N/A'}</td>
                <td className="px-6 py-4 text-sm text-text-muted">{m.role}</td>
                <td className="px-6 py-4">
                  {m.is_board ? (
                    <span className="px-2 py-1 bg-accent/20 text-accent text-[10px] font-bold rounded-md uppercase">Yes</span>
                  ) : (
                    <span className="px-2 py-1 bg-elevated text-text-muted/70 text-[10px] font-bold rounded-md uppercase">No</span>
                  )}
                </td>
                <td className="px-6 py-4 text-xs text-text-muted/70">
                  {(() => {
                    try {
                      const scopes = typeof m.scopes === 'string' ? JSON.parse(m.scopes) : m.scopes;
                      return Array.isArray(scopes) ? scopes.join(', ') : 'None';
                    } catch {
                      return 'None';
                    }
                  })()}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {isAdmin && (
                      <button 
                        onClick={() => openEditMember(m)}
                        className="p-2 text-text-muted/70 hover:text-accent transition-colors"
                        title="Edit Member"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <button 
                        onClick={() => handleResetPassword(m.email)}
                        className="p-2 text-text-muted/70 hover:text-accent transition-colors"
                        title="Reset Password"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                    )}
                    {isAdmin && (
                      <button 
                        onClick={() => askRemoveMember(m)}
                        className="p-2 text-text-muted/70 hover:text-rose-400 transition-colors"
                        title="Remove Member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals (Simplified) */}
      {memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Remove member" className="w-full max-w-md">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar user={memberToRemove} size="md" />
                <div className="min-w-0">
                  <p className="text-text-base font-bold truncate">{memberToRemove.name}</p>
                  <p className="text-xs text-text-muted truncate">
                    {[memberToRemove.email, teams.find((t: any) => t.id === memberToRemove.team_id)?.name].filter(Boolean).join(' • ')}
                  </p>
                </div>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                Remove <span className="text-text-base font-semibold">{memberToRemove.name}</span> from the team?
                They'll lose access immediately, but their messages, tasks, attendance history, and other work will be kept.
              </p>
              {removeError && <p className="text-sm text-rose-400">{removeError}</p>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setMemberToRemove(null)}>Cancel</Button>
                <Button variant="danger" onClick={handleDeleteMember} disabled={removingMember}>
                  {removingMember ? 'Removing...' : 'Remove from team'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
      {showAddTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={editingTeam ? "Edit Team" : "Add New Team"} className="w-full max-w-md">
            <div className="space-y-4">
              <Input placeholder="Team Name (e.g. CyberKnights)" value={newTeam.name} onChange={(e: any) => setNewTeam({...newTeam, name: e.target.value})} />
              <Input placeholder="Team Number (e.g. 12345)" value={newTeam.number} onChange={(e: any) => setNewTeam({...newTeam, number: e.target.value})} />
              
              <div className="pt-2">
                <p className="text-xs font-bold text-text-muted uppercase mb-3">Team Branding (Default for members)</p>
                <div className="flex items-center gap-3">
                  <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.accent_color || '#FFC700'} onChange={(e) => setNewTeam({...newTeam, accent_color: e.target.value})} />
                  <Input placeholder="Accent Color (Yellow)" value={newTeam.accent_color} onChange={(e: any) => setNewTeam({...newTeam, accent_color: e.target.value})} />
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeTeamEditor}>Cancel</Button>
                <Button onClick={handleAddTeam}>{editingTeam ? "Save Changes" : "Create Team"}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={editingMember ? "Edit Member" : "Add New Member"} className="w-full max-w-md">
            <div className="space-y-4">
              <Select 
                options={[
                  { label: 'Select Team', value: '' },
                  ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id }))
                ]} 
                value={newMember.team_id}
                onChange={(e: any) => setNewMember({...newMember, team_id: e.target.value})}
              />
              <Input placeholder="Full Name" value={newMember.name} onChange={(e: any) => setNewMember({...newMember, name: e.target.value})} />
              <Input placeholder="Role (e.g. Lead Programmer)" value={newMember.role} onChange={(e: any) => setNewMember({...newMember, role: e.target.value})} />
              <Input placeholder="Email" value={newMember.email} onChange={(e: any) => setNewMember({...newMember, email: e.target.value})} />
              <label className="flex items-center gap-2 text-sm text-text-base/80">
                <input type="checkbox" checked={newMember.is_board} onChange={(e) => setNewMember({...newMember, is_board: e.target.checked})} />
                Board Member (Admin)
              </label>
              {newMember.is_board && (
                <div className="space-y-2">
                  <p className="text-xs text-text-muted font-bold uppercase">Scopes</p>
                  <div className="flex flex-wrap gap-2">
                    {['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin'].map(s => (
                      <button 
                        key={s}
                        type="button"
                        onClick={() => {
                          const scopes = newMember.scopes.includes(s)
                            ? newMember.scopes.filter(x => x !== s)
                            : [...newMember.scopes, s];
                          setNewMember({...newMember, scopes});
                        }}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-all",
                          newMember.scopes.includes(s) ? "bg-accent border-accent text-accent-ink" : "border-text-base/10 text-text-muted"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeMemberEditor}>Cancel</Button>
                <Button onClick={handleAddMember}>{editingMember ? "Save Changes" : "Add Member"}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- QR check-in ----------
// Full-screen in-app camera scanner — students point it at the projected QR.
function QrScannerModal({ onClose, onToken }: { onClose: () => void; onToken: (token: string) => void }) {
  const error = useQrScanner('qr-reader-region', onToken);
  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <p className="text-text-base font-bold">Scan the check-in QR</p>
        <button onClick={onClose} className="p-2 rounded-full bg-text-base/10 text-text-base" aria-label="Close scanner">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10">
        {error ? (
          <div className="text-center">
            <Camera className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-text-base text-sm mb-6">{error}</p>
            <Button onClick={onClose}>Go back</Button>
          </div>
        ) : (
          <>
            <div id="qr-reader-region" className="w-full max-w-sm rounded-2xl overflow-hidden" />
            <p className="text-text-muted text-sm mt-6 text-center">Point your camera at the QR code<br />projected by your admin</p>
          </>
        )}
      </div>
    </div>
  );
}

// Admin panel: start a session, show the QR + day code, project fullscreen.
function QrSessionPanel({ teamName }: { teamName: string }) {
  const { session, loading, busy, duration, setDuration, start, stop: stopSession, remaining } = useQrSession();
  const [presenting, setPresenting] = useState(false);
  const stop = async () => { await stopSession(); setPresenting(false); };
  const durations = QR_DURATIONS;

  return (
    <>
      <Card icon={QrCode} title="QR Check-in" subtitle="Project the code — students scan to mark themselves present">
        {loading ? (
          <p className="text-sm text-text-muted py-4 text-center">Loading…</p>
        ) : !session ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Start a session and put the QR up on the board. Students scan it with their phone camera — no more honor-system check-ins.</p>
            <div className="flex flex-wrap gap-2">
              {durations.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    'px-3 py-2 rounded-xl text-sm font-bold border transition-all',
                    duration === d.value
                      ? 'bg-accent text-accent-ink border-accent'
                      : 'bg-text-base/5 text-text-muted border-text-base/10 hover:text-text-base'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <Button onClick={start} disabled={busy} className="w-full sm:w-auto">
              <QrCode className="w-5 h-5" /> {busy ? 'Starting…' : 'Start check-in session'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-6 items-center">
            <div className="bg-white p-4 rounded-2xl shrink-0">
              <QRCodeSVG value={session.url} size={200} level="M" />
            </div>
            <div className="flex-1 w-full text-center sm:text-left space-y-3">
              <div>
                <p className="text-xs text-text-muted uppercase font-bold tracking-widest mb-1">Day code (camera not working? type this)</p>
                <p className="text-4xl font-display font-bold tracking-[0.2em] text-text-base">{session.code}</p>
              </div>
              <p className="text-sm text-text-muted flex items-center justify-center sm:justify-start gap-2">
                <Timer className="w-4 h-4 text-accent" />
                Session ends in <span className="text-text-base font-bold tabular-nums">{formatCountdown(remaining)}</span>
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => setPresenting(true)} variant="secondary">
                  <Maximize2 className="w-4 h-4" /> Project fullscreen
                </Button>
                <Button onClick={stop} disabled={busy} variant="danger">
                  <X className="w-4 h-4" /> End session
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {presenting && session && (
        <div className="theme-dark fixed inset-0 z-[90] bg-black flex flex-col items-center justify-center p-6 text-center">
          <button
            onClick={() => setPresenting(false)}
            className="absolute top-4 right-4 p-3 rounded-full bg-text-base/10 text-text-base hover:bg-text-base/20"
            aria-label="Exit fullscreen"
          >
            <X className="w-6 h-6" />
          </button>
          <p className="text-text-base/60 text-sm font-bold uppercase tracking-[0.25em] mb-2">{teamName}</p>
          <h2 className="text-text-base text-2xl sm:text-4xl font-display font-bold mb-6">Scan to check in</h2>
          <div className="bg-white p-5 sm:p-8 rounded-3xl">
            <QRCodeSVG value={session.url} size={Math.min(420, typeof window !== 'undefined' ? window.innerWidth - 120 : 300)} level="M" />
          </div>
          <p className="text-text-base/60 text-sm mt-6 mb-1 uppercase tracking-widest font-bold">No camera? Enter code</p>
          <p className="text-text-base text-5xl sm:text-6xl font-display font-bold tracking-[0.25em]">{session.code}</p>
          <p className="text-text-base/50 text-sm mt-6 tabular-nums">Ends in {formatCountdown(remaining)}</p>
        </div>
      )}
    </>
  );
}

// Landing page for a scanned QR (also used by the in-app flow deep link).
function QrCheckinPage({ currentUser, onRefresh }: any) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/api/attendance/qr-session/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Session not found');
        setInfo(data);
        if (data.alreadyCheckedIn) {
          setDone(true);
          onRefresh?.();
        }
      } catch (e: any) {
        setError(e.message || 'Could not load session');
      }
    })();
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/attendance/checkin/${token}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      setDone(true);
      onRefresh?.();
    } catch (e: any) {
      setError(e.message || 'Check-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Card className="text-center py-8">
          <div className={cn(
            'w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4',
            done ? 'bg-emerald-500/15' : error ? 'bg-rose-500/15' : 'bg-accent/15'
          )}>
            {done ? <Check className="w-8 h-8 text-emerald-400" /> : error ? <X className="w-8 h-8 text-rose-400" /> : <QrCode className="w-8 h-8 text-accent" />}
          </div>
          {error ? (
            <>
              <h3 className="text-xl font-display font-bold text-text-base mb-2">Can't check in</h3>
              <p className="text-sm text-text-muted mb-6">{error}</p>
              <Button onClick={() => navigate('/dashboard')} variant="secondary">Back to dashboard</Button>
            </>
          ) : done ? (
            <>
              <h3 className="text-xl font-display font-bold text-text-base mb-2">You're checked in</h3>
              <p className="text-sm text-text-muted mb-6">{info?.teamName} · {format(new Date(), 'EEEE, MMMM d')}</p>
              <Button onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
            </>
          ) : !info ? (
            <p className="text-sm text-text-muted">Loading session…</p>
          ) : !info.isMember ? (
            <>
              <h3 className="text-xl font-display font-bold text-text-base mb-2">Wrong team</h3>
              <p className="text-sm text-text-muted mb-6">You're signed in as {currentUser?.name}, who isn't on {info.teamName}.</p>
              <Button onClick={() => navigate('/dashboard')} variant="secondary">Back to dashboard</Button>
            </>
          ) : (
            <>
              <p className="text-xs text-text-muted uppercase font-bold tracking-widest mb-1">{info.teamName}</p>
              <h3 className="text-xl font-display font-bold text-text-base mb-2">Check in{info.memberName ? ` as ${info.memberName}` : ''}?</h3>
              <p className="text-sm text-text-muted mb-6">Session ends {format(new Date(info.expiresAt), 'h:mm a')}</p>
              <Button onClick={confirm} disabled={busy} className="px-8 py-3 text-base w-full">
                <CalendarCheck className="w-5 h-5" /> {busy ? 'Checking in…' : "Yes, I'm here"}
              </Button>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

function StudentCheckinView({ attendance, currentUser, onRefresh, refresh }: any) {
  const { code, setCode, codeBusy, submitCode, checkinWithToken: checkin, myRecords, todayRecord, checkedIn } = useStudentCheckin({ attendance, currentUser, refresh, onRefresh });
  const [scanOpen, setScanOpen] = useState(false);
  const [codeMode, setCodeMode] = useState(() => !!code); // a drafted code reopens the field

  const statusMeta: any = {
    P: { label: 'Present', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    L: { label: 'Late', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    E: { label: 'Excused', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    U: { label: 'Unexcused', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    S: { label: 'Sick', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  };

  const checkinWithToken = (token: string) => { setScanOpen(false); void checkin(token); };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await submitCode()) setCodeMode(false);
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Attendance</h3>
        <p className="text-sm text-text-muted mt-1">Check in when you arrive, and review your own attendance history.</p>
      </div>
      <Card className="text-center py-8">
        <div className={cn(
          "w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4",
          checkedIn ? "bg-emerald-500/15" : "bg-accent/15"
        )}>
          <CalendarCheck className={cn("w-8 h-8", checkedIn ? "text-emerald-400" : "text-accent")} />
        </div>
        <p className="text-xs text-text-muted uppercase font-bold tracking-widest mb-1">
          {format(new Date(), 'EEEE, MMMM d')}
        </p>
        {checkedIn ? (
          <>
            <h4 className="text-xl font-display font-bold text-text-base mb-2">You are checked in</h4>
            <p className="text-sm text-text-muted">Status: {statusMeta[todayRecord.status]?.label || todayRecord.status}</p>
          </>
        ) : (
          <>
            <h4 className="text-xl font-display font-bold text-text-base mb-2">Not checked in yet</h4>
            <p className="text-sm text-text-muted mb-5">Scan the QR code your admin has projected,<br />or enter today's code.</p>
            <Button onClick={() => setScanOpen(true)} className="px-8 py-3 text-base w-full sm:w-auto">
              <ScanLine className="w-5 h-5" /> Scan QR code
            </Button>
            <div className="mt-3">
              <button
                onClick={() => setCodeMode(!codeMode)}
                className="text-sm text-text-muted hover:text-text-base underline underline-offset-4"
              >
                {codeMode ? 'Hide code entry' : 'Camera not working? Enter the code'}
              </button>
            </div>
            {codeMode && (
              <form onSubmit={handleCodeSubmit} className="mt-3 flex gap-2 max-w-xs mx-auto">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Day code"
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-text-base/5 border border-text-base/10 rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.2em] text-text-base placeholder:text-text-muted/50 uppercase focus:outline-none focus:border-accent/60"
                />
                <Button type="submit" disabled={codeBusy || !code.trim()}>
                  {codeBusy ? '…' : 'Go'}
                </Button>
              </form>
            )}
          </>
        )}
      </Card>
      {scanOpen && <QrScannerModal onClose={() => setScanOpen(false)} onToken={checkinWithToken} />}
      <div>
        <h4 className="text-sm font-bold text-text-base uppercase tracking-widest mb-3">My history</h4>
        {myRecords.length === 0 ? (
          <Card><p className="text-sm text-text-muted text-center py-6">No attendance records yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {myRecords.slice(0, 30).map((r: any) => (
              <div key={r.date} className="card-surface px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-text-base font-medium">{format(new Date(r.date + 'T12:00:00'), 'EEE, MMM d, yyyy')}</span>
                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", statusMeta[r.status]?.cls || 'bg-text-base/5 text-text-muted border-text-base/10')}>
                  {statusMeta[r.status]?.label || r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AttendanceView({ members, attendance, events, onRefresh, refresh, setLoading, hasScope, insights, updateInsights, isAiLoading, ThinkingIndicator, currentUser, activeTeamName }: any) {
  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'history' | 'summary'>('grid');
  const [showHideMenu, setShowHideMenu] = useState(false);
  // Grid, meeting days and summaries are shared with the Modern Attendance page.
  const {
    isAdmin, sessions, summary, hiddenDates, calendarStart, setCalendarStart, savingStatus,
    visibleDates, rangeLabel, hasMoreDates, getStatus, toggleStatus,
    hideDate, hideByDayOfWeek, unhideByDayOfWeek, hideAll, unhideAll,
  } = useAttendanceController({ attendance, refresh, hasScope });

  const statusColors: any = {
    'P': 'bg-emerald-500 text-emerald-950',
    'L': 'bg-amber-500 text-amber-950',
    'E': 'bg-blue-500 text-blue-950',
    'U': 'bg-rose-500 text-rose-950',
    'S': 'bg-purple-500 text-purple-950',
    '-': 'bg-text-base/5 text-text-muted/70'
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Students get a personal check-in view instead of the admin grid
  if (!isAdmin) {
    return <StudentCheckinView attendance={attendance} currentUser={currentUser} onRefresh={onRefresh} refresh={refresh} />;
  }

  const renderGrid = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Attendance</h3>
        <p className="text-sm text-text-muted mt-1">Mark who's here each day — click a cell to cycle status. Students check in by scanning the QR code above.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gaps-2 sm:gap-3 items-center">
          <button 
            onClick={() => setCalendarStart(Math.max(0, calendarStart - 1))}
            className="px-3 py-2 bg-text-base/5 hover:bg-text-base/10 rounded-lg text-sm font-bold text-text-base/80"
            disabled={calendarStart === 0}
          >
            ← Previous
          </button>
          <span className="text-xs text-text-muted">
            {rangeLabel}
          </span>
          {hasMoreDates && (
            <button 
              onClick={() => setCalendarStart(calendarStart + 1)}
              className="px-3 py-2 bg-text-base/5 hover:bg-text-base/10 rounded-lg text-sm font-bold text-text-base/80"
            >
              Next →
            </button>
          )}
        </div>
        
        <div className="flex gap-2 items-center">
          {savingStatus !== 'idle' && (
            <div className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-text-base/5">
              {savingStatus === 'saving' && <Clock className="w-3 h-3 text-amber-400 animate-spin" />}
              {savingStatus === 'saved' && <Check className="w-3 h-3 text-emerald-400" />}
              <span className="text-text-base/80">{savingStatus === 'saving' ? 'Saving...' : 'Saved'}</span>
            </div>
          )}
          <button 
            onClick={() => setShowHideMenu(!showHideMenu)}
            className="px-3 py-2 bg-text-base/5 hover:bg-text-base/10 rounded-lg text-sm font-bold text-text-base/80 flex items-center gap-2"
            title="Show/hide dates"
          >
            {showHideMenu ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">Manage Dates</span>
          </button>
        </div>
      </div>

      {showHideMenu && (
        <div className="card-surface p-4 space-y-4">
          <h4 className="text-sm font-bold text-text-base">Hide/Show Meeting Dates</h4>
          
          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-muted font-bold mb-2">By Day of Week</p>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {dayNames.map((name, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const isHidden = hiddenDates.some(d => weekdayOf(d) === idx);
                      if (isHidden) {
                        unhideByDayOfWeek(idx);
                      } else {
                        hideByDayOfWeek(idx);
                      }
                    }}
                    className={cn(
                      "py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                      hiddenDates.some(d => weekdayOf(d) === idx)
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                variant="secondary" 
                size="sm"
                onClick={hideAll}
                className="text-xs"
              >
                Hide All
              </Button>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={unhideAll}
                className="text-xs"
              >
                Show All
              </Button>
            </div>

            <div className="text-[10px] text-text-muted/70">
              {hiddenDates.length} dates hidden • Showing {visibleDates.length} dates
            </div>
          </div>
        </div>
      )}

      <div className="card-surface overflow-x-auto custom-scrollbar">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-text-base/5 border-b border-text-base/20">
                <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase sticky left-0 bg-secondary z-10 min-w-[150px] border-r border-text-base/15">Member</th>
                {visibleDates.map(date => (
                  <th key={date} className="px-2 py-3 text-[10px] font-bold text-text-muted uppercase text-center min-w-[40px] group relative border-r border-text-base/10 last:border-r-0">
                    <div className="text-center">
                      {format(parseLocalDate(date), 'MMM dd')}
                      <div className="text-[8px] text-text-muted">{format(parseLocalDate(date), 'EEE')}</div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => hideDate(date)}
                        className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-rose-500/20 text-rose-400 px-2 py-1 rounded whitespace-nowrap"
                        title="Hide this date"
                      >
                        Hide
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-text-base/15">
              {members.map((m: any) => (
                <tr key={m.id} className="hover:bg-text-base/5 transition-colors">
                  <td className="px-4 py-3 text-sm text-text-base font-medium sticky left-0 bg-secondary z-10 border-r border-text-base/15">
                    {m.name}
                  </td>
                  {visibleDates.map(date => {
                    const status = getStatus(m.id, date);
                    return (
                      <td key={date} className="px-1 py-1 text-center border-r border-text-base/10 last:border-r-0">
                        <button
                          onClick={() => toggleStatus(m.id, date)}
                          disabled={!isAdmin}
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all active:scale-90",
                            statusColors[status] || statusColors['-'],
                            !isAdmin && "cursor-default"
                          )}
                        >
                          {status}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="p-4 bg-text-base/5 border-t border-text-base/10 flex flex-wrap gap-4 text-[10px] font-bold uppercase rounded-b-2xl">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500" /> Present (P)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-amber-500" /> Late (L)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-blue-500" /> Excused (E)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-rose-500" /> Unexcused (U)</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-purple-500" /> School Event (S)</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {isAdmin && <QrSessionPanel teamName={activeTeamName || 'Your team'} />}
      <Card title="Attendance Trend" subtitle={hiddenDates.length > 0 ? "Present check-ins · last 14 meeting days" : "Present check-ins · last 14 days"} icon={TrendingUp} className="p-5 gap-3">
        <Suspense fallback={<ChartLoadingFallback />}>
          <AttendanceTrendChart attendance={attendance} hiddenDates={hiddenDates} events={events} className="h-52" />
        </Suspense>
      </Card>
      <div className="flex gap-1 sm:gap-2 p-1 bg-text-base/5 rounded-xl border border-text-base/10 w-full sm:w-fit overflow-x-auto custom-scrollbar">
        <button 
          onClick={() => setActiveSubTab('grid')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'grid' ? "bg-accent text-accent-ink shadow-lg" : "text-text-muted hover:text-text-base")}
        >
          Attendance Grid
        </button>
        <button 
          onClick={() => setActiveSubTab('history')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'history' ? "bg-accent text-accent-ink shadow-lg" : "text-text-muted hover:text-text-base")}
        >
          History
        </button>
        <button 
          onClick={() => setActiveSubTab('summary')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'summary' ? "bg-accent text-accent-ink shadow-lg" : "text-text-muted hover:text-text-base")}
        >
          Insights
        </button>
      </div>

      {activeSubTab === 'grid' && renderGrid()}
      
      {activeSubTab === 'history' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {sessions.length === 0 ? (
            <div className="col-span-full py-20 text-center glass rounded-2xl border border-text-base/5">
              <Calendar className="w-12 h-12 text-text-muted mx-auto mb-4" />
              <p className="text-text-muted">No attendance history found yet.</p>
            </div>
          ) : (
            sessions.map(date => {
              const records = attendance.filter((r: any) => r.date === date);
              const presentCount = records.filter((r: any) => r.status === 'P').length;
              return (
                <button 
                  key={date}
                  onClick={() => {
                    // Navigate to grid or just view info
                  }}
                  className="card-surface p-4 text-left hover:!border-accent/50 transition-all group cursor-default"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-text-base/5 rounded-lg text-accent group-hover:bg-accent group-hover:text-accent-ink transition-colors">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold text-text-muted/70 uppercase">{format(new Date(date), 'EEE')}</span>
                  </div>
                  <p className="font-bold text-text-base mb-1">{format(new Date(date), 'MMM dd, yyyy')}</p>
                  <p className="text-xs text-text-muted">{presentCount} members present</p>
                </button>
              );
            })
          )}
        </div>
      )}

      {activeSubTab === 'summary' && (
        <div className="space-y-6">
          <Card title="Attendance Analysis" icon={Zap}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-text-muted">Leverage AI to identify trends, missing members, and engagement levels.</p>
              <Button onClick={() => updateInsights()} disabled={isAiLoading}>
                <Zap className="w-4 h-4" /> {insights ? "Refresh Analysis" : "Generate Analysis"}
              </Button>
            </div>
            {(isAiLoading || insights) && (
              <div className="p-6 bg-text-base/5 rounded-2xl border border-text-base/10 prose prose-invert max-w-none">
                {isAiLoading && !insights ? <ThinkingIndicator /> : <Markdown>{insights}</Markdown>}
              </div>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-text-base/5 border-b border-text-base/10">
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Member</th>
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Rate</th>
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">P / A / L / E</th>
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">History (Last 5)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-base/5">
                {summary.map((m: any) => {
                  const rate = m.total > 0 ? Math.round((m.present / m.total) * 100) : 0;
                  const last5 = attendance
                    .filter((r: any) => r.member_id === m.member_id)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 5)
                    .reverse();

                  return (
                    <tr key={m.member_id} className="hover:bg-text-base/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-text-base">{m.name}</p>
                        <p className="text-[10px] text-text-muted/70 uppercase">{members.find((mem: any) => mem.id === m.member_id)?.role}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-1.5 bg-text-base/5 rounded-full overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${rate}%` }} />
                          </div>
                          <span className="text-sm font-bold text-text-base">{rate}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <span className="text-xs font-bold text-emerald-400" title="Present">{m.present}P</span>
                          <span className="text-xs font-bold text-rose-400" title="Absent">{m.absent}A</span>
                          <span className="text-xs font-bold text-amber-400" title="Late">{m.late}L</span>
                          <span className="text-xs font-bold text-blue-400" title="Excused">{m.excused}E</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {last5.map((r, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "w-2 h-2 rounded-full",
                                statusColors[r.status] || 'bg-secondary'
                              )}
                              title={`${r.date}: ${r.status}`}
                            />
                          ))}
                          {last5.length === 0 && <span className="text-[10px] text-text-muted">No data</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
      )}
    </div>
  );
}

function CalendarView({ events, setEvents, teams, onRefresh, refresh, currentUser, hasScope }: any) {
  // All Calendar state + handlers are shared with the Modern Calendar page.
  const {
    canManageCalendar, cursor, setCursor, todayKey, byDate, upcoming, isEventFinished,
    showModal, editingId, form, setForm, openNew, openEdit, closeEditor, handleSave, handleDelete, deleteEvent,
    aiOpen, setAiOpen, aiText, setAiText, aiBusy, aiNote, aiProposals, setAiProposals, aiCreating, handleAiParse, handleAiCreateAll,
  } = useCalendarController({ events, setEvents, refresh, currentUser, hasScope });

  // Right-click on a calendar event: edit or delete without opening the card.
  useContextMenu('cal-event', (el) => {
    if (!canManageCalendar) return null;
    const id = Number(el.dataset.cmId);
    const ev = (events || []).find((x: any) => x.id === id);
    if (!ev) return null;
    return [
      { label: 'Edit event', icon: Pencil, action: () => openEdit(ev) },
      { label: 'Add event on this day', icon: Plus, action: () => openNew(ev.date) },
      {
        label: 'Delete event', icon: Trash2, danger: true, action: () => { void deleteEvent(id, ev.title); },
      },
    ];
  });
  // Right-click a day cell (the day number or empty space): add an event on
  // that date. Events nested inside still resolve to the cal-event menu.
  useContextMenu('cal-day', (el) => {
    if (!canManageCalendar) return null;
    const date = el.dataset.cmDate;
    if (!date) return null;
    return [
      { label: `Add event · ${fmtDate(date)}`, icon: Plus, action: () => openNew(date) },
    ];
  });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const typeStyle: Record<string, string> = {
    meeting: 'bg-info/15 text-info border-info/30',
    competition: 'bg-accent/15 text-accent border-accent/30',
    deadline: 'bg-warning/15 text-warning border-warning/30',
    social: 'bg-success/15 text-success border-success/30',
    other: 'bg-text-base/10 text-text-base/80 border-text-base/10',
  };

  const typeLabel: Record<string, string> = {
    meeting: 'Meeting', competition: 'Competition', deadline: 'Deadline', social: 'Social', other: 'Other',
  };

  const fmtDate = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-text-base">Team Calendar</h2>
          <p className="text-sm text-text-muted">Meetings, competitions, and deadlines</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month stepper stays together as one unit so the arrows never
              end up on different rows on narrow screens. */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="secondary" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-text-base font-semibold min-w-[130px] text-center text-sm sm:text-base">{monthLabel}</span>
            <Button variant="secondary" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="Next month"><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <Button variant="secondary" onClick={() => setCursor(new Date())}>Today</Button>
          {canManageCalendar && <Button onClick={() => openNew(todayKey)} className="max-sm:flex-1"><Plus className="w-4 h-4" /> New Event</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2 !p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-text-muted mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={'blank-' + i} />;
              const key = toDateKey(new Date(year, month, day));
              const dayEvents = byDate[key] || [];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  data-cm-type="cal-day"
                  data-cm-date={key}
                  onClick={() => canManageCalendar && openNew(key)}
                  className={cn(
                    'min-h-[92px] rounded-xl border p-1.5 transition-colors',
                    canManageCalendar ? 'cursor-pointer' : 'cursor-default',
                    isToday ? 'border-accent/60 bg-accent/5' : 'border-text-base/5 bg-text-base/[0.02] hover:border-text-base/20'
                  )}
                >
                  <div className={cn(
                    'text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                    isToday ? 'bg-accent text-accent-ink' : 'text-text-base/80'
                  )}>{day}</div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e: any) => (
                      <button
                        key={e.id}
                        data-cm-type="cal-event"
                        data-cm-id={e.id}
                        onClick={(ev) => { ev.stopPropagation(); if (canManageCalendar) openEdit(e); }}
                        className={cn('w-full text-left text-[11px] px-1.5 py-0.5 rounded-md border truncate', canManageCalendar ? 'cursor-pointer' : 'cursor-default', typeStyle[e.event_type] || typeStyle.other, isEventFinished(e) && 'opacity-60')}
                      >
                        <span className={cn(isEventFinished(e) && 'line-through')}>
                          {e.start_time && <span className="opacity-70">{fmtTime(e.start_time)} </span>}{e.title}
                        </span>
                      </button>
                    ))}
                    {dayEvents.length > 3 && <div className="text-[11px] text-text-muted/70 px-1">+{dayEvents.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Upcoming" icon={Clock}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-text-muted/70">No upcoming events. Click a day to add one.</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((e: any) => (
                <button key={e.id} onClick={() => openEdit(e)} className="w-full text-left flex gap-3 p-3 rounded-xl border border-text-base/5 bg-text-base/[0.02] hover:border-text-base/20 transition-colors">
                  <div className={cn('w-1.5 rounded-full', (typeStyle[e.event_type] || typeStyle.other).split(' ')[0].replace('bg-', 'bg-').replace('/15', ''))} style={{ backgroundColor: 'currentColor' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-base truncate">{e.title}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {fmtDate(e.date)}{e.start_time && ` · ${fmtTime(e.start_time)}${e.end_time ? '–' + fmtTime(e.end_time) : ''}`}
                    </div>
                    {e.location && <div className="text-xs text-text-muted/70 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{e.location}</div>}
                  </div>
                  <span className={cn('text-[10px] font-bold uppercase px-2 py-1 rounded-md border h-fit', typeStyle[e.event_type] || typeStyle.other)}>
                    {typeLabel[e.event_type] || 'Other'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-3 pb-[calc(62px+env(safe-area-inset-bottom)+0.75rem)] md:p-4">
          {/* Below md the fixed bottom nav (62px + safe area) paints over this
              overlay, so reserve its height — the sticky Save/Cancel row then
              sits fully above the nav. */}
          <Card title={editingId ? 'Edit Event' : 'New Event'} className="w-full max-w-md max-h-[calc(100dvh-62px-env(safe-area-inset-bottom)-1.5rem)] md:max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
              {!editingId && (
                <div className="rounded-xl border border-accent/20 bg-accent/[0.04] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAiOpen(!aiOpen)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
                  >
                    <Sparkles className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-sm font-bold text-text-base flex-1">AI quick-add</span>
                    <span className="text-[11px] text-text-muted">Describe it, Bruno fills the form</span>
                    {aiOpen ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                  </button>
                  {aiOpen && (
                    <div className="px-4 pb-4 space-y-2.5">
                      <textarea
                        className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base text-sm focus:outline-none focus:border-accent/50 transition-colors h-20"
                        placeholder="e.g. Parent meeting tomorrow at 6pm in Room 101 — or paste several events at once"
                        value={aiText}
                        onChange={(e: any) => setAiText(e.target.value)}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-text-muted">Same Bruno AI, right here in the form.</p>
                        <Button variant="secondary" className="!text-xs !py-1.5" onClick={handleAiParse} disabled={aiBusy || !aiText.trim()}>
                          {aiBusy ? 'Bruno is reading…' : 'Parse with Bruno'}
                        </Button>
                      </div>
                      {aiNote && <p className="text-xs text-text-base/80">{aiNote}</p>}
                      {aiProposals.length > 0 && (
                        <div className="space-y-1.5 max-h-44 overflow-y-auto">
                          {aiProposals.map((e: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-text-base/[0.04] border border-text-base/10 px-3 py-1.5">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-text-base truncate">{e.title}</p>
                                <p className="text-[11px] text-text-muted">{e.date}{e.time ? ` • ${e.time}` : ''}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setAiProposals(aiProposals.filter((_, j) => j !== i))}
                                className="text-text-muted hover:text-rose-400 transition-colors shrink-0"
                                title="Remove"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <Button className="!text-xs w-full" onClick={handleAiCreateAll} disabled={aiCreating || !aiProposals.length}>
                            {aiCreating ? 'Creating…' : `Create all ${aiProposals.length} events`}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <Input placeholder="Event title" value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} />
              <textarea
                className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base focus:outline-none focus:border-accent/50 transition-colors h-20"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e: any) => setForm({ ...form, description: e.target.value })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Date</label>
                  <Input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Location</label>
                  <Input placeholder="Where?" value={form.location} onChange={(e: any) => setForm({ ...form, location: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Start time</label>
                  <Input type="time" value={form.start_time} onChange={(e: any) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">End time</label>
                  <Input type="time" value={form.end_time} onChange={(e: any) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  options={[
                    { label: 'Meeting', value: 'meeting' },
                    { label: 'Competition', value: 'competition' },
                    { label: 'Deadline', value: 'deadline' },
                    { label: 'Social', value: 'social' },
                    { label: 'Other', value: 'other' },
                  ]}
                  value={form.event_type}
                  onChange={(e: any) => setForm({ ...form, event_type: e.target.value })}
                />
                <Select
                  options={[
                    { label: 'All teams', value: '' },
                    ...teams.map((t: any) => ({ label: `${t.name} #${t.number}`, value: String(t.id) })),
                  ]}
                  value={form.team_id}
                  onChange={(e: any) => setForm({ ...form, team_id: e.target.value })}
                />
              </div>
              <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-elevated border-t border-text-base/10 flex gap-3 justify-between">
                <div>
                  {editingId && <Button variant="danger" onClick={handleDelete}><Trash2 className="w-4 h-4" /> Delete</Button>}
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={closeEditor}>Cancel</Button>
                  <Button onClick={handleSave}>{editingId ? 'Save' : 'Create Event'}</Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
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

function BudgetView({ budget, setBudget, teams, onRefresh, refresh, hasScope, currentUser }: any) {
  const {
    isAdmin, showAdd, editingId, newItem, setNewItem, busy,
    openNewEntry, openEditEntry, closeEntryModal, handleAdd, handleDelete, totalIncome, totalExpense,
  } = useBudgetController({ budget, setBudget, teams, refresh, hasScope, currentUser });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Budget</h3>
        <p className="text-sm text-text-muted mt-1">Team money at a glance — income, expenses, and every transaction. Everyone can view; only members with the budget permission (via their role) can add or edit entries.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <p className="text-xs text-emerald-400 uppercase font-bold">Total Income</p>
          <p className="text-3xl font-display font-bold text-text-base">${totalIncome.toLocaleString()}</p>
        </Card>
        <Card className="bg-rose-500/10 border-rose-500/20">
          <p className="text-xs text-rose-400 uppercase font-bold">Total Expenses</p>
          <p className="text-3xl font-display font-bold text-text-base">${totalExpense.toLocaleString()}</p>
        </Card>
        <Card className="bg-accent/10 border-accent/20">
          <p className="text-xs text-accent uppercase font-bold">Net Balance</p>
          <p className="text-3xl font-display font-bold text-text-base">${(totalIncome - totalExpense).toLocaleString()}</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Transaction History</h3>
          <p className="text-sm text-text-muted mt-1">A line-by-line record of money in and out.</p>
        </div>
        {isAdmin && <Button onClick={openNewEntry} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log Transaction</Button>}
      </div>

      {/* Mobile: stacked cards — same swipe-trap reason as members/roles. */}
      <div className="md:hidden space-y-3">
        {budget.map((item: any) => (
          <div key={item.id} data-cm-type="budget-tx" data-cm-id={item.id} className="card-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-text-base font-semibold leading-snug">{item.description}</p>
                <p className="text-xs text-text-muted mt-1">{item.category} · {item.date}</p>
              </div>
              <span className={cn("text-sm font-bold shrink-0", item.type === 'income' ? 'text-emerald-400' : 'text-rose-400')}>
                {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString()}
              </span>
            </div>
            {isAdmin && (
              <div className="flex gap-1 mt-1.5">
                <button onClick={() => openEditEntry(item)} title="Edit transaction" aria-label="Edit transaction" className="text-text-muted hover:text-accent transition-colors p-2.5 -ml-2.5">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(item.id)} title="Delete transaction" aria-label="Delete transaction" className="text-text-muted hover:text-rose-400 transition-colors p-2.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
        {!budget.length && (
          <p className="text-xs text-text-muted/60 text-center py-6">No transactions yet</p>
        )}
      </div>
      <div className="hidden md:block card-surface overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-text-base/5 border-b border-text-base/10">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Date</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Description</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Amount</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-text-base/5">
            {budget.map((item: any) => (
              <tr key={item.id} className="hover:bg-text-base/5 transition-colors" data-cm-type="budget-tx" data-cm-id={item.id}>
                <td className="px-6 py-4 text-sm text-text-muted">{item.date}</td>
                <td className="px-6 py-4 text-sm text-text-base font-medium">{item.description}</td>
                <td className="px-6 py-4 text-sm text-text-muted">{item.category}</td>
                <td className={cn(
                  "px-6 py-4 text-sm font-bold",
                  item.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                )}>
                  {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1">
                      <button onClick={() => openEditEntry(item)} title="Edit transaction" aria-label="Edit transaction" className="text-text-muted hover:text-accent transition-colors p-1">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} title="Delete transaction" aria-label="Delete transaction" className="text-text-muted hover:text-rose-400 transition-colors p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={editingId ? 'Edit Transaction' : 'Log Transaction'} className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant={newItem.type === 'income' ? 'primary' : 'secondary'} 
                  className="flex-1"
                  onClick={() => setNewItem({...newItem, type: 'income'})}
                >Income</Button>
                <Button 
                  variant={newItem.type === 'expense' ? 'primary' : 'secondary'} 
                  className="flex-1"
                  onClick={() => setNewItem({...newItem, type: 'expense'})}
                >Expense</Button>
              </div>
              <Select 
                options={[
                  { label: 'Select Team', value: '' },
                  ...teams.map(t => ({ label: `${t.name} #${t.number}`, value: t.id }))
                ]} 
                value={newItem.team_id}
                onChange={(e: any) => setNewItem({...newItem, team_id: e.target.value})}
              />
              <Input placeholder="Amount" type="number" value={newItem.amount} onChange={(e: any) => setNewItem({...newItem, amount: e.target.value})} />
              <Input placeholder="Category (e.g. Parts, Registration)" value={newItem.category} onChange={(e: any) => setNewItem({...newItem, category: e.target.value})} />
              <Input placeholder="Description" value={newItem.description} onChange={(e: any) => setNewItem({...newItem, description: e.target.value})} />
              <Input type="date" value={newItem.date} onChange={(e: any) => setNewItem({...newItem, date: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeEntryModal}>Cancel</Button>
                <Button onClick={handleAdd} disabled={busy}>{busy ? 'Saving…' : (editingId ? 'Save Changes' : 'Log Entry')}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function InventoryView({ inventory, setInventory, members, teams, onRefresh, refresh, currentUser, hasScope }: any) {
  const {
    canManage, showAdd, setShowAdd, openAdd, showEdit, setShowEdit, newPart, setNewPart,
    searchTerm, setSearchTerm, filterCategory, setFilterCategory, revLink, setRevLink, isLoadingRev,
    invoiceParsing, invoiceConfirming, autoCategorizing, invoiceItems, showInvoicePreview, setShowInvoicePreview, invoiceFileRef,
    busy, handleAdd, handleUpdate, handleDelete, handleImportRev, handleInvoiceFile, updateInvoiceItem,
    handleInvoiceConfirm, handleAutoCategorize, categories, filteredParts, totalValue,
  } = useInventoryController({ inventory, setInventory, teams, refresh, currentUser, hasScope });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Card className="bg-accent/10 border-accent/20">
          <p className="text-xs text-accent uppercase font-bold">Total Parts</p>
          <p className="text-3xl font-display font-bold text-text-base">{inventory.length}</p>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <p className="text-xs text-blue-400 uppercase font-bold">Inventory Value</p>
          <p className="text-3xl font-display font-bold text-text-base">${totalValue.toLocaleString(undefined, {maximumFractionDigits: 2})}</p>
        </Card>
      </div>

      <Card title="Parts Management" subtitle="Every part, tool, and material the team owns — search, add, and keep stock counts current">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input 
              placeholder="Search by name, SKU, or part number..." 
              value={searchTerm}
              onChange={(e: any) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select 
              options={[
                { label: 'All Categories', value: '' },
                ...categories.map(c => ({ label: c, value: c }))
              ]}
              value={filterCategory}
              onChange={(e: any) => setFilterCategory(e.target.value)}
              className="sm:w-48"
            />
            {canManage && (
              <Button onClick={openAdd} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Part</Button>
            )}
            {canManage && (
              <Button onClick={() => invoiceFileRef.current?.click()} variant="secondary" className="w-full sm:w-auto" disabled={!!invoiceParsing}>
                <FileUp className="w-4 h-4" /> {invoiceParsing || 'Import Invoice'}
              </Button>
            )}
            {canManage && inventory.some((p: any) => !p.category) && (
              <Button onClick={handleAutoCategorize} variant="secondary" className="w-full sm:w-auto" disabled={autoCategorizing}>
                <Tags className="w-4 h-4" /> {autoCategorizing ? 'Categorizing...' : 'Auto-categorize'}
              </Button>
            )}
            <input ref={invoiceFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple className="hidden" onChange={handleInvoiceFile} />
          </div>

          <div className="glass rounded-2xl overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-text-base/5 border-b border-text-base/10 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Name</th>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">SKU</th>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Part #</th>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Qty</th>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Category</th>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Cost</th>
                  {canManage && <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-text-base/5">
                {filteredParts.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-text-muted/70">No parts found</td>
                  </tr>
                ) : (
                  filteredParts.map((part: any) => (
                    <tr key={part.id} className="hover:bg-text-base/5 transition-colors" data-cm-type="inventory-part" data-cm-id={part.id}>
                      <td className="px-4 py-3 text-sm text-text-base font-medium">{part.name}</td>
                      <td className="px-4 py-3 text-sm text-accent font-mono">{part.sku}</td>
                      <td className="px-4 py-3 text-sm text-text-muted">{part.part_number || '—'}</td>
                      <td className="px-4 py-3 text-sm text-text-base"><span className="bg-text-base/10 px-2 py-1 rounded">{part.quantity}</span></td>
                      <td className="px-4 py-3 text-sm text-text-muted">{part.category || '—'}</td>
                      <td className="px-4 py-3 text-sm text-blue-400">${(part.cost * part.quantity).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right flex gap-2 justify-end">
                          <button onClick={() => setShowEdit(part)} className="text-text-muted hover:text-accent transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(part.id)} className="text-text-muted hover:text-rose-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <Card title="Add New Part" className="w-full max-w-2xl my-8">
            <div className="space-y-4">
              <div className="space-y-2 pb-4 border-b border-text-base/10">
                <p className="text-xs font-bold text-text-muted uppercase">Import from REV Robotics</p>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Paste REV Robotics product link (e.g., https://www.revrobotics.com/rev-31-1596/)" 
                    value={revLink}
                    onChange={(e: any) => setRevLink(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleImportRev} 
                    variant="secondary"
                    disabled={isLoadingRev || !revLink.trim()}
                  >
                    {isLoadingRev ? 'Loading...' : 'Import'}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input placeholder="Part Name *" value={newPart.name} onChange={(e: any) => setNewPart({...newPart, name: e.target.value})} />
                <Input placeholder="SKU (Unique) *" value={newPart.sku} onChange={(e: any) => setNewPart({...newPart, sku: e.target.value})} />
                <Input placeholder="Part Number" value={newPart.part_number} onChange={(e: any) => setNewPart({...newPart, part_number: e.target.value})} />
                <Input placeholder="Quantity" type="number" value={newPart.quantity} onChange={(e: any) => setNewPart({...newPart, quantity: e.target.value})} />
                <Select 
                  options={[
                    { label: 'Select Team', value: '' },
                    ...teams.map((t: any) => ({ label: `${t.name} #${t.number}`, value: t.id }))
                  ]}
                  value={newPart.team_id}
                  onChange={(e: any) => setNewPart({...newPart, team_id: e.target.value})}
                />
                <Input placeholder="Location" value={newPart.location} onChange={(e: any) => setNewPart({...newPart, location: e.target.value})} />
                <Select
                  options={INVENTORY_CATEGORIES.map((c: string) => ({ label: c, value: c }))}
                  value={newPart.category || 'Other'}
                  onChange={(e: any) => setNewPart({...newPart, category: e.target.value})}
                />
                <Input placeholder="Cost per Unit" type="number" step="0.01" value={newPart.cost} onChange={(e: any) => setNewPart({...newPart, cost: e.target.value})} />
              </div>
              <Input placeholder="Description" value={newPart.description} onChange={(e: any) => setNewPart({...newPart, description: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={busy}>{busy ? 'Adding…' : 'Add Part'}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showInvoicePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <Card title="Import order invoice" className="w-full max-w-3xl my-8">
            <div className="space-y-4">
              <p className="text-sm text-text-muted leading-relaxed">
                Review the items read from your invoice{invoiceItems.length > 1 ? 's' : ''}. The AI assigned a category
                to each item — adjust anything wrong, uncheck what you don't want, then import.
                Items already in inventory get restocked.
              </p>
              <div className="glass rounded-2xl overflow-x-auto custom-scrollbar max-h-96">
                <table className="w-full text-left text-sm">
                  <thead className="bg-text-base/5 border-b border-text-base/10 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 w-10"></th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase">Item</th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase">SKU</th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase w-24">Qty</th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase w-28">Unit $</th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase w-36">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-text-base/5">
                    {invoiceItems.map((it: any, i: number) => (
                      <tr key={i} className={it.selected ? '' : 'opacity-40'}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!it.selected}
                            onChange={(e: any) => updateInvoiceItem(i, { selected: e.target.checked })}
                            className="w-4 h-4 accent-[#FFC700]"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input value={it.name} onChange={(e: any) => updateInvoiceItem(i, { name: e.target.value })} className="!py-1.5 text-sm" />
                        </td>
                        <td className="px-3 py-2 text-xs text-accent font-mono whitespace-nowrap">{it.sku}</td>
                        <td className="px-3 py-2">
                          <Input type="number" min="0" value={it.quantity} onChange={(e: any) => updateInvoiceItem(i, { quantity: e.target.value })} className="!py-1.5 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e: any) => updateInvoiceItem(i, { unitPrice: e.target.value })} className="!py-1.5 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            options={INVENTORY_CATEGORIES.map((c: string) => ({ label: c, value: c }))}
                            value={it.category || 'Other'}
                            onChange={(e: any) => updateInvoiceItem(i, { category: e.target.value })}
                            className="!py-1.5 text-sm"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowInvoicePreview(false)} disabled={invoiceConfirming}>Cancel</Button>
                <Button onClick={handleInvoiceConfirm} disabled={invoiceConfirming}>
                  {invoiceConfirming ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
                  ) : (
                    <>Import {invoiceItems.filter((it: any) => it.selected).length} items</>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <Card title="Edit Part" className="w-full max-w-2xl my-8">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input placeholder="Part Name" value={showEdit.name} onChange={(e: any) => setShowEdit({...showEdit, name: e.target.value})} />
                <Input placeholder="SKU" value={showEdit.sku} onChange={(e: any) => setShowEdit({...showEdit, sku: e.target.value})} />
                <Input placeholder="Part Number" value={showEdit.part_number || ''} onChange={(e: any) => setShowEdit({...showEdit, part_number: e.target.value})} />
                <Input placeholder="Quantity" type="number" value={showEdit.quantity} onChange={(e: any) => setShowEdit({...showEdit, quantity: e.target.value})} />
                <Select 
                  options={[
                    { label: 'Select Team', value: '' },
                    ...teams.map((t: any) => ({ label: `${t.name} #${t.number}`, value: t.id }))
                  ]}
                  value={showEdit.team_id || ''}
                  onChange={(e: any) => setShowEdit({...showEdit, team_id: e.target.value})}
                />
                <Input placeholder="Location" value={showEdit.location || ''} onChange={(e: any) => setShowEdit({...showEdit, location: e.target.value})} />
                <Select
                  options={INVENTORY_CATEGORIES.map((c: string) => ({ label: c, value: c }))}
                  value={showEdit.category || 'Other'}
                  onChange={(e: any) => setShowEdit({...showEdit, category: e.target.value})}
                />
                <Input placeholder="Cost per Unit" type="number" step="0.01" value={showEdit.cost} onChange={(e: any) => setShowEdit({...showEdit, cost: e.target.value})} />
              </div>
              <Input placeholder="Description" value={showEdit.description || ''} onChange={(e: any) => setShowEdit({...showEdit, description: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowEdit(null)}>Cancel</Button>
                <Button onClick={handleUpdate} disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}


// Rich YouTube channel analytics, analyzer-style: stat tiles, channel meta
// (handle, country, join date), and an expandable description. Data comes
// from the YouTube Data API via social_profiles (populated on link + sync).
function YouTubeChannelDetails({ p }: { p: any }) {
  const [expanded, setExpanded] = useState(false);
  const videos = Number(p.latest?.posts) || 0;
  const views = Number(p.latest?.views) || 0;
  const avgViews = videos > 0 ? Math.round(views / videos) : 0;
  const joined = (() => {
    if (!p.published_at) return null;
    const d = new Date(p.published_at);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  })();
  const channelUrl = p.custom_url
    ? `https://www.youtube.com/${String(p.custom_url).replace(/^@/, '@')}`
    : p.external_id ? `https://www.youtube.com/channel/${p.external_id}` : null;
  const tiles = [
    { label: 'Total views', value: fmtCompact(views) },
    { label: 'Videos', value: fmtCompact(videos) },
    { label: 'Avg views / video', value: fmtCompact(avgViews) },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(t => (
          <div key={t.label} className="rounded-lg bg-text-base/[0.03] border border-text-base/5 px-2 py-1.5">
            <p className="text-sm font-bold text-text-base leading-tight">{t.value}</p>
            <p className="text-[9px] text-text-muted uppercase font-bold leading-tight mt-0.5">{t.label}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
        {p.custom_url && <span className="text-text-base/70 font-semibold">{p.custom_url}</span>}
        {p.country && <span>{p.country}</span>}
        {joined && <span>Joined {joined}</span>}
        {channelUrl && (
          <a href={channelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            <ExternalLink className="w-3 h-3" /> Open channel
          </a>
        )}
      </div>
      {p.description && (
        <div>
          <p className={`text-[11px] text-text-muted whitespace-pre-line ${expanded ? '' : 'line-clamp-2'}`}>{p.description}</p>
          <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-accent hover:underline mt-0.5">
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  );
}

function fmtCompact(n: any) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v * 100) / 100);
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

function OutreachField({ label, children }: any) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const PLATFORM_META: Record<string, { label: string; Icon: any; color: string; metric: string }> = {
  tiktok: { label: 'TikTok', Icon: Music2, color: '#22d3ee', metric: 'Followers' },
  youtube: { label: 'YouTube', Icon: Youtube, color: '#f87171', metric: 'Subscribers' },
};

function Sparkline({ points }: any) {
  const vals = (points || []).filter((v: any) => typeof v === 'number' && isFinite(v));
  if (vals.length < 2) return <p className="text-[11px] text-text-muted">Sync history will chart here</p>;
  const w = 120, h = 36, pad = 4;
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const pts = vals.map((v: number, i: number) => {
    const x = pad + (i * (w - 2 * pad)) / (vals.length - 1);
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? '#4ade80' : '#fb7185'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function timeAgoSocial(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function OutreachView({ outreach, setOutreach, socialProfiles, setSocialProfiles, youtubeEnabled, tiktokEnabled, currentUser, onRefresh, refresh, hasScope }: any) {
  // Log, social and bulk-log state + handlers are shared with the Modern Outreach page.
  const {
    isAdminSocial, profiles, showLinkYT, setShowLinkYT, ytInput, setYtInput, linkingYT, syncingId,
    handleLinkYouTube, handleUnlinkProfile, handlePinProfile, handleMoveProfile, handleSyncNow,
    showForm, editingId, form, setForm, set, saving, openAdd, openEdit, closeForm, handleSubmit, handleDelete, totals,
    bulkOpen, setBulkOpen, bulkText, setBulkText, bulkRows, removeBulkRow, bulkBusy, bulkSaving, bulkNote,
    handleBulkParse, handleBulkAiParse, handleBulkLogAll,
  } = useOutreachController({ outreach, setOutreach, socialProfiles, setSocialProfiles, currentUser, onRefresh, refresh, hasScope });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Outreach Log</h3>
          <p className="text-sm text-text-muted mt-1">Track community events and service hours.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="secondary" onClick={() => setBulkOpen(!bulkOpen)} className="w-full sm:w-auto"><ClipboardPaste className="w-4 h-4" /> Bruno AI</Button>
          <Button onClick={openAdd} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log Event</Button>
        </div>
      </div>

      {bulkOpen && (
        <Card title="Bruno AI" subtitle="Paste rows or describe events in plain words — Bruno turns them into log entries in one go" icon={ClipboardPaste}>
          <div className="space-y-3">
            <textarea
              className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base text-sm focus:outline-none focus:border-accent/50 transition-colors h-28"
              placeholder={"Paste rows like:\nRobotics demo | 2026-09-12 | 2 | Community center | 40 attendees\nSTEM workshop | Sep 18 | 3h | Local high school | $250 raised\n\n…or paste straight from a spreadsheet — tabs work too."}
              value={bulkText}
              onChange={(e: any) => setBulkText(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="!text-xs" onClick={handleBulkParse} disabled={!bulkText.trim()}>Quick parse</Button>
              <Button variant="secondary" className="!text-xs" onClick={handleBulkAiParse} disabled={bulkBusy || !bulkText.trim()}>
                <Sparkles className="w-3.5 h-3.5" /> {bulkBusy ? 'Bruno is reading…' : 'Parse with Bruno'}
              </Button>
              {bulkNote && <p className="text-xs text-text-base/70 w-full">{bulkNote}</p>}
            </div>
            {bulkRows.length > 0 && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {bulkRows.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-text-base/[0.04] border border-text-base/10 px-3 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-base truncate">{r.title}</p>
                      <p className="text-[11px] text-text-muted">
                        {r.date}{r.hours !== '' ? ` • ${r.hours}h` : ''}{r.location ? ` • ${r.location}` : ''}{r.attendees !== '' ? ` • ${r.attendees} attendees` : ''}{r.funds_raised !== '' ? ` • $${r.funds_raised}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBulkRow(i)}
                      className="text-text-muted hover:text-rose-400 transition-colors shrink-0"
                      title="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <Button className="!text-xs w-full" onClick={handleBulkLogAll} disabled={bulkSaving || !bulkRows.length}>
                  {bulkSaving ? 'Logging…' : `Log all ${bulkRows.length} events`}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: 'Events', value: String(totals.events), Icon: Flag },
          { label: 'Hours', value: `${totals.hours}h`, Icon: Clock },
          { label: 'Attendees', value: fmtCompact(totals.attendees), Icon: User },
          { label: 'Funds raised', value: `$${fmtCompact(totals.funds)}`, Icon: Wallet },
        ].map(({ label, value, Icon }: any) => (
          <div key={label} className="card-surface rounded-2xl p-4 flex items-center gap-3">
            <div className="rounded-xl bg-accent/12 p-2">
              <Icon className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-xl font-display font-bold text-text-base leading-none">{value}</p>
              <p className="text-[10px] text-text-muted uppercase font-bold mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Social media — auto-synced */}
      <Card title="Social Media" subtitle="Connect YouTube — stats sync automatically every day" icon={TrendingUp}>
        {profiles.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-text-muted">No social profiles linked yet.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {isAdminSocial && youtubeEnabled && (
                <Button variant="secondary" onClick={() => setShowLinkYT(true)}><Youtube className="w-4 h-4" /> Link YouTube channel</Button>
              )}
            </div>
            {isAdminSocial && !youtubeEnabled && (
              <p className="text-xs text-text-muted">Social auto-sync isn't configured on the server yet.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {profiles.map((p: any) => {
              const meta = PLATFORM_META[p.platform] || { label: p.platform || 'Unknown', Icon: Globe, color: '#a1a1aa', metric: 'Followers' };
              const PIcon = meta.Icon;
              const g = p.growth;
              return (
                <div key={p.id} className="rounded-xl border border-text-base/10 bg-elevated p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      {p.avatar_url ? (
                        <img src={assetUrl(p.avatar_url)} alt="" className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <div className="rounded-lg p-2" style={{ backgroundColor: meta.color + '22' }}>
                          <PIcon className="w-4 h-4" style={{ color: meta.color }} />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-text-base">{p.display_name || p.handle}</p>
                        <p className="text-[11px] text-text-muted">{meta.label}{p.handle ? ` • ${p.handle}` : ''}</p>
                      </div>
                    </div>
                    {isAdminSocial && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handlePinProfile(p.id, !!p.is_pinned)} className={`${p.is_pinned ? 'text-volt' : 'text-text-muted'} hover:text-volt transition-colors`} title={p.is_pinned ? 'Unpin from top' : 'Pin to top'}>
                          <Pin className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleMoveProfile(p.id, -1)} className="text-text-muted hover:text-text-base transition-colors" title="Move up">
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleMoveProfile(p.id, 1)} className="text-text-muted hover:text-text-base transition-colors" title="Move down">
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleUnlinkProfile(p.id)} className="text-text-muted hover:text-rose-400 transition-colors" title="Unlink profile">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-2">
                        <div>
                          <p className="text-2xl font-display font-bold text-text-base">{fmtCompact(p.latest?.followers)}</p>
                          <p className="text-[10px] text-text-muted uppercase font-bold">{meta.metric}</p>
                          {g && (
                            <p className={`text-xs font-semibold mt-1 ${g.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {g.delta >= 0 ? '+' : ''}{fmtCompact(g.delta)} ({g.delta >= 0 ? '+' : ''}{g.pct}%)
                            </p>
                          )}
                        </div>
                        <Sparkline points={p.history} />
                      </div>
                      {(p.latest?.likes != null || p.latest?.posts != null || p.latest?.views != null) && (
                        p.platform === 'youtube'
                          ? <YouTubeChannelDetails p={p} />
                          : (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                          {p.platform === 'tiktok' && p.latest?.likes != null && <span><b className="text-text-base/80">{fmtCompact(p.latest.likes)}</b> likes</span>}
                          {p.latest?.posts != null && <span><b className="text-text-base/80">{fmtCompact(p.latest.posts)}</b> {p.platform === 'youtube' ? 'videos' : 'posts'}</span>}
                          {p.platform === 'youtube' && p.latest?.views != null && <span><b className="text-text-base/80">{fmtCompact(p.latest.views)}</b> views</span>}
                        </div>
                          )
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-text-muted">{p.last_synced_at ? `Synced ${timeAgoSocial(p.last_synced_at)}` : 'Not synced yet'}</p>
                        {isAdminSocial && (
                          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => handleSyncNow(p.id)} disabled={syncingId === p.id}>
                            {syncingId === p.id ? 'Syncing…' : 'Sync now'}
                          </Button>
                        )}
                      </div>
                    </div>
                </div>
              );
            })}
          </div>
        )}
        {showLinkYT && (
          <div className="rounded-xl border border-text-base/10 bg-elevated p-4 space-y-3 mt-4">
            <OutreachField label="YouTube channel">
              <Input placeholder="@handle, channel URL, channel ID, or analyzer link" value={ytInput} onChange={(e: any) => setYtInput(e.target.value)} />
            </OutreachField>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setShowLinkYT(false)}>Cancel</Button>
              <Button onClick={handleLinkYouTube} disabled={linkingYT}>{linkingYT ? 'Linking…' : 'Link channel'}</Button>
            </div>
          </div>
        )}
        {profiles.length > 0 && isAdminSocial && (
          <div className="flex flex-wrap gap-2 mt-4">
            {youtubeEnabled && (
              <Button variant="secondary" onClick={() => setShowLinkYT(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Link YouTube</Button>
            )}
          </div>
        )}
      </Card>

      {/* Event cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {(outreach || []).map((event: any) => (
          <Card key={event.id} title={event.title} icon={Globe} data-cm-type="outreach" data-cm-id={event.id}>
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <p className="text-xs text-text-muted">{event.location} • {event.date}</p>
                <p className="text-sm text-text-base/80 mt-2">{event.description}</p>
                {(event.attendees > 0 || event.funds_raised > 0) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-text-muted">
                    {event.attendees > 0 && <span><b className="text-text-base/80">{event.attendees}</b> attendees</span>}
                    {event.funds_raised > 0 && <span><b className="text-text-base/80">${fmtCompact(event.funds_raised)}</b> raised</span>}
                  </div>
                )}
              </div>
              <div className="text-right flex flex-col items-end gap-2 shrink-0">
                <p className="text-2xl font-display font-bold text-accent">{event.hours}h</p>
                <p className="text-[10px] text-text-muted uppercase font-bold">Logged</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => openEdit(event)} className="text-text-muted hover:text-accent transition-colors" title="Edit event">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(event.id)} className="text-text-muted hover:text-rose-400 transition-colors" title="Delete event">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {(outreach || []).length === 0 && (
        <Card>
          <p className="text-sm text-text-muted text-center py-4">No outreach events yet — log your first one above, or ask Bruno to add them from chat.</p>
        </Card>
      )}

      {/* Improved add/edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={closeForm}>
          <Card title={editingId ? 'Edit Outreach Event' : 'Log Outreach Event'} subtitle={editingId ? 'Update the details below' : 'Pick a quick type or fill in the details'} className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div onClick={(e: any) => e.stopPropagation()} className="space-y-4">
              {!editingId && (
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Quick type</span>
                  <div className="flex flex-wrap gap-2">
                    {OUTREACH_PRESETS.map((preset: string) => (
                      <button
                        key={preset}
                        onClick={() => setForm({ ...form, title: preset })}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                          form.title === preset
                            ? 'border-accent text-accent bg-accent/10'
                            : 'border-text-base/10 text-text-muted hover:text-text-base hover:border-text-base/25'
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <OutreachField label="Event title *">
                <Input placeholder="e.g. Library STEM Demo" value={form.title} onChange={set('title')} autoFocus />
              </OutreachField>
              <OutreachField label="Description">
                <textarea
                  className="w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all h-20"
                  placeholder="What did the team do?"
                  value={form.description}
                  onChange={set('description')}
                />
              </OutreachField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <OutreachField label="Date *">
                  <Input type="date" value={form.date} onChange={set('date')} />
                </OutreachField>
                <OutreachField label="Location">
                  <Input placeholder="Where?" value={form.location} onChange={set('location')} />
                </OutreachField>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <OutreachField label="Hours">
                  <Input type="number" min="0" placeholder="2" value={form.hours} onChange={set('hours')} />
                </OutreachField>
                <OutreachField label="Attendees">
                  <Input type="number" min="0" placeholder="0" value={form.attendees} onChange={set('attendees')} />
                </OutreachField>
                <OutreachField label="Funds raised ($)">
                  <Input type="number" min="0" step="0.01" placeholder="0" value={form.funds_raised} onChange={set('funds_raised')} />
                </OutreachField>
              </div>
              <p className="text-[11px] text-text-muted">Tip: you can also ask Bruno in chat to log one or many events — e.g. "log our last three demos".</p>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={closeForm}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Log Event')}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}


const SCOUT_FILTERS = ['All', 'Game Updates', 'Parts & Suppliers', 'Community', 'Competitions', 'Videos'];



function CommunicationView({ communications, setCommunications, onRefresh, refresh, hasScope }: any) {
  // Log state + handlers are shared with the Modern Communication page.
  const {
    canManage, showAdd, setShowAdd, showImport, setShowImport, showQuickAdd, setShowQuickAdd, newComm, setNewComm, expandedId, setExpandedId, replyingTo, setReplyingTo, replyForm, setReplyForm, askResponded, setAskResponded, editingEntry, setEditingEntry, editForm, setEditForm, threads, handleAdd, handleReply, openReply, openEdit, handleEdit, handleDelete,
  } = useCommunicationController({ communications, setCommunications, refresh, hasScope });
  const editDialogRef = useRef<HTMLDivElement>(null);
  const editTriggerRef = useRef<HTMLElement | null>(null);

  // Focus management for the edit dialog: move focus in on open, trap Tab
  // inside while open, restore focus to the trigger on close.
  useEffect(() => {
    if (!editingEntry) return;
    editTriggerRef.current = document.activeElement as HTMLElement | null;
    const node = editDialogRef.current;
    if (!node) return;
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((el) => el.offsetParent !== null);
    const first = focusables()[0];
    if (first) first.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditingEntry(null); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (editTriggerRef.current && document.contains(editTriggerRef.current)) {
        editTriggerRef.current.focus();
      }
    };
  }, [editingEntry]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Communication Log</h3>
          <p className="text-sm text-text-muted mt-1">A shared record of emails and messages sent on the team's behalf.</p>
        </div>
        {canManage && (
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="secondary" onClick={() => setShowQuickAdd(true)} className="flex-1 sm:flex-none">
              <Sparkles className="w-4 h-4" /> Bruno quick add
            </Button>
            <Button variant="secondary" onClick={() => setShowImport(true)} className="flex-1 sm:flex-none">
              <Mail className="w-4 h-4" /> Import email
            </Button>
            <Button onClick={() => setShowAdd(true)} className="flex-1 sm:flex-none"><Plus className="w-4 h-4" /> Log New Message</Button>
          </div>
        )}
      </div>

      {showImport && (
        <EmailImportModal
          onClose={() => setShowImport(false)}
          onLogged={() => { setShowImport(false); refresh.communications(); }}
        />
      )}

      {showQuickAdd && (
        <BrunoQuickAdd
          threads={threads.map((t: any) => ({ id: t.root.id, subject: t.root.subject, recipient: t.root.recipient, date: t.root.date }))}
          onClose={() => setShowQuickAdd(false)}
          onLogged={() => { setShowQuickAdd(false); refresh.communications(); }}
        />
      )}

      <div className="space-y-3 sm:space-y-4">
        {threads.map((thread: any) => {
          const { root, replies, all, count } = thread;
          const expanded = expandedId === root.id;
          const latest = all[all.length - 1];
          return (
            <Card key={root.id} className="relative overflow-hidden" data-cm-type="comm" data-cm-id={root.id}>
              <div className={cn(
                "absolute top-0 left-0 w-1 h-full",
                root.type === 'email' ? 'bg-blue-500' : 'bg-accent'
              )} />
              <button
                className="w-full text-left"
                onClick={() => setExpandedId(expanded ? null : root.id)}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                        root.type === 'email' ? 'bg-blue-500/20 text-blue-400' : 'bg-accent/20 text-accent'
                      )}>{root.type}</span>
                      {count > 1 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-text-base/10 text-text-muted">
                          {count} messages
                        </span>
                      )}
                      <p className="text-xs text-text-muted">{latest.date}</p>
                    </div>
                    <h4 className="text-text-base font-bold text-lg truncate">{root.subject}</h4>
                    <p className="text-sm text-text-muted mb-1">To: {root.recipient}</p>
                    <p className="text-sm text-text-base/60 line-clamp-2">{latest.body}</p>
                  </div>
                  <ChevronDown className={cn("w-5 h-5 text-text-muted shrink-0 transition-transform mt-1", expanded && "rotate-180")} />
                </div>
              </button>

              {expanded && (
                <div className="mt-4 pt-4 border-t border-text-base/10">
                  <div className="relative pl-5 space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-text-base/15">
                    {all.map((entry: any) => {
                      const inbound = entry.direction === 'inbound';
                      return (
                        <div key={entry.id} className="relative">
                          <div className={cn(
                            "absolute -left-5 top-1.5 w-[15px] h-[15px] rounded-full border-2",
                            inbound ? "bg-blue-500 border-blue-500/40" : "bg-accent border-accent/40"
                          )} />
                          <div className={cn(
                            "rounded-xl px-4 py-3 border",
                            inbound ? "bg-blue-500/[0.07] border-blue-500/20" : "bg-text-base/[0.03] border-text-base/10"
                          )}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className={cn(
                                "text-[11px] font-bold uppercase tracking-wide",
                                inbound ? "text-blue-400" : "text-accent"
                              )}>
                                {inbound ? `Reply from ${root.recipient}` : "You / Team"}
                              </span>
                              <span className="text-[11px] text-text-muted">{entry.date}</span>
                            </div>
                            <p className="text-sm text-text-base/85 whitespace-pre-wrap">{entry.body}</p>
                            {canManage && (
                              <div className="mt-2 flex gap-3">
                                <button
                                  onClick={() => openEdit(entry)}
                                  className="text-[11px] text-text-muted hover:text-accent transition-colors"
                                >
                                  Edit
                                </button>
                                {entry.parent_id != null && (
                                  <button
                                    onClick={() => handleDelete(entry.id, false)}
                                    className="text-[11px] text-text-muted hover:text-rose-400 transition-colors"
                                  >
                                    Delete reply
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {canManage && (
                    <div className="flex gap-2 mt-4">
                      <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={() => openReply(thread, 'inbound')}>
                        <Reply className="w-3.5 h-3.5" /> They replied
                      </Button>
                      <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={() => openReply(thread, 'outbound')}>
                        <MessageSquare className="w-3.5 h-3.5" /> We followed up
                      </Button>
                      <button onClick={() => handleDelete(root.id, true)} className="ml-auto text-text-muted hover:text-rose-400 transition-colors" title="Delete thread">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEdit(root)} className="text-text-muted hover:text-accent transition-colors" title="Edit thread">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        {threads.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-text-muted text-sm">No communications logged yet.</p>
          </Card>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Communication" className="w-full max-w-lg">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button 
                  variant={newComm.type === 'email' ? 'primary' : 'secondary'} 
                  className="flex-1"
                  onClick={() => setNewComm({...newComm, type: 'email'})}
                >Email</Button>
                <Button 
                  variant={newComm.type === 'announcement' ? 'primary' : 'secondary'} 
                  className="flex-1"
                  onClick={() => setNewComm({...newComm, type: 'announcement'})}
                >Announcement</Button>
              </div>
              <Input placeholder="Recipient (e.g. Team Parents, Sponsor Name)" value={newComm.recipient} onChange={(e: any) => setNewComm({...newComm, recipient: e.target.value})} />
              <Input placeholder="Subject" value={newComm.subject} onChange={(e: any) => setNewComm({...newComm, subject: e.target.value})} />
              <textarea 
                className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base focus:outline-none focus:border-accent/50 transition-colors h-48"
                placeholder="Message Body"
                value={newComm.body}
                onChange={(e: any) => setNewComm({...newComm, body: e.target.value})}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={handleAdd}>Log Message</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {replyingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={replyForm.direction === 'inbound' ? `Reply from ${replyingTo.root.recipient}` : "Follow-up message"} className="w-full max-w-lg">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={replyForm.direction === 'inbound' ? 'primary' : 'secondary'}
                  className="flex-1"
                  onClick={() => setReplyForm({ ...replyForm, direction: 'inbound' })}
                >They replied</Button>
                <Button
                  variant={replyForm.direction === 'outbound' ? 'primary' : 'secondary'}
                  className="flex-1"
                  onClick={() => setReplyForm({ ...replyForm, direction: 'outbound' })}
                >We followed up</Button>
              </div>
              <p className="text-xs text-text-muted">Re: {replyingTo.root.subject} — To: {replyingTo.root.recipient}</p>
              <textarea
                className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base focus:outline-none focus:border-accent/50 transition-colors h-40"
                placeholder={replyForm.direction === 'inbound' ? "Paste their response…" : "Write your follow-up…"}
                value={replyForm.body}
                onChange={(e: any) => setReplyForm({ ...replyForm, body: e.target.value })}
              />
              <Input
                type="text"
                value={replyForm.date}
                onChange={(e: any) => setReplyForm({ ...replyForm, date: e.target.value })}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setReplyingTo(null)}>Cancel</Button>
                <Button onClick={handleReply} disabled={!replyForm.body.trim()}>Add Reply</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" ref={editDialogRef}>
          <Card title={editingEntry.parent_id == null ? "Edit thread" : "Edit message"} className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={editForm.direction === 'outbound' ? 'primary' : 'secondary'}
                  className="flex-1"
                  onClick={() => setEditForm({ ...editForm, direction: 'outbound' })}
                >We sent it</Button>
                <Button
                  variant={editForm.direction === 'inbound' ? 'primary' : 'secondary'}
                  className="flex-1"
                  onClick={() => setEditForm({ ...editForm, direction: 'inbound' })}
                >They sent it</Button>
              </div>
              {editingEntry.parent_id == null && (
                <>
                  <Input placeholder="Recipient" value={editForm.recipient} onChange={(e: any) => setEditForm({ ...editForm, recipient: e.target.value })} />
                  <Input placeholder="Subject" value={editForm.subject} onChange={(e: any) => setEditForm({ ...editForm, subject: e.target.value })} />
                </>
              )}
              <textarea
                className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-2 text-text-base focus:outline-none focus:border-accent/50 transition-colors h-40"
                placeholder="Message body"
                value={editForm.body}
                onChange={(e: any) => setEditForm({ ...editForm, body: e.target.value })}
              />
              <Input
                type="text"
                value={editForm.date}
                onChange={(e: any) => setEditForm({ ...editForm, date: e.target.value })}
              />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setEditingEntry(null)}>Cancel</Button>
                <Button onClick={handleEdit}>Save changes</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {askResponded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Did they respond?" className="w-full max-w-sm">
            <p className="text-sm text-text-muted mb-4">
              Did <span className="text-text-base font-bold">{askResponded.recipient || 'the recipient'}</span> respond to "{askResponded.subject}"? You can log their reply now.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setAskResponded(null)}>Not yet</Button>
              <Button onClick={() => {
                const saved = askResponded;
                setAskResponded(null);
                // Open the editor straight from the saved message's id and
                // details — don't depend on the list refresh having finished.
                setExpandedId(saved.id);
                openReply({ root: { id: saved.id, recipient: saved.recipient, subject: saved.subject, type: saved.type } }, 'inbound');
              }}>Yes, log reply</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// Link preview embed for chat messages (Discord-style).
function LinkPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setDismissed(false);
    apiFetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d && (d.title || d.description || d.image)) setPreview(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);
  if (dismissed || !preview) return null;
  return (
    <div className="mt-2 max-w-md rounded-xl border border-text-base/10 bg-text-base/[0.03] overflow-hidden">
      {preview.image && (
        <img src={preview.image} alt="" className="w-full max-h-48 object-cover" loading="lazy"
             onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <a href={preview.url} target="_blank" rel="noopener noreferrer"
             className="text-sm font-bold text-blue-400 hover:text-blue-300 line-clamp-2 break-all"
             onClick={(e) => e.stopPropagation()}>
            {preview.title || preview.site || url}
          </a>
          <button onClick={() => setDismissed(true)}
                  className="p-1 text-text-muted/50 hover:text-text-muted shrink-0" aria-label="Dismiss preview">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {preview.description && (
          <p className="text-xs text-text-muted mt-1 line-clamp-3">{preview.description}</p>
        )}
        {preview.site && (
          <p className="text-[10px] text-text-muted/60 mt-1.5 uppercase tracking-wide">{preview.site}</p>
        )}
      </div>
    </div>
  );
}

// Discord-style messaging: channel list on the left, conversation in the
// center, member list with presence on the right. No servers — channels live
// inside the team.
function ChatView({ messages, setMessages, msgCache, msgExhausted, members, currentUser, socket, channels, setChannels, activeChannelId, setActiveChannelId, handleCreateChannel, handleDeleteChannel, isAdmin, teams, activeTeamName, onSwitchTeam, chatCategories, handleCreateCategory, handleRenameCategory, handleDeleteCategory, handleMoveChannel }: any) {
  // Messages state + handlers are shared with the Modern Messages page.
  const {
    content, setContent, mentionSearch, setMentionSearch, showMentions, setShowMentions, uploading, setUploading, pendingFile, setPendingFile, pendingPreview, setPendingPreview, dragging, setDragging, showChannelsMobile, setShowChannelsMobile, showMembersMobile, setShowMembersMobile, showMemberList, setShowMemberList, creatingChannel, setCreatingChannel, creatingIn, setCreatingIn, newChannelName, setNewChannelName, newChannelTopic, setNewChannelTopic, creatingCategory, setCreatingCategory, newCategoryName, setNewCategoryName, renamingCat, setRenamingCat, renameCatName, setRenameCatName, renamingChannel, setRenamingChannel, renameChannelName, setRenameChannelName, moveMenuFor, setMoveMenuFor, dragChannelId, setDragChannelId, dragOverTarget, setDragOverTarget, reactPickerFor, setReactPickerFor, voice, handleDropOnCategory, collapsedCats, setCollapsedCats, toggleCat, showTeamMenu, setShowTeamMenu, replyTo, setReplyTo, forwardMsg, setForwardMsg, flashId, setFlashId, activeMsgId, setActiveMsgId, isTouchDevice, scrollRef, fileInputRef, composerRef, msgRefs, loadingOlder, setLoadingOlder, loadOlderMessages, activeChannel, canPostInChannel, visibleMessages, scrollToMessage, startReply, copyMessageText, convertMentions, handleSend, handleForward, clearPending, queueFile, handlePaste, handleDrop, handleFileUpload, handleDeleteMessage, recentReactions, setRecentReactions, recordRecentReaction, handleReactionsChange, handlePickReaction, handleCreateChannelSubmit, handleCreateCategorySubmit, handleRenameCategorySubmit, handleRenameChannelSubmit, handleKeyDown, onContentChange, filteredMentions,
  } = useChatController({ messages, setMessages, msgCache, msgExhausted, members, currentUser, socket, channels, setChannels, activeChannelId, setActiveChannelId, isAdmin, handleCreateChannel, handleCreateCategory, handleRenameCategory, handleMoveChannel, memberMenuItems });

  const isImageFile = (filepath: string) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(filepath);
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatFileDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDayDivider = (ts: string) => {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  };

  const renderContent = (text: string) => {
    // Split on @mentions and URLs, keeping delimiters
    const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
    return text.split(/(@\[[^\]]+\])/).map((part: string, i: number) => {
      if (part.startsWith('@[') && part.endsWith(']')) {
        const name = part.slice(2, -1);
        return (
          <span key={i} className="font-bold text-accent bg-accent/10 rounded px-1 py-0.5">
            @{name}
          </span>
        );
      }
      // Linkify URLs within this part
      const urlParts = part.split(urlRegex);
      if (urlParts.length === 1) return part;
      return urlParts.map((up: string, j: number) => {
        if (urlRegex.test(up)) {
          urlRegex.lastIndex = 0;
          const href = up.startsWith('http') ? up : `https://${up}`;
          // Strip trailing punctuation that isn't part of the URL
          const m = up.match(/^(.*?)([.,;:!?)]+)$/);
          const cleanUp = m ? m[1] : up;
          const trail = m ? m[2] : '';
          const cleanHref = cleanUp.startsWith('http') ? cleanUp : `https://${cleanUp}`;
          return (
            <span key={`${i}-${j}`}>
              <a href={cleanHref} target="_blank" rel="noopener noreferrer"
                 className="text-blue-400 hover:text-blue-300 underline break-all"
                 onClick={(e) => e.stopPropagation()}>
                {cleanUp}
              </a>
              {trail}
            </span>
          );
        }
        return up;
      });
    });
  };

  // Extract the first URL from message text for link preview embeds
  const extractFirstUrl = (text: string): string | null => {
    const m = text.match(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i);
    if (!m) return null;
    let url = m[0].replace(/[.,;:!?)]+$/, '');
    return url.startsWith('http') ? url : `https://${url}`;
  };

  const onlineMembers = members.filter((m: any) => m.presence === 'online' || m.presence === 'idle' || m.presence === 'dnd');
  const offlineMembers = members.filter((m: any) => !onlineMembers.includes(m));

  // ---- Channel categories (Discord-style groups) ----
  const sortedCats = [...(chatCategories || [])].sort(
    (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id
  );
  const catIds = new Set(sortedCats.map((c: any) => c.id));
  const channelsByCat = new Map<number, any[]>();
  const ungroupedChannels: any[] = [];
  (channels || []).forEach((c: any) => {
    if (c.category_id != null && catIds.has(c.category_id)) {
      if (!channelsByCat.has(c.category_id)) channelsByCat.set(c.category_id, []);
      channelsByCat.get(c.category_id)!.push(c);
    } else {
      ungroupedChannels.push(c);
    }
  });
  // Touch devices have no hover: admin row actions stay visible so the
  // channel/category controls are tappable on phones.
  const adminIconVis = isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover/cat:opacity-100';

  const renderCreateChannelForm = () => (
    <div className="mx-1 mb-2 p-3 rounded-xl bg-primary border border-text-base/10 space-y-2 flex-shrink-0">
      <input
        value={newChannelName}
        onChange={(e) => setNewChannelName(e.target.value)}
        placeholder="channel-name"
        maxLength={40}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannelSubmit(); }}
        className="w-full bg-secondary border border-text-base/10 rounded-lg px-3 py-2 text-sm text-text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
      />
      <input
        value={newChannelTopic}
        onChange={(e) => setNewChannelTopic(e.target.value)}
        placeholder="Topic (optional)"
        maxLength={140}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannelSubmit(); }}
        className="w-full bg-secondary border border-text-base/10 rounded-lg px-3 py-2 text-sm text-text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
      />
      <div className="flex gap-2">
        <button
          onClick={handleCreateChannelSubmit}
          disabled={!newChannelName.trim()}
          className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-ink hover:brightness-105 disabled:opacity-40 transition-all"
        >
          Create
        </button>
        <button
          onClick={() => { setCreatingIn(null); setCreatingChannel(false); setNewChannelName(''); setNewChannelTopic(''); }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-base hover:bg-text-base/[0.06] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderChannelRow = (c: any) => {
    const isActive = c.id === activeChannelId;
    return (
      <div key={c.id} className="group/channel relative">
        <button
          onClick={() => { setActiveChannelId(c.id); setReplyTo(null); setShowChannelsMobile(false); }}
          title={c.topic || `#${c.name}`}
          draggable={isAdmin && !isTouchDevice}
          onDragStart={(e) => {
            if (!isAdmin) return;
            e.dataTransfer.setData('text/plain', String(c.id));
            e.dataTransfer.effectAllowed = 'move';
            setDragChannelId(c.id);
          }}
          onDragEnd={() => { setDragChannelId(null); setDragOverTarget(null); }}
          className={cn(
            'w-full flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[15px] transition-all text-left',
            isActive ? 'bg-text-base/[0.08] text-text-base font-semibold' : 'text-text-muted hover:bg-text-base/[0.04] hover:text-text-base',
            dragChannelId === c.id && 'opacity-40',
            isAdmin && !isTouchDevice && 'cursor-grab active:cursor-grabbing'
          )}
        >
          <Hash className={cn('w-[18px] h-[18px] flex-shrink-0', isActive ? 'text-accent' : 'text-text-muted/60')} />
          <span className="truncate flex-1">{c.name}</span>
          {c.post_restricted ? <Lock className="w-3.5 h-3.5 flex-shrink-0 text-text-muted/50" /> : null}
          {isAdmin && (
            <span className={cn('flex items-center gap-0.5 flex-shrink-0 transition-opacity', isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover/channel:opacity-100')}>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setRenameChannelName(c.name); setRenamingChannel(renamingChannel === c.id ? null : c.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setRenameChannelName(c.name); setRenamingChannel(renamingChannel === c.id ? null : c.id); } }}
                className="p-1 rounded text-text-muted/60 hover:text-text-base"
                title={`Rename #${c.name}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setMoveMenuFor(moveMenuFor === c.id ? null : c.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setMoveMenuFor(moveMenuFor === c.id ? null : c.id); } }}
                className="p-1 rounded text-text-muted/60 hover:text-text-base"
                title={`Move #${c.name} to another category`}
              >
                <FolderInput className="w-3.5 h-3.5" />
              </span>
              {c.name !== 'general' && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleDeleteChannel(c.id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleDeleteChannel(c.id); } }}
                  className="p-1 rounded text-text-muted/60 hover:text-rose-400"
                  title={`Delete #${c.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </span>
              )}
            </span>
          )}
        </button>
        {moveMenuFor === c.id && isAdmin && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMoveMenuFor(null)} />
            <div className="absolute right-1 top-9 z-50 w-48 rounded-xl border border-text-base/10 bg-secondary shadow-2xl p-1">
              <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted/60">Move to</p>
              {sortedCats.map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={async () => { setMoveMenuFor(null); await handleMoveChannel(c.id, cat.id); }}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors',
                    c.category_id === cat.id ? 'text-accent font-semibold' : 'text-text-muted hover:bg-text-base/[0.06] hover:text-text-base'
                  )}
                >
                  {cat.name}
                </button>
              ))}
              <button
                onClick={async () => { setMoveMenuFor(null); await handleMoveChannel(c.id, null); }}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors',
                  c.category_id == null ? 'text-accent font-semibold' : 'text-text-muted hover:bg-text-base/[0.06] hover:text-text-base'
                )}
              >
                Ungrouped
              </button>
              <div className="my-1 border-t border-text-base/[0.06]" />
              <button
                onClick={async () => {
                  setMoveMenuFor(null);
                  try {
                    const res = await apiFetch(`/api/chat/channels/${c.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ post_restricted: c.post_restricted ? 0 : 1 }),
                    });
                    if (!res.ok) throw new Error();
                    notify(c.post_restricted ? `#${c.name} is open for everyone to post.` : `#${c.name} is now admin-only.`, 'success');
                  } catch { notify('Could not change that setting.', 'error'); }
                }}
                className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-text-muted hover:bg-text-base/[0.06] hover:text-text-base transition-colors flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                {c.post_restricted ? 'Open posting to everyone' : 'Admin-only posting'}
              </button>
            </div>
          </>
        )}
        {renamingChannel === c.id && isAdmin && (
          <div className="mx-1 mt-1 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <input
              value={renameChannelName}
              onChange={(e) => setRenameChannelName(e.target.value)}
              maxLength={40}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameChannelSubmit(); if (e.key === 'Escape') setRenamingChannel(null); }}
              className="flex-1 min-w-0 bg-secondary border border-text-base/10 rounded-lg px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent/60"
              aria-label="Channel name"
            />
            <button onClick={handleRenameChannelSubmit} disabled={!renameChannelName.trim()} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-ink disabled:opacity-40">Save</button>
          </div>
        )}
      </div>
    );
  };

  const renderCategoryHeader = (cat: any, ungrouped: boolean) => {
    const dropKey = ungrouped ? 'uncat' : `cat:${cat.id}`;
    const isDropTarget = isAdmin && dragOverTarget === dropKey;
    return (
    <div
      className={cn('group/cat flex items-center gap-0.5 px-2.5 pt-3 pb-1 rounded-lg transition-colors', isDropTarget && 'bg-accent/15 outline outline-1 outline-accent/50')}
      onDragOver={isAdmin ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverTarget(dropKey); } : undefined}
      onDragLeave={() => setDragOverTarget((prev) => (prev === dropKey ? null : prev))}
      onDrop={isAdmin ? (e) => handleDropOnCategory(e, ungrouped ? null : cat.id) : undefined}
    >
      <button
        onClick={() => { if (!ungrouped) toggleCat(cat.id); }}
        className="flex items-center gap-1 flex-1 min-w-0 text-left"
        aria-expanded={ungrouped ? undefined : !collapsedCats.has(cat.id)}
      >
        {!ungrouped && (
          <ChevronDown className={cn('w-3.5 h-3.5 text-text-muted/60 transition-transform flex-shrink-0', collapsedCats.has(cat.id) && '-rotate-90')} />
        )}
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted/70 truncate">
          {ungrouped ? 'Ungrouped' : cat.name}
        </span>
      </button>
      {isAdmin && (
        <span className={cn('flex items-center flex-shrink-0 transition-opacity', adminIconVis)}>
          {!ungrouped && (
            <>
              <button
                onClick={() => { setRenameCatName(cat.name); setRenamingCat(renamingCat === cat.id ? null : cat.id); }}
                className="p-1 rounded text-text-muted/60 hover:text-text-base"
                title={`Rename "${cat.name}"`}
                aria-label={`Rename category ${cat.name}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                className="p-1 rounded text-text-muted/60 hover:text-rose-400"
                title={`Delete "${cat.name}"`}
                aria-label={`Delete category ${cat.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={() => setCreatingIn(creatingIn === (ungrouped ? 'uncat' : cat.id) ? null : (ungrouped ? 'uncat' : cat.id))}
            className="p-1 rounded text-text-muted/60 hover:text-text-base"
            title={ungrouped ? 'Create channel' : `Create channel in ${cat.name}`}
            aria-label={ungrouped ? 'Create channel' : `Create channel in ${cat.name}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </span>
      )}
    </div>
    );
  };

  const channelList = (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted/70">Text channels</p>
        {isAdmin && (
          <button
            onClick={() => { setCreatingCategory(!creatingCategory); setNewCategoryName(''); }}
            className="p-1.5 -mr-1 rounded-md text-text-muted hover:text-text-base hover:bg-text-base/[0.07] transition-colors"
            title="New category"
            aria-label="New category"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        )}
      </div>
      {creatingCategory && isAdmin && (
        <div className="mx-3 mb-2 p-3 rounded-xl bg-primary border border-text-base/10 space-y-2 flex-shrink-0">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name"
            maxLength={40}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategorySubmit(); }}
            className="w-full bg-secondary border border-text-base/10 rounded-lg px-3 py-2 text-sm text-text-base placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateCategorySubmit}
              disabled={!newCategoryName.trim()}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-ink hover:brightness-105 disabled:opacity-40 transition-all"
            >
              Create category
            </button>
            <button
              onClick={() => { setCreatingCategory(false); setNewCategoryName(''); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-base hover:bg-text-base/[0.06] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
        {sortedCats.map((cat: any) => (
          <div key={cat.id}>
            {renderCategoryHeader(cat, false)}
            {renamingCat === cat.id && isAdmin && (
              <div className="mx-1 mb-1 flex gap-1.5">
                <input
                  value={renameCatName}
                  onChange={(e) => setRenameCatName(e.target.value)}
                  maxLength={40}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRenameCategorySubmit(); if (e.key === 'Escape') setRenamingCat(null); }}
                  className="flex-1 min-w-0 bg-secondary border border-text-base/10 rounded-lg px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent/60"
                />
                <button onClick={handleRenameCategorySubmit} disabled={!renameCatName.trim()} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-ink disabled:opacity-40">Save</button>
              </div>
            )}
            {!collapsedCats.has(cat.id) && (
              <div className="space-y-0.5">
                {(channelsByCat.get(cat.id) || []).map(renderChannelRow)}
              </div>
            )}
            {creatingIn === cat.id && isAdmin && renderCreateChannelForm()}
          </div>
        ))}
        {ungroupedChannels.length > 0 && (
          <div>
            {renderCategoryHeader({ id: 'uncat' }, true)}
            <div className="space-y-0.5">
              {ungroupedChannels.map(renderChannelRow)}
            </div>
            {creatingIn === 'uncat' && isAdmin && renderCreateChannelForm()}
          </div>
        )}
        {sortedCats.length === 0 && ungroupedChannels.length === 0 && (
          <p className="px-2.5 py-4 text-sm text-text-muted/60">No channels yet.</p>
        )}
      </div>
      {/* Voice channels — same sidebar section conventions as the text list */}
      <div className="flex-shrink-0 border-t border-text-base/[0.06] max-h-[42%] overflow-y-auto custom-scrollbar">
        <VoiceChannelList />
      </div>
    </div>
  );

  const memberList = (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted/70">
          Members — {members.length}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
        {onlineMembers.length > 0 && (
          <p className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted/60">
            Online — {onlineMembers.length}
          </p>
        )}
        {onlineMembers.map((m: any) => (
          <div key={m.id} data-cm-type="member-chat" data-cm-id={m.id} className="group flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-text-base/[0.04] transition-colors">
            <AvatarWithPresence user={m} size="sm" presence={m.presence} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-base truncate leading-tight">{m.name}</p>
              <p className="text-[11px] text-text-muted truncate">{PRESENCE_META[m.presence]?.label || 'Offline'}</p>
            </div>
            {/* Call a member: starts a PUBLIC voice-channel call anyone can join, and rings them. */}
            {m.id !== currentUser?.id && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  title={`Voice call ${m.name}`}
                  aria-label={`Voice call ${m.name}`}
                  onClick={() => voice.startCall([m.id], 'audio')}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Phone className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title={`Video call ${m.name}`}
                  aria-label={`Video call ${m.name}`}
                  onClick={() => voice.startCall([m.id], 'video')}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Video className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        ))}
        {offlineMembers.length > 0 && (
          <p className="px-2.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted/60">
            Offline — {offlineMembers.length}
          </p>
        )}
        {offlineMembers.map((m: any) => (
          <div key={m.id} data-cm-type="member-chat" data-cm-id={m.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg opacity-60 hover:opacity-90 hover:bg-text-base/[0.04] transition-all">
            <AvatarWithPresence user={m} size="sm" presence={m.presence} />
            <p className="text-sm font-medium text-text-muted truncate flex-1">{m.name}</p>
          </div>
        ))}
      </div>
    </div>
  );

  let lastDay = '';
  const canDelete = (msg: any) => msg.sender_id === currentUser.id || isAdmin;

  // Right-click on a message: reply, copy, delete (same rules as the hover bar).
  useContextMenu('message', (el) => {
    const id = Number(el.dataset.cmId);
    const msg = (messages || []).find((m: any) => m.id === id);
    if (!msg) return null;
    const items: { label: string; icon?: any; danger?: boolean; action: () => void }[] = [
      { label: 'Reply', icon: Reply, action: () => startReply(msg) },
      { label: 'Copy text', icon: Copy, action: () => copyMessageText(msg) },
    ];
    if (canDelete(msg)) {
      items.push({ label: 'Delete message', icon: Trash2, danger: true, action: () => handleDeleteMessage(msg.id) });
    }
    return items;
  });
  const messageList = visibleMessages.map((msg: any, idx: number) => {
    const day = formatDayDivider(msg.timestamp);
    const showDivider = day !== lastDay;
    lastDay = day;
    const sender = members.find((m: any) => m.id === msg.sender_id);
    const senderName = msg.sender_name || sender?.name || 'Unknown';
    const flashed = flashId === msg.id;
    const replyGone = msg.reply_to_id && (msg.reply_deleted || !msg.reply_sender_name);
    return (
      <div key={msg.id ?? idx}>
        {showDivider && (
          <div className="flex items-center gap-3 my-4 px-4">
            <div className="flex-1 h-px bg-text-base/10" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted/70">{day}</span>
            <div className="flex-1 h-px bg-text-base/10" />
          </div>
        )}
        <div
          ref={(el) => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
          onClick={() => { if (isTouchDevice) setActiveMsgId((id) => (id === msg.id ? null : msg.id)); }}
          data-cm-type="message"
          data-cm-id={msg.id}
          className={cn(
            'group relative flex gap-3 px-4 py-1.5 transition-colors',
            flashed ? 'bg-accent/15' : 'hover:bg-text-base/[0.03]'
          )}
        >
          {/* action bar — hover on desktop, tap-to-toggle on touch devices */}
          <div className={cn(
            'absolute -top-3 right-4 z-10 items-center rounded-lg border border-text-base/10 bg-secondary shadow-xl overflow-hidden',
            activeMsgId === msg.id ? 'flex' : 'hidden group-hover:flex'
          )}>
            <button onClick={(e) => { e.stopPropagation(); setActiveMsgId(null); startReply(msg); }} title="Reply (R)" aria-label="Reply to message" className="p-2 text-text-muted hover:text-text-base hover:bg-text-base/[0.07] transition-colors">
              <Reply className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setReactPickerFor(reactPickerFor === msg.id ? null : msg.id); }} title="Add reaction" aria-label="Add reaction" className="p-2 text-text-muted hover:text-text-base hover:bg-text-base/[0.07] transition-colors">
              <Smile className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setActiveMsgId(null); setForwardMsg(msg); }} title="Forward" aria-label="Forward message" className="p-2 text-text-muted hover:text-text-base hover:bg-text-base/[0.07] transition-colors">
              <Forward className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setActiveMsgId(null); copyMessageText(msg); }} title="Copy text" aria-label="Copy message text" className="p-2 text-text-muted hover:text-text-base hover:bg-text-base/[0.07] transition-colors">
              <Copy className="w-4 h-4" />
            </button>
            {canDelete(msg) && (
              <button onClick={(e) => { e.stopPropagation(); setActiveMsgId(null); handleDeleteMessage(msg.id); }} title="Delete" aria-label="Delete message" className="p-2 text-text-muted hover:text-rose-400 hover:bg-text-base/[0.07] transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex-shrink-0 pt-0.5">
            <AvatarWithPresence user={{ name: senderName, avatar_url: sender?.avatar_url }} size="sm" presence={sender?.presence} dotClassName="w-2.5 h-2.5" />
          </div>
          <div className="flex-1 min-w-0">
            {msg.is_forwarded ? (
              <p className="text-[11px] font-semibold text-text-muted/80 mb-0.5">Forwarded{msg.forwarded_from ? ` · ${msg.forwarded_from}` : ''}</p>
            ) : null}
            {msg.reply_to_id && !replyGone && (
              <button onClick={(e) => { e.stopPropagation(); scrollToMessage(msg.reply_to_id); }} className="flex items-center gap-1.5 mb-1 text-xs text-text-muted hover:text-text-base transition-colors max-w-full" title="Jump to original">
                <Reply className="w-3 h-3 rotate-180 flex-shrink-0 text-text-muted/60" />
                <span className="font-bold truncate">{msg.reply_sender_name}</span>
                <span className="truncate opacity-70">{(msg.reply_content || '').slice(0, 90)}</span>
              </button>
            )}
            {msg.reply_to_id && replyGone && (
              <p className="text-xs text-text-muted/50 italic mb-1">Original message was deleted</p>
            )}
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-bold text-text-base">{senderName}</span>
              <span className="text-[10px] text-text-muted/60">{format(new Date(msg.timestamp), 'h:mm a')}</span>
            </div>
            <div className="text-[15px] text-text-base/90 leading-relaxed break-words">
              {msg.file_path && (
                <div className="flex flex-col gap-2 mb-1.5 mt-1">
                  {isImageFile(msg.file_path) && (
                    <ChatImage src={assetUrl(msg.file_path)} href={assetUrl(msg.file_path)} alt={msg.file_name || 'uploaded'} />
                  )}
                  {!isImageFile(msg.file_path) && (
                    <div className="flex flex-col gap-1 p-3 rounded-xl border min-w-[200px] max-w-xs bg-text-base/5 border-text-base/10">
                      <div className="flex items-center gap-2 text-sm font-medium text-text-base">
                        <FileText className="w-4 h-4 text-accent shrink-0" />
                        <span className="truncate">{msg.file_name || msg.file_path.split('/').pop()}</span>
                      </div>
                      {(msg.file_size || msg.file_updated) && (
                        <div className="flex items-center gap-3 text-[10px] text-text-muted">
                          {msg.file_size && <span>{formatFileSize(msg.file_size)}</span>}
                          {msg.file_updated && <span>{formatFileDate(msg.file_updated)}</span>}
                        </div>
                      )}
                      <a
                        href={assetUrl(msg.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 hover:bg-accent/20 transition-colors text-xs text-accent font-medium"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                    </div>
                  )}
                </div>
              )}
              {msg.content && <div>{renderContent(msg.content)}</div>}
              {msg.content && extractFirstUrl(msg.content) && (
                <LinkPreview url={extractFirstUrl(msg.content)!} />
              )}
            </div>
            <MessageReactions
              messageId={msg.id}
              reactions={msg.reactions || []}
              memberId={currentUser?.id}
              onReactionsChange={handleReactionsChange}
              memberNames={Object.fromEntries((members || []).map((m: any) => [m.id, m.name]))}
            />
            {reactPickerFor === msg.id && (
              <div className="relative z-20 mt-1">
                <ReactionPicker
                  onPick={(emoji: string) => handlePickReaction(msg.id, emoji)}
                  onClose={() => setReactPickerFor(null)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  });

  const teamHeader = (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => (teams || []).length > 1 && setShowTeamMenu(!showTeamMenu)}
        className="w-full flex items-center gap-2 px-4 h-12 border-b border-text-base/[0.06] hover:bg-text-base/[0.03] transition-colors"
        title={activeTeamName || 'My team'}
      >
        <span className="font-bold text-[15px] text-text-base truncate flex-1 text-left">{activeTeamName || 'My team'}</span>
        {(teams || []).length > 1 && <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform', showTeamMenu && 'rotate-180')} />}
      </button>
      {showTeamMenu && (teams || []).length > 1 && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setShowTeamMenu(false)} aria-label="Close team menu" />
          <div className="absolute left-2 right-2 top-full mt-1 glass rounded-xl border border-text-base/10 shadow-2xl overflow-hidden z-50">
            <div className="max-h-64 overflow-y-auto custom-scrollbar py-1.5">
              {(teams || []).map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => { setShowTeamMenu(false); onSwitchTeam?.(t.id); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-text-base/5',
                    t.name === activeTeamName ? 'text-text-base font-bold' : 'text-text-base/70'
                  )}
                >
                  <Layers className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="truncate flex-1">{t.name}</span>
                  {t.name === activeTeamName && <Check className="w-4 h-4 text-accent flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div
      className="flex h-full w-full min-h-0 relative bg-primary"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 bg-accent/10 border-2 border-dashed border-accent flex items-center justify-center pointer-events-none">
          <p className="text-accent font-bold">Drop to attach</p>
        </div>
      )}

      {/* Left: channels (drawer on mobile) */}
      <div className="hidden md:flex w-60 flex-shrink-0 border-r border-text-base/[0.06] bg-secondary/40 flex-col min-h-0">
        {teamHeader}
        <div className="flex-1 min-h-0 flex flex-col">{channelList}</div>
      </div>
      {showChannelsMobile && (
        <div className="md:hidden absolute inset-y-0 left-0 w-64 z-30 bg-secondary border-r border-text-base/10 flex flex-col min-h-0">
          <div className="flex items-center justify-between pl-4 pr-2 h-12 border-b border-text-base/[0.06] flex-shrink-0">
            <span className="text-sm font-bold text-text-base truncate">{activeTeamName || 'Channels'}</span>
            <button onClick={() => setShowChannelsMobile(false)} className="p-2 text-text-muted hover:text-text-base" aria-label="Close channels">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">{channelList}</div>
        </div>
      )}

      {/* Center: conversation */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="h-12 px-3 sm:px-4 border-b border-text-base/[0.06] flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowChannelsMobile(true)} className="md:hidden p-2 -ml-1 text-text-muted hover:text-text-base" aria-label="Open channels">
            <Menu className="w-5 h-5" />
          </button>
          <img src="/logo.png?v=3" alt="" className="w-5 h-5 rounded-md flex-shrink-0" />
          <h3 className="text-[15px] font-bold text-text-base truncate">{activeChannel?.name || 'general'}</h3>
          {activeChannel?.topic && (
            <p className="hidden sm:block text-xs text-text-muted truncate border-l border-text-base/10 pl-2 ml-1">{activeChannel.topic}</p>
          )}
          <div className="flex-1" />
          <button onClick={() => setShowMemberList(!showMemberList)} className="hidden xl:block p-2 text-text-muted hover:text-text-base transition-colors" aria-label="Toggle member list" title="Toggle member list">
            <Users className={cn('w-5 h-5', showMemberList && 'text-accent')} />
          </button>
          <button onClick={() => setShowMembersMobile(!showMembersMobile)} className="xl:hidden p-2 text-text-muted hover:text-text-base" aria-label="Toggle members">
            <Users className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-3 min-h-0">
          {visibleMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="w-16 h-16 rounded-full bg-text-base/[0.05] flex items-center justify-center">
                <Hash className="w-8 h-8 text-text-muted/50" />
              </div>
              <div>
                <p className="text-text-base font-bold">Welcome to #{activeChannel?.name || 'general'}!</p>
                <p className="text-sm text-text-muted mt-1">This is the start of the conversation.</p>
              </div>
            </div>
          ) : (
            <>
              {!msgExhausted.current.get(activeChannelId) && visibleMessages.length >= 100 && (
                <div className="flex justify-center pb-2">
                  <button
                    onClick={loadOlderMessages}
                    disabled={loadingOlder}
                    className="text-xs font-semibold text-text-muted hover:text-text-base border border-text-base/10 hover:border-text-base/25 rounded-full px-4 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {loadingOlder ? 'Loading…' : 'Load older messages'}
                  </button>
                </div>
              )}
              {messageList}
            </>
          )}
        </div>

        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1 flex-shrink-0 relative">
          {!canPostInChannel ? (
            <div className="flex items-center gap-2.5 bg-secondary/60 border border-text-base/10 rounded-xl px-4 py-3.5 text-sm text-text-muted">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>Only admins can post in <span className="font-semibold text-text-base">#{activeChannel?.name}</span></span>
            </div>
          ) : (
          <>
          {replyTo && (
            <div className="flex items-center gap-2 pl-4 pr-2 py-2 bg-secondary/80 border border-text-base/10 border-b-0 rounded-t-xl text-xs">
              <Reply className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              <span className="text-text-muted flex-shrink-0">Replying to <span className="font-bold text-text-base">{replyTo.sender_name}</span></span>
              <span className="text-text-muted/60 truncate flex-1">{(replyTo.content || '').slice(0, 80)}</span>
              <button onClick={() => setReplyTo(null)} className="p-1.5 text-text-muted hover:text-text-base transition-colors" title="Cancel reply (Esc)">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-2">
              {pendingPreview ? (
                <img src={pendingPreview} alt="attachment preview" className="w-14 h-14 rounded-lg object-cover border border-text-base/10" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-text-base/5 border border-text-base/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-text-base truncate">{pendingFile.name}</p>
                <p className="text-[11px] text-text-muted">{formatFileSize(pendingFile.size)} — will send with your message</p>
              </div>
              <button onClick={clearPending} className="p-2 text-text-muted hover:text-rose-400 transition-colors" title="Remove attachment">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {showMentions && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-4 mb-2 glass rounded-xl border border-text-base/10 overflow-hidden w-56 shadow-2xl z-10">
              {filteredMentions.slice(0, 5).map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => {
                    const parts = content.split(' ');
                    parts.pop();
                    setContent([...parts, `@${m.name} `].join(' '));
                    setShowMentions(false);
                    composerRef.current?.focus();
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-text-base/80 hover:bg-accent hover:text-accent-ink transition-colors flex items-center gap-2.5"
                >
                  {m.special ? (
                    <span className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                      <Bell className="w-3.5 h-3.5 text-accent" />
                    </span>
                  ) : (
                    <Avatar user={m} size="xs" />
                  )}
                  <span className="flex-1">@{m.name}</span>
                  {m.special && <span className="text-[11px] text-text-muted/70 truncate">{m.special}</span>}
                </button>
              ))}
            </div>
          )}
          <div className={cn(
            'flex gap-1.5 items-end bg-secondary/60 border border-text-base/10 px-1.5 py-1.5',
            replyTo ? 'rounded-b-xl border-t-0' : 'rounded-xl'
          )}>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-10 w-10 rounded-lg transition-all active:scale-95 flex items-center justify-center disabled:opacity-50 text-text-muted hover:text-text-base hover:bg-text-base/[0.08] flex-shrink-0"
              title="Attach file"
            >
              <FileUp className="w-5 h-5" />
            </button>
            <textarea
              ref={composerRef}
              className="flex-1 bg-transparent px-2 py-2.5 text-sm text-text-base placeholder:text-text-muted/60 focus:outline-none min-h-[40px] max-h-32 resize-none"
              placeholder={`Message #${activeChannel?.name || 'general'}`}
              value={content}
              onChange={onContentChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={uploading}
              rows={1}
            />
            <Button onClick={handleSend} disabled={uploading || (!content.trim() && !pendingFile)} className="h-10 w-10 p-0 flex-shrink-0 rounded-lg"><Send className="w-5 h-5" /></Button>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Right: members */}
      <div className={cn(
        'w-56 flex-shrink-0 border-l border-text-base/[0.06] bg-secondary/40 flex-col min-h-0',
        showMembersMobile ? 'absolute inset-y-0 right-0 z-30 flex bg-secondary' : (showMemberList ? 'hidden xl:flex' : 'hidden')
      )}>
        {showMembersMobile && (
          <div className="xl:hidden flex items-center justify-between px-4 h-12 border-b border-text-base/[0.06] flex-shrink-0">
            <span className="text-sm font-bold text-text-base">Members</span>
            <button onClick={() => setShowMembersMobile(false)} className="p-1.5 text-text-muted hover:text-text-base" aria-label="Close members">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0">{memberList}</div>
      </div>

      {/* Forward modal */}
      {forwardMsg && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setForwardMsg(null)}>
          <div className="w-full max-w-sm glass rounded-2xl border border-text-base/10 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-text-base/10">
              <h3 className="text-base font-bold text-text-base">Forward message</h3>
              <p className="text-xs text-text-muted mt-1 truncate">"{(forwardMsg.content || forwardMsg.file_name || 'attachment').slice(0, 80)}"</p>
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar py-2">
              {(channels || []).map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => handleForward(c.id)}
                  className="w-full flex items-center gap-2.5 px-5 py-2.5 text-left hover:bg-text-base/[0.05] transition-colors"
                >
                  <Hash className="w-4 h-4 text-text-muted/70 flex-shrink-0" />
                  <span className={cn('text-sm truncate flex-1', c.id === activeChannelId ? 'text-text-base font-semibold' : 'text-text-base/80')}>{c.name}</span>
                  {c.id === activeChannelId && <span className="text-[10px] text-text-muted uppercase tracking-wider">current</span>}
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-text-base/10 flex justify-end">
              <button onClick={() => setForwardMsg(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:text-text-base hover:bg-text-base/[0.06] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// Feedback: any signed-in user can send a note straight to Sushil
// Empty state for accounts with zero team memberships: create a team, join
// one with an access code, or delete the account.
function TeamlessScreen({ user, onCreateTeam, onJoinTeam, onDeleteAccount, onSignOut }: any) {
  const [mode, setMode] = useState<'menu' | 'create' | 'join' | 'delete'>('menu');
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const doCreate = async () => {
    if (!teamName.trim() || busy) return;
    setBusy(true);
    try {
      await onCreateTeam(teamName.trim());
    } catch (e: any) {
      notify(e.message || 'Could not create team', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      await onJoinTeam(code.trim());
    } catch (e: any) {
      notify(e.message || 'Could not join team', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (confirmEmail.trim().toLowerCase() !== (user?.email || '').toLowerCase()) {
      notify('Type your email address exactly to confirm.', 'info');
      return;
    }
    if (!(await confirmDialog({ title: 'Delete account', message: 'This is permanent. Delete your account and all of your personal data?', confirmLabel: 'Delete my account', danger: true }))) return;
    setBusy(true);
    try {
      await onDeleteAccount();
    } catch (e: any) {
      notify(e.message || 'Could not delete your account.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4 relative overflow-hidden">
      <DialogHost />
      <div className="hero-grid absolute inset-0" />
      <div className="hero-glow absolute inset-0" />
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center gold-glow">
            <Bolt className="text-accent-ink w-9 h-9" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-display font-bold text-text-base tracking-tight text-center">You're not on any teams</h1>
          <p className="text-text-muted text-center text-sm">
            {user?.email ? `Signed in as ${user.email}. ` : ''}Create a new workspace, join one with an access code, or delete your account.
          </p>
        </div>

        <Card className="p-6">
          {mode === 'menu' && (
            <div className="space-y-3">
              <Button className="w-full py-3" onClick={() => setMode('create')}>
                <Plus className="w-4 h-4 mr-2" /> Create a team
              </Button>
              <Button variant="secondary" className="w-full py-3" onClick={() => setMode('join')}>
                <KeyRound className="w-4 h-4 mr-2" /> Join with an access code
              </Button>
              <button onClick={() => setMode('delete')} className="w-full text-center text-xs text-text-muted hover:text-rose-400 transition-colors pt-2">
                Delete my account
              </button>
              <button onClick={onSignOut} className="w-full text-center text-xs text-text-muted hover:text-text-base transition-colors">
                Sign out
              </button>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-text-muted uppercase">Team name</label>
                <Input value={teamName} onChange={(e: any) => setTeamName(e.target.value)} placeholder="e.g. Hypnotic Robotics" autoFocus />
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setMode('menu')} className="flex-1">Back</Button>
                <Button onClick={doCreate} disabled={busy || !teamName.trim()} className="flex-1">
                  {busy ? 'Creating…' : 'Create team'}
                </Button>
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-text-muted uppercase">Access code</label>
                <Input value={code} onChange={(e: any) => setCode(e.target.value)} placeholder="Ask your admin for the code" autoFocus className="uppercase" />
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setMode('menu')} className="flex-1">Back</Button>
                <Button onClick={doJoin} disabled={busy || !code.trim()} className="flex-1">
                  {busy ? 'Joining…' : 'Join team'}
                </Button>
              </div>
            </div>
          )}

          {mode === 'delete' && (
            <div className="space-y-4">
              <p className="text-sm text-rose-300 font-semibold">
                This cannot be undone. Type your email (<span className="text-text-base">{user?.email}</span>) to confirm.
              </p>
              <Input value={confirmEmail} onChange={(e: any) => setConfirmEmail(e.target.value)} placeholder="your@email.com" />
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => { setMode('menu'); setConfirmEmail(''); }} className="flex-1">Back</Button>
                <Button
                  onClick={doDelete}
                  disabled={busy || confirmEmail.trim().toLowerCase() !== (user?.email || '').toLowerCase()}
                  className="flex-1 bg-rose-600 text-text-base hover:bg-rose-500 disabled:opacity-40"
                >
                  {busy ? 'Deleting…' : 'Yes, delete everything'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}

function FeedbackModal({ onClose }: any) {
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [attachmentKind, setAttachmentKind] = useState<'image' | 'video' | 'file'>('image');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const acceptFile = (f: File): boolean => {
    const mime = f.type || '';
    const name = f.name.toLowerCase();
    const ok = mime.startsWith('image/') || mime.startsWith('video/')
      || /\.(pdf|txt|md|markdown|csv|log|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z)$/.test(name);
    if (!ok) {
      notify('That file type is not supported — use an image, video, or common document.', 'error');
      return false;
    }
    if (f.size > 25 * 1024 * 1024) {
      notify('Attachments must be under 25MB.', 'error');
      return false;
    }
    return true;
  };

  const setFile = (f: File) => {
    if (preview) URL.revokeObjectURL(preview);
    setAttachment(f);
    setPreview(URL.createObjectURL(f));
    setAttachmentKind(f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : 'file');
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (acceptFile(f)) setFile(f);
  };

  // Paste a screenshot / file straight from the clipboard (Ctrl+V / Cmd+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f && acceptFile(f)) {
          e.preventDefault();
          setFile(f);
          notify('Attachment pasted — ready to send.', 'success');
        }
        return;
      }
    }
  };

  const clearAttachment = () => {
    if (preview) URL.revokeObjectURL(preview);
    setAttachment(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('category', category);
      form.append('message', message.trim());
      if (attachment) form.append('attachment', attachment);
      const res = await apiFetch('/api/feedback', { method: 'POST', body: form });
      if (res.ok) {
        clearAttachment();
        setSent(true);
      } else {
        const data = await res.json().catch(() => ({}));
        notify(data.error || 'Could not send feedback — try again.', 'error');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-2xl border border-text-base/10 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} onPaste={handlePaste}>
        {sent ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-lg font-display font-bold text-text-base mb-2">Feedback sent</h3>
            <p className="text-sm text-text-muted mb-6">Thanks — Sushil reads every note personally.</p>
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-display font-bold text-text-base">Send feedback</h3>
              <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-base transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-text-muted mb-4">Found a bug, have an idea, or just want to say hi? This goes directly to Sushil.</p>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-text-muted uppercase">Topic</label>
                <Select
                  value={category}
                  onChange={(e: any) => setCategory(e.target.value)}
                  options={[
                    { value: 'general', label: 'General' },
                    { value: 'bug', label: 'Bug report' },
                    { value: 'feature', label: 'Feature idea' },
                    { value: 'question', label: 'Question' },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-text-muted uppercase">Message</label>
                <textarea
                  value={message}
                  onChange={(e: any) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="Tell Sushil what's on your mind…"
                  className="w-full bg-elevated border border-text-base/10 rounded-xl px-4 py-2.5 text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all resize-none"
                />
              </div>
              <div className="space-y-2">
                <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.txt,.md,.csv,.log,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" onChange={pickFile} className="hidden" />
                {attachment ? (
                  <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-2">
                    {attachmentKind === 'image' && preview ? (
                      <img src={preview} alt="attachment preview" className="w-14 h-14 rounded-lg object-cover border border-text-base/10" />
                    ) : attachmentKind === 'video' && preview ? (
                      <video src={preview} className="w-14 h-14 rounded-lg object-cover border border-text-base/10" muted playsInline />
                    ) : (
                      <div className="w-14 h-14 rounded-lg border border-text-base/10 bg-text-base/5 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-accent" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-text-base truncate">{attachment?.name}</p>
                      <p className="text-[11px] text-text-muted">Will send with your feedback</p>
                    </div>
                    <button type="button" onClick={clearAttachment} className="p-2 text-text-muted hover:text-rose-400 transition-colors" title="Remove attachment">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-text-base/15 bg-text-base/5 px-4 py-3 text-sm text-text-muted hover:text-text-base hover:border-accent/40 transition-colors"
                  >
                    <Paperclip className="w-4 h-4" /> Attach a file or video
                  </button>
                )}
                <p className="text-[11px] text-text-muted/80">
                  Reporting a bug or something looks off? Attach a screenshot, video, or file — you can also paste one straight from your clipboard (Ctrl+V / ⌘V). (Up to 25MB.)
                </p>
              </div>
              <Button type="submit" disabled={sending || !message.trim()} className="w-full">
                {sending ? 'Sending…' : 'Send to Sushil'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// Owner portal: Sushil's cross-workspace view of usage + feedback
function fmtTokens(n: any): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${v}`;
}

function aiStatusOf(u: any) {
  if (!u) return { label: '—', cls: 'bg-text-base/5 text-text-muted' };
  if (u.ai_disabled === 1) return { label: 'AI disabled', cls: 'bg-rose-500/15 text-rose-400' };
  if (u.ai_timeout_until && new Date(String(u.ai_timeout_until).replace(' ', 'T') + 'Z').getTime() > Date.now())
    return { label: 'Timed out', cls: 'bg-amber-500/15 text-amber-400' };
  if (u.ai_daily_token_limit) return { label: `${fmtTokens(u.ai_daily_token_limit)}/day`, cls: 'bg-sky-500/15 text-sky-400' };
  return { label: 'AI ok', cls: 'bg-emerald-500/15 text-emerald-400' };
}

function loginChips(u: any) {
  const chips: string[] = [];
  if (u.google_id) chips.push('Google');
  if (u.discord_id) chips.push('Discord');
  if (u.github_id) chips.push('GitHub');
  return chips;
}

const FLAG_REASONS: Record<string, { label: string; cls: string }> = {
  'homework': { label: 'Homework-like', cls: 'bg-amber-500/15 text-amber-400' },
  'spam': { label: 'Spam burst', cls: 'bg-rose-500/15 text-rose-400' },
  'excessive-use': { label: 'Excessive use', cls: 'bg-orange-500/15 text-orange-400' },
};

const FLAG_STATUSES: Record<string, { label: string; cls: string }> = {
  'open': { label: 'Open', cls: 'bg-rose-500/15 text-rose-400' },
  'dismissed': { label: 'Dismissed', cls: 'bg-text-base/5 text-text-muted' },
  'warned': { label: 'Warned', cls: 'bg-amber-500/15 text-amber-400' },
  'timed_out': { label: 'Timed out', cls: 'bg-orange-500/15 text-orange-400' },
  'ai_disabled': { label: 'AI disabled', cls: 'bg-rose-500/20 text-rose-300' },
};

function OwnerView(_props: any) {
  const [tab, setTab] = useState<'overview' | 'users' | 'ai' | 'flags' | 'feedback'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [aiOverview, setAiOverview] = useState<any>(null);
  const [flags, setFlags] = useState<any[]>([]);
  const [flagFilter, setFlagFilter] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [o, f, u, a, fl] = await Promise.all([
        apiFetch('/api/owner/overview').then(r => r.json()),
        apiFetch('/api/owner/feedback').then(r => r.json()),
        apiFetch('/api/owner/users').then(r => r.json()),
        apiFetch(aiOverviewUrl()).then(r => r.json()),
        apiFetch('/api/owner/ai-flags').then(r => r.json()),
      ]);
      setOverview(o);
      setFeedback(Array.isArray(f) ? f : []);
      setUsers(Array.isArray(u) ? u : []);
      setAiOverview(a);
      setFlags(Array.isArray(fl) ? fl : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadAll(); }, []);

  const reloadFlags = async (filter: 'open' | 'all' = flagFilter) => {
    const r = await apiFetch(`/api/owner/ai-flags?status=${filter}`);
    if (r.ok) setFlags(await r.json());
  };
  const reloadUsers = async () => {
    const r = await apiFetch('/api/owner/users');
    if (r.ok) setUsers(await r.json());
  };
  const reloadAi = async () => {
    const r = await apiFetch(aiOverviewUrl());
    if (r.ok) setAiOverview(await r.json());
  };
  // The owner's timezone drives "today" and the daily history server-side.
  // Defined after loadAll/reloadAi (function hoisting keeps both working).
  function aiOverviewUrl() {
    let tz = 'America/New_York';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* default */ }
    return `/api/owner/ai-overview?tz=${encodeURIComponent(tz)}`;
  }
  // Fresh numbers every time the AI Control tab opens.
  useEffect(() => { if (tab === 'ai') reloadAi(); }, [tab]);

  const setFeedbackStatus = async (id: number, status: 'new' | 'resolved') => {
    const res = await apiFetch(`/api/owner/feedback/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      // Resolved feedback is deleted server-side (user gets notified), so drop it from the list.
      if (status === 'resolved') setFeedback(feedback.filter(f => f.id !== id));
      else setFeedback(feedback.map(f => f.id === id ? { ...f, status } : f));
    }
  };

  const handleFlagAction = async (id: number, action: string, note: string, timeoutHours?: number) => {
    const r = await apiFetch(`/api/owner/ai-flags/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note, timeoutHours })
    });
    if (r.ok) {
      notify(action === 'dismiss' ? 'Flag dismissed' : action === 'warn' ? 'Warning recorded' : action === 'timeout' ? 'AI timed out for user' : 'AI disabled for user', 'success');
      reloadFlags(); reloadUsers(); reloadAi();
    } else {
      notify('Action failed', 'error');
    }
  };

  const quickDeleteUser = async (u: any) => {
    const ok = await confirmDialog({
      title: 'Delete user',
      message: `Remove ${u.name} (${u.email}) from ${u.team_name || 'their team'}? Their private AI chats and usage history go with them. This can't be undone.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    const r = await apiFetch(`/api/owner/users/${u.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { notify(j.error || 'Delete failed', 'error'); return; }
    notify('User deleted', 'success');
    reloadUsers(); reloadAi(); reloadFlags();
  };

  const totals = overview?.totals || {};
  const openFlagCount = aiOverview?.flags?.open || 0;
  const statCards = [
    { label: 'Workspaces', value: totals.teams || 0, icon: Users },
    { label: 'Users', value: totals.users || 0, icon: UserCircle },
    { label: 'AI msgs today', value: aiOverview?.today?.messages || 0, icon: Zap },
    { label: 'Feedback notes', value: totals.feedback || 0, icon: MessageSquareHeart },
  ];

  const teams = Array.from(new Set(users.map(u => u.team_name).filter(Boolean))).sort() as string[];
  const filteredUsers = users.filter(u => {
    if (teamFilter !== 'all' && u.team_name !== teamFilter) return false;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: 'Users' },
    { id: 'ai', label: 'AI Control' },
    { id: 'flags', label: `Flags${openFlagCount > 0 ? ` (${openFlagCount})` : ''}` },
    { id: 'feedback', label: `Feedback${totals.new_feedback > 0 ? ` (${totals.new_feedback})` : ''}` },
  ] as const;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-text-base flex items-center gap-2">
          <Crown className="w-5 h-5 text-accent" /> Owner Portal
        </h3>
        <p className="text-sm text-text-muted mt-1">Your private command center — every workspace, user, AI flag, and feedback note in one place.</p>
      </div>

      <div className="flex gap-1 sm:gap-2 p-1 bg-text-base/5 rounded-xl border border-text-base/10 w-full sm:w-fit overflow-x-auto custom-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={cn("px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap capitalize", tab === t.id ? "bg-accent text-accent-ink shadow-lg" : "text-text-muted hover:text-text-base")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card><p className="text-sm text-text-muted text-center py-8">Loading…</p></Card>
      ) : tab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {statCards.map((c) => (
              <Card key={c.label} className="!p-4 !gap-2">
                <c.icon className="w-5 h-5 text-accent" />
                <p className="text-2xl font-display font-bold text-text-base">{c.value}</p>
                <p className="text-xs text-text-muted">{c.label}</p>
              </Card>
            ))}
          </div>
          <Card title="Workspaces" subtitle="Every team on Control Point and how active each one is">
            <div className="space-y-2">
              {(overview?.teams || []).map((t: any) => (
                <div key={t.id} className="glass rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text-base truncate">{t.name}</p>
                    <p className="text-[11px] text-text-muted">Code {t.access_code}{t.number ? ` · #${t.number}` : ''}</p>
                  </div>
                  <div className="flex gap-4 text-xs text-text-muted ml-auto">
                    <span><b className="text-text-base">{t.member_count}</b> members</span>
                    <span><b className="text-text-base">{t.message_count}</b> messages</span>
                    <span><b className="text-text-base">{t.task_count}</b> tasks</span>
                    <span><b className="text-text-base">{t.feedback_count}</b> feedback</span>
                  </div>
                </div>
              ))}
              {(overview?.teams || []).length === 0 && (
                <p className="text-sm text-text-muted text-center py-6">No workspaces yet.</p>
              )}
            </div>
          </Card>
        </>
      ) : tab === 'users' ? (
        <Card title="Users" subtitle={`${filteredUsers.length} shown — click Manage for AI controls, warnings, and deletion`}>
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search name or email…"
                className="w-full bg-text-base/5 border border-text-base/10 rounded-xl pl-9 pr-3 py-2 text-sm text-text-base placeholder:text-text-muted focus:outline-none focus:border-accent/50"
              />
            </div>
            <ThemedSelect
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="bg-text-base/5 border border-text-base/10 rounded-xl px-3 py-2 text-sm text-text-base focus:outline-none"
            >
              <option value="all">All teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </ThemedSelect>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {filteredUsers.map((u: any) => {
              const st = aiStatusOf(u);
              return (
                <div key={u.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-text-base/5">
                  <Avatar user={u} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-text-base truncate flex items-center gap-2">
                      {u.name}
                      {u.flags_open > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400">{u.flags_open} flag{u.flags_open > 1 ? 's' : ''}</span>
                      )}
                      {u.warnings > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{u.warnings} warn</span>
                      )}
                    </p>
                    <p className="text-[11px] text-text-muted truncate">
                      {u.email}{u.team_name ? ` · ${u.team_name}` : ''} · {u.account_type}
                      {u.tokens_7d > 0 ? ` · ${fmtTokens(u.tokens_7d)} tokens / 7d` : ''}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full whitespace-nowrap hidden sm:inline-block", st.cls)}>{st.label}</span>
                  <Button variant="secondary" size="sm" className="!text-xs" onClick={() => setSelectedId(u.id)}>Manage</Button>
                  <button
                    onClick={() => quickDeleteUser(u)}
                    title="Delete user"
                    className="p-2 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <p className="text-sm text-text-muted text-center py-6">No users match.</p>
            )}
          </div>
        </Card>
      ) : tab === 'ai' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="!p-4 !gap-2">
              <Zap className="w-5 h-5 text-accent" />
              <p className="text-2xl font-display font-bold text-text-base">{aiOverview?.today?.messages || 0}</p>
              <p className="text-xs text-text-muted">AI messages today</p>
            </Card>
            <Card className="!p-4 !gap-2">
              <MessageSquare className="w-5 h-5 text-accent" />
              <p className="text-2xl font-display font-bold text-text-base">{fmtTokens(aiOverview?.today?.tokens || 0)}</p>
              <p className="text-xs text-text-muted">Tokens today</p>
            </Card>
            <Card className="!p-4 !gap-2">
              <Users className="w-5 h-5 text-accent" />
              <p className="text-2xl font-display font-bold text-text-base">{aiOverview?.today?.users || 0}</p>
              <p className="text-xs text-text-muted">People used AI today</p>
            </Card>
            <Card className="!p-4 !gap-2">
              <Flag className="w-5 h-5 text-rose-400" />
              <p className="text-2xl font-display font-bold text-text-base">{openFlagCount}</p>
              <p className="text-xs text-text-muted">Open misuse flags</p>
            </Card>
          </div>
          {(aiOverview?.providers || []).length > 0 && (
            <p className="text-xs text-text-muted">
              Today's providers:{' '}
              {(aiOverview.providers || []).map((p: any) => `${p.provider} · ${p.messages} msgs`).join('  |  ')}
            </p>
          )}
          <Card title="Usage — last 14 days" subtitle="Messages per day (bars) · tokens (line). Hover any day for detail.">
            {(aiOverview?.daily || []).length > 0 ? (
              <Suspense fallback={<ChartLoadingFallback label="Loading chart…" />}>
                <AiUsageChart daily={aiOverview.daily} />
              </Suspense>
            ) : (
              <p className="text-sm text-text-muted text-center py-8">No AI usage in the last 14 days.</p>
            )}
          </Card>
          <Card title="Heaviest AI users" subtitle="Last 7 days by tokens — spot runaway usage at a glance">
            <div className="space-y-1">
              {(aiOverview?.top || []).map((t: any, i: number) => (
                <div key={t.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-text-base/5">
                  <span className="text-xs font-bold text-text-muted w-5 text-center">{i + 1}</span>
                  <Avatar user={t} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-text-base truncate">{t.name}</p>
                    <p className="text-[11px] text-text-muted truncate">{t.email}{t.team_name ? ` · ${t.team_name}` : ''}</p>
                  </div>
                  <div className="text-right text-xs text-text-muted flex-shrink-0">
                    <p><b className="text-text-base">{fmtTokens(t.tokens)}</b> tokens</p>
                    <p>{t.messages} messages</p>
                  </div>
                  <Button variant="secondary" size="sm" className="!text-xs" onClick={() => setSelectedId(t.id)}>Manage</Button>
                </div>
              ))}
              {(aiOverview?.top || []).length === 0 && (
                <p className="text-sm text-text-muted text-center py-6">No AI usage in the last 7 days.</p>
              )}
            </div>
          </Card>
          <Card title="How flagging works" subtitle="Automatic misuse detection">
            <ul className="text-sm text-text-muted space-y-1.5 list-disc pl-5">
              <li><b className="text-text-base">Homework-like</b> — messages matching homework/essay/quiz patterns get flagged for your review.</li>
              <li><b className="text-text-base">Spam burst</b> — 12+ AI messages within 10 minutes.</li>
              <li><b className="text-text-base">Excessive use</b> — 80+ AI messages in a day.</li>
              <li>Flags never block anyone by themselves — you decide: dismiss, warn, time out, or disable AI.</li>
            </ul>
          </Card>
        </>
      ) : tab === 'flags' ? (
        <div className="space-y-3">
          <div className="flex gap-1 p-1 bg-text-base/5 rounded-xl border border-text-base/10 w-fit">
            {(['open', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFlagFilter(f); reloadFlags(f); }}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all", flagFilter === f ? "bg-accent text-accent-ink" : "text-text-muted hover:text-text-base")}
              >
                {f}
              </button>
            ))}
          </div>
          {flags.length === 0 && (
            <Card><p className="text-sm text-text-muted text-center py-8">No {flagFilter === 'open' ? 'open ' : ''}flags. Quiet on the AI front.</p></Card>
          )}
          {flags.map((f: any) => (
            <FlagCard key={f.id} flag={f} onAction={handleFlagAction} onManageUser={(id: number) => setSelectedId(id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {feedback.length === 0 && <Card><p className="text-sm text-text-muted text-center py-8">No feedback yet.</p></Card>}
          {feedback.map((f: any) => (
            <Card key={f.id} className="!p-4 !gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent/15 text-accent">{f.category}</span>
                    <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full", f.status === 'new' ? "bg-emerald-500/15 text-emerald-400" : "bg-text-base/5 text-text-muted")}>{f.status}</span>
                  </div>
                  <p className="text-sm text-text-base whitespace-pre-wrap">{f.message}</p>
                  {f.screenshot_url && (
                    <div className="mt-2">
                      {((f.attachment_type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(f.screenshot_url)) ? (
                        <video src={f.screenshot_url} controls className="max-h-48 rounded-lg border border-text-base/10" />
                      ) : ((f.attachment_type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.screenshot_url)) ? (
                        <a href={f.screenshot_url} target="_blank" rel="noreferrer" className="block">
                          <img src={f.screenshot_url} alt="feedback attachment" className="max-h-40 rounded-lg border border-text-base/10 object-contain hover:border-accent/40 transition-colors" />
                        </a>
                      ) : (
                        <a href={f.screenshot_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-text-base/10 bg-text-base/5 px-3 py-2 text-xs text-text-base hover:border-accent/40 transition-colors">
                          <FileText className="w-4 h-4 text-accent" />
                          <span className="max-w-48 truncate">{f.attachment_name || 'Download attachment'}</span>
                        </a>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] text-text-muted mt-2">{f.user_name} · {f.user_email}{f.team_name ? ` · ${f.team_name}` : ''} · {f.created_at ? format(new Date(f.created_at), 'MMM d, yyyy h:mm a') : ''}</p>
                </div>
                <Button
                  variant="secondary"
                  className="!px-3 !py-1.5 !text-xs flex-shrink-0"
                  onClick={() => setFeedbackStatus(f.id, f.status === 'new' ? 'resolved' : 'new')}
                >
                  {f.status === 'new' ? 'Resolve' : 'Reopen'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedId !== null && (
        <OwnerUserDrawer
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => { reloadUsers(); reloadAi(); reloadFlags(); }}
          teams={overview?.teams || []}
        />
      )}
    </div>
  );
}

function FlagCard({ flag, onAction, onManageUser }: { flag: any; onAction: (id: number, action: string, note: string, timeoutHours?: number) => Promise<void>; onManageUser: (id: number) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const reason = FLAG_REASONS[flag.reason] || { label: flag.reason, cls: 'bg-text-base/5 text-text-muted' };
  const status = FLAG_STATUSES[flag.status] || { label: flag.status, cls: 'bg-text-base/5 text-text-muted' };

  const run = async (action: string, timeoutHours?: number) => {
    setBusy(true);
    try { await onAction(flag.id, action, note, timeoutHours); }
    finally { setBusy(false); }
  };

  return (
    <Card className="!p-4 !gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full", reason.cls)}>{reason.label}</span>
        <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full", status.cls)}>{status.label}</span>
        <span className="text-[11px] text-text-muted ml-auto">{flag.created_at ? format(new Date(flag.created_at), 'MMM d, h:mm a') : ''}</span>
      </div>
      <div className="flex items-center gap-2">
        <Avatar user={{ name: flag.user_name, email: flag.user_email }} size="sm" />
        <div className="min-w-0">
          <button onClick={() => flag.member_id && onManageUser(flag.member_id)} className="text-sm font-bold text-text-base truncate hover:text-accent transition-colors text-left">
            {flag.user_name || 'Unknown user'}
          </button>
          <p className="text-[11px] text-text-muted truncate">{flag.user_email}{flag.team_name ? ` · ${flag.team_name}` : ''}</p>
        </div>
      </div>
      <p className="text-sm text-text-base/90 bg-text-base/5 border border-text-base/10 rounded-xl px-3 py-2 whitespace-pre-wrap">“{flag.excerpt}”</p>
      {flag.reviewer_note && (
        <p className="text-[11px] text-text-muted">Your note: {flag.reviewer_note}</p>
      )}
      {flag.status === 'open' && (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional — recorded with warn/timeout/disable)…"
            className="w-full bg-text-base/5 border border-text-base/10 rounded-xl px-3 py-2 text-sm text-text-base placeholder:text-text-muted focus:outline-none focus:border-accent/50"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="!text-xs" disabled={busy} onClick={() => run('dismiss')}>Dismiss</Button>
            <Button variant="secondary" size="sm" className="!text-xs !border-amber-500/40 !text-amber-400" disabled={busy} onClick={() => run('warn')}>
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Warn
            </Button>
            <Button variant="secondary" size="sm" className="!text-xs !border-orange-500/40 !text-orange-400" disabled={busy} onClick={() => run('timeout', 24)}>
              <Timer className="w-3.5 h-3.5 mr-1" /> Timeout 24h
            </Button>
            <Button variant="secondary" size="sm" className="!text-xs !border-rose-500/40 !text-rose-400" disabled={busy} onClick={() => run('disable')}>
              <Ban className="w-3.5 h-3.5 mr-1" /> Disable AI
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function OwnerUserDrawer({ userId, onClose, onChanged, teams }: { userId: number; onClose: () => void; onChanged: () => void; teams: any[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dailyLimit, setDailyLimit] = useState('');
  const [replyMax, setReplyMax] = useState('');
  const [warnNote, setWarnNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [moveTeamId, setMoveTeamId] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/owner/users/${userId}`);
      if (r.ok) {
        const d = await r.json();
        setData(d);
        setDailyLimit(d.user.ai_daily_token_limit ? String(d.user.ai_daily_token_limit) : '');
        setReplyMax(d.user.ai_max_tokens_reply ? String(d.user.ai_max_tokens_reply) : '');
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [userId]);

  const patchAi = async (body: any, msg = 'AI controls updated') => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/owner/users/${userId}/ai`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { notify(j.error || 'Update failed', 'error'); return; }
      notify(msg, 'success');
      await load(); onChanged();
    } finally { setBusy(false); }
  };

  const doWarn = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/owner/users/${userId}/warn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: warnNote }),
      });
      if (!r.ok) { notify('Warn failed', 'error'); return; }
      notify('Warning recorded', 'success');
      setWarnNote('');
      await load(); onChanged();
    } finally { setBusy(false); }
  };

  const doMoveUser = async () => {
    const u = data?.user;
    const dest = (teams || []).find((t: any) => String(t.id) === String(moveTeamId));
    if (!dest) { notify('Pick a workspace first', 'error'); return; }
    const ok = await confirmDialog({
      title: 'Move user',
      message: `Move ${u?.name} (${u?.email}) from ${u?.team_name || 'their team'} to ${dest.name}? They'll lose their current roles and be signed out. They won't be notified.`,
      confirmLabel: 'Move',
    });
    if (!ok) return;
    setMoving(true);
    setMoveError('');
    try {
      const r = await apiFetch(`/api/owner/users/${userId}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: dest.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j.error || `Move failed (HTTP ${r.status})`;
        setMoveError(msg);
        notify(msg, 'error');
        return;
      }
      notify(`Moved to ${dest.name}`, 'success');
      setMoveTeamId('');
      await load(); onChanged();
    } catch (e: any) {
      const msg = e?.message?.includes('fetch') || e?.name === 'TypeError'
        ? 'Network error — check your connection and try again.'
        : (e?.message || 'Move failed unexpectedly.');
      setMoveError(msg);
      notify(msg, 'error');
    } finally { setMoving(false); }
  };

  const doDeleteMembership = async () => {
    const u = data?.user;
    const ok = await confirmDialog({
      title: 'Delete user',
      message: `Remove ${u?.name} (${u?.email}) from ${u?.team_name || 'their team'}? Sessions, private AI chats, and usage history are removed too. This can't be undone.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    const r = await apiFetch(`/api/owner/users/${userId}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { notify(j.error || 'Delete failed', 'error'); return; }
    notify('User deleted', 'success');
    onClose(); onChanged();
  };

  const doDeleteAccount = async () => {
    const u = data?.user;
    const teams = (data?.siblings?.length || 0) + 1;
    const ok = await confirmDialog({
      title: 'Delete entire account',
      message: `Delete EVERYTHING for ${u?.email} across ${teams} team${teams > 1 ? 's' : ''}? This can't be undone.`,
      confirmLabel: 'Delete everything', danger: true,
    });
    if (!ok) return;
    const r = await apiFetch(`/api/owner/accounts?email=${encodeURIComponent(u.email)}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { notify(j.error || 'Delete failed', 'error'); return; }
    if (j.skipped?.length) notify(`Deleted ${j.deleted.length}, skipped ${j.skipped.length} (see console)`, 'info');
    else notify(`Account deleted (${j.deleted.length} membership${j.deleted.length === 1 ? '' : 's'})`, 'success');
    onClose(); onChanged();
  };

  const u = data?.user;
  const st = aiStatusOf(u);
  const usage = (data?.usage14 || []) as any[];
  const maxT = Math.max(1, ...usage.map((d: any) => Number(d.tokens) || 0));
  const chips = u ? loginChips(u) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-[#0b0b0d] border-l border-text-base/10 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-display font-bold text-text-base">Manage user</h4>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-text-base/10 text-text-muted hover:text-text-base transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading || !u ? (
          <p className="text-sm text-text-muted text-center py-8">Loading…</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Avatar user={u} size="md" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-text-base truncate">{u.name}</p>
                <p className="text-xs text-text-muted truncate">{u.email}</p>
                <p className="text-xs text-text-muted">{u.team_name || 'No team'} · {u.role} · {u.account_type}</p>
              </div>
              <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full whitespace-nowrap", st.cls)}>{st.label}</span>
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <span key={c} className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-text-base/5 text-text-muted">via {c}</span>
                ))}
                {(data?.siblings?.length || 0) > 0 && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-text-base/5 text-text-muted">
                    {data.siblings.length + 1} teams total
                  </span>
                )}
              </div>
            )}

            <Card title="AI access" subtitle="Kill switch, timeouts, and token budgets" className="!gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-text-base">AI enabled</p>
                  <p className="text-[11px] text-text-muted">Turn off to block all Bruno / NavGPT replies</p>
                </div>
                <Switch
                  checked={u.ai_disabled !== 1}
                  onChange={(next) => patchAi({ ai_disabled: !next }, next ? 'AI re-enabled' : 'AI disabled for user')}
                  label={`AI enabled for ${u.name || u.email || 'user'}`}
                  disabled={busy}
                  onClassName="bg-emerald-500"
                />
              </div>

              <div>
                <p className="text-sm font-bold text-text-base mb-1.5">Timeout AI</p>
                <div className="flex flex-wrap gap-2">
                  {[{ l: '1 hour', h: 1 }, { l: '24 hours', h: 24 }, { l: '7 days', h: 168 }].map((t) => (
                    <Button key={t.l} variant="secondary" size="sm" className="!text-xs" disabled={busy} onClick={() => patchAi({ timeoutHours: t.h }, `AI paused for ${t.l}`)}>
                      <Timer className="w-3.5 h-3.5 mr-1" /> {t.l}
                    </Button>
                  ))}
                  {u.ai_timeout_until && new Date(String(u.ai_timeout_until).replace(' ', 'T') + 'Z').getTime() > Date.now() && (
                    <Button variant="secondary" size="sm" className="!text-xs" disabled={busy} onClick={() => patchAi({ ai_timeout_until: null }, 'Timeout cleared')}>
                      Clear timeout
                    </Button>
                  )}
                </div>
                {u.ai_timeout_until && new Date(String(u.ai_timeout_until).replace(' ', 'T') + 'Z').getTime() > Date.now() && (
                  <p className="text-[11px] text-amber-400 mt-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Paused until {format(new Date(String(u.ai_timeout_until).replace(' ', 'T') + 'Z'), 'MMM d, h:mm a')}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <p className="text-xs font-bold text-text-base mb-1">Daily token limit</p>
                  <div className="flex gap-1.5">
                    <input
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Unlimited"
                      inputMode="numeric"
                      className="w-full bg-text-base/5 border border-text-base/10 rounded-xl px-3 py-1.5 text-sm text-text-base placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                    />
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => patchAi({ ai_daily_token_limit: dailyLimit || null }, 'Daily limit saved')}>Set</Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-text-base mb-1">Max tokens / reply</p>
                  <div className="flex gap-1.5">
                    <input
                      value={replyMax}
                      onChange={(e) => setReplyMax(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Default"
                      inputMode="numeric"
                      className="w-full bg-text-base/5 border border-text-base/10 rounded-xl px-3 py-1.5 text-sm text-text-base placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                    />
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => patchAi({ ai_max_tokens_reply: replyMax || null }, 'Reply cap saved')}>Set</Button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-text-muted">Blank = no limit. Limits apply to Bruno / NavGPT chat; blocked users see your message in the chat.</p>
            </Card>

            <Card title="Warn user" subtitle="Warnings are logged and visible here" className="!gap-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={warnNote}
                  onChange={(e) => setWarnNote(e.target.value)}
                  placeholder="Reason for the warning…"
                  className="flex-1 min-w-0 bg-text-base/5 border border-text-base/10 rounded-xl px-3 py-2 text-sm text-text-base placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                />
                <Button variant="secondary" size="sm" disabled={busy} onClick={doWarn} className="sm:w-auto w-full">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Warn
                </Button>
              </div>
              {(data?.warnings || []).length > 0 && (
                <div className="space-y-1.5 mt-1">
                  {(data.warnings as any[]).map((w: any) => (
                    <div key={w.id} className="text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                      <p className="text-amber-200">{w.note || 'Warning issued'}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">{w.created_at ? format(new Date(w.created_at), 'MMM d, yyyy h:mm a') : ''}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="AI usage" subtitle="Last 14 days">
              {usage.length === 0 ? (
                <p className="text-xs text-text-muted">No AI usage recorded.</p>
              ) : (
                <div className="flex items-end gap-1 h-24">
                  {usage.map((d: any) => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.day}: ${d.messages} messages, ${fmtTokens(d.tokens)} tokens`}>
                      <div className="w-full bg-accent/70 rounded-sm" style={{ height: `${Math.max(4, (Number(d.tokens) / maxT) * 80)}px` }} />
                      <span className="text-[8px] text-text-muted">{String(d.day).slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {(data?.flags || []).length > 0 && (
              <Card title="Flag history" subtitle="Misuse flags for this user" className="!gap-2">
                {(data.flags as any[]).map((f: any) => {
                  const rs = FLAG_STATUSES[f.status] || { label: f.status, cls: 'bg-text-base/5 text-text-muted' };
                  const rr = FLAG_REASONS[f.reason] || { label: f.reason, cls: 'bg-text-base/5 text-text-muted' };
                  return (
                    <div key={f.id} className="text-xs bg-text-base/5 border border-text-base/10 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={cn("text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full", rr.cls)}>{rr.label}</span>
                        <span className={cn("text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full", rs.cls)}>{rs.label}</span>
                        <span className="text-[10px] text-text-muted ml-auto">{f.created_at ? format(new Date(f.created_at), 'MMM d') : ''}</span>
                      </div>
                      <p className="text-text-base/80 line-clamp-2">“{f.excerpt}”</p>
                    </div>
                  );
                })}
              </Card>
            )}

            <Card title="Move workspace" subtitle="Silent — the user is not notified" className="!gap-3">
              <p className="text-xs text-text-muted leading-relaxed">
                Currently in <span className="text-text-base font-bold">{u.team_name || 'no workspace'}</span>.
                Moving clears their roles and signs them out of all sessions.
              </p>
              <div className="flex gap-2">
                <ThemedSelect
                  value={moveTeamId}
                  onChange={(e) => { setMoveTeamId(e.target.value); setMoveError(''); }}
                  disabled={moving || busy}
                  className="flex-1 min-w-0 bg-text-base/[0.04] border border-text-base/10 rounded-xl px-3 py-2.5 text-sm text-text-base focus:outline-none focus:border-accent/50 disabled:opacity-50"
                >
                  <option value="">Pick a workspace…</option>
                  {(teams || [])
                    .filter((t: any) => t.id !== u.team_id)
                    .map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}{t.number ? ` (${t.number})` : ''}</option>
                    ))}
                </ThemedSelect>
                <Button variant="secondary" size="sm" className="!text-xs whitespace-nowrap" disabled={moving || busy || !moveTeamId} onClick={doMoveUser}>
                  {moving ? 'Moving…' : 'Move'}
                </Button>
              </div>
              {moveError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2" role="alert">
                  {moveError}
                </p>
              )}
            </Card>

            <Card title="Danger zone" subtitle="Irreversible" className="!gap-2 !border-rose-500/20">
              <Button variant="secondary" size="sm" className="w-full !text-xs !border-rose-500/40 !text-rose-400" disabled={busy} onClick={doDeleteMembership}>
                <UserX className="w-3.5 h-3.5 mr-1" /> Remove from {u.team_name || 'team'}
              </Button>
              <Button variant="secondary" size="sm" className="w-full !text-xs !border-rose-500/40 !text-rose-400" disabled={busy} onClick={doDeleteAccount}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete entire account ({(data?.siblings?.length || 0) + 1} team{(data?.siblings?.length || 0) + 1 > 1 ? 's' : ''})
              </Button>
              <p className="text-[11px] text-text-muted">Deleting the account removes every membership under {u.email}. You can't delete your own owner account or a team's last admin.</p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function AccountManager({ currentUser }: any) {
  const hasPassword = !!currentUser?.hasPassword;

  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [exporting, setExporting] = useState(false);

  const changePassword = async () => {
    setPwMsg(null);
    if (nw !== nw2) { setPwMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    if (nw.length < 6) { setPwMsg({ ok: false, text: 'New password must be at least 6 characters.' }); return; }
    setPwBusy(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPwMsg({ ok: true, text: 'Password changed. Other devices were signed out.' });
        setCur(''); setNw(''); setNw2('');
      } else {
        setPwMsg({ ok: false, text: data.error || 'Could not change password.' });
      }
    } finally {
      setPwBusy(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await apiFetch('/api/auth/export');
      if (!res.ok) { notify('Could not export your data.', 'error'); return; }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `control-point-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Security" icon={KeyRound} subtitle="Keep your sign-in safe">
        {hasPassword ? (
          <div className="space-y-3 max-w-sm">
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-muted uppercase">Current password</label>
              <Input type="password" value={cur} onChange={(e: any) => setCur(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-muted uppercase">New password</label>
              <Input type="password" value={nw} onChange={(e: any) => setNw(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-muted uppercase">Confirm new password</label>
              <Input type="password" value={nw2} onChange={(e: any) => setNw2(e.target.value)} autoComplete="new-password" />
            </div>
            {pwMsg && (
              <p className={cn("text-xs", pwMsg.ok ? "text-emerald-400" : "text-rose-400")}>{pwMsg.text}</p>
            )}
            <Button onClick={changePassword} disabled={pwBusy || !cur || !nw || !nw2}>
              {pwBusy ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            You sign in with Google, so there's no password here to change — manage it in your Google account instead.
          </p>
        )}
      </Card>

      <Card title="Your Data" icon={Download} subtitle="Take your data with you">
        <p className="text-sm text-text-muted mb-3">
          Download everything this app stores about you — your profile, attendance, messages, feedback, and notifications — as a JSON file.
        </p>
        <Button variant="secondary" onClick={exportData} disabled={exporting}>
          <Download className="w-4 h-4 mr-2" /> {exporting ? 'Preparing…' : 'Download my data'}
        </Button>
      </Card>

    </div>
  );
}

function ProfileView({ currentUser, onRefresh, refresh, setLoading, hasScope, setColorVersion }: any) {
  const [name, setName] = useState(currentUser?.name || '');
  const [role, setRole] = useState(currentUser?.role || '');
  const [accentColor, setAccentColor] = useState(currentUser?.accent_color || '');

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setRole(currentUser.role || '');
      setAccentColor(currentUser.accent_color || '');
    }
  }, [currentUser]);

  // Apply the accent change in real-time to the page. Branding is
  // accent-only — surfaces and text always follow the theme tokens.
  useEffect(() => {
    const root = document.documentElement;
    if (validHex(accentColor)) root.style.setProperty('--color-accent', accentColor.trim());
    else root.style.removeProperty('--color-accent');

    // Trigger re-render of all components to pick up new CSS variables
    setColorVersion((v) => v + 1);
  }, [accentColor, setColorVersion]);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify('Please choose an image file.', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { notify('Image must be under 2 MB.', 'error'); return; }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const sid = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null;
      const res = await fetch(apiUrl(`/api/profile/avatar${sid ? `?sessionId=${encodeURIComponent(sid)}` : ''}`), {
        method: 'POST',
        body: fd
      });
      if (res.ok) {
        await await refresh.members();
      } else {
        notify('Could not upload that picture.', 'error');
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: null })
      });
      if (res.ok) await refresh.members();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Self-service: anyone can update their own name, title, theme colors, and avatar
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role,
          accent_color: accentColor || null,
        })
      });
      if (res.ok) {
        await await refresh.members();
        notify('Profile updated successfully!', 'success');
      } else {
        notify('Could not save your profile.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetColors = () => {
    setAccentColor('');
  };

  const isAdmin = hasScope('admin');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-xl font-display font-bold text-text-base">My Profile</h3>
        <p className="text-sm text-text-muted mt-1">Your name and picture show up everywhere — chat, tasks, the team roster. Changes are visible to your whole team instantly.</p>
      </div>
      <Card title="Personal Information" icon={UserCircle}>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar user={currentUser} size="xl" />
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e: any) => handleAvatarFile(e.target.files?.[0])}
              />
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={avatarUploading}>
                {avatarUploading ? 'Uploading…' : currentUser?.avatar_url ? 'Change picture' : 'Add a picture'}
              </Button>
              {currentUser?.avatar_url && (
                <button onClick={removeAvatar} className="block text-xs text-text-muted hover:text-rose-400 transition-colors">
                  Remove picture
                </button>
              )}
              <p className="text-[11px] text-text-muted/70">Images up to 2 MB.</p>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-muted uppercase">Full Name</label>
            <Input value={name} onChange={(e: any) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-muted uppercase">Role / Description</label>
            <Input value={role} onChange={(e: any) => setRole(e.target.value)} />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-muted uppercase">Accent (Yellow)</label>
              <div className="flex gap-2">
                <input type="color" className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" value={accentColor || '#FFC700'} onChange={(e) => setAccentColor(e.target.value)} />
                <Input value={accentColor} onChange={(e: any) => setAccentColor(e.target.value)} placeholder="#FFC700" />
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                const res = await apiFetch('/api/theme/reset', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Could not reset theme');
                setAccentColor('');
                const root = document.documentElement;
                root.style.removeProperty('--color-accent');
                root.style.removeProperty('--color-primary');
                root.style.removeProperty('--color-text-base');
                setColorVersion((v: number) => v + 1);
                refresh.settings();
                notify('Theme reset to the default Volt & Carbon colors.', 'success');
              } catch (e: any) {
                notify(e.message || 'Could not reset theme', 'error');
              }
            }}
            className="text-xs text-text-muted hover:text-accent transition-colors self-start"
          >
            Reset to the default Volt &amp; Carbon theme
          </button>

          <div className="pt-2 flex flex-wrap gap-3">
            <Button onClick={handleSave}>Save Changes</Button>
            <Button variant="secondary" onClick={resetColors}>Reset to Team Default</Button>
          </div>
        </div>
      </Card>
      
      <Card title="Privacy" subtitle="Control what this app stores on your device">
        <button
          onClick={() => window.dispatchEvent(new Event('cp:cookie-settings'))}
          className="text-sm text-accent hover:underline self-start"
        >
          Cookie &amp; storage settings
        </button>
      </Card>

      <Card title="Account Details" className="opacity-70">
        <div className="space-y-2">
          <p className="text-sm text-text-muted">Email: <span className="text-text-base">{currentUser?.email}</span></p>
          <p className="text-sm text-text-muted">Account Type: <span className="text-accent">{currentUser?.is_board ? 'Board Member' : 'Team Member'}</span></p>
          <p className="text-sm text-text-muted">Administrative Scopes: <span className="text-text-base">
            {(() => {
              try {
                let scopes = currentUser?.scopes;
                while (typeof scopes === 'string') {
                  const parsed = JSON.parse(scopes);
                  if (typeof parsed === 'string') scopes = parsed;
                  else { scopes = parsed; break; }
                }
                return Array.isArray(scopes) && scopes.length > 0 ? scopes.join(', ') : 'None';
              } catch {
                return 'None';
              }
            })()}
          </span></p>
        </div>
      </Card>

      <AccountManager currentUser={currentUser} />
    </div>
  );
}

function GoogleCalendarSettings({ settings, isAdmin, onRefresh }: any) {
  const [link, setLink] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncOn, setSyncOn] = useState(settings?.google_calendar_sync === '1');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/calendar/link');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setLink(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setSyncOn(settings?.google_calendar_sync === '1'); }, [settings?.google_calendar_sync]);

  // Handle OAuth return flags
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('cal_linked') === '1') {
      notify('Google Calendar linked!', 'success');
      window.history.replaceState({}, '', window.location.pathname);
      load();
    } else if (params.get('cal_error')) {
      notify('Could not link Google Calendar — try again.', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const unlink = async () => {
    if (!(await confirmDialog({ title: 'Unlink Google Calendar?', message: 'Team events will no longer sync to your personal calendar.', confirmLabel: 'Unlink' }))) return;
    const res = await apiFetch('/api/calendar/link', { method: 'DELETE' });
    if (res.ok) { notify('Google Calendar unlinked', 'success'); load(); }
    else notify('Could not unlink — try again.', 'error');
  };

  const toggleSync = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'google_calendar_sync', value: syncOn ? '0' : '1' }),
      });
      if (res.ok) {
        setSyncOn(!syncOn);
        notify(syncOn ? 'Team calendar sync turned off' : 'Team calendar sync turned on — new events will push to linked calendars', 'success');
        onRefresh?.();
      } else notify('Could not save setting', 'error');
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-base">Personal calendar link</p>
          <p className="text-xs text-text-muted mt-0.5">
            {link?.linked
              ? `Linked as ${link.google_email || 'your Google account'}`
              : 'Link your Google account to receive team events on your personal calendar.'}
          </p>
        </div>
        {link?.linked ? (
          <Button variant="secondary" onClick={unlink} className="shrink-0">Unlink</Button>
        ) : (
          <a href="/api/auth/google/calendar" className="shrink-0">
            <Button className="w-full sm:w-auto">Link Google Calendar</Button>
          </a>
        )}
      </div>
      {isAdmin && (
        <div className="flex items-start gap-3 pt-3 border-t border-text-base/10">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              role="switch"
              aria-checked={syncOn}
              onClick={toggleSync}
              disabled={saving}
              className={cn("w-11 h-6 rounded-full transition-colors shrink-0", syncOn ? "bg-accent" : "bg-text-base/15")}
            >
              <span className={cn("block w-5 h-5 rounded-full bg-white shadow transition-transform mt-0.5", syncOn ? "translate-x-5 ml-0.5" : "translate-x-0.5")} />
            </button>
            <span>
              <span className="text-sm font-semibold text-text-base block">Sync team events to members' calendars</span>
              <span className="text-xs text-text-muted block mt-0.5">
                When on, meetings, league meets, and other team events automatically appear on every linked member's personal Google Calendar.
              </span>
            </span>
          </label>
        </div>
      )}
      {!link?.team_sync_enabled && link?.linked && (
        <p className="text-xs text-text-muted/70">Team sync is currently off — your admin can turn it on anytime.</p>
      )}
    </div>
  );
}

function SettingsView({ settings, members, teams, onRefresh, refresh, currentUser, navGptQualified, navGptActive, isOwner, hasPerm }: any) {
  const voice = useVoice();
  const [criteria, setCriteria] = useState(settings.excuse_criteria || '');
  const [maxTokensNews, setMaxTokensNews] = useState(settings.max_tokens_news || '1024');
  const [maxTokensAttendance, setMaxTokensAttendance] = useState(settings.max_tokens_attendance || '1024');
  const [maxTokensExcuse, setMaxTokensExcuse] = useState(settings.max_tokens_excuse || '512');
  const [maxTokensSummary, setMaxTokensSummary] = useState(settings.max_tokens_summary || '1024');
  const [maxTokensChat, setMaxTokensChat] = useState(settings.max_tokens_chat || '1024');
  const [chatProvider, setChatProvider] = useState(settings.chat_provider || 'hybrid');
  const [showMemberEdit, setShowMemberEdit] = useState<any>(null);

  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [allMessages, setAllMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [savingPersona, setSavingPersona] = useState(false);

  // Delete account — only enabled with zero team memberships
  const [showDelete, setShowDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [delBusy, setDelBusy] = useState(false);

  const deleteAccount = async () => {
    if (confirmEmail.trim().toLowerCase() !== (currentUser?.email || '').toLowerCase()) {
      notify('Type your email address exactly to confirm.', 'info');
      return;
    }
    if (!(await confirmDialog({ title: 'Delete account', message: 'This is permanent. Delete your account and all of your personal data?', confirmLabel: 'Delete my account', danger: true }))) return;
    setDelBusy(true);
    try {
      const res = await apiFetch('/api/auth/account', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('sessionId');
        window.location.reload();
      } else {
        notify(data.error || 'Could not delete your account.', 'error');
      }
    } finally {
      setDelBusy(false);
    }
  };

  const isPresident = currentUser?.role === 'President';

  // --- FTC team connection ---
  const myTeam = (teams || []).find((t: any) => t.id === currentUser?.team_id);
  const [ftcNumber, setFtcNumber] = useState('');
  const [ftcVerifying, setFtcVerifying] = useState(false);
  const [ftcVerified, setFtcVerified] = useState<any>(null);
  const [ftcError, setFtcError] = useState('');
  const [ftcSaving, setFtcSaving] = useState(false);

  useEffect(() => {
    if (myTeam?.ftc_team_number) setFtcNumber(String(myTeam.ftc_team_number));
  }, [myTeam?.ftc_team_number]);

  const verifyFtcNumber = async () => {
    const num = parseInt(ftcNumber, 10);
    if (!num || num <= 0) { setFtcError('Enter a valid team number'); return; }
    setFtcVerifying(true);
    setFtcError('');
    setFtcVerified(null);
    try {
      const res = await apiFetch(`/api/ftc/lookup?number=${num}`);
      const body = await res.json();
      if (!res.ok) { setFtcError(body?.error || 'Lookup failed'); return; }
      setFtcVerified(body);
    } catch {
      setFtcError('Could not reach FTC Scout — try again in a moment');
    } finally {
      setFtcVerifying(false);
    }
  };

  const saveFtcNumber = async (num: number | null) => {
    if (!myTeam?.id) return;
    setFtcSaving(true);
    try {
      const res = await apiFetch(`/api/teams/${myTeam.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ftc_team_number: num }),
      });
      if (!res.ok) { notify('Failed to save team number', 'error'); return; }
      setFtcVerified(null);
      if (num === null) setFtcNumber('');
      refresh.settings();
    } finally {
      setFtcSaving(false);
    }
  };

  const fetchStorageUsage = async () => {
    setLoadingStorage(true);
    try {
      const res = await apiFetch('/api/admin/storage-usage');
      const data = await res.json();
      setStorageUsage(data.totalSize);
    } catch (error) {
      console.error('Failed to fetch storage usage:', error);
    } finally {
      setLoadingStorage(false);
    }
  };

  const fetchAllMessages = async () => {
    setLoadingMessages(true);
    try {
      const res = await apiFetch('/api/messages');
      const data = await res.json();
      setAllMessages(data);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSilentDelete = async (messageId: number) => {
    if (await confirmDialog({ title: 'Delete message', message: 'Are you sure you want to permanently delete this message? This cannot be undone.', confirmLabel: 'Delete', danger: true })) {
      const removed = (allMessages || []).find((m: any) => m.id === messageId);
      setAllMessages((prev: any[]) => (prev || []).filter((m: any) => m.id !== messageId));
      try {
        const res = await apiFetch(`/api/messages/${messageId}?silent=true`, { method: 'DELETE' });
        if (res.ok) {
          notify('Message permanently deleted.', 'success');
        } else {
          throw new Error('delete failed');
        }
      } catch (error) {
        console.error('Delete error:', error);
        if (removed) setAllMessages((prev: any[]) => [...(prev || []), removed].sort((a: any, b: any) => (a.id || 0) - (b.id || 0)));
        notify('Failed to delete message.', 'error');
      }
    }
  };

  const handleUpdateMessage = async () => {
    if (!editingMessage) return;
    const prevContent = (allMessages || []).find((m: any) => m.id === editingMessage.id)?.content;
    setAllMessages((prev: any[]) => (prev || []).map((m: any) => m.id === editingMessage.id ? { ...m, content: editingMessage.content } : m));
    setEditingMessage(null);
    try {
      const res = await apiFetch(`/api/messages/${editingMessage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingMessage.content })
      });
      if (res.ok) {
        notify('Message updated.', 'success');
      } else {
        throw new Error('update failed');
      }
    } catch (error) {
      console.error('Update error:', error);
      setAllMessages((prev: any[]) => (prev || []).map((m: any) => m.id === editingMessage.id ? { ...m, content: prevContent } : m));
      notify('Failed to update message.', 'error');
    }
  };

  // Message moderation (silent edit/delete) needs manage_members on the server.
  const canModerateMessages = hasPerm ? hasPerm('manage_members') : false;
  useEffect(() => {
    fetchStorageUsage();
  }, []);
  // Load (or reload) the moderation list whenever the permission turns on.
  useEffect(() => {
    if (canModerateMessages) fetchAllMessages();
  }, [canModerateMessages]);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleSave = async () => {
    const payloads = [
      { key: 'excuse_criteria', value: criteria },
      // AI token limits are owner-only; non-owners never send them.
      ...(isOwner ? [
        { key: 'max_tokens_news', value: maxTokensNews },
        { key: 'max_tokens_attendance', value: maxTokensAttendance },
        { key: 'max_tokens_excuse', value: maxTokensExcuse },
        { key: 'max_tokens_summary', value: maxTokensSummary },
        { key: 'max_tokens_chat', value: maxTokensChat },
        { key: 'chat_provider', value: chatProvider },
      ] : []),
    ];

    for (const payload of payloads) {
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    refresh.settings();
    notify('Settings saved', 'success');
  };

  const updateMember = async (id: number, data: any) => {
    try {
      await apiFetch(`/api/members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      refresh.members();
      setShowMemberEdit(null);
    } catch {
      notify('Could not update member — try again.', 'error');
    }
  };

  // Right-click on a member row: call, copy ID, scopes, board status, remove.
  // (No friending/DMs — calls open a public team voice channel.)
  useContextMenu('member', (el) => {
    const id = Number(el.dataset.cmId);
    const m = (members || []).find((x: any) => x.id === id);
    if (!m) return null;
    return memberMenuItems({
      m,
      isSelf: m.id === currentUser?.id,
      canCall: true,
      onCall: (memberId, media) => voice.startCall([memberId], media),
      onEditScopes: () => setShowMemberEdit(m),
      onToggleBoard: () => updateMember(m.id, { ...m, is_board: m.is_board ? 0 : 1 }),
      onRemove: m.id !== currentUser?.id ? () => removeMemberFromTeam(m, refresh.members) : undefined,
    });
  });

  return (
    <div className="max-w-4xl space-y-8">
      <Card title="FTC Team Connection" icon={Trophy} subtitle="Link your FTC team number to pull live stats, OPR rankings, and event history">
        <div className="space-y-4">
          {myTeam?.ftc_team_number ? (
            <div className="flex flex-wrap items-center gap-3 p-4 bg-accent/10 border border-accent/30 rounded-2xl">
              <span className="bg-accent text-accent-ink font-display font-bold px-3 py-1 rounded-xl">#{myTeam.ftc_team_number}</span>
              <p className="text-sm text-text-base/80 flex-1">Connected — stats appear on the dashboard and Team Stats page.</p>
              <Button variant="danger" size="sm" onClick={async () => { if (await confirmDialog({ title: 'Disconnect FTC team', message: 'Disconnect the FTC team? Stats will be hidden.', confirmLabel: 'Disconnect', danger: true })) saveFtcNumber(null); }} disabled={ftcSaving}>
                Disconnect
              </Button>
            </div>
          ) : (
            <p className="text-sm text-text-muted">No FTC team connected yet.</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="number"
              placeholder="FTC team number (e.g. 4215)"
              value={ftcNumber}
              onChange={(e: any) => { setFtcNumber(e.target.value); setFtcVerified(null); setFtcError(''); }}
              className="sm:max-w-xs"
            />
            <Button variant="secondary" onClick={verifyFtcNumber} disabled={ftcVerifying || !ftcNumber}>
              {ftcVerifying ? 'Verifying…' : 'Verify'}
            </Button>
          </div>
          {ftcError && <p className="text-sm text-rose-400">{ftcError}</p>}
          {ftcVerified && (
            <div className="p-4 bg-text-base/5 border border-text-base/10 rounded-2xl space-y-2">
              <p className="text-text-base font-bold">Team {ftcVerified.number} — {ftcVerified.name}</p>
              <p className="text-xs text-text-muted">
                {[ftcVerified.schoolName, [ftcVerified.location?.city, ftcVerified.location?.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                {ftcVerified.rookieYear ? ` · Rookie ${ftcVerified.rookieYear}` : ''}
              </p>
              <Button onClick={() => saveFtcNumber(parseInt(ftcNumber, 10))} disabled={ftcSaving}>
                {ftcSaving ? 'Saving…' : `Connect team ${ftcVerified.number}`}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {typeof hasPerm === 'function' && hasPerm('manage_voice') && (
        <Card title="Voice & Calls" icon={PhoneCall} subtitle="Channel defaults, call features, and audio/video quality">
          <VoiceSettingsSection />
        </Card>
      )}

      {navGptQualified && (
        <Card title="Chatbot Persona" icon={Bot} subtitle="Who answers in the team chatbot">
          <div className="flex items-center gap-4">
            <Switch
              checked={!!navGptActive}
              label="NavGPT ❤️"
              disabled={savingPersona}
              onChange={async () => {
                if (savingPersona) return;
                if (navGptActive) {
                  const ok = await confirmDialog({
                    title: 'Turn off NavGPT ❤️?',
                    message: 'The team chatbot will go back to being Bruno — the normal persona. You can switch back to NavGPT ❤️ anytime.',
                    confirmLabel: 'Turn off',
                    cancelLabel: 'Keep NavGPT ❤️',
                    danger: true
                  });
                  if (!ok) return;
                }
                setSavingPersona(true);
                try {
                  const res = await apiFetch('/api/team/chat-persona', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: !navGptActive })
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Could not update persona');
                  notify(navGptActive ? 'NavGPT ❤️ is off — the chatbot is Bruno again.' : 'NavGPT ❤️ is on.', 'success');
                  refresh.teams();
                } catch (e: any) {
                  notify(e.message || 'Could not update persona', 'error');
                } finally {
                  setSavingPersona(false);
                }
              }}
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-base">NavGPT ❤️</p>
              <p className="text-xs text-text-muted leading-relaxed">
                {navGptActive
                  ? 'On — the chatbot answers as NavGPT ❤️. Turn it off to go back to the normal Bruno persona.'
                  : 'Off — the chatbot is the normal Bruno. Flip the switch to bring back NavGPT ❤️.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card title="Storage Usage" icon={Wallet}>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Total size of all file uploads (messages, code files, etc.).</p>
          {storageUsage !== null ? (
            <p className="text-2xl font-bold text-accent">{formatBytes(storageUsage)}</p>
          ) : (
            <p className="text-text-muted/70">Click to calculate.</p>
          )}
          <Button onClick={fetchStorageUsage} disabled={loadingStorage}>
            {loadingStorage ? 'Calculating...' : 'Recalculate'}
          </Button>
        </div>
      </Card>
      
      {canModerateMessages && <Card title="Message Management" icon={Mail}>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Silently edit or delete messages.</p>
          <div className="max-h-96 overflow-y-auto glass p-2 rounded-xl">
            {loadingMessages ? <p>Loading messages...</p> : (
              allMessages.map((msg: any) => (
                <div key={msg.id} className="p-2 border-b border-text-base/10">
                  <p className="text-xs text-text-muted">{new Date(msg.timestamp).toLocaleString()} - {msg.sender_name}</p>
                  {editingMessage?.id === msg.id ? (
                    <textarea 
                      value={editingMessage.content} 
                      onChange={(e) => setEditingMessage({...editingMessage, content: e.target.value})}
                      className="w-full bg-primary my-1 p-2 rounded"
                    />
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                  {msg.file_path && <p className="text-xs italic text-accent">{msg.file_path}</p>}
                  <div className="flex gap-2 mt-2">
                    {editingMessage?.id === msg.id ? (
                      <Button onClick={handleUpdateMessage}>Save</Button>
                    ) : (
                      <Button onClick={() => setEditingMessage(msg)}>Edit</Button>
                    )}
                    <Button onClick={() => handleSilentDelete(msg.id)} variant="danger">Delete</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>}

      <Card title="AI Absence Evaluation" icon={Settings}>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Define the criteria the AI should use to determine if an absence is excused.</p>
          <textarea 
            className="w-full bg-primary border border-text-base/10 rounded-xl px-4 py-3 text-text-base focus:outline-none focus:border-accent/50 transition-colors h-48 text-sm"
            placeholder="e.g. Excused if: sick with doctor note, family emergency, school event. Unexcused if: forgot, overslept, gaming..."
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </Card>

      {isOwner && (
      <Card title="AI Configuration (Max Tokens)" icon={Bolt}>
        <div className="space-y-1 mb-4">
          <label className="text-xs font-bold text-text-muted uppercase">Chat provider</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 max-w-xl" role="radiogroup" aria-label="Chat provider">
            {([
              { id: 'hybrid', label: 'Hybrid', hint: 'Fireworks + Gemini for research' },
              { id: 'fireworks', label: 'Fireworks', hint: 'Fireworks credits for chat + Gemini for research' },
              { id: 'gemini', label: 'Gemini only', hint: 'All chat via Gemini (paid)' },
            ] as const).map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={chatProvider === p.id}
                onClick={() => setChatProvider(p.id)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left transition-all',
                  chatProvider === p.id
                    ? 'bg-accent text-accent-ink border-accent'
                    : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:border-text-base/25 hover:text-text-base'
                )}
              >
                <span className="block text-[13px] font-bold">{p.label}</span>
                <span className={cn('block text-[11px] mt-0.5', chatProvider === p.id ? 'opacity-80' : 'text-text-muted/70')}>{p.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-muted uppercase">News Scout</label>
            <Input type="number" value={maxTokensNews} onChange={(e: any) => setMaxTokensNews(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-muted uppercase">Attendance Analysis</label>
            <Input type="number" value={maxTokensAttendance} onChange={(e: any) => setMaxTokensAttendance(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-muted uppercase">Excuse Checker</label>
            <Input type="number" value={maxTokensExcuse} onChange={(e: any) => setMaxTokensExcuse(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-muted uppercase">Activity Summary</label>
            <Input type="number" value={maxTokensSummary} onChange={(e: any) => setMaxTokensSummary(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-text-muted uppercase">Bruno Chat</label>
            <Input type="number" value={maxTokensChat} onChange={(e: any) => setMaxTokensChat(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={handleSave}>Save AI Limits</Button>
        </div>
      </Card>
      )}

      {isPresident && (
        <Card title="Admin Delegation" icon={Users}>
          <div className="space-y-4">
            <p className="text-sm text-text-muted">Grant administrative scopes to board members.</p>
            <div className="glass rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-text-base/5 border-b border-text-base/10">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Name</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Board</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Scopes</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-text-base/5">
                  {members.map((m: any) => (
                    <tr key={m.id} data-cm-type="member" data-cm-id={m.id}>
                      <td className="px-4 py-3 text-text-base">{m.name}</td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => updateMember(m.id, { ...m, is_board: m.is_board ? 0 : 1 })}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase",
                            m.is_board ? "bg-accent/20 text-accent" : "bg-elevated text-text-muted/70"
                          )}
                        >
                          {m.is_board ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted/70">
                        {(() => {
                          try {
                            const scopes = typeof m.scopes === 'string' ? JSON.parse(m.scopes) : m.scopes;
                            return Array.isArray(scopes) ? scopes.join(', ') : 'None';
                          } catch {
                            return 'None';
                          }
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="secondary" size="sm" onClick={() => setShowMemberEdit(m)}>Edit Scopes</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {showMemberEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={`Edit Member: ${showMemberEdit.name}`} className="w-full max-w-md">
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Name</label>
                <Input
                  value={showMemberEdit.name || ''}
                  onChange={(e: any) => setShowMemberEdit({ ...showMemberEdit, name: e.target.value })}
                  maxLength={80}
                  placeholder="Member name"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Role / title</label>
                <Input
                  value={showMemberEdit.role || ''}
                  onChange={(e: any) => setShowMemberEdit({ ...showMemberEdit, role: e.target.value })}
                  maxLength={80}
                  placeholder="e.g. Build Captain"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-widest mb-1.5">Scopes</label>
                <div className="flex flex-wrap gap-2">
                {['attendance', 'budget', 'tasks', 'inventory', 'code', 'admin'].map(s => {
                  const currentScopes = (() => {
                    try {
                      const parsed = typeof showMemberEdit.scopes === 'string' ? JSON.parse(showMemberEdit.scopes) : showMemberEdit.scopes;
                      return Array.isArray(parsed) ? parsed : [];
                    } catch {
                      return [];
                    }
                  })();
                  const active = currentScopes.includes(s);
                  return (
                    <button 
                      key={s}
                      onClick={() => {
                        const next = active ? currentScopes.filter((x: string) => x !== s) : [...currentScopes, s];
                        setShowMemberEdit({ ...showMemberEdit, scopes: next });
                      }}
                      className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-all",
                        active ? "bg-accent border-accent text-accent-ink" : "border-text-base/10 text-text-muted"
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowMemberEdit(null)}>Cancel</Button>
                <Button onClick={() => updateMember(showMemberEdit.id, showMemberEdit)}>Save Changes</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card title="Google Calendar" icon={Calendar} subtitle="Sync team events to your personal calendar">
        <GoogleCalendarSettings
          settings={settings}
          isAdmin={hasPerm?.('manage_calendar') || currentUser?.role === 'President'}
          onRefresh={onRefresh}
        />
      </Card>

      <Card title="Danger Zone" icon={ShieldCheck} subtitle="Irreversible actions" className="border-rose-500/25">
        {(teams || []).length > 0 ? (
          <div>
            <p className="text-sm text-text-muted mb-3">
              Account deletion is available once you have no team memberships. Delete your teams or leave them from the Teams page first — then come back here.
            </p>
            <Button
              disabled
              className="bg-rose-500/10 text-rose-300/50 border border-rose-500/20 cursor-not-allowed"
              title="Leave or delete all your teams first"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete my account
            </Button>
          </div>
        ) : !showDelete ? (
          <div>
            <p className="text-sm text-text-muted mb-3">
              Permanently delete your account and all of your personal data (profile, notifications, avatar). You have no team memberships, so there's nothing left to leave behind.
            </p>
            <Button
              onClick={() => setShowDelete(true)}
              className="bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete my account
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-w-sm">
            <p className="text-sm text-rose-300 font-semibold">
              This cannot be undone. Type your email (<span className="text-text-base">{currentUser?.email}</span>) to confirm.
            </p>
            <Input
              value={confirmEmail}
              onChange={(e: any) => setConfirmEmail(e.target.value)}
              placeholder="your@email.com"
            />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => { setShowDelete(false); setConfirmEmail(''); }}>
                Cancel
              </Button>
              <Button
                onClick={deleteAccount}
                disabled={delBusy || confirmEmail.trim().toLowerCase() !== (currentUser?.email || '').toLowerCase()}
                className="bg-rose-600 text-text-base hover:bg-rose-500 disabled:opacity-40"
              >
                {delBusy ? 'Deleting…' : 'Yes, delete everything'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
