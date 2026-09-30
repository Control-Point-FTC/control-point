import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
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
  Settings,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  ImagePlus,
  TrendingUp,
  Clock,
  Award,
  MessageSquare,
  Send,
  Bell,
  LogOut,
  Lock,
  UserPlus,
  Search,
  EyeOff,
  Eye,
  Edit2,
  FolderPlus,
  FolderInput,
  Calendar,
  User,
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
  Trophy,
  Flag,
  Cog,
  Medal,
  Layers,
  Hash,
  ChevronUp,
  Music2,
  Youtube,
  Pin,
  Bot,
  QrCode,
  ScanLine,
  Maximize2,
  Timer,
  Keyboard,
  Camera,
  LayoutGrid,
  BadgeCheck,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import Markdown from 'react-markdown';
import BrunoView from './components/BrunoView';
import BrunoPanel from './components/BrunoPanel';
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
import { format } from 'date-fns';

import { Team, Member, AttendanceRecord, Task, BudgetItem, OutreachEvent, Communication, CalendarEvent } from './types';
import { fetchScoutFeed, getAttendanceInsights, streamAttendanceInsights, getActivitySummary, streamActivitySummary } from './services/aiService';
import { apiFetch } from './services/api';
import { CodeView } from './components/CodeView';
import { DialogHost, confirmDialog, promptDialog, notify } from './components/dialog';
import RolesView, { RoleBadge } from './components/RolesView';
import SettingsModal from './components/SettingsModal';
import Landing from './Landing';
import LegalPage from './Legal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

// --- Components ---

const Card = ({ children, className, title, subtitle, icon: Icon }: any) => (
  <div className={cn("card-surface p-6 flex flex-col gap-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)]", className)}>
    {(title || Icon) && (
      <div className="flex items-center justify-between mb-1">
        <div>
          {title && <h3 className="text-lg font-display font-bold text-white tracking-tight">{title}</h3>}
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="rounded-xl bg-accent/12 p-2.5">
            <Icon className="w-5 h-5 text-accent" />
          </div>
        )}
      </div>
    )}
    {children}
  </div>
);

const Button = ({ children, className, variant = 'primary', ...props }: any) => {
  const accentColor = getCSSVariable('--color-accent');
  const primaryColor = getCSSVariable('--color-primary');
  
  const variants: any = {
    primary: {
      className: 'font-bold hover:brightness-105 shadow-[0_4px_16px_rgba(255,199,0,0.25)]',
      style: { backgroundColor: accentColor || '#FFC700', color: '#231A00' }
    },
    secondary: 'bg-elevated text-white hover:bg-white/10 border border-white/10 font-semibold',
    outline: {
      className: 'text-accent hover:opacity-80 border border-current font-bold',
    },
    ghost: 'text-text-muted hover:text-white hover:bg-white/5 font-semibold',
    danger: 'bg-rose-900/30 text-rose-400 hover:bg-rose-900/50 border border-rose-500/30 font-semibold'
  };
  
  const variantConfig = variants[variant as keyof typeof variants];
  const isObject = typeof variantConfig === 'object' && !Array.isArray(variantConfig);
  
  return (
    <button 
      className={cn(
        "px-4 py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50", 
        isObject ? variantConfig.className : variantConfig,
        className
      )}
      style={isObject ? variantConfig.style : undefined}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({ className, ...props }: any) => (
  <input 
    className={cn(
      "w-full bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all",
      className
    )}
    {...props}
  />
);

const Select = ({ className, options, ...props }: any) => (
  <select 
    className={cn(
      "w-full bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all",
      className
    )}
    {...props}
  >
    {options.map((opt: any) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);

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
    return <img src={user.avatar_url} alt={user?.name || 'avatar'} className={cn(cls, 'object-cover')} />;
  }
  return <div className={cls}>{(user?.name || '?').charAt(0).toUpperCase()}</div>;
};

import { PRESENCE_META, PresenceDot, PresencePicker } from './components/presence';

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

// --- Role choice + signup screens ---

const AuthShell = ({ children }: any) => (
  <div className="min-h-screen bg-primary flex items-center justify-center p-4 relative overflow-hidden">
    <div className="hero-grid absolute inset-0" />
    <div className="hero-glow absolute inset-0" />
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
      {children}
    </motion.div>
  </div>
);

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"/>
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-3.9 3C3.5 21.3 7.5 24 12 24z"/>
    <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l3.9-3z"/>
    <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.3 6.6l3.9 3.1c1-2.9 3.7-5 6.8-5z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.009c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const GithubIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const RoleScreen = ({ onBack, onSelect, googleEnabled, discordEnabled, githubEnabled }: { onBack: () => void; onSelect: (mode: 'admin' | 'student') => void; googleEnabled: boolean; discordEnabled: boolean; githubEnabled: boolean }) => (
  <AuthShell>
    <button
      onClick={onBack}
      className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-white transition-colors"
    >
      <ChevronLeft className="w-4 h-4" /> Back to home
    </button>
    <Card className="p-8">
      <div className="flex flex-col items-center gap-3 mb-6 text-center">
        <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center gold-glow">
          <Bolt className="text-accent-ink w-8 h-8" strokeWidth={2.5} />
        </div>
        <h1 className="text-2xl font-display font-bold text-white tracking-tight">Create your account</h1>
        <p className="text-text-muted text-sm">How will you use Control Point?</p>
      </div>
      <div className="grid gap-3">
        <button
          onClick={() => onSelect('admin')}
          className="group text-left rounded-2xl border border-white/10 bg-elevated p-5 hover:border-accent/60 hover:bg-white/5 transition-all active:scale-[0.99]"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-accent/15 p-3 shrink-0">
              <ShieldCheck className="w-6 h-6 text-accent" />
            </div>
            <div>
              <p className="font-bold text-white text-[15px]">I'm a Team Admin</p>
              <p className="text-sm text-text-muted mt-1 leading-relaxed">
                Create a workspace for your robotics team. You'll get an access code to share with your students.
              </p>
            </div>
          </div>
        </button>
        <button
          onClick={() => onSelect('student')}
          className="group text-left rounded-2xl border border-white/10 bg-elevated p-5 hover:border-accent/60 hover:bg-white/5 transition-all active:scale-[0.99]"
        >
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-sky-400/15 p-3 shrink-0">
              <GraduationCap className="w-6 h-6 text-sky-400" />
            </div>
            <div>
              <p className="font-bold text-white text-[15px]">I'm a Student</p>
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
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-text-muted">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <div className="mt-4 space-y-2.5">
            {googleEnabled && (
              <a href="/api/auth/google?intent=signup" className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-elevated px-3 py-3 text-sm font-semibold text-white hover:border-accent/60 hover:bg-white/5 transition-all">
                <GoogleIcon /> Continue with Google
              </a>
            )}
            {discordEnabled && (
              <a href="/api/auth/discord?intent=signup" className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-elevated px-3 py-3 text-sm font-semibold text-white hover:border-accent/60 hover:bg-white/5 transition-all">
                <DiscordIcon /> Continue with Discord
              </a>
            )}
            {githubEnabled && (
              <a href="/api/auth/github?intent=signup" className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-elevated px-3 py-3 text-sm font-semibold text-white hover:border-accent/60 hover:bg-white/5 transition-all">
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
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'found' | 'notfound' | 'error'>('idle');
  const [foundName, setFoundName] = useState('');
  const [foundSchool, setFoundSchool] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const timer = useRef<any>(null);

  const doLookup = async (num: string) => {
    const n = num.trim();
    if (!/^\d+$/.test(n)) {
      setLookup('idle'); setFoundName(''); setFoundSchool(null);
      return;
    }
    setLookup('loading');
    try {
      const res = await fetch(`/api/ftc/lookup-public?number=${encodeURIComponent(n)}`);
      if (res.ok) {
        const data = await res.json();
        setFoundName(data.name || '');
        setFoundSchool(data.schoolName || null);
        setLookup('found');
        setManual(false);
        setTeamName(data.name || '');
      } else {
        setLookup('notfound');
        setFoundName('');
        setTeamName('');
      }
    } catch {
      setLookup('error');
      setTeamName('');
    }
  };

  const onNumChange = (v: string) => {
    setTeamNumber(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) {
      setLookup('idle'); setFoundName(''); setFoundSchool(null); setTeamName('');
      return;
    }
    timer.current = setTimeout(() => doLookup(v), 600);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

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
              <p className="text-sm font-bold text-white truncate">{foundName}</p>
              {foundSchool && <p className="text-xs text-text-muted truncate">{foundSchool}</p>}
              <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">Verified FTC team — you're all set</p>
            </div>
          </div>
        )}
        {(lookup === 'notfound' || lookup === 'error') && !manual && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
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
          <button type="button" onClick={() => { setManual(false); setTeamName(''); doLookup(teamNumber); }} className="text-accent font-semibold hover:underline">
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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamNumber, setTeamNumber] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await onSignup({
        accountType: mode, name, email, password,
        teamName, teamNumber, accessCode,
      });
      onDone(data);
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setBusy(false);
    }
  };

  const label = (t: string) => (
    <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">{t}</label>
  );

  return (
    <AuthShell>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-white transition-colors"
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
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">
            {mode === 'admin' ? 'Create your workspace' : 'Join your team'}
          </h1>
          <p className="text-text-muted text-sm">
            {mode === 'admin'
              ? 'Set up your team and get an access code for your students.'
              : 'Enter the access code from your team admin to join.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">{label('Full name')}<Input required value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Ada Lovelace" /></div>
          <div className="space-y-1.5">{label('Email')}<Input type="email" required value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="you@team.org" /></div>
          <div className="space-y-1.5">
            {label('Password')}
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} required minLength={6} value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="6+ characters" className="pr-11" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white">
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
  const needsRole = intent === 'signup';
  const [pickedRole, setPickedRole] = useState<'admin' | 'student'>('student');
  const isAdmin = intent === 'admin_signup' || (needsRole && pickedRole === 'admin');
  const [teamName, setTeamName] = useState('');
  const [teamNumber, setTeamNumber] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/oauth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, token, teamName, teamNumber, accessCode, role: needsRole ? pickedRole : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      onDone(data);
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    } finally {
      setBusy(false);
    }
  };

  const label = (t: string) => (
    <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">{t}</label>
  );

  return (
    <AuthShell>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-white transition-colors"
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
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Almost done</h1>
          <p className="text-text-muted text-sm flex items-center gap-2">
            {provider === 'discord' ? <DiscordIcon /> : provider === 'github' ? <GithubIcon /> : <GoogleIcon />}
            {' '}Signed in with {provider === 'discord' ? 'Discord' : provider === 'github' ? 'GitHub' : 'Google'} — one more step.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {needsRole && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPickedRole('admin')}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  pickedRole === 'admin' ? "border-accent bg-accent/10" : "border-white/10 bg-elevated hover:border-white/25"
                )}
              >
                <ShieldCheck className={cn("w-5 h-5 mb-2", pickedRole === 'admin' ? "text-accent" : "text-text-muted")} />
                <p className="text-sm font-bold text-white">Team Admin</p>
                <p className="text-xs text-text-muted mt-1">Create a workspace</p>
              </button>
              <button
                type="button"
                onClick={() => setPickedRole('student')}
                className={cn(
                  "rounded-xl border p-4 text-left transition-all",
                  pickedRole === 'student' ? "border-accent bg-accent/10" : "border-white/10 bg-elevated hover:border-white/25"
                )}
              >
                <GraduationCap className={cn("w-5 h-5 mb-2", pickedRole === 'student' ? "text-accent" : "text-text-muted")} />
                <p className="text-sm font-bold text-white">Student</p>
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
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">Workspace ready</h1>
          <p className="text-text-muted text-sm mt-2 leading-relaxed">
            <span className="text-white font-semibold">{team.name}</span> is set up.
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
const navItems = [
  { id: 'dashboard', path: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, pinned: true },
  { id: 'stats', path: 'stats', label: 'Team Stats', icon: Trophy, pinned: true },
  {
    id: 'teams', path: 'teams', label: 'Teams & Members', icon: Users, pinned: true,
    children: [
      { id: 'teams', path: 'teams', label: 'Members', icon: Users },
      { id: 'roles', path: 'roles', label: 'Roles', icon: ShieldCheck, perm: 'manage_roles' },
    ],
  },
  { id: 'attendance', path: 'attendance', label: 'Attendance', icon: CalendarCheck, scope: 'attendance', group: 'Manage' },
  { id: 'tasks', path: 'tasks', label: 'Tasks', icon: CheckSquare, group: 'Manage' },
  { id: 'calendar', path: 'calendar', label: 'Calendar', icon: Calendar, group: 'Manage' },
  { id: 'budget', path: 'budget', label: 'Budget', icon: Wallet, scope: 'budget', group: 'Manage' },
  { id: 'inventory', path: 'inventory', label: 'Inventory', icon: Zap, scope: 'inventory', group: 'Manage' },
  { id: 'outreach', path: 'outreach', label: 'Outreach', icon: Globe, group: 'Manage' },
  { id: 'code', path: 'code', label: 'Code', icon: Code2, scope: 'code', group: 'Manage' },
  { id: 'comm', path: 'comm', label: 'Communication', icon: Mail, group: 'Connect' },
  { id: 'chat', path: 'chat', label: 'Messaging', icon: MessageSquare, group: 'Connect' },
  { id: 'scout', path: 'scout', label: 'AI Scout', icon: Newspaper, group: 'Connect' },
  { id: 'owner', path: 'owner', label: 'Owner', icon: Crown, ownerOnly: true, pinned: true },
];
// NOTE: 'profile' and 'settings' are intentionally not nav items anymore —
// they live in the Discord-style settings popup (gear button by the user card).
// Their routes still work for deep links.

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

export default function App() {
  // Real URL routing — every section is its own route, so refresh keeps you where you are
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname.split('/')[1] || 'dashboard';
  const setActiveTab = (id: string) => navigate(`/${id}`);
  const activeNav = navItems.find((t) => t.id === activeTab)
    || navItems.flatMap((t) => (t as any).children || []).find((c: any) => c.id === activeTab);
  // Messaging is immersive: no top bar, no footer — the chat fills the whole content area
  const isChatRoute = activeTab === 'chat';
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const isMobile = useIsMobile();
  // Teams & Members submenu (Members / Roles), Discord-style settings popup,
  // and the presence status picker live here so the sidebar owns them.
  const [teamsNavOpen, setTeamsNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  // Auto-expand the Teams submenu when we're on one of its pages.
  useEffect(() => {
    if (activeTab === 'teams' || activeTab === 'roles') setTeamsNavOpen(true);
  }, [activeTab]);

  /** Change my presence status (online / idle / dnd / invisible). */
  const handleStatusPick = async (status: string) => {
    if (!currentUser) return;
    setStatusPickerOpen(false);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentUser.name, role: currentUser.role || '', presence_status: status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        setCurrentUser({ ...currentUser, ...data.user });
      } else {
        notify(data.error || 'Could not update status.', 'error');
      }
    } catch {
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
  const [brunoPanelOpen, setBrunoPanelOpen] = useState(false);
  const brunoClickTimer = useRef<number | null>(null);

  // ---- Onboarding (welcome, tour, setup wizard, dashboard checklist) ----
  // Persisted per account (email-keyed) on the server so progress survives
  // refresh, logout/login, and team switches.
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStartStep, setTourStartStep] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStartStep, setWizardStartStep] = useState<0 | 1 | 2>(0);
  const tourSaveTimer = useRef<number | null>(null);
  const tourStepRef = useRef(0);

  // Single click → Copilot-style side panel; double-click → full /bruno view
  const handleBrunoButton = () => {
    if (brunoClickTimer.current) {
      window.clearTimeout(brunoClickTimer.current);
      brunoClickTimer.current = null;
      setBrunoPanelOpen(false);
      navigate('/bruno');
      return;
    }
    brunoClickTimer.current = window.setTimeout(() => {
      brunoClickTimer.current = null;
      setBrunoPanelOpen(true);
    }, 260);
  };
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // True once the initial session check has finished. Until then we show a
  // minimal splash — never the landing page — so a refresh never flashes the
  // marketing homepage before the app shell appears.
  const [authReady, setAuthReady] = useState(false);
  const [authScreen, setAuthScreen] = useState<'landing' | 'login' | 'role' | 'signup-admin' | 'signup-student' | 'code-reveal'>('landing');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupTeam, setSignupTeam] = useState<{ id: number; name: string; access_code: string } | null>(null);

  // Data State
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
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
  // Discord-style text channels (no servers — channels live inside the team)
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
      const ch = await fetchJsonStandalone('/api/chat/channels');
      if (Array.isArray(ch) && ch.length > 0) {
        setChannels(ch);
        setActiveChannelId((prev) => {
          if (prev && ch.some((c: any) => c.id === prev)) return prev;
          const general = ch.find((c: any) => c.name === 'general') || ch[0];
          return general ? general.id : null;
        });
      }
      const cats = await fetchJsonStandalone('/api/chat/categories').catch(() => null);
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
        if (activeChannelIdRef.current === activeChannelId) setMessages(msgs);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, currentUser?.id]);

  // The socket connects once per login, so mirror the active channel in a ref
  // for the (stale-closure) onmessage handler.
  const activeChannelIdRef = useRef<number | null>(null);
  useEffect(() => { activeChannelIdRef.current = activeChannelId; }, [activeChannelId]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [hiddenDates, setHiddenDates] = useState<string[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [scoutFeed, setScoutFeed] = useState<any[]>([]);
  const [scoutUpdatedAt, setScoutUpdatedAt] = useState<number | null>(null);
  const [scoutError, setScoutError] = useState<string>("");
  const [insights, setInsights] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);
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

  // AI Scout visual feed: JSON cards cached in localStorage (24h), refreshed on demand
  const updateNews = async (force: boolean = false) => {
    const CACHE_KEY = 'ftcScoutFeedCache';
    const TS_KEY = 'ftcScoutFeedTimestamp';

    // check local cache first
    if (!force && typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        const ts = localStorage.getItem(TS_KEY);
        if (cached && ts) {
          const age = Date.now() - parseInt(ts, 10);
          const items = JSON.parse(cached);
          if (Array.isArray(items) && age < 24 * 60 * 60 * 1000) {
            setScoutFeed(items);
            setScoutUpdatedAt(parseInt(ts, 10));
            return;
          }
        }
      } catch { /* fall through to network */ }
    }

    setIsAiLoading(true);
    setAiLoadingTarget('news');
    setScoutError('');
    try {
      const { items } = await fetchScoutFeed(force);
      setScoutFeed(items);
      const now = Date.now();
      setScoutUpdatedAt(now);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(items));
          localStorage.setItem(TS_KEY, now.toString());
        } catch { /* storage full — ignore */ }
      }
    } catch (err) {
      console.error('Error updating news:', err);
      // keep any previously loaded feed visible; the view shows a retry banner
      setScoutError('Failed to fetch latest news. Please check your connection.');
    } finally {
      setIsAiLoading(false);
      setAiLoadingTarget(null);
    }
  };

  // WebSocket
  const [socket, setSocket] = useState<WebSocket | null>(null);

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
      fetch(`/api/auth/me?sessionId=${encodeURIComponent(gs)}`)
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
        fetch(`/api/auth/me?sessionId=${encodeURIComponent(saved)}`)
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

  // Apply custom colors
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      const myTeam = teams.find(t => t.id === currentUser.team_id);
      
      const accent = [currentUser.accent_color, myTeam?.accent_color].find(validHex)?.trim() || '#FFC700';
      const primary = [currentUser.primary_color, myTeam?.primary_color].find(validHex)?.trim() || '#09090B';
      const text = [currentUser.text_color, myTeam?.text_color].find(validHex)?.trim() || '#F8FAFC'; // slate-100 default

      const root = document.documentElement;
      root.style.setProperty('--color-accent', accent);
      root.style.setProperty('--color-primary', primary);
      root.style.setProperty('--color-text-base', text);
      
      // Secondary color is usually a slightly lighter version of primary
      // For simplicity, we can just use the same or a slightly transparent version
      root.style.setProperty('--color-secondary', '#1A1A1A');
    } else {
      // Reset to defaults
      const root = document.documentElement;
      root.style.setProperty('--color-accent', '#FFC700');
      root.style.setProperty('--color-primary', '#09090B');
      root.style.setProperty('--color-text-base', '#F8FAFC');
      root.style.setProperty('--color-secondary', '#1A1A1A');
    }
  }, [currentUser, teams, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
      connectSocket();
    }
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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
      console.log("WebSocket connected");
      const sid = typeof localStorage !== 'undefined' ? localStorage.getItem('sessionId') : null;
      if (sid) ws.send(JSON.stringify({ type: 'hello', sessionId: sid }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
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
          }
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected, retrying in 3s...");
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

  const fetchData = async () => {
    setLoading(true);
    try {
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

      const [t, m, a, tk, b, o, soc, inv, c, msgs, s, h, d, ev] = await Promise.all([
        fetchJson('/api/teams'),
        fetchJson('/api/members'),
        fetchJson('/api/attendance'),
        fetchJson('/api/tasks'),
        fetchJson('/api/budget'),
        fetchJson('/api/outreach'),
        fetchJson('/api/outreach/social'),
        fetchJson('/api/inventory'),
        fetchJson('/api/communications'),
        fetchJson('/api/messages'),
        fetchJson('/api/settings'),
        fetchJson('/api/hidden-dates'),
        fetchJson('/api/documentation'),
        fetchJson('/api/events'),
      ]);

      if (Array.isArray(t)) setTeams(t);
      if (Array.isArray(m)) {
        console.log(`[Data Fetch] Received ${m.length} members`);
        setMembers(m);
        if (currentUser) {
          const updatedUser = m.find((member: any) => member.id === currentUser.id);
          console.log(`[Data Fetch] Updating currentUser:`, updatedUser);
          if (updatedUser) setCurrentUser(updatedUser);
        }
      }
      if (Array.isArray(a)) setAttendance(a);
      if (Array.isArray(tk)) setTasks(tk);
      if (Array.isArray(b)) setBudget(b);
      if (Array.isArray(o)) setOutreach(o);
      if (Array.isArray(soc)) setSocialProfiles(soc);
      if (Array.isArray(inv)) setInventory(inv);
      if (Array.isArray(c)) setCommunications(c);
      if (Array.isArray(msgs)) setMessages(msgs);
      if (Array.isArray(h)) setHiddenDates(h);
      if (Array.isArray(d)) setDocumentation(d);
      if (Array.isArray(ev)) setEvents(ev);
      if (s && Array.isArray(s)) {
        const settingsMap = s.reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
        setSettings(settingsMap);
      }

      if (currentUser) {
        const notes = await fetchJson(`/api/notifications/${currentUser.id}`);
        if (Array.isArray(notes)) setNotifications(notes);
      }

      // Background updates
      updateNews();
      // Insights and Summary are now manual or context-specific
      if (currentUser) {
        updateSummary();
      }
    } catch (err) {
      console.error("Error in fetchData:", err);
    } finally {
      setLoading(false);
      setTeamsLoaded(true);
    }
  };

  const persistSession = (sid: string, user: any) => {
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
  // Team-scoped client caches (AI scout feed + summary) live in localStorage under
  // fixed keys; drop them so the newly active team's data is fetched fresh.
  const clearTeamCaches = () => {
    if (typeof localStorage === 'undefined') return;
    [
      'ftcScoutFeedCache', 'ftcScoutFeedTimestamp',
      'ftcSummaryCache', 'ftcSummaryTimestamp', 'ftcSummaryItemCount',
    ].forEach((k) => localStorage.removeItem(k));
  };

  const handleSwitchTeam = async (teamId: number) => {
    if (teamId === currentUser?.team_id) return;
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
  const navGptActive = navGptQualified && (activeTeam?.navgpt_enabled ?? 1) === 1;
  const botName = navGptActive ? 'NavGPT ❤️' : 'Bruno';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword })
    });
    const data = await res.json();
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
      notify(data.error || "Login failed", 'error');
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
    if (data.user) {
      persistSession(data.sessionId, data.user);
      setNeedsSetup(false);
    }
  };

  const handleLogout = async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch { /* best effort — still sign out locally */ }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setSessionId(null);
    setTeams([]);
    setTeamsLoaded(false);
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
  const studentTabIds = ['dashboard', 'stats', 'attendance', 'tasks', 'calendar', 'budget', 'inventory', 'outreach', 'comm', 'chat'];
  const tabVisible = (t: any): boolean => {
    if (t.ownerOnly) return isOwner;
    if (t.perm) return hasPerm(t.perm);
    if (isAdmin) return !t.scope || hasScope(t.scope);
    return studentTabIds.includes(t.id);
  };
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
    if (tourSaveTimer.current) window.clearTimeout(tourSaveTimer.current);
    tourSaveTimer.current = window.setTimeout(() => {
      patchOnboarding({ walkthrough: { lastStep: index } }).catch(() => {});
    }, 600);
  };

  const handleTourExit = async () => {
    if (tourSaveTimer.current) window.clearTimeout(tourSaveTimer.current);
    setTourOpen(false);
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
    const now = new Date().toISOString();
    try {
      const s = await patchOnboarding({
        walkthrough: { completed: true, lastStep: 0 },
        steps: { tour: { status: 'done', updatedAt: now } },
      });
      if (next === 'setup') {
        setWizardStartStep(s.steps.profile.status === 'done' ? 2 : 0);
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
    const viewProps = {
      teams, members, attendance, tasks, budget, outreach, socialProfiles, youtubeEnabled, tiktokEnabled, inventory, communications, events,
      messages, settings, hiddenDates, currentUser, onRefresh: fetchData, setLoading,
      // ChatView gates channel create/delete UI on this — it was missing, so
      // the + button never rendered for anyone.
      isAdmin,
      // setters for optimistic UI (instant-feeling mutations with rollback on error)
      setTasks, setEvents, setOutreach, setInventory, setBudget, setAttendance, setMembers,
      setMessages, msgCache,
      insights, scoutFeed, scoutUpdatedAt, scoutError, summary, socket, hasScope,
      isAiLoading, setIsAiLoading, ThinkingIndicator, aiLoadingTarget,
      colorVersion, setColorVersion,
      // multi-team: switcher, add/delete/leave, active team name
      onSwitchTeam: handleSwitchTeam, onAddTeam: handleAddTeam, onDeleteTeam: handleDeleteTeam, onLeaveTeam: handleLeaveTeam,
      activeTeamName, botName, navGptQualified, navGptActive,
      // app owner (OWNER_EMAILS) — gates owner-only UI like AI limit config
      isOwner,
      // give child views a way to explicitly refresh the AI news cache
      refreshNews: () => updateNews(true),
      updateInsights,
      updateSummary: () => updateSummary(true),
      // onboarding: dashboard checklist + resume entry points
      onboardingState: onboarding,
      onContinueSetup: openSetupGuide,
      onDismissChecklist: handleChecklistDismiss,
      // Discord-style chat channels
      channels, activeChannelId, setActiveChannelId,
      chatCategories,
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
      ? <DashboardView {...viewProps} teams={teams} data={{ attendance, tasks, budget, outreach, insights, scoutFeed, summary, members, events }} />
      : <StudentDashboardView {...viewProps} />;
    return (
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={dashboardEl} />
        <Route path="/stats" element={<TeamStatsView />} />
        <Route path="/teams" element={<TeamsView {...viewProps} />} />
        <Route path="/roles" element={<RolesView members={members} currentUser={currentUser} onRefresh={fetchData} />} />
        <Route path="/attendance" element={<AttendanceView {...viewProps} />} />
        <Route path="/tasks" element={<TasksView {...viewProps} />} />
        <Route path="/calendar" element={<CalendarView {...viewProps} />} />
        <Route path="/budget" element={<BudgetView {...viewProps} />} />
        <Route path="/inventory" element={<InventoryView {...viewProps} />} />
        <Route path="/outreach" element={<OutreachView {...viewProps} />} />
        <Route path="/code" element={<CodeView {...viewProps} />} />
        <Route path="/comm" element={<CommunicationView {...viewProps} />} />
        <Route path="/chat" element={<ChatView {...viewProps} />} />
        <Route path="/scout" element={<ScoutView {...viewProps} />} />
        <Route path="/bruno" element={<BrunoView key={currentUser?.team_id ?? 'none'} {...viewProps} />} />
        <Route path="/profile" element={<ProfileView {...viewProps} />} />
        <Route path="/settings" element={<SettingsView {...viewProps} />} />
        <Route path="/owner" element={<OwnerView {...viewProps} />} />
        <Route path="/checkin/:token" element={<QrCheckinPage currentUser={currentUser} onRefresh={fetchData} />} />
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
    if (oauthSignup) {
      return (
        <OAuthSignupScreen
          token={oauthSignup.token}
          intent={oauthSignup.intent}
          provider={oauthSignup.provider}
          onBack={() => { setOauthSignup(null); setAuthScreen('landing'); }}
          onDone={(data) => {
            persistSession(data.sessionId, data.user);
            setOauthSignup(null);
            if (data?.team) setSignupTeam(data.team);
          }}
        />
      );
    }
    if (authScreen === 'landing') {
      return <Landing onSignIn={() => setAuthScreen('login')} onGetStarted={() => setAuthScreen('role')} />;
    }
    if (authScreen === 'role') {
      return <RoleScreen googleEnabled={googleEnabled} discordEnabled={discordEnabled} githubEnabled={githubEnabled} onBack={() => setAuthScreen('landing')} onSelect={(m) => setAuthScreen(m === 'admin' ? 'signup-admin' : 'signup-student')} />;
    }

    if (authScreen === 'signup-admin' || authScreen === 'signup-student') {
      const mode = authScreen === 'signup-admin' ? 'admin' : 'student';
      return (
        <SignupScreen
          mode={mode}
          onBack={() => setAuthScreen('role')}
          onSignup={handleSignup}
          onDone={(data) => {
            if (mode === 'admin' && data?.team) setSignupTeam(data.team);
          }}
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
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back to home
          </button>
          <Card className="p-8">
            <div className="flex flex-col items-center gap-4 mb-8">
              <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center gold-glow">
                <Bolt className="text-accent-ink w-9 h-9" strokeWidth={2.5} />
              </div>
              <h1 className="text-3xl font-display font-bold text-white tracking-tight">Control Point</h1>
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
                <label className="text-[11px] font-bold text-text-muted uppercase tracking-widest">Password</label>
                <Input type="password" required value={loginPassword} onChange={(e: any) => setLoginPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <Button type="submit" className="w-full py-3 mt-2 text-[15px]">
                {needsSetup ? "Complete Setup" : "Sign In"}
              </Button>
            </form>
            {oauthError && !needsSetup && (
              <p className="text-sm text-rose-400 text-center mt-4">{oauthError}</p>
            )}
            {(googleEnabled || discordEnabled || githubEnabled) && !needsSetup && (
              <>
                <div className="flex items-center gap-3 mt-6">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-text-muted">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
                <div className="mt-6 space-y-2.5">
                  {googleEnabled && (
                    <a href="/api/auth/google?intent=login" className="block">
                      <Button variant="secondary" className="w-full py-3" type="button">
                        <GoogleIcon />
                        Continue with Google
                      </Button>
                    </a>
                  )}
                  {discordEnabled && (
                    <a href="/api/auth/discord?intent=login" className="block">
                      <Button variant="secondary" className="w-full py-3" type="button">
                        <DiscordIcon />
                        Continue with Discord
                      </Button>
                    </a>
                  )}
                  {githubEnabled && (
                    <a href="/api/auth/github?intent=login" className="block">
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

  return (
    <div className="flex h-dvh overflow-hidden bg-primary">
      <DialogHost />
      {signupTeam && <CodeRevealScreen team={signupTeam} onEnter={() => setSignupTeam(null)} />}
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
          "bg-secondary border-r border-white/5 flex flex-col z-40",
          isMobile ? "fixed inset-y-0 left-0 shadow-xl" : "relative"
        )}
        style={{
          transform: isMobile && !isSidebarOpen ? 'translateX(-100%)' : 'translateX(0)',
          transition: 'transform 0.3s ease-in-out'
        }}
      >
        <div className="px-4 sm:px-5 pt-5 pb-4 flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 bg-accent rounded-2xl flex items-center justify-center gold-glow flex-shrink-0">
            <Bolt className="text-accent-ink w-6 h-6" strokeWidth={2.5} />
          </div>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 }}
              className="whitespace-nowrap"
            >
              <h1 className="text-[17px] font-display font-bold text-white leading-none tracking-tight">Control Point</h1>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted mt-1">Team workspace</p>
            </motion.div>
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
                const open = teamsNavOpen || childActive;
                return (
                  <div key={item.id}>
                    <button
                      data-onboard={`nav-${item.id}`}
                      onClick={() => (isSidebarOpen ? setTeamsNavOpen(!teamsNavOpen) : navigate(`/${item.path}`))}
                      title={!isSidebarOpen ? item.label : undefined}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative text-sm",
                        childActive
                          ? "bg-accent text-accent-ink font-bold shadow-[0_4px_16px_rgba(255,199,0,0.3)]"
                          : "text-text-muted hover:bg-white/[0.06] hover:text-white font-medium"
                      )}
                    >
                      <item.icon className={cn("w-[18px] h-[18px] shrink-0", childActive ? "text-accent-ink" : "text-accent/80 group-hover:text-accent")} strokeWidth={2.25} />
                      {isSidebarOpen && (
                        <>
                          <span className="truncate flex-1 text-left">{item.label}</span>
                          <ChevronDown className={cn("w-4 h-4 flex-shrink-0 transition-transform", open && "rotate-180")} />
                        </>
                      )}
                    </button>
                    {isSidebarOpen && open && (
                      <div className="ml-5 mt-1 space-y-1 border-l border-white/10 pl-2">
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
                                  : "text-text-muted hover:bg-white/[0.06] hover:text-white font-medium"
                              )}
                            >
                              <k.icon className={cn("w-4 h-4 shrink-0", kActive ? "text-accent" : "text-accent/70 group-hover:text-accent")} strokeWidth={2.25} />
                              <span className="truncate">{k.label}</span>
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
                  title={!isSidebarOpen ? item.label : undefined}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative text-sm",
                    depth > 0 && "py-2 text-[13px]",
                    isActive
                      ? "bg-accent text-accent-ink font-bold shadow-[0_4px_16px_rgba(255,199,0,0.3)]"
                      : "text-text-muted hover:bg-white/[0.06] hover:text-white font-medium"
                  )}
                >
                  <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive ? "text-accent-ink" : "text-accent/80 group-hover:text-accent")} strokeWidth={2.25} />
                  {isSidebarOpen && <span className="truncate">{item.label}</span>}
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

        <div className="p-3 sm:p-4 border-t border-white/[0.06] flex-shrink-0 space-y-1.5">
          {/* Discord-style user card: avatar w/ presence, name, status picker, settings gear */}
          <div className="relative">
            {statusPickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setStatusPickerOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 w-64 z-50 bg-elevated border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                  <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">Set status</p>
                  <PresencePicker value={currentUser?.presence_status || 'online'} onPick={handleStatusPick} />
                </div>
              </>
            )}
            <div className={cn("flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.06]", isSidebarOpen ? "p-2.5" : "p-2 justify-center")}>
              <button
                onClick={() => setStatusPickerOpen(!statusPickerOpen)}
                className="hover:ring-2 hover:ring-accent/50 transition-all rounded-full flex-shrink-0"
                title={`Status: ${PRESENCE_META[currentUser?.presence]?.label || 'Offline'} — click to change`}
              >
                <AvatarWithPresence user={currentUser} size="md" presence={currentUser?.presence} />
              </button>
              {isSidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate leading-tight">{currentUser?.name}</p>
                  <p className="text-[11px] text-text-muted truncate">{PRESENCE_META[currentUser?.presence]?.label || currentUser?.role}</p>
                </div>
              )}
              {isSidebarOpen && (
                <>
                  <button onClick={() => setSettingsOpen(true)} aria-label="Settings" data-onboard="nav-settings-gear" className="p-2 text-text-muted hover:text-white transition-colors flex-shrink-0" title="Settings">
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
            className="w-full hidden md:flex items-center gap-3 px-3 py-2 text-text-muted hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors text-sm font-medium"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isSidebarOpen ? <ChevronLeft className="w-[18px] h-[18px] flex-shrink-0" /> : <ChevronRight className="w-[18px] h-[18px] flex-shrink-0" />}
            {isSidebarOpen && <span>Collapse</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-0 bg-primary relative h-dvh">
        {!isChatRoute && (
        <header className="flex-shrink-0 z-20 glass px-4 sm:px-6 lg:px-8 py-3 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <h2 className="text-lg sm:text-xl md:text-2xl font-display font-bold text-white capitalize truncate">{activeTab === 'bruno' ? botName : activeNav?.label || 'Dashboard'}</h2>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0">
            <button
              onClick={() => setShowFeedback(true)}
              className="p-2 text-text-muted hover:text-white transition-colors"
              title="Send feedback to Sushil"
            >
              <MessageSquareHeart className="w-5 h-5" />
            </button>
            <div className="relative">
              <button 
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) markNotificationsRead();
                }}
                className="relative p-2 text-text-muted hover:text-white transition-colors"
              >
                <Bell className="w-5 h-5" />
                {notifications.some(n => !n.is_read) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full border-2 border-primary" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={cn(
                      "glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50",
                      isMobile
                        ? "fixed left-3 right-3 top-[calc(60px+env(safe-area-inset-top))] w-auto"
                        : "absolute right-0 mt-2 w-80"
                    )}
                  >
                    <div className="p-4 border-b border-white/10 bg-white/5">
                      <h4 className="text-sm font-bold text-white">Notifications</h4>
                    </div>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar">
                      {notifications.length > 0 ? (
                        notifications.map(n => (
                          <div key={n.id} className={cn("p-4 border-b border-white/5 hover:bg-white/5 transition-colors", !n.is_read && "bg-accent/5")}>
                            <p className="text-xs text-white leading-relaxed">{n.content}</p>
                            <p className="text-[10px] text-text-muted/70 mt-1">{format(new Date(n.timestamp), 'MMM d, h:mm a')}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center">
                          <p className="text-xs text-text-muted/70">No notifications yet</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {teams.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowTeamMenu(!showTeamMenu)}
                  className="flex items-center gap-1.5 px-2.5 py-2 bg-white/5 rounded-full border border-white/10 hover:border-accent/40 hover:bg-white/[0.08] transition-all cursor-pointer max-w-[140px] sm:max-w-[200px]"
                  aria-label="Switch team"
                  title="Switch team"
                >
                  <Layers className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="hidden sm:block text-xs font-bold text-white truncate">{activeTeamName}</span>
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
                        "glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50",
                        isMobile
                          ? "fixed left-3 right-3 top-[calc(60px+env(safe-area-inset-top))] w-auto"
                          : "absolute right-0 mt-2 w-56"
                      )}
                    >
                      <div className="p-3 border-b border-white/10 bg-white/5">
                        <p className="text-[11px] font-bold text-text-muted uppercase tracking-wider">My teams</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto custom-scrollbar">
                        {teams.map((t: any) => (
                          <button
                            key={t.id}
                            onClick={() => { setShowTeamMenu(false); handleSwitchTeam(t.id); }}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/5",
                              t.id === currentTeamId ? "bg-accent/10" : ""
                            )}
                          >
                            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
                              <Layers className="w-4 h-4 text-accent" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
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
            <button
              onClick={handleBrunoButton}
              data-onboard="header-bruno"
              title={`${botName} — click for quick chat, double-click for full view`}
              aria-label={`Open ${botName}`}
              className="w-10 h-10 rounded-full bg-accent/15 border border-accent/40 hover:bg-accent/25 hover:scale-105 active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
            >
              <span className="text-[20px] leading-none" role="img" aria-label="Bruno the robot">🤖</span>
            </button>
            {currentUser && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-3 p-1.5 sm:px-4 sm:py-2 bg-white/5 rounded-full border border-white/10 hover:border-accent/40 hover:bg-white/[0.08] transition-all cursor-pointer"
                  aria-label="Account menu"
                >
                  <Avatar user={currentUser} size="sm" />
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-bold text-white">{currentUser.name}</p>
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
                        "glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50",
                        isMobile
                          ? "fixed left-3 right-3 top-[calc(60px+env(safe-area-inset-top))] w-auto"
                          : "absolute right-0 mt-2 w-52"
                      )}
                    >
                      <div className="p-3 border-b border-white/10 bg-white/5">
                        <p className="text-sm font-bold text-white truncate">{currentUser.name}</p>
                        <p className="text-[11px] text-text-muted truncate">{currentUser.email || currentUser.role}</p>
                      </div>
                      <div className="p-1.5">
                        <button
                          onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white hover:bg-white/[0.06] transition-colors"
                        >
                          <UserCircle className="w-[18px] h-[18px] text-accent" />
                          My Profile
                        </button>
                        <button
                          onClick={() => { setShowUserMenu(false); openSetupGuide(); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white hover:bg-white/[0.06] transition-colors"
                        >
                          <Sparkles className="w-[18px] h-[18px] text-accent" />
                          Setup guide
                        </button>
                        {(currentUser as any)?.account_type === 'admin' && (
                          <button
                            onClick={() => { setShowUserMenu(false); navigate('/settings'); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white hover:bg-white/[0.06] transition-colors"
                          >
                            <Settings className="w-[18px] h-[18px] text-accent" />
                            Settings
                          </button>
                        )}
                        <div className="my-1.5 border-t border-white/[0.06]" />
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
          "flex flex-col flex-1 min-h-0",
          isChatRoute ? "overflow-hidden pb-[calc(62px+env(safe-area-inset-bottom))] md:pb-0" : "px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 pb-28 md:pb-8 overflow-y-auto custom-scrollbar"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="flex flex-col flex-1 min-h-0"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                  <p className="text-text-muted animate-pulse">Synchronizing club data...</p>
                </div>
              ) : renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
        {!isChatRoute && (
        <AppFooter
          links={visibleTabs.filter((t) => ['dashboard', 'stats', 'scout', 'calendar', 'chat', 'tasks'].includes(t.id))}
          teamName={activeTeamName}
        />
        )}
      </main>

      {/* Mobile bottom tab bar — the student-first navigation on phones */}
      {isMobile && (
        <nav
          aria-label="Primary"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-secondary/95 backdrop-blur-lg"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex">
            {mobileTabs.map((t) => {
              const isActive = activeTab === t.id;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  data-onboard={`mtab-${t.id}`}
                  onClick={() => navigate(`/${t.path}`)}
                  aria-current={isActive ? 'page' : undefined}
                  className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[62px] active:scale-95 transition-transform"
                >
                  <Icon className={cn('w-6 h-6', isActive ? 'text-accent' : 'text-text-muted')} strokeWidth={isActive ? 2.5 : 2} />
                  <span className={cn('text-[10px] font-bold leading-none', isActive ? 'text-accent' : 'text-text-muted')}>
                    {mobileTabShortLabels[t.id] || t.label}
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

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      <CookieConsent />
      <BrunoPanel
        key={currentUser?.team_id ?? 'none'}
        open={brunoPanelOpen}
        onClose={() => setBrunoPanelOpen(false)}
        onExpand={() => { setBrunoPanelOpen(false); navigate('/bruno'); }}
        currentUser={currentUser}
        botName={botName}
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
  );
}

// Site footer for the app shell: quick navigation, data credit, copyright.
function AppFooter({ links, teamName }: { links: { id: string; path: string; label: string }[]; teamName?: string }) {
  const navigate = useNavigate();
  return (
    <footer className="hidden md:block flex-shrink-0 border-t border-white/[0.06] bg-secondary/60">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
            <Bolt className="text-accent-ink w-3.5 h-3.5" strokeWidth={2.5} />
          </div>
          <p className="text-xs text-text-muted truncate">
            <span className="font-bold text-white">Control Point</span>
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
              {l.label}
            </button>
          ))}
        </nav>
        <p className="text-[10px] text-text-muted/70 text-center sm:text-right leading-relaxed">
          Match data: ftc-scout.org<br className="sm:hidden" /> · © 2026 Control Point
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
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6">
      <div className="glass rounded-2xl border border-white/10 max-w-2xl mx-auto p-5 sm:p-6 shadow-2xl">
        {!customizing ? (
          <>
            <h3 className="text-base font-display font-bold text-white mb-2">How Control Point stores data</h3>
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
            <h3 className="text-base font-display font-bold text-white mb-4">Storage preferences</h3>
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 p-3">
                <div>
                  <p className="text-sm font-bold text-white">Essential</p>
                  <p className="text-xs text-text-muted">Sign-in session and security. Always on.</p>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Always on</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 p-3">
                <div>
                  <p className="text-sm font-bold text-white">Preferences</p>
                  <p className="text-xs text-text-muted">Theme colors and UI choices, saved on this device.</p>
                </div>
                <button
                  onClick={() => setFunctional(!functional)}
                  className={cn("w-11 h-6 rounded-full transition-colors relative flex-shrink-0", functional ? "bg-accent" : "bg-white/10")}
                  aria-label="Toggle preference storage"
                >
                  <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all", functional ? "left-[22px]" : "left-0.5")} />
                </button>
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

function DashboardView({ data, currentUser, onRefresh, settings, setLoading, insights, updateInsights, isAiLoading, setIsAiLoading, ThinkingIndicator, updateSummary, colorVersion, teams, onboardingState, onContinueSetup, onDismissChecklist }: any) {
  const [aiTab, setAiTab] = useState<'summary' | 'insights'>('summary');
  const navigate = useNavigate();
  const ftc = useFtcTeam();
  const [showOut, setShowOut] = useState(false);
  const [outReason, setOutReason] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const myStatus = data.attendance?.find((r: any) => r.member_id === currentUser?.id && r.date === today);

  const handleSelfReport = async (status: string, reason?: string) => {
    setLoading(true);
    try {
      let finalStatus = status;

      // AI excuse checker is skipped for now: a self-reported absence is
      // logged as unexcused with the reason saved, and an admin can flip it
      // to excused from the Attendance view.
      if (status === 'O' && reason) {
        finalStatus = 'U';
      }

      const res = await apiFetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          records: [{ member_id: currentUser.id, status: finalStatus, reason }]
        })
      });
      if (res.ok) {
        setShowOut(false);
        onRefresh();
        if (reason) notify('Absence logged. An admin can mark it excused from the Attendance view.', 'success');
      }
    } finally {
      setLoading(false);
    }
  };

  const totalBudget = data.budget?.reduce((acc: number, item: any) => 
    item.type === 'income' ? acc + item.amount : acc - item.amount, 0
  ) || 0;

  const todayAttendance = data.attendance?.filter((r: any) => r.date === today) || [];
  const attendanceRate = todayAttendance.length > 0
    ? (todayAttendance.filter((r: any) => r.status === 'P' || r.status === 'L').length / (data.members?.length || 1) * 100).toFixed(0)
    : (data.attendance?.filter((r: any) => r.status === 'P').length / Math.max(1, data.attendance?.length || 0) * 100).toFixed(0);

  const activeTasks = data.tasks?.filter((t: any) => t.status !== 'done').length || 0;

  const chartData = useMemo(() => {
    const last14Days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return format(d, 'yyyy-MM-dd');
    });

    return last14Days.map(date => ({
      date: format(new Date(date), 'MMM dd'),
      count: data.attendance?.filter((r: any) => r.date === date && (r.status === 'P' || r.status === 'L')).length || 0
    }));
  }, [data.attendance, colorVersion]);

  // Get dynamic colors for charts
  const accentColor = getCSSVariable('--color-accent') || '#FFC700';
  const secondaryColor = getCSSVariable('--color-secondary') || '#1A1A1A';

  const myTeam = (teams || []).find((t: any) => t.id === currentUser?.team_id);

  const copyAccessCode = async () => {
    if (!myTeam?.access_code) return;
    try { await navigator.clipboard.writeText(myTeam.access_code); } catch { /* clipboard unavailable */ }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const regenerateCode = async () => {
    if (!(await confirmDialog({ title: 'Regenerate access code', message: 'Generate a new access code? The old code will stop working.', confirmLabel: 'Regenerate', danger: true }))) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/teams/regenerate-code', { method: 'POST' });
      if (res.ok) onRefresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    {onboardingState && shouldShowChecklist(onboardingState) && (
      <div className="mb-3">
        <SetupChecklist
          state={onboardingState}
          onContinue={onContinueSetup}
          onDismiss={onDismissChecklist}
        />
      </div>
    )}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
      {/* ── KPI row ─────────────────────────────────────────── */}
      <Card className="xl:col-span-3 p-3 gap-3" icon={Trophy} title="FTC Standing" subtitle={ftc.data ? `Team ${ftc.data.number} · ${seasonLabel(ftc.season)}` : 'Connect your team in Settings'}>
        {ftc.loading ? (
          <div className="h-14 flex items-center"><div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" /></div>
        ) : ftc.data?.opr?.tot ? (
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-display font-bold text-accent leading-none">#{ftc.data.opr.tot.rank?.toLocaleString() ?? '–'}</p>
              <p className="text-[11px] text-text-muted mt-1.5">OPR {ftc.data.opr.tot.value} · world rank</p>
            </div>
            <button onClick={() => navigate('/stats')} className="text-xs font-bold text-accent hover:opacity-80 whitespace-nowrap">Full stats →</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-text-muted">No team connected</p>
            <button onClick={() => navigate('/settings')} className="text-xs font-bold text-accent hover:opacity-80 whitespace-nowrap">Connect →</button>
          </div>
        )}
      </Card>

      <Card className="xl:col-span-3 p-3 gap-3" icon={CalendarCheck} title="Attendance" subtitle={todayAttendance.length > 0 ? "Today's session" : 'All-time average'}>
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-display font-bold text-white leading-none">{attendanceRate}<span className="text-lg text-text-muted">%</span></p>
          <button onClick={() => navigate('/attendance')} className="text-xs font-bold text-accent hover:opacity-80 whitespace-nowrap">Details →</button>
        </div>
      </Card>

      <Card className="xl:col-span-3 p-3 gap-3" icon={CheckSquare} title="Open Tasks" subtitle={`${data.tasks?.length || 0} total tasks`}>
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-display font-bold text-blue-400 leading-none">{activeTasks}</p>
          <button onClick={() => navigate('/tasks')} className="text-xs font-bold text-accent hover:opacity-80 whitespace-nowrap">View all →</button>
        </div>
      </Card>

      <Card className="xl:col-span-3 p-3 gap-3" icon={Wallet} title="Budget" subtitle="Net balance">
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-display font-bold text-emerald-400 leading-none truncate">${totalBudget.toLocaleString()}</p>
          <button onClick={() => navigate('/budget')} className="text-xs font-bold text-accent hover:opacity-80 whitespace-nowrap">View →</button>
        </div>
      </Card>

      {/* ── FTC team detail + access code ───────────────────── */}
      <Card className="md:col-span-2 xl:col-span-8 p-3 gap-3" icon={Trophy} title="Team Performance" subtitle={ftc.data ? `${ftc.data.name} · ftc-scout.org` : 'FTC Scout integration'}>
        {ftc.loading ? (
          <div className="flex items-center gap-3 py-6"><div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" /><p className="text-sm text-text-muted animate-pulse">Loading stats…</p></div>
        ) : ftc.notConnected ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-2">
            <p className="text-sm text-text-muted flex-1">Connect your FTC team number to see live OPR, rankings, and event history here.</p>
            <Button onClick={() => navigate('/settings')} className="text-sm w-fit">Connect team</Button>
          </div>
        ) : ftc.data ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="bg-accent text-accent-ink font-display font-bold px-2.5 py-0.5 rounded-lg text-sm shrink-0">#{ftc.data.number}</span>
                <div className="min-w-0">
                  <p className="text-white font-bold leading-tight text-sm truncate">{ftc.data.name}</p>
                  <p className="text-[10px] text-text-muted truncate">{[ftc.data.school, ftc.data.city, ftc.data.state].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex flex-wrap gap-1">
                  {ftc.data.seasons.map((s: number) => (
                    <button key={s} onClick={() => ftc.setSeason(s)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${s === ftc.season ? 'bg-accent text-accent-ink' : 'bg-white/5 text-text-muted hover:text-white border border-white/10'}`}>
                      {s}–{String(s + 1).slice(2)}
                    </button>
                  ))}
                </div>
                <button onClick={() => navigate('/stats')} className="text-[11px] font-bold text-accent hover:opacity-80 whitespace-nowrap">Full stats →</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[['Total OPR', ftc.data.opr.tot], ['Auto', ftc.data.opr.auto], ['TeleOp', ftc.data.opr.dc], ['Endgame', ftc.data.opr.eg]].map(([label, stat]: any) => (
                <div key={label as string} className="px-2 py-1.5 bg-white/5 rounded-lg border border-white/5 min-w-0">
                  <p className="text-[9px] text-text-muted uppercase font-bold tracking-wider truncate">{label}</p>
                  <p className="text-base font-display font-bold text-white leading-tight truncate">{stat?.value ?? '—'} <span className="text-[10px] text-accent font-bold">{stat?.rank != null ? `#${stat.rank.toLocaleString()}` : ''}</span></p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-4">
            <p className="text-sm text-text-muted flex-1">{ftc.error || 'Stats unavailable.'}</p>
            <Button variant="secondary" onClick={ftc.refresh} className="text-sm">Retry</Button>
          </div>
        )}
      </Card>

      {myTeam && (
        <Card className="xl:col-span-4 p-3 gap-3" icon={KeyRound} title="Team Access Code" subtitle="Students join with this code">
          <p className="text-xl font-mono font-bold text-accent tracking-[0.12em] break-all">{myTeam.access_code}</p>
          <div className="flex gap-2 mt-1">
            <Button variant="secondary" onClick={copyAccessCode} className="text-xs flex-1">
              {copiedCode ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
            </Button>
            <Button variant="ghost" onClick={regenerateCode} className="text-xs">Regenerate</Button>
          </div>
        </Card>
      )}

      {/* ── Attendance trend + up next ──────────────────────── */}
      <Card className="md:col-span-2 xl:col-span-7 p-3 gap-3" icon={TrendingUp} title="Attendance Trend" subtitle="Present check-ins · last 14 days">
        <div className="h-10 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} interval={2} />
              <YAxis stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip
                contentStyle={{ backgroundColor: secondaryColor, border: '1px solid #ffffff20', borderRadius: '12px' }}
                itemStyle={{ color: accentColor }}
              />
              <Line type="monotone" dataKey="count" stroke={accentColor} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="xl:col-span-5 p-3 gap-3" icon={Calendar} title="Up Next" subtitle="Events & open tasks">
        <div className="space-y-2 max-h-20 overflow-y-auto custom-scrollbar pr-1">
          {(data.events || []).filter((e: any) => e.date >= today).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))).slice(0, 3).map((e: any) => (
            <div key={`e-${e.id}`} className="flex items-center gap-3 p-2 bg-white/5 rounded-xl border border-white/5">
              <div className="w-9 h-9 rounded-lg bg-accent/15 flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-accent uppercase leading-none">{format(new Date(e.date + 'T12:00:00'), 'MMM')}</span>
                <span className="text-sm font-display font-bold text-white leading-none">{format(new Date(e.date + 'T12:00:00'), 'd')}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-white truncate">{e.title}</p>
                <p className="text-[10px] text-text-muted">{e.start_time || ''}{e.location ? ` · ${e.location}` : ''}</p>
              </div>
            </div>
          ))}
          {(data.tasks || []).filter((t: any) => t.status !== 'done').slice(0, 3).map((t: any) => (
            <div key={`t-${t.id}`} className="flex items-center gap-3 p-2 bg-white/5 rounded-xl border border-white/5">
              <div className={cn('w-2 h-2 rounded-full shrink-0 ml-3.5', t.status === 'todo' ? 'bg-slate-500' : 'bg-blue-400')} />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-white truncate">{t.title}</p>
                <p className="text-[10px] text-text-muted">Task{t.due_date ? ` · due ${t.due_date}` : ''}</p>
              </div>
            </div>
          ))}
          {(data.events || []).filter((e: any) => e.date >= today).length === 0 && (data.tasks || []).filter((t: any) => t.status !== 'done').length === 0 && (
            <p className="text-xs text-text-muted/70 italic py-2">Nothing scheduled — enjoy the calm.</p>
          )}
        </div>
      </Card>

      {/* ── AI activity + my status ─────────────────────────── */}
      <Card className="md:col-span-2 xl:col-span-7 p-3 gap-3" icon={Zap} title="AI Activity" subtitle="Summaries & attendance insights">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
            {(['summary', 'insights'] as const).map(t => (
              <button key={t} onClick={() => setAiTab(t)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${aiTab === t ? 'bg-accent text-accent-ink' : 'text-text-muted hover:text-white'}`}>
                {t === 'summary' ? 'Summary' : 'Insights'}
              </button>
            ))}
          </div>
          {aiTab === 'summary' ? (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-accent" onClick={() => updateSummary(true)} disabled={isAiLoading}>
              <Clock className="w-3 h-3 mr-1" /> Refresh
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => updateInsights()} disabled={isAiLoading} className="text-[11px] h-7">
              {insights ? 'Refresh' : 'Generate'}
            </Button>
          )}
        </div>
        <div className="text-[13px] text-white/80 leading-relaxed prose prose-invert max-w-none max-h-16 min-h-[48px] overflow-y-auto custom-scrollbar pr-1">
          {aiTab === 'summary' ? (
            isAiLoading && !data.summary ? <ThinkingIndicator /> : <Markdown>{data.summary || 'No summary available yet.'}</Markdown>
          ) : (
            isAiLoading && !insights ? <ThinkingIndicator /> : insights ? <Markdown>{insights}</Markdown> : <p className="text-xs text-text-muted/70 italic">Generate AI insights from your attendance data.</p>
          )}
        </div>
      </Card>

      <Card className="xl:col-span-5 p-3 gap-3" icon={User} title="My Status" subtitle="Today's check-in">
        {myStatus ? (
          <div className={cn(
            'p-3 rounded-xl border flex items-center justify-between gap-2',
            myStatus.status === 'P' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
            myStatus.status === 'A' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
            myStatus.status === 'L' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
            'bg-blue-500/10 border-blue-500/30 text-blue-400'
          )}>
            <span className="text-sm font-bold flex items-center gap-2">
              <CalendarCheck className="w-4 h-4" />
              {myStatus.status === 'P' ? 'Present' : myStatus.status === 'A' ? 'Absent' : myStatus.status === 'E' ? 'Excused' : myStatus.status === 'L' ? 'Late' : 'Other'}
            </span>
            <Button variant="ghost" size="sm" onClick={() => handleSelfReport('-')} className="h-7 text-[11px] opacity-60 hover:opacity-100">Reset</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button onClick={() => handleSelfReport('P')} variant="outline" className="flex-1 text-xs border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10" disabled={isAiLoading}>
              <CheckSquare className="w-3.5 h-3.5" /> I'm Here
            </Button>
            <Button onClick={() => handleSelfReport('L')} variant="outline" className="flex-1 text-xs border-amber-500/50 text-amber-400 hover:bg-amber-500/10" disabled={isAiLoading}>
              <Clock className="w-3.5 h-3.5" /> Late
            </Button>
            <Button onClick={() => setShowOut(true)} variant="secondary" className="text-xs" disabled={isAiLoading}>
              <LogOut className="w-3.5 h-3.5" /> Out
            </Button>
          </div>
        )}
      </Card>
    </div>

      {showOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Absence" className="w-full max-w-md">
            <div className="space-y-4">
              <p className="text-sm text-text-muted">Let the team know why you'll be missing today's session.</p>
              <textarea 
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-24 disabled:opacity-50"
                placeholder="Reason for absence..."
                value={outReason}
                onChange={(e) => setOutReason(e.target.value)}
                disabled={isAiLoading}
              />
              {isAiLoading && <div className="flex justify-center"><ThinkingIndicator /></div>}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowOut(false)} disabled={isAiLoading}>Cancel</Button>
                <Button onClick={() => handleSelfReport('O', outReason)} disabled={isAiLoading || !outReason}>Submit</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

// Personal dashboard for students: my tasks, my attendance, upcoming events
function StudentDashboardView({ teams, members, attendance, tasks, setTasks, events, currentUser, onRefresh, setLoading, onboardingState, onContinueSetup, onDismissChecklist }: any) {
  const myTeam = teams?.find((t: any) => t.id === currentUser?.team_id);
  const today = format(new Date(), 'yyyy-MM-dd');
  const myTasks = (tasks || []).filter((t: any) => t.assigned_to === currentUser?.id);
  const openTasks = myTasks.filter((t: any) => t.status !== 'done');
  const myAttendance = (attendance || []).filter((r: any) => r.member_id === currentUser?.id);
  const attendanceRate = myAttendance.length > 0
    ? Math.round(myAttendance.filter((r: any) => r.status === 'P' || r.status === 'L' || r.status === 'E').length / myAttendance.length * 100)
    : null;
  const upcomingEvents = (events || [])
    .filter((e: any) => e.date >= today)
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const toggleTask = async (task: any) => {
    // Optimistic: flip instantly, roll back on failure. No global spinner.
    const next = task.status === 'done' ? 'todo' : 'done';
    const prev = tasks;
    setTasks((ts: any[]) => ts.map((t: any) => t.id === task.id
      ? { ...t, status: next, completed_at: next === 'done' ? new Date().toISOString() : null }
      : t));
    try {
      const res = await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) {
        setTasks(prev);
        notify('Could not update task — try again.', 'error');
      }
    } catch {
      setTasks(prev);
      notify('Could not update task — try again.', 'error');
    }
  };

  const statusChip: any = {
    P: 'bg-emerald-400/15 text-emerald-400',
    L: 'bg-amber-400/15 text-amber-400',
    E: 'bg-sky-400/15 text-sky-400',
    O: 'bg-slate-400/15 text-slate-400',
    U: 'bg-rose-400/15 text-rose-400',
  };

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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 pb-8 sm:pb-20">
      <Card className="lg:col-span-3" icon={GraduationCap}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
              Welcome back, {currentUser?.name?.split(' ')[0]}
            </h2>
            <p className="text-sm text-text-muted mt-1">
              {myTeam?.name ? `${myTeam.name} • ` : ''}{members?.length || 0} teammates
            </p>
          </div>
          <div className="flex gap-4 sm:gap-6">
            <div className="text-center">
              <p className="text-2xl font-display font-bold text-accent">{openTasks.length}</p>
              <p className="text-[11px] text-text-muted uppercase font-bold">Open tasks</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-display font-bold text-accent">{attendanceRate === null ? '—' : `${attendanceRate}%`}</p>
              <p className="text-[11px] text-text-muted uppercase font-bold">My attendance</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-display font-bold text-accent">{upcomingEvents.length}</p>
              <p className="text-[11px] text-text-muted uppercase font-bold">Upcoming events</p>
            </div>
          </div>
        </div>
      </Card>

      <Card title="My Tasks" icon={CheckSquare} className="lg:col-span-2">
        {myTasks.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">No tasks assigned to you yet. Nice work — you're all caught up.</p>
        ) : (
          <div className="space-y-2">
            {myTasks.map((task: any) => (
              <button
                key={task.id}
                onClick={() => toggleTask(task)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all text-left"
              >
                <span className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all",
                  task.status === 'done' ? "bg-accent border-accent" : "border-white/25"
                )}>
                  {task.status === 'done' && <Check className="w-3.5 h-3.5 text-accent-ink" strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={cn("block text-sm font-semibold truncate", task.status === 'done' ? "text-text-muted line-through" : "text-white")}>
                    {task.title}
                  </span>
                  {task.due_date && <span className="text-[11px] text-text-muted">Due {task.due_date}</span>}
                </span>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md",
                  task.status === 'done' ? "bg-emerald-400/15 text-emerald-400" : task.status === 'in-progress' ? "bg-blue-400/15 text-blue-400" : "bg-slate-400/15 text-slate-400"
                )}>
                  {task.status === 'done' ? 'Done' : task.status === 'in-progress' ? 'In progress' : 'To do'}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Upcoming Events" icon={Calendar}>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">No upcoming events scheduled.</p>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((e: any) => (
              <div key={e.id} className="flex gap-3">
                <div className="w-11 shrink-0 rounded-xl bg-accent/10 border border-accent/20 flex flex-col items-center justify-center py-1.5">
                  <span className="text-[10px] font-bold text-accent uppercase">{format(new Date(e.date + 'T12:00:00'), 'MMM')}</span>
                  <span className="text-lg font-display font-bold text-white leading-none">{format(new Date(e.date + 'T12:00:00'), 'd')}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{e.title}</p>
                  <p className="text-xs text-text-muted truncate">{[e.time, e.location].filter(Boolean).join(' • ')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="My Recent Attendance" icon={CalendarCheck} className="lg:col-span-3">
        {myAttendance.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">No attendance records yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {myAttendance.slice(0, 14).map((r: any) => (
              <div key={r.id} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold", statusChip[r.status] || statusChip.O)}>
                <span>{r.date}</span>
                <span className="opacity-80">{r.status === 'P' ? 'Present' : r.status === 'L' ? 'Late' : r.status === 'E' ? 'Excused' : r.status === 'U' ? 'Unexcused' : 'Out'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
    </>
  );
}

function TeamsView({ teams, members, onRefresh, currentUser, hasScope, onAddTeam, onSwitchTeam, onDeleteTeam, onLeaveTeam }: any) {
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [newTeam, setNewTeam] = useState<any>({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
  const [newMember, setNewMember] = useState({ team_id: '', name: '', role: '', email: '', is_board: false, scopes: [] });
  const [memberToRemove, setMemberToRemove] = useState<any>(null);
  const [removeError, setRemoveError] = useState('');
  const [removingMember, setRemovingMember] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);

  const isAdmin = hasScope('admin');
  const activeTeamId = currentUser?.team_id;

  const handleResetPassword = async (email: string) => {
    if (!(await confirmDialog({ title: 'Reset password', message: `Reset password for ${email}? They will need to set it up again on next login.`, confirmLabel: 'Reset', danger: true }))) return;
    await apiFetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    notify('Password reset successfully.', 'success');
  };

  const handleAddTeam = async () => {
    if (savingTeam) return;
    setSavingTeam(true);
    try {
      if (editingTeam) {
        const res = await apiFetch(`/api/teams/${editingTeam.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newTeam)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not save team');
        notify('Team updated', 'success');
        setShowAddTeam(false);
        setEditingTeam(null);
        setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
        onRefresh();
      } else {
        // Creating a new workspace switches the session to it
        const data = await onAddTeam(newTeam.name);
        notify(`Team "${data.team?.name || 'created'}" created — code ${data.team?.access_code}`, 'success');
        setShowAddTeam(false);
        setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
      }
    } catch (e: any) {
      notify(e.message || 'Could not save team', 'error');
    } finally {
      setSavingTeam(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToRemove) return;
    setRemovingMember(true);
    setRemoveError('');
    try {
      const res = await apiFetch(`/api/members/${memberToRemove.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setRemoveError(err.error || 'Could not remove member');
        return;
      }
      setMemberToRemove(null);
      onRefresh();
    } catch (error) {
      setRemoveError('Could not remove member: ' + error);
    } finally {
      setRemovingMember(false);
    }
  };

  const handleAddMember = async () => {
    const url = editingMember ? `/api/members/${editingMember.id}` : '/api/members';
    const method = editingMember ? 'PATCH' : 'POST';
    
    // Robust scope handling
    let scopes = newMember.scopes;
    if (typeof scopes === 'string') {
      try {
        scopes = JSON.parse(scopes);
      } catch {
        scopes = [];
      }
    }

    await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newMember, scopes })
    });
    setShowAddMember(false);
    setEditingMember(null);
    setNewMember({ team_id: '', name: '', role: '', email: '', is_board: false, scopes: [] });
    onRefresh();
  };

  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">Teams</h3>
          <p className="text-sm text-text-muted mt-1">Your workspaces — create teams, tweak their look, and share access codes so students can join.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => {
            setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
            setShowAddTeam(true);
          }}><Plus className="w-4 h-4" /> Add Team</Button>
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
                  <span className="text-[11px] text-text-muted font-mono">Code: <span className="font-bold text-white">{team.access_code}</span></span>
                </div>
                <p className="text-xs text-text-muted uppercase font-bold">Members ({team.member_count ?? 0})</p>
                {team.id === activeTeamId ? (
                  <div className="flex flex-wrap gap-2">
                    {members.filter((m: any) => m.team_id === team.id).map((m: any) => (
                      <div key={m.id} className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs text-white">
                        {m.name}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted/70">Switch to this team to manage its members.</p>
                )}
                {(team.accent_color || team.primary_color) && (
                  <div className="pt-2">
                    <p className="text-[10px] text-text-muted/70 uppercase font-bold mb-1">Team Branding</p>
                    <div className="flex gap-2">
                      {team.accent_color && <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: team.accent_color }} title="Accent" />}
                      {team.primary_color && <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: team.primary_color }} title="Primary" />}
                      {team.text_color && <div className="w-4 h-4 rounded-full border border-white/10" style={{ backgroundColor: team.text_color }} title="Text" />}
                    </div>
                  </div>
                )}
              </div>
              {isAdmin ? (
                <div className="flex gap-2 pt-4 border-t border-white/5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1 h-8 text-[10px]"
                    onClick={() => {
                      setEditingTeam(team);
                      setNewTeam({
                        name: team.name,
                        number: team.number,
                        accent_color: team.accent_color || '',
                        primary_color: team.primary_color || '',
                        text_color: team.text_color || ''
                      });
                      setShowAddTeam(true);
                    }}
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
                <div className="flex gap-2 pt-4 border-t border-white/5">
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
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">All Members</h3>
          <p className="text-sm text-text-muted mt-1">Everyone on this team — manage the roster, roles, and permissions.</p>
        </div>
        <Button onClick={() => setShowAddMember(true)}><Plus className="w-4 h-4" /> Add Member</Button>
      </div>

      <div className="glass rounded-2xl overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 border-b border-white/10">
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
          <tbody className="divide-y divide-white/5">
            {members.map((m: any) => (
              <tr key={m.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 text-sm text-white font-medium">
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
                    <span className="px-2 py-1 bg-slate-800 text-text-muted/70 text-[10px] font-bold rounded-md uppercase">No</span>
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
                        onClick={() => {
                          setEditingMember(m);
                          let scopes = m.scopes;
                          try {
                            if (typeof scopes === 'string') scopes = JSON.parse(scopes);
                          } catch {
                            scopes = [];
                          }
                          setNewMember({ 
                            team_id: m.team_id || '', 
                            name: m.name, 
                            role: m.role, 
                            email: m.email, 
                            is_board: m.is_board === 1, 
                            scopes: Array.isArray(scopes) ? scopes : []
                          });
                          setShowAddMember(true);
                        }}
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
                        onClick={() => { setMemberToRemove(m); setRemoveError(''); }}
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
                  <p className="text-white font-bold truncate">{memberToRemove.name}</p>
                  <p className="text-xs text-text-muted truncate">
                    {[memberToRemove.email, teams.find((t: any) => t.id === memberToRemove.team_id)?.name].filter(Boolean).join(' • ')}
                  </p>
                </div>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                Remove <span className="text-white font-semibold">{memberToRemove.name}</span> from the team?
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
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-3">
                    <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.accent_color || '#FFC700'} onChange={(e) => setNewTeam({...newTeam, accent_color: e.target.value})} />
                    <Input placeholder="Accent Color (Yellow)" value={newTeam.accent_color} onChange={(e: any) => setNewTeam({...newTeam, accent_color: e.target.value})} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.primary_color || '#09090B'} onChange={(e) => setNewTeam({...newTeam, primary_color: e.target.value})} />
                    <Input placeholder="Interface Color (Navy)" value={newTeam.primary_color} onChange={(e: any) => setNewTeam({...newTeam, primary_color: e.target.value})} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.text_color || '#F8FAFC'} onChange={(e) => setNewTeam({...newTeam, text_color: e.target.value})} />
                    <Input placeholder="Text Color" value={newTeam.text_color} onChange={(e: any) => setNewTeam({...newTeam, text_color: e.target.value})} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setShowAddTeam(false); setEditingTeam(null); setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' }); }}>Cancel</Button>
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
              <label className="flex items-center gap-2 text-sm text-white/80">
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
                          const scopes = newMember.scopes.includes(s as never) 
                            ? newMember.scopes.filter(x => x !== s) 
                            : [...newMember.scopes, s];
                          setNewMember({...newMember, scopes: scopes as never[]});
                        }}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-all",
                          newMember.scopes.includes(s as never) ? "bg-accent border-accent text-primary" : "border-white/10 text-text-muted"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setShowAddMember(false); setEditingMember(null); setNewMember({ team_id: '', name: '', role: '', email: '', is_board: false, scopes: [] }); }}>Cancel</Button>
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
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (h > 0 ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Full-screen in-app camera scanner — students point it at the projected QR.
function QrScannerModal({ onClose, onToken }: { onClose: () => void; onToken: (token: string) => void }) {
  const [error, setError] = useState('');
  const handledRef = useRef(false);
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let cancelled = false;
    (async () => {
      try {
        scanner = new Html5Qrcode('qr-reader-region');
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            if (handledRef.current) return;
            const m = decodedText.match(/\/checkin\/([A-Za-z0-9]+)/i) || decodedText.trim().match(/^([a-f0-9]{24,})$/i);
            if (m) {
              handledRef.current = true;
              onToken(m[1]);
            }
          },
          () => { /* per-frame miss — ignore */ }
        );
      } catch (e) {
        if (!cancelled) setError("Couldn't access the camera. Type the day's code instead.");
      }
    })();
    return () => {
      cancelled = true;
      try {
        const stopP = scanner?.stop() as unknown as Promise<void> | undefined;
        if (stopP && typeof stopP.then === 'function') {
          stopP.then(() => { try { scanner?.clear(); } catch { /* noop */ } }).catch(() => {});
        } else {
          try { scanner?.clear(); } catch { /* noop */ }
        }
      } catch { /* noop */ }
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <p className="text-white font-bold">Scan the check-in QR</p>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white" aria-label="Close scanner">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-10">
        {error ? (
          <div className="text-center">
            <Camera className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <p className="text-white text-sm mb-6">{error}</p>
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
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<number | 'today'>(60);
  const [presenting, setPresenting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = async () => {
    try {
      const res = await apiFetch('/api/attendance/qr-session');
      const data = await res.json();
      if (res.ok) setSession(data.session);
    } catch { /* offline — leave as-is */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session?.token]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/attendance/qr-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: duration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start session');
      setSession(data.session);
      notify('Check-in session is live — project the QR.', 'success');
    } catch (e: any) {
      notify(e.message || 'Could not start session', 'error');
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/attendance/qr-session/stop', { method: 'POST' });
      setSession(null);
      setPresenting(false);
      notify('Check-in session ended.', 'info');
    } finally {
      setBusy(false);
    }
  };

  const durations: { label: string; value: number | 'today' }[] = [
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '3 hours', value: 180 },
    { label: 'Rest of today', value: 'today' },
  ];
  const remaining = session ? new Date(session.expiresAt).getTime() - now : 0;
  useEffect(() => {
    if (session && remaining <= 0) setSession(null);
  }, [remaining]);

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
                      : 'bg-white/5 text-text-muted border-white/10 hover:text-white'
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
                <p className="text-4xl font-display font-bold tracking-[0.2em] text-white">{session.code}</p>
              </div>
              <p className="text-sm text-text-muted flex items-center justify-center sm:justify-start gap-2">
                <Timer className="w-4 h-4 text-accent" />
                Session ends in <span className="text-white font-bold tabular-nums">{formatCountdown(remaining)}</span>
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
        <div className="fixed inset-0 z-[90] bg-black flex flex-col items-center justify-center p-6 text-center">
          <button
            onClick={() => setPresenting(false)}
            className="absolute top-4 right-4 p-3 rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Exit fullscreen"
          >
            <X className="w-6 h-6" />
          </button>
          <p className="text-white/60 text-sm font-bold uppercase tracking-[0.25em] mb-2">{teamName}</p>
          <h2 className="text-white text-2xl sm:text-4xl font-display font-bold mb-6">Scan to check in</h2>
          <div className="bg-white p-5 sm:p-8 rounded-3xl">
            <QRCodeSVG value={session.url} size={Math.min(420, typeof window !== 'undefined' ? window.innerWidth - 120 : 300)} level="M" />
          </div>
          <p className="text-white/60 text-sm mt-6 mb-1 uppercase tracking-widest font-bold">No camera? Enter code</p>
          <p className="text-white text-5xl sm:text-6xl font-display font-bold tracking-[0.25em]">{session.code}</p>
          <p className="text-white/50 text-sm mt-6 tabular-nums">Ends in {formatCountdown(remaining)}</p>
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
              <h3 className="text-xl font-display font-bold text-white mb-2">Can't check in</h3>
              <p className="text-sm text-text-muted mb-6">{error}</p>
              <Button onClick={() => navigate('/dashboard')} variant="secondary">Back to dashboard</Button>
            </>
          ) : done ? (
            <>
              <h3 className="text-xl font-display font-bold text-white mb-2">You're checked in</h3>
              <p className="text-sm text-text-muted mb-6">{info?.teamName} · {format(new Date(), 'EEEE, MMMM d')}</p>
              <Button onClick={() => navigate('/dashboard')}>Back to dashboard</Button>
            </>
          ) : !info ? (
            <p className="text-sm text-text-muted">Loading session…</p>
          ) : !info.isMember ? (
            <>
              <h3 className="text-xl font-display font-bold text-white mb-2">Wrong team</h3>
              <p className="text-sm text-text-muted mb-6">You're signed in as {currentUser?.name}, who isn't on {info.teamName}.</p>
              <Button onClick={() => navigate('/dashboard')} variant="secondary">Back to dashboard</Button>
            </>
          ) : (
            <>
              <p className="text-xs text-text-muted uppercase font-bold tracking-widest mb-1">{info.teamName}</p>
              <h3 className="text-xl font-display font-bold text-white mb-2">Check in{info.memberName ? ` as ${info.memberName}` : ''}?</h3>
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

function StudentCheckinView({ attendance, currentUser, onRefresh }: any) {
  const [scanOpen, setScanOpen] = useState(false);
  const [codeMode, setCodeMode] = useState(false);
  const [code, setCode] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const myRecords = (attendance || [])
    .filter((r: any) => r.member_id === currentUser?.id)
    .sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
  const todayRecord = myRecords.find((r: any) => r.date === today);
  const checkedIn = todayRecord && (todayRecord.status === 'P' || todayRecord.status === 'L');

  const statusMeta: any = {
    P: { label: 'Present', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    L: { label: 'Late', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    E: { label: 'Excused', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    U: { label: 'Unexcused', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    S: { label: 'Sick', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  };

  const checkinWithToken = async (token: string) => {
    setScanOpen(false);
    try {
      const res = await apiFetch(`/api/attendance/checkin/${token}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      notify(data.already ? 'You were already checked in.' : 'Checked in — welcome!', 'success');
      await onRefresh();
    } catch (e: any) {
      notify(e.message || 'Check-in failed', 'error');
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setCodeBusy(true);
    try {
      const res = await apiFetch('/api/attendance/checkin-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      notify(data.already ? 'You were already checked in.' : 'Checked in — welcome!', 'success');
      setCode('');
      setCodeMode(false);
      await onRefresh();
    } catch (e: any) {
      notify(e.message || 'Check-in failed', 'error');
    } finally {
      setCodeBusy(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Attendance</h3>
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
            <h4 className="text-xl font-display font-bold text-white mb-2">You are checked in</h4>
            <p className="text-sm text-text-muted">Status: {statusMeta[todayRecord.status]?.label || todayRecord.status}</p>
          </>
        ) : (
          <>
            <h4 className="text-xl font-display font-bold text-white mb-2">Not checked in yet</h4>
            <p className="text-sm text-text-muted mb-5">Scan the QR code your admin has projected,<br />or enter today's code.</p>
            <Button onClick={() => setScanOpen(true)} className="px-8 py-3 text-base w-full sm:w-auto">
              <ScanLine className="w-5 h-5" /> Scan QR code
            </Button>
            <div className="mt-3">
              <button
                onClick={() => setCodeMode(!codeMode)}
                className="text-sm text-text-muted hover:text-white underline underline-offset-4"
              >
                {codeMode ? 'Hide code entry' : 'Camera not working? Enter the code'}
              </button>
            </div>
            {codeMode && (
              <form onSubmit={handleCodeSubmit} className="mt-3 flex gap-2 max-w-xs mx-auto">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                  placeholder="Day code"
                  autoComplete="off"
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-lg font-bold tracking-[0.2em] text-white placeholder:text-text-muted/50 uppercase focus:outline-none focus:border-accent/60"
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
        <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-3">My history</h4>
        {myRecords.length === 0 ? (
          <Card><p className="text-sm text-text-muted text-center py-6">No attendance records yet.</p></Card>
        ) : (
          <div className="space-y-2">
            {myRecords.slice(0, 30).map((r: any) => (
              <div key={r.date} className="glass rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-white font-medium">{format(new Date(r.date + 'T12:00:00'), 'EEE, MMM d, yyyy')}</span>
                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full border", statusMeta[r.status]?.cls || 'bg-white/5 text-text-muted border-white/10')}>
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

function AttendanceView({ members, attendance, onRefresh, setLoading, hasScope, insights, updateInsights, isAiLoading, ThinkingIndicator, currentUser, activeTeamName }: any) {
  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'history' | 'summary'>('grid');
  const [sessions, setSessions] = useState<string[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [hiddenDates, setHiddenDates] = useState<string[]>([]);
  const [calendarStart, setCalendarStart] = useState(0); // weeks from today
  const [showHideMenu, setShowHideMenu] = useState(false);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pendingChanges, setPendingChanges] = useState<Map<number, { date: string; status: string }>>(new Map());

  const isAdmin = hasScope('attendance');

  useEffect(() => {
    const fetchExtraData = async () => {
      const [sess, summ, hidden] = await Promise.all([
        apiFetch('/api/attendance/sessions').then(r => r.json()),
        apiFetch('/api/attendance/summary').then(r => r.json()),
        apiFetch('/api/hidden-dates').then(r => r.json())
      ]);
      if (Array.isArray(sess)) setSessions(sess);
      if (Array.isArray(summ)) setSummary(summ);
      if (Array.isArray(hidden)) setHiddenDates(hidden);
    };
    fetchExtraData();
  }, [attendance]);

  // Generate dates: 2-week chunks starting from today
  // Parse a 'yyyy-MM-dd' string as a LOCAL date. Plain new Date(str) parses as
  // UTC midnight, which shifts the weekday back a day in US timezones and
  // broke the day-of-week hide/show toggles.
  const parseLocalDate = (dateStr: string): Date => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const weekdayOf = (dateStr: string): number => parseLocalDate(dateStr).getDay();

  // The grid always shows at least MIN_VISIBLE_DATES columns: it scans the
  // 14-day window as before, then keeps scanning forward (skipping hidden
  // days) until it has enough. Sunday-only teams see 5 consecutive Sundays;
  // Mon–Fri teams see their weekdays in order with weekends skipped.
  const MIN_VISIBLE_DATES = 5;
  const MAX_LOOKAHEAD_DAYS = 365;

  const visibleDates = useMemo(() => {
    const dates: string[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + calendarStart * 14);

    const d = new Date(startDate);
    for (let i = 0; i < MAX_LOOKAHEAD_DAYS && (i < 14 || dates.length < MIN_VISIBLE_DATES); i++) {
      const dateStr = format(d, 'yyyy-MM-dd');
      if (!hiddenDates.includes(dateStr)) {
        dates.push(dateStr);
      }
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }, [calendarStart, hiddenDates]);

  // Date-range label follows the dates actually shown (the window may extend
  // past 14 days when hidden days are skipped).
  const rangeLabel = useMemo(() => {
    if (visibleDates.length > 0) {
      const first = parseLocalDate(visibleDates[0]);
      const last = parseLocalDate(visibleDates[visibleDates.length - 1]);
      return `${format(first, 'MMM dd')} - ${format(last, 'MMM dd')}`;
    }
    const s = new Date();
    s.setDate(s.getDate() + calendarStart * 14);
    const e = new Date(s);
    e.setDate(e.getDate() + 13);
    return `${format(s, 'MMM dd')} - ${format(e, 'MMM dd')}`;
  }, [visibleDates, calendarStart]);

  // Check if there are more dates to load
  const hasMoreDates = useMemo(() => {
    const nextStartDate = new Date();
    nextStartDate.setDate(nextStartDate.getDate() + (calendarStart + 1) * 14);
    return nextStartDate < new Date(new Date().getFullYear() + 1, 0, 1); // Can load up to next year
  }, [calendarStart]);

  const getStatus = (memberId: number, date: string) => {
    const changeKey = memberId;
    if (pendingChanges.has(changeKey) && pendingChanges.get(changeKey)!.date === date) {
      return pendingChanges.get(changeKey)!.status;
    }
    return attendance.find((r: any) => r.member_id === memberId && r.date === date)?.status || '-';
  };

  const toggleStatus = async (memberId: number, date: string) => {
    if (!isAdmin) return;
    
    const current = getStatus(memberId, date);
    const statuses = ['-', 'P', 'L', 'E', 'U', 'S'];
    const nextIndex = (statuses.indexOf(current) + 1) % statuses.length;
    const nextStatus = statuses[nextIndex];

    // Optimistic update
    const changeKey = memberId;
    const newChanges = new Map(pendingChanges);
    newChanges.set(changeKey, { date, status: nextStatus });
    setPendingChanges(newChanges);
    setSavingStatus('saving');

    try {
      const res = await apiFetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date, 
          records: [{ member_id: memberId, status: nextStatus === '-' ? null : nextStatus }] 
        })
      });
      if (res.ok) {
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus('idle'), 2000);
        // Keep optimistic update, refresh data in background
        onRefresh();
      } else {
        setSavingStatus('idle');
        notify('Failed to save attendance', 'error');
      }
    } catch (error) {
      setSavingStatus('idle');
      notify('Error saving attendance', 'error');
    }
  };

  const hideDate = async (dateStr: string) => {
    setHiddenDates([...hiddenDates, dateStr]);
    try {
      await apiFetch('/api/hidden-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr })
      });
    } catch (error) {
      console.error('Error hiding date:', error);
      setHiddenDates(hiddenDates.filter(d => d !== dateStr));
    }
  };

  const unhideDate = async (dateStr: string) => {
    setHiddenDates(hiddenDates.filter(d => d !== dateStr));
    try {
      await apiFetch(`/api/hidden-dates/${dateStr}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Error unhiding date:', error);
      setHiddenDates([...hiddenDates, dateStr]);
    }
  };

  const hideByDayOfWeek = async (dayIndex: number) => {
    // dayIndex: 0=Sunday, 1=Monday, ..., 6=Saturday
    const newHidden = [...hiddenDates];
    const toAdd: string[] = [];
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 365); // Check past year too for cleanup

    for (let i = 0; i < 730; i++) { // Check ~2 years
      checkDate.setDate(checkDate.getDate() + 1);
      if (checkDate.getDay() === dayIndex) {
        const dateStr = format(checkDate, 'yyyy-MM-dd');
        if (!newHidden.includes(dateStr)) {
          newHidden.push(dateStr);
          toAdd.push(dateStr);
        }
      }
    }

    setHiddenDates(newHidden);
    // Single bulk request instead of ~100 sequential ones.
    if (toAdd.length > 0) {
      await apiFetch('/api/hidden-dates/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: toAdd })
      }).catch(console.error);
    }
  };

  const unhideByDayOfWeek = async (dayIndex: number) => {
    const removed = hiddenDates.filter(dateStr => weekdayOf(dateStr) === dayIndex);
    const newHidden = hiddenDates.filter(dateStr => weekdayOf(dateStr) !== dayIndex);

    setHiddenDates(newHidden);
    // Single bulk request instead of ~100 sequential ones.
    if (removed.length > 0) {
      await apiFetch('/api/hidden-dates/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: removed })
      }).catch(console.error);
    }
  };

  const hideAll = async () => {
    const allDates = new Set<string>();
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 365);
    
    for (let i = 0; i < 730; i++) {
      checkDate.setDate(checkDate.getDate() + 1);
      allDates.add(format(checkDate, 'yyyy-MM-dd'));
    }
    
    const newHidden = Array.from(allDates);
    const toAdd = newHidden.filter(d => !hiddenDates.includes(d));
    setHiddenDates(newHidden);
    if (toAdd.length > 0) {
      await apiFetch('/api/hidden-dates/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: toAdd })
      }).catch(console.error);
    }
  };

  const unhideAll = async () => {
    const removed = [...hiddenDates];
    setHiddenDates([]);
    if (removed.length > 0) {
      await apiFetch('/api/hidden-dates/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: removed })
      }).catch(console.error);
    }
  };

  const statusColors: any = {
    'P': 'bg-emerald-500 text-emerald-950',
    'L': 'bg-amber-500 text-amber-950',
    'E': 'bg-blue-500 text-blue-950',
    'U': 'bg-rose-500 text-rose-950',
    'S': 'bg-purple-500 text-purple-950',
    '-': 'bg-white/5 text-text-muted/70'
  };

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Students get a personal check-in view instead of the admin grid
  if (!isAdmin) {
    return <StudentCheckinView attendance={attendance} currentUser={currentUser} onRefresh={onRefresh} />;
  }

  const renderGrid = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Attendance</h3>
        <p className="text-sm text-text-muted mt-1">Mark who's here each day — click a cell to cycle status. Students check in by scanning the QR code above.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gaps-2 sm:gap-3 items-center">
          <button 
            onClick={() => setCalendarStart(Math.max(0, calendarStart - 1))}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold text-white/80"
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
              className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold text-white/80"
            >
              Next →
            </button>
          )}
        </div>
        
        <div className="flex gap-2 items-center">
          {savingStatus !== 'idle' && (
            <div className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-white/5">
              {savingStatus === 'saving' && <Clock className="w-3 h-3 text-amber-400 animate-spin" />}
              {savingStatus === 'saved' && <Check className="w-3 h-3 text-emerald-400" />}
              <span className="text-white/80">{savingStatus === 'saving' ? 'Saving...' : 'Saved'}</span>
            </div>
          )}
          <button 
            onClick={() => setShowHideMenu(!showHideMenu)}
            className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold text-white/80 flex items-center gap-2"
            title="Show/hide dates"
          >
            {showHideMenu ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">Manage Dates</span>
          </button>
        </div>
      </div>

      {showHideMenu && (
        <div className="glass rounded-2xl p-4 border border-white/10 space-y-4">
          <h4 className="text-sm font-bold text-white">Hide/Show Meeting Dates</h4>
          
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

      <div className="glass rounded-2xl overflow-x-auto custom-scrollbar">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase sticky left-0 bg-[#111111] z-10 min-w-[150px]">Member</th>
                {visibleDates.map(date => (
                  <th key={date} className="px-2 py-3 text-[10px] font-bold text-text-muted uppercase text-center min-w-[40px] group relative">
                    <div className="text-center">
                      {format(parseLocalDate(date), 'MMM dd')}
                      <div className="text-[8px] text-slate-600">{format(parseLocalDate(date), 'EEE')}</div>
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
            <tbody className="divide-y divide-white/5">
              {members.map((m: any) => (
                <tr key={m.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-sm text-white font-medium sticky left-0 bg-[#111111]/90 backdrop-blur-md z-10 border-r border-white/5">
                    {m.name}
                  </td>
                  {visibleDates.map(date => {
                    const status = getStatus(m.id, date);
                    return (
                      <td key={date} className="px-1 py-1 text-center">
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
      <div className="p-4 bg-white/5 border-t border-white/10 flex flex-wrap gap-4 text-[10px] font-bold uppercase rounded-b-2xl">
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
      <div className="flex gap-1 sm:gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-full sm:w-fit overflow-x-auto custom-scrollbar">
        <button 
          onClick={() => setActiveSubTab('grid')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'grid' ? "bg-accent text-primary shadow-lg" : "text-text-muted hover:text-white")}
        >
          Attendance Grid
        </button>
        <button 
          onClick={() => setActiveSubTab('history')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'history' ? "bg-accent text-primary shadow-lg" : "text-text-muted hover:text-white")}
        >
          History
        </button>
        <button 
          onClick={() => setActiveSubTab('summary')}
          className={cn("px-2 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap", activeSubTab === 'summary' ? "bg-accent text-primary shadow-lg" : "text-text-muted hover:text-white")}
        >
          Insights
        </button>
      </div>

      {activeSubTab === 'grid' && renderGrid()}
      
      {activeSubTab === 'history' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {sessions.length === 0 ? (
            <div className="col-span-full py-20 text-center glass rounded-2xl border border-white/5">
              <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
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
                  className="glass p-4 rounded-2xl border border-white/10 text-left hover:border-accent/50 transition-all group cursor-default"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-2 bg-white/5 rounded-lg text-accent group-hover:bg-accent group-hover:text-primary transition-colors">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold text-text-muted/70 uppercase">{format(new Date(date), 'EEE')}</span>
                  </div>
                  <p className="font-bold text-white mb-1">{format(new Date(date), 'MMM dd, yyyy')}</p>
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
              <div className="p-6 bg-white/5 rounded-2xl border border-white/10 prose prose-invert max-w-none">
                {isAiLoading && !insights ? <ThinkingIndicator /> : <Markdown>{insights}</Markdown>}
              </div>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Member</th>
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Rate</th>
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">P / A / L / E</th>
                  <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">History (Last 5)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {summary.map((m: any) => {
                  const rate = m.total > 0 ? Math.round((m.present / m.total) * 100) : 0;
                  const last5 = attendance
                    .filter((r: any) => r.member_id === m.member_id)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .slice(0, 5)
                    .reverse();

                  return (
                    <tr key={m.member_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-white">{m.name}</p>
                        <p className="text-[10px] text-text-muted/70 uppercase">{members.find((mem: any) => mem.id === m.member_id)?.role}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-accent" style={{ width: `${rate}%` }} />
                          </div>
                          <span className="text-sm font-bold text-white">{rate}%</span>
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
                                statusColors[r.status] || 'bg-slate-700'
                              )}
                              title={`${r.date}: ${r.status}`}
                            />
                          ))}
                          {last5.length === 0 && <span className="text-[10px] text-slate-600">No data</span>}
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

function CalendarView({ events, teams, onRefresh, currentUser, hasScope }: any) {
  const canManageCalendar = hasScope ? hasScope('calendar') : false;
  const [cursor, setCursor] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', description: '', date: '', start_time: '', end_time: '', location: '', event_type: 'meeting', team_id: '' });

  const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayKey = toKey(new Date());

  const byDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const e of events) {
      (map[e.date] = map[e.date] || []).push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    }
    return map;
  }, [events]);

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
    other: 'bg-white/10 text-white/80 border-white/10',
  };

  const typeLabel: Record<string, string> = {
    meeting: 'Meeting', competition: 'Competition', deadline: 'Deadline', social: 'Social', other: 'Other',
  };

  const openNew = (dateKey: string) => {
    setEditingId(null);
    setForm({ title: '', description: '', date: dateKey, start_time: '', end_time: '', location: '', event_type: 'meeting', team_id: '' });
    setShowModal(true);
  };

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setForm({
      title: e.title, description: e.description || '', date: e.date,
      start_time: e.start_time || '', end_time: e.end_time || '',
      location: e.location || '', event_type: e.event_type || 'meeting',
      team_id: e.team_id ? String(e.team_id) : '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.date) return;
    const payload = { ...form, team_id: form.team_id ? Number(form.team_id) : null, created_by: currentUser?.id };
    if (editingId) {
      await apiFetch(`/api/events/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } else {
      await apiFetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    }
    setShowModal(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (!(await confirmDialog({ title: 'Delete event', message: 'Delete this event?', confirmLabel: 'Delete', danger: true }))) return;
    await apiFetch(`/api/events/${editingId}`, { method: 'DELETE' });
    setShowModal(false);
    onRefresh();
  };

  const fmtTime = (t: string) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const fmtDate = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const upcoming = [...events]
    .filter((e: any) => e.date >= todayKey)
    .sort((a: any, b: any) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Team Calendar</h2>
          <p className="text-sm text-text-muted">Meetings, competitions, and deadlines</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => setCursor(new Date())}>Today</Button>
          <Button variant="secondary" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-white font-semibold min-w-[150px] text-center">{monthLabel}</span>
          <Button variant="secondary" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="w-4 h-4" /></Button>
          {canManageCalendar && <Button onClick={() => openNew(todayKey)}><Plus className="w-4 h-4" /> New Event</Button>}
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
              const key = toKey(new Date(year, month, day));
              const dayEvents = byDate[key] || [];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  onClick={() => canManageCalendar && openNew(key)}
                  className={cn(
                    'min-h-[92px] rounded-xl border p-1.5 transition-colors',
                    canManageCalendar ? 'cursor-pointer' : 'cursor-default',
                    isToday ? 'border-accent/60 bg-accent/5' : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                  )}
                >
                  <div className={cn(
                    'text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full',
                    isToday ? 'bg-accent text-primary' : 'text-white/80'
                  )}>{day}</div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e: any) => (
                      <button
                        key={e.id}
                        onClick={(ev) => { ev.stopPropagation(); if (canManageCalendar) openEdit(e); }}
                        className={cn('w-full text-left text-[11px] px-1.5 py-0.5 rounded-md border truncate', canManageCalendar ? 'cursor-pointer' : 'cursor-default', typeStyle[e.event_type] || typeStyle.other)}
                      >
                        {e.start_time && <span className="opacity-70">{fmtTime(e.start_time)} </span>}{e.title}
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
                <button key={e.id} onClick={() => openEdit(e)} className="w-full text-left flex gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:border-white/20 transition-colors">
                  <div className={cn('w-1.5 rounded-full', (typeStyle[e.event_type] || typeStyle.other).split(' ')[0].replace('bg-', 'bg-').replace('/15', ''))} style={{ backgroundColor: 'currentColor' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{e.title}</div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={editingId ? 'Edit Event' : 'New Event'} className="w-full max-w-md">
            <div className="space-y-4">
              <Input placeholder="Event title" value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} />
              <textarea
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-20"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e: any) => setForm({ ...form, description: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Date</label>
                  <Input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Location</label>
                  <Input placeholder="Where?" value={form.location} onChange={(e: any) => setForm({ ...form, location: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Start time</label>
                  <Input type="time" value={form.start_time} onChange={(e: any) => setForm({ ...form, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">End time</label>
                  <Input type="time" value={form.end_time} onChange={(e: any) => setForm({ ...form, end_time: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
              <div className="flex gap-3 justify-between">
                <div>
                  {editingId && <Button variant="danger" onClick={handleDelete}><Trash2 className="w-4 h-4" /> Delete</Button>}
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
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
function defaultTeamId(teams: any[], currentUser: any): any {
  const tid = currentUser?.team_id;
  if (tid == null || tid === '') return '';
  return teams.some((t: any) => String(t.id) === String(tid)) ? tid : '';
}

function TasksView({ tasks, setTasks, teams, members, onRefresh, currentUser, hasScope }: any) {  const [showAddTask, setShowAddTask] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isBoardTask, setIsBoardTask] = useState(false);
  const [newTask, setNewTask] = useState({ team_id: '', title: '', description: '', assigned_to: '', due_date: '' });
  const [filterTeam, setFilterTeam] = useState('all');
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const markPending = (id: number, on: boolean) => setPendingIds((prev) => {
    const s = new Set(prev);
    if (on) s.add(id); else s.delete(id);
    return s;
  });

  const isAdmin = hasScope('admin');
  const canManageTasks = hasScope('tasks');

  const handleAddTask = async () => {
    if (pendingIds.has(-1)) return;
    markPending(-1, true);
    try {
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newTask, is_board: isBoardTask ? 1 : 0 })
      });
      if (res.ok) {
        setShowAddTask(false);
        setNewTask({ team_id: '', title: '', description: '', assigned_to: '', due_date: '' });
        onRefresh();
      } else {
        notify('Could not create task — try again.', 'error');
      }
    } finally {
      markPending(-1, false);
    }
  };

  const filteredTasks = tasks.filter((t: any) => {
    const boardCheck = t.is_board ? isAdmin : true;
    const teamCheck = filterTeam === 'all' || t.team_id?.toString() === filterTeam;
    return boardCheck && teamCheck;
  });

  const updateStatus = async (id: number, status: string) => {
    if (pendingIds.has(id)) return;
    // Optimistic: flip the status instantly, roll back if the server rejects.
    const prev = tasks;
    setTasks((ts: any[]) => ts.map((t: any) => t.id === id
      ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : null }
      : t));
    markPending(id, true);
    try {
      const res = await apiFetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        setTasks(prev);
        notify('Could not update task — try again.', 'error');
      }
    } catch {
      setTasks(prev);
      notify('Could not update task — try again.', 'error');
    } finally {
      markPending(id, false);
    }
  };

  const handleDeleteTask = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete task', message: 'Delete this task?', confirmLabel: 'Delete', danger: true }))) return;
    if (pendingIds.has(id)) return;
    // Optimistic: remove instantly, restore on failure.
    const prev = tasks;
    setTasks((ts: any[]) => ts.filter((t: any) => t.id !== id));
    markPending(id, true);
    try {
      const res = await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setTasks(prev);
        notify('Could not delete task — try again.', 'error');
      }
    } catch {
      setTasks(prev);
      notify('Could not delete task — try again.', 'error');
    } finally {
      markPending(id, false);
    }
  };

  // Analytics Data
  const completionTrends = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, 'yyyy-MM-dd');
    }).reverse();

    return last7Days.map(date => ({
      date: format(new Date(date), 'MMM dd'),
      completed: tasks.filter((t: any) => t.status === 'done' && t.completed_at?.startsWith(date)).length
    }));
  }, [tasks]);

  const memberCapacity = useMemo(() => {
    return members.map((m: any) => {
      const memberTasks = tasks.filter((t: any) => t.assigned_to === m.id);
      return {
        name: m.name,
        total: memberTasks.length,
        todo: memberTasks.filter((t: any) => t.status === 'todo').length,
        inProgress: memberTasks.filter((t: any) => t.status === 'in-progress').length,
        done: memberTasks.filter((t: any) => t.status === 'done').length,
      };
    }).filter(m => m.total > 0);
  }, [tasks, members]);

  const avgCompletionTime = useMemo(() => {
    const completedTasks = tasks.filter((t: any) => t.status === 'done' && t.completed_at && t.created_at);
    if (completedTasks.length === 0) return 0;
    const totalTime = completedTasks.reduce((acc: number, t: any) => {
      const start = new Date(t.created_at).getTime();
      const end = new Date(t.completed_at).getTime();
      return acc + (end - start);
    }, 0);
    return (totalTime / completedTasks.length / (1000 * 60 * 60 * 24)).toFixed(1); // in days
  }, [tasks]);

  const columns = [
    { id: 'todo', label: 'To Do', color: 'bg-slate-500' },
    { id: 'in-progress', label: 'In Progress', color: 'bg-blue-400' },
    { id: 'done', label: 'Done', color: 'bg-emerald-400' }
  ];

  // Get dynamic colors for charts
  const secondaryColor = getCSSVariable('--color-secondary') || '#1A1A1A';

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Tasks</h3>
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
          <Button onClick={() => { setNewTask({ team_id: defaultTeamId(teams, currentUser), title: '', description: '', assigned_to: '', due_date: '' }); setShowAddTask(true); }} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> New Task</Button>
        )}
      </div>

      {showAnalytics ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card title="Completion Trend (Last 7 Days)" icon={TrendingUp}>
            <div className="h-64 min-h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={completionTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1A1A1A', border: 'none', borderRadius: '8px', color: '#fff' }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Member Capacity" icon={Users}>
            <div className="h-64 min-h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberCapacity} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={80} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: secondaryColor, border: 'none', borderRadius: '8px', color: '#fff' }}
                  />
                  <Bar dataKey="todo" stackId="a" fill="#64748b" />
                  <Bar dataKey="inProgress" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="done" stackId="a" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-xs text-text-muted uppercase font-bold mb-1">Avg. Completion Time</p>
                <p className="text-4xl font-display font-bold text-white">{avgCompletionTime} <span className="text-sm font-normal text-text-muted/70">days</span></p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase font-bold mb-1">Active Tasks</p>
                <p className="text-4xl font-display font-bold text-blue-400">{tasks.filter(t => t.status !== 'done').length}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase font-bold mb-1">Success Rate</p>
                <p className="text-4xl font-display font-bold text-emerald-400">
                  {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0}%
                </p>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 h-auto min-h-[600px] md:h-[calc(100vh-250px)]">
        {columns.map(col => (
          <div key={col.id} className="bg-secondary/30 rounded-2xl p-4 flex flex-col gap-4 border border-white/5">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-2 h-2 rounded-full", col.color)} />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">{col.label}</h4>
              <span className="ml-auto text-xs text-text-muted/70">{tasks.filter((t: any) => t.status === col.id).length}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
              {filteredTasks.filter((t: any) => t.status === col.id).map((task: any) => (
                <div key={task.id} className={cn(
                  "glass p-4 rounded-xl border group",
                  task.is_board ? "border-accent/30 bg-accent/5" : "border-white/10"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <h5 className="text-sm font-bold text-white">{task.title}</h5>
                    <div className="flex items-center gap-2">
                      {task.is_board && <Lock className="w-3 h-3 text-accent" />}
                      {canManageTasks && (
                        <button onClick={() => handleDeleteTask(task.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-text-muted line-clamp-2 mb-3">{task.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-primary">
                        {members.find((m: any) => m.id === task.assigned_to)?.name.charAt(0) || '?'}
                      </div>
                      <span className="text-[10px] text-text-muted/70">{task.due_date}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {col.id !== 'todo' && <button onClick={() => updateStatus(task.id, 'todo')} className="p-1 hover:text-accent"><ChevronRight className="w-4 h-4 rotate-180" /></button>}
                      {col.id !== 'done' && <button onClick={() => updateStatus(task.id, col.id === 'todo' ? 'in-progress' : 'done')} className="p-1 hover:text-accent"><ChevronRight className="w-4 h-4" /></button>}
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
          <Card title="New Task" className="w-full max-w-md">
            <div className="space-y-4">
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
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-24"
                placeholder="Description"
                value={newTask.description}
                onChange={(e: any) => setNewTask({...newTask, description: e.target.value})}
              />
              <Select 
                options={[
                  { label: 'Assign To', value: '' },
                  ...members.map(m => ({ label: m.name, value: m.id }))
                ]} 
                value={newTask.assigned_to}
                onChange={(e: any) => setNewTask({...newTask, assigned_to: e.target.value})}
              />
              <Input type="date" value={newTask.due_date} onChange={(e: any) => setNewTask({...newTask, due_date: e.target.value})} />
              
              {isAdmin && (
                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input type="checkbox" checked={isBoardTask} onChange={(e) => setIsBoardTask(e.target.checked)} />
                  Private Board Task
                </label>
              )}

              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAddTask(false)}>Cancel</Button>
                <Button onClick={handleAddTask} disabled={pendingIds.has(-1)}>{pendingIds.has(-1) ? 'Creating…' : 'Create Task'}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function BudgetView({ budget, teams, onRefresh, hasScope, currentUser }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ team_id: '', type: 'expense', amount: '', category: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({...newItem, amount: parseFloat(newItem.amount)})
      });
      if (res.ok) {
        setShowAdd(false);
        onRefresh();
      } else {
        notify('Could not log entry — try again.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete transaction', message: 'Delete this transaction?', confirmLabel: 'Delete', danger: true }))) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/budget/${id}`, { method: 'DELETE' });
      if (res.ok) onRefresh();
      else notify('Could not delete entry — try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const totalIncome = budget.filter((i: any) => i.type === 'income').reduce((acc: number, i: any) => acc + i.amount, 0);
  const totalExpense = budget.filter((i: any) => i.type === 'expense').reduce((acc: number, i: any) => acc + i.amount, 0);

  const isAdmin = hasScope('budget');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Budget</h3>
        <p className="text-sm text-text-muted mt-1">Team money at a glance — income, expenses, and every transaction. Everyone can view; only members with the budget permission (via their role) can add or edit entries.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <p className="text-xs text-emerald-400 uppercase font-bold">Total Income</p>
          <p className="text-3xl font-display font-bold text-white">${totalIncome.toLocaleString()}</p>
        </Card>
        <Card className="bg-rose-500/10 border-rose-500/20">
          <p className="text-xs text-rose-400 uppercase font-bold">Total Expenses</p>
          <p className="text-3xl font-display font-bold text-white">${totalExpense.toLocaleString()}</p>
        </Card>
        <Card className="bg-accent/10 border-accent/20">
          <p className="text-xs text-accent uppercase font-bold">Net Balance</p>
          <p className="text-3xl font-display font-bold text-white">${(totalIncome - totalExpense).toLocaleString()}</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">Transaction History</h3>
          <p className="text-sm text-text-muted mt-1">A line-by-line record of money in and out.</p>
        </div>
        {isAdmin && <Button onClick={() => { setNewItem({ team_id: defaultTeamId(teams, currentUser), type: 'expense', amount: '', category: '', description: '', date: format(new Date(), 'yyyy-MM-dd') }); setShowAdd(true); }} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log Transaction</Button>}
      </div>

      <div className="glass rounded-2xl overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Date</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Description</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase">Amount</th>
              <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {budget.map((item: any) => (
              <tr key={item.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 text-sm text-text-muted">{item.date}</td>
                <td className="px-6 py-4 text-sm text-white font-medium">{item.description}</td>
                <td className="px-6 py-4 text-sm text-text-muted">{item.category}</td>
                <td className={cn(
                  "px-6 py-4 text-sm font-bold",
                  item.type === 'income' ? 'text-emerald-400' : 'text-rose-400'
                )}>
                  {item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  {isAdmin && (
                    <button onClick={() => handleDelete(item.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title="Log Transaction" className="w-full max-w-md">
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
                <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={busy}>{busy ? 'Saving…' : 'Log Entry'}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function InventoryView({ inventory, members, teams, onRefresh, currentUser, hasScope }: any) {
  const canManage = hasScope ? hasScope('inventory') : false;
  const INVENTORY_CATEGORIES = [
    "Structure", "Motion", "Wheels", "Electronics", "Sensors", "Power",
    "Hardware", "Tools", "Raw Material", "3D Printing", "Field", "Other",
  ];
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [revLink, setRevLink] = useState('');
  const [isLoadingRev, setIsLoadingRev] = useState(false);
  const [invoiceParsing, setInvoiceParsing] = useState<string | null>(null); // null = idle, string = status text
  const [invoiceConfirming, setInvoiceConfirming] = useState(false);
  const [autoCategorizing, setAutoCategorizing] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const invoiceFileRef = React.useRef<HTMLInputElement>(null);
  const [newPart, setNewPart] = useState({ 
    team_id: '', name: '', part_number: '', sku: '', quantity: '1', assigned_to: '', 
    location: '', category: '', description: '', cost: '' 
  });
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    if (!newPart.name || !newPart.sku) {
      notify('Name and SKU are required', 'error');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPart,
          team_id: newPart.team_id ? parseInt(newPart.team_id) : null,
          quantity: parseInt(newPart.quantity) || 0,
          assigned_to: newPart.assigned_to ? parseInt(newPart.assigned_to) : null,
          cost: parseFloat(newPart.cost) || 0
        })
      });
      if (res.ok) {
        setShowAdd(false);
        setNewPart({ team_id: '', name: '', part_number: '', sku: '', quantity: '1', assigned_to: '', location: '', category: '', description: '', cost: '' });
        onRefresh();
      } else {
        const err = await res.json();
        notify('Error: ' + err.error, 'error');
      }
    } catch (error) {
      notify('Error adding part: ' + error, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async () => {
    if (!showEdit) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/inventory/${showEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...showEdit,
          team_id: showEdit.team_id ? parseInt(showEdit.team_id) : null,
          assigned_to: showEdit.assigned_to ? parseInt(showEdit.assigned_to) : null,
          cost: parseFloat(showEdit.cost) || 0
        })
      });
      if (res.ok) {
        setShowEdit(null);
        onRefresh();
      } else {
        const err = await res.json();
        notify('Error: ' + err.error, 'error');
      }
    } catch (error) {
      notify('Error updating part: ' + error, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete part', message: 'Delete this part?', confirmLabel: 'Delete', danger: true }))) return;
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/inventory/${id}`, { method: 'DELETE' });
      if (res.ok) onRefresh();
      else notify('Could not delete part — try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleImportRev = async () => {
    if (!revLink.trim()) {
      notify('Please enter a REV Robotics link', 'info');
      return;
    }
    
    setIsLoadingRev(true);
    try {
      const res = await apiFetch('/api/inventory/scrape-rev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: revLink })
      });

      if (res.ok) {
        const data = await res.json();
        setNewPart({
          ...newPart,
          name: data.name || newPart.name,
          sku: data.sku || newPart.sku,
          part_number: data.part_number || newPart.part_number,
          cost: data.cost ? data.cost.toString() : newPart.cost,
          category: data.category || newPart.category
        });
        setRevLink('');
        notify('Product imported! Review and save when ready.', 'success');
      } else {
        const err = await res.json();
        notify('Error: ' + err.error, 'error');
      }
    } catch (error) {
      notify('Error importing from REV: ' + error, 'error');
    } finally {
      setIsLoadingRev(false);
    }
  };

  const handleInvoiceFile = async (e: any) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    if (!files.length) return;
    const allItems: any[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setInvoiceParsing(files.length > 1 ? `Reading ${i + 1} of ${files.length}...` : 'Reading file...');
        const form = new FormData();
        form.append('file', file);
        const res = await apiFetch('/api/inventory/import-invoice/parse', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          notify(`Couldn't read ${file.name}: ` + (data.error || 'Unsupported file'), 'error');
          continue;
        }
        if (!data.items || data.items.length === 0) {
          notify(`No line items found in ${file.name}`, 'error');
          continue;
        }
        for (const it of data.items) allItems.push({ ...it, selected: true });
      }
      if (allItems.length === 0) {
        notify('No line items found in the selected file(s)', 'error');
        return;
      }
      setInvoiceItems(allItems);
      setShowInvoicePreview(true);
    } catch (error) {
      notify('Error reading file: ' + error, 'error');
    } finally {
      setInvoiceParsing(null);
    }
  };

  const updateInvoiceItem = (index: number, patch: any) => {
    setInvoiceItems(items => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const handleInvoiceConfirm = async () => {
    const selected = invoiceItems.filter((it: any) => it.selected);
    if (!selected.length) {
      notify('Select at least one item to import', 'info');
      return;
    }
    if (invoiceConfirming) return;
    setInvoiceConfirming(true);
    try {
      const res = await apiFetch('/api/inventory/import-invoice/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map((it: any) => ({
            sku: it.sku,
            name: it.name,
            quantity: parseInt(it.quantity, 10) || 0,
            cost: parseFloat(it.unitPrice) || 0,
            category: it.category || 'Other'
          }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify('Error: ' + (data.error || 'Import failed'), 'error');
        return;
      }
      setShowInvoicePreview(false);
      setInvoiceItems([]);
      onRefresh();
      const parts = [`${data.added} added`, `${data.merged} restocked`];
      if (data.skipped?.length) parts.push(`${data.skipped.length} skipped`);
      notify('Import complete: ' + parts.join(', '), 'success');
    } catch (error) {
      notify('Error importing: ' + error, 'error');
    } finally {
      setInvoiceConfirming(false);
    }
  };

  const handleAutoCategorize = async () => {
    if (autoCategorizing) return;
    setAutoCategorizing(true);
    try {
      const res = await apiFetch('/api/inventory/auto-categorize', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify('Error: ' + (data.error || 'Auto-categorize failed'), 'error');
        return;
      }
      onRefresh();
      notify(data.categorized > 0 ? `Categorized ${data.categorized} part${data.categorized === 1 ? '' : 's'}` : 'Everything is already categorized', 'success');
    } catch (error) {
      notify('Error: ' + error, 'error');
    } finally {
      setAutoCategorizing(false);
    }
  };

  const categories = [...new Set(inventory.map((p: any) => p.category).filter((c: any) => c))];
  const filteredParts = inventory.filter((p: any) => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.part_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = !filterCategory || p.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const totalValue = inventory.reduce((acc: number, p: any) => acc + (p.cost * p.quantity), 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <Card className="bg-accent/10 border-accent/20">
          <p className="text-xs text-accent uppercase font-bold">Total Parts</p>
          <p className="text-3xl font-display font-bold text-white">{inventory.length}</p>
        </Card>
        <Card className="bg-blue-500/10 border-blue-500/20">
          <p className="text-xs text-blue-400 uppercase font-bold">Inventory Value</p>
          <p className="text-3xl font-display font-bold text-white">${totalValue.toLocaleString(undefined, {maximumFractionDigits: 2})}</p>
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
              <Button onClick={() => { setNewPart({ team_id: defaultTeamId(teams, currentUser), name: '', part_number: '', sku: '', quantity: '1', assigned_to: '', location: '', category: '', description: '', cost: '' }); setShowAdd(true); }} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Part</Button>
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
              <thead className="bg-white/5 border-b border-white/10 sticky top-0">
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
              <tbody className="divide-y divide-white/5">
                {filteredParts.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-text-muted/70">No parts found</td>
                  </tr>
                ) : (
                  filteredParts.map((part: any) => (
                    <tr key={part.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-white font-medium">{part.name}</td>
                      <td className="px-4 py-3 text-sm text-accent font-mono">{part.sku}</td>
                      <td className="px-4 py-3 text-sm text-text-muted">{part.part_number || '—'}</td>
                      <td className="px-4 py-3 text-sm text-white"><span className="bg-white/10 px-2 py-1 rounded">{part.quantity}</span></td>
                      <td className="px-4 py-3 text-sm text-text-muted">{part.category || '—'}</td>
                      <td className="px-4 py-3 text-sm text-blue-400">${(part.cost * part.quantity).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right flex gap-2 justify-end">
                          <button onClick={() => setShowEdit(part)} className="text-slate-600 hover:text-accent transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(part.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
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
              <div className="space-y-2 pb-4 border-b border-white/10">
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
                  <thead className="bg-white/5 border-b border-white/10 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 w-10"></th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase">Item</th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase">SKU</th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase w-24">Qty</th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase w-28">Unit $</th>
                      <th className="px-3 py-3 text-xs font-bold text-text-muted uppercase w-36">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
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

const OUTREACH_PRESETS = ['Demo', 'Workshop', 'Volunteering', 'Fundraiser', 'Presentation', 'Competition'];

function fmtCompact(n: any) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v * 100) / 100);
}

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

function OutreachView({ outreach, socialProfiles, youtubeEnabled, tiktokEnabled, currentUser, onRefresh, hasScope }: any) {
  const isAdminSocial = hasScope ? hasScope('outreach') : (currentUser as any)?.account_type === 'admin';
  const [showLinkYT, setShowLinkYT] = useState(false);
  const [ytInput, setYtInput] = useState('');
  const [linkingYT, setLinkingYT] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  // TikTok OAuth result (?social=connected|error|cancelled|tiktok_unavailable)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('social');
    if (!s) return;
    if (s === 'connected') notify('TikTok connected — stats synced.', 'success');
    else if (s === 'cancelled') notify('TikTok connection cancelled.', 'error');
    else if (s === 'tiktok_unavailable') notify('TikTok is temporarily unavailable.', 'error');
    else if (s === 'error') notify('TikTok connection failed — try again.', 'error');
    params.delete('social');
    window.history.replaceState(null, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
    if (s === 'connected') onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLinkYouTube = async () => {
    if (!ytInput.trim()) { notify('Enter a channel handle, URL, or channel ID.', 'error'); return; }
    setLinkingYT(true);
    try {
      const res = await apiFetch('/api/outreach/social/youtube', { method: 'POST', body: JSON.stringify({ input: ytInput.trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not link channel');
      notify('YouTube channel linked — stats synced.', 'success');
      setYtInput('');
      setShowLinkYT(false);
      onRefresh();
    } catch (e: any) {
      notify(e.message || 'Could not link channel', 'error');
    } finally {
      setLinkingYT(false);
    }
  };

  const handleUnlinkProfile = async (id: number) => {
    if (!window.confirm('Unlink this profile? Its sync history will be removed.')) return;
    await apiFetch(`/api/outreach/social/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handlePinProfile = async (id: number, pinned: boolean) => {
    await apiFetch(`/api/outreach/social/${id}`, { method: 'PATCH', body: JSON.stringify({ pinned: !pinned }) });
    onRefresh();
  };

  const handleMoveProfile = async (id: number, dir: -1 | 1) => {
    const ids = (socialProfiles || []).map((p: any) => p.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await apiFetch('/api/outreach/social/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
    onRefresh();
  };

  const handleSyncNow = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await apiFetch(`/api/outreach/social/${id}/sync`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Sync failed');
      notify('Stats updated.', 'success');
      onRefresh();
    } catch (e: any) {
      notify(e.message || 'Sync failed', 'error');
    } finally {
      setSyncingId(null);
    }
  };

  // TikTok is temporarily disabled until Login Kit is verified — hide any
  // linked TikTok profiles from the UI (their data stays in the DB).
  const profiles = (socialProfiles || []).filter((p: any) => p.platform !== 'tiktok');
  const emptyForm = () => ({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '2', location: '', attendees: '', funds_raised: '' });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  const totals = useMemo(() => {
    const list = outreach || [];
    return {
      events: list.length,
      hours: list.reduce((s: number, e: any) => s + (Number(e.hours) || 0), 0),
      attendees: list.reduce((s: number, e: any) => s + (Number(e.attendees) || 0), 0),
      funds: list.reduce((s: number, e: any) => s + (Number(e.funds_raised) || 0), 0),
    };
  }, [outreach]);

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setShowForm(true); };
  const openEdit = (event: any) => {
    setEditingId(event.id);
    setForm({
      title: event.title || '',
      description: event.description || '',
      date: (event.date || '').slice(0, 10) || format(new Date(), 'yyyy-MM-dd'),
      hours: event.hours != null && event.hours !== '' ? String(event.hours) : '',
      location: event.location || '',
      attendees: event.attendees ? String(event.attendees) : '',
      funds_raised: event.funds_raised ? String(event.funds_raised) : '',
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { notify('Give the event a title.', 'error'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) { notify('Pick a valid date.', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date,
        hours: Math.max(0, parseInt(form.hours) || 0),
        location: form.location.trim(),
        attendees: Math.max(0, parseInt(form.attendees) || 0),
        funds_raised: Math.max(0, Math.round((parseFloat(form.funds_raised) || 0) * 100) / 100),
      };
      const res = editingId
        ? await apiFetch(`/api/outreach/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await apiFetch('/api/outreach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('save failed');
      setShowForm(false);
      setEditingId(null);
      onRefresh();
      notify(editingId ? 'Event updated.' : 'Event logged.');
    } catch {
      notify('Could not save the event.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete event', message: 'Delete this outreach event?', confirmLabel: 'Delete', danger: true }))) return;
    await apiFetch(`/api/outreach/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">Outreach Log</h3>
          <p className="text-sm text-text-muted mt-1">Track community events and service hours.</p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log Event</Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
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
              <p className="text-xl font-display font-bold text-white leading-none">{value}</p>
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
              const meta = PLATFORM_META[p.platform] || PLATFORM_META.youtube;
              const PIcon = meta.Icon;
              const g = p.growth;
              return (
                <div key={p.id} className="rounded-xl border border-white/10 bg-elevated p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
                      ) : (
                        <div className="rounded-lg p-2" style={{ backgroundColor: meta.color + '22' }}>
                          <PIcon className="w-4 h-4" style={{ color: meta.color }} />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-bold text-white">{p.display_name || p.handle}</p>
                        <p className="text-[11px] text-text-muted">{meta.label}{p.handle ? ` • ${p.handle}` : ''}</p>
                      </div>
                    </div>
                    {isAdminSocial && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handlePinProfile(p.id, !!p.is_pinned)} className={`${p.is_pinned ? 'text-volt' : 'text-slate-600'} hover:text-volt transition-colors`} title={p.is_pinned ? 'Unpin from top' : 'Pin to top'}>
                          <Pin className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleMoveProfile(p.id, -1)} className="text-slate-600 hover:text-white transition-colors" title="Move up">
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleMoveProfile(p.id, 1)} className="text-slate-600 hover:text-white transition-colors" title="Move down">
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleUnlinkProfile(p.id)} className="text-slate-600 hover:text-rose-400 transition-colors" title="Unlink profile">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-2">
                        <div>
                          <p className="text-2xl font-display font-bold text-white">{fmtCompact(p.latest?.followers)}</p>
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
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                          {p.platform === 'tiktok' && p.latest?.likes != null && <span><b className="text-white/80">{fmtCompact(p.latest.likes)}</b> likes</span>}
                          {p.latest?.posts != null && <span><b className="text-white/80">{fmtCompact(p.latest.posts)}</b> {p.platform === 'youtube' ? 'videos' : 'posts'}</span>}
                          {p.platform === 'youtube' && p.latest?.views != null && <span><b className="text-white/80">{fmtCompact(p.latest.views)}</b> views</span>}
                        </div>
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
          <div className="rounded-xl border border-white/10 bg-elevated p-4 space-y-3 mt-4">
            <OutreachField label="YouTube channel">
              <Input placeholder="@yourteam or paste a channel URL" value={ytInput} onChange={(e: any) => setYtInput(e.target.value)} />
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
          <Card key={event.id} title={event.title} icon={Globe}>
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <p className="text-xs text-text-muted">{event.location} • {event.date}</p>
                <p className="text-sm text-white/80 mt-2">{event.description}</p>
                {(event.attendees > 0 || event.funds_raised > 0) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-text-muted">
                    {event.attendees > 0 && <span><b className="text-white/80">{event.attendees}</b> attendees</span>}
                    {event.funds_raised > 0 && <span><b className="text-white/80">${fmtCompact(event.funds_raised)}</b> raised</span>}
                  </div>
                )}
              </div>
              <div className="text-right flex flex-col items-end gap-2 shrink-0">
                <p className="text-2xl font-display font-bold text-accent">{event.hours}h</p>
                <p className="text-[10px] text-text-muted uppercase font-bold">Logged</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => openEdit(event)} className="text-slate-600 hover:text-accent transition-colors" title="Edit event">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(event.id)} className="text-slate-600 hover:text-rose-400 transition-colors" title="Delete event">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { setShowForm(false); setEditingId(null); }}>
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
                            : 'border-white/10 text-text-muted hover:text-white hover:border-white/25'
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
                  className="w-full bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all h-20"
                  placeholder="What did the team do?"
                  value={form.description}
                  onChange={set('description')}
                />
              </OutreachField>
              <div className="grid grid-cols-2 gap-3">
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
                <Button variant="secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
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

function scoutTimeAgo(ts: number | null): string {
  if (!ts) return '';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function ScoutView({ scoutFeed, scoutUpdatedAt, scoutError, refreshNews, isAiLoading, aiLoadingTarget, ThinkingIndicator }: any) {
  const [filter, setFilter] = useState('All');
  const loading = isAiLoading && aiLoadingTarget === 'news';

  const items = useMemo(() => {
    const list = Array.isArray(scoutFeed) ? scoutFeed : [];
    return filter === 'All' ? list : list.filter((it: any) => it.category === filter);
  }, [scoutFeed, filter]);

  const counts = useMemo(() => {
    const list = Array.isArray(scoutFeed) ? scoutFeed : [];
    const c: any = { All: list.length };
    for (const f of SCOUT_FILTERS.slice(1)) c[f] = list.filter((it: any) => it.category === f).length;
    return c;
  }, [scoutFeed]);

  const catMeta = (cat: string) => {
    switch (cat) {
      case 'Game Updates': return { Icon: Flag, badge: 'text-sky-300 bg-sky-400/10 border-sky-400/30' };
      case 'Parts & Suppliers': return { Icon: Cog, badge: 'text-accent bg-accent/10 border-accent/30' };
      case 'Community': return { Icon: Users, badge: 'text-violet-300 bg-violet-400/10 border-violet-400/30' };
      case 'Competitions': return { Icon: Medal, badge: 'text-amber-300 bg-amber-400/10 border-amber-400/30' };
      case 'Videos': return { Icon: Play, badge: 'text-rose-300 bg-rose-400/10 border-rose-400/30' };
      default: return { Icon: Newspaper, badge: 'text-text-muted bg-white/5 border-white/10' };
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">AI Scout: FTC BIOBUZZ</h3>
          <p className="text-sm text-text-muted mt-1">Competitive FTC news, rules, parts, and events — scoped to the 2026–27 BIOBUZZ season.</p>
        </div>
        <div className="flex items-center gap-3">
          {scoutUpdatedAt ? <span className="text-xs text-text-muted whitespace-nowrap">Updated {scoutTimeAgo(scoutUpdatedAt)}</span> : null}
          <Button onClick={refreshNews} variant="outline" disabled={loading} className="w-full sm:w-auto">
            <Clock className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Scouting...' : 'Refresh News'}
          </Button>
        </div>
      </div>

      {/* category filter chips */}
      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 -mx-1 px-1">
        {SCOUT_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 ${
              filter === f
                ? 'bg-accent text-primary border-accent shadow-[0_4px_16px_rgba(255,199,0,0.25)]'
                : 'bg-white/[0.03] text-text-muted border-white/10 hover:text-white hover:border-white/25'
            }`}
          >
            {f}{counts[f] > 0 ? <span className="opacity-70"> · {counts[f]}</span> : null}
          </button>
        ))}
      </div>

      {/* stale-data warning */}
      {scoutError && items.length > 0 ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/90">
          Couldn't refresh the feed — showing the last saved stories.
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-3 animate-pulse">
              <div className="h-6 w-32 rounded-full bg-white/10" />
              <div className="h-5 w-4/5 rounded bg-white/10" />
              <div className="h-4 w-full rounded bg-white/5" />
              <div className="h-4 w-2/3 rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((it: any, i: number) => {
            const { Icon, badge } = catMeta(it.category);
            const isVideo = it.category === 'Videos';
            return (
              <a
                key={i}
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 flex flex-col gap-3 hover:border-accent/40 hover:bg-white/[0.05] transition-all active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${badge}`}>
                    <Icon className="w-3 h-3" /> {it.category}
                  </span>
                  {isVideo ? (
                    <span className="w-8 h-8 rounded-full bg-accent text-primary flex items-center justify-center shrink-0 shadow-[0_4px_16px_rgba(255,199,0,0.25)]">
                      <Play className="w-4 h-4 ml-0.5" />
                    </span>
                  ) : (
                    <ExternalLink className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors shrink-0" />
                  )}
                </div>
                <h4 className="text-white font-bold leading-snug">{it.title}</h4>
                <p className="text-sm text-text-muted leading-relaxed line-clamp-3 flex-1">{it.summary}</p>
                <p className="text-xs text-text-muted/70 truncate">{it.source}</p>
              </a>
            );
          })}
        </div>
      ) : scoutError ? (
        <Card className="min-h-[300px] flex flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-white font-bold">Couldn't load the scout feed</p>
          <p className="text-sm text-text-muted">{scoutError}</p>
          <Button onClick={refreshNews} variant="outline">Try again</Button>
        </Card>
      ) : (
        <Card className="min-h-[300px] flex flex-col items-center justify-center gap-4">
          <ThinkingIndicator />
          <p className="text-text-muted">Scouting the FTC world for you...</p>
        </Card>
      )}
    </div>
  );
}

function CommunicationView({ communications, onRefresh, hasScope }: any) {
  const canManage = hasScope ? hasScope('communications') : false;
  const [showAdd, setShowAdd] = useState(false);
  const [newComm, setNewComm] = useState({ recipient: '', subject: '', body: '', type: 'email', date: format(new Date(), 'yyyy-MM-dd HH:mm') });

  const handleAdd = async () => {
    await apiFetch('/api/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComm)
    });
    setShowAdd(false);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete log', message: 'Delete this log?', confirmLabel: 'Delete', danger: true }))) return;
    await apiFetch(`/api/communications/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">Communication Log</h3>
          <p className="text-sm text-text-muted mt-1">A shared record of emails and messages sent on the team's behalf.</p>
        </div>
        {canManage && <Button onClick={() => setShowAdd(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log New Message</Button>}
      </div>

      <div className="space-y-3 sm:space-y-4">
        {communications.map((comm: any) => (
          <Card key={comm.id} className="relative overflow-hidden">
            <div className={cn(
              "absolute top-0 left-0 w-1 h-full",
              comm.type === 'email' ? 'bg-blue-500' : 'bg-accent'
            )} />
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    comm.type === 'email' ? 'bg-blue-500/20 text-blue-400' : 'bg-accent/20 text-accent'
                  )}>{comm.type}</span>
                  <p className="text-xs text-text-muted">{comm.date}</p>
                </div>
                <h4 className="text-white font-bold text-lg">{comm.subject}</h4>
                <p className="text-sm text-text-muted mb-3">To: {comm.recipient}</p>
                <p className="text-sm text-white/80 whitespace-pre-wrap">{comm.body}</p>
              </div>
              {canManage && (
                <button onClick={() => handleDelete(comm.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </Card>
        ))}
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
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-48"
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
    </div>
  );
}

// Discord-style messaging: channel list on the left, conversation in the
// center, member list with presence on the right. No servers — channels live
// inside the team.
function ChatView({ messages, setMessages, msgCache, members, currentUser, socket, channels, activeChannelId, setActiveChannelId, handleCreateChannel, handleDeleteChannel, isAdmin, teams, activeTeamName, onSwitchTeam, chatCategories, handleCreateCategory, handleRenameCategory, handleDeleteCategory, handleMoveChannel }: any) {
  const [content, setContent] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showChannelsMobile, setShowChannelsMobile] = useState(false);
  const [showMembersMobile, setShowMembersMobile] = useState(false);
  const [showMemberList, setShowMemberList] = useState(true);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [creatingIn, setCreatingIn] = useState<number | 'uncat' | null>(null); // category id (or 'uncat') the new-channel form belongs to
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelTopic, setNewChannelTopic] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCat, setRenamingCat] = useState<number | null>(null);
  const [renameCatName, setRenameCatName] = useState('');
  const [moveMenuFor, setMoveMenuFor] = useState<number | null>(null); // channel id with the move-to-category menu open
  const [dragChannelId, setDragChannelId] = useState<number | null>(null); // admin drag-and-drop between categories
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null); // 'cat:<id>' | 'uncat'

  // Admin drag-and-drop: drop a channel row onto a category header to move it.
  const handleDropOnCategory = async (e: React.DragEvent, categoryId: number | null) => {
    e.preventDefault();
    setDragOverTarget(null);
    const raw = e.dataTransfer.getData('text/plain');
    const id = dragChannelId ?? parseInt(raw, 10);
    setDragChannelId(null);
    if (!isAdmin || !Number.isFinite(id)) return;
    const chan = (channels || []).find((c: any) => c.id === id);
    if (!chan || (chan.category_id ?? null) === categoryId) return;
    await handleMoveChannel(id, categoryId);
  };
  const [collapsedCats, setCollapsedCats] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(`cp-collapsed-cats-${currentUser?.team_id ?? 'x'}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });
  const toggleCat = (id: number) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(`cp-collapsed-cats-${currentUser?.team_id ?? 'x'}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const [showTeamMenu, setShowTeamMenu] = useState(false);
  // reply + forward state
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [forwardMsg, setForwardMsg] = useState<any | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  // touch devices have no hover — tapping a message reveals its action bar
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null);
  const [isTouchDevice] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  );
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const msgRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());

  const activeChannel = (channels || []).find((c: any) => c.id === activeChannelId) || (channels || [])[0];
  const canPostInChannel = isAdmin || !activeChannel?.post_restricted;
  // Discord shows no tombstones — deleted messages vanish
  const visibleMessages = (messages || []).filter((m: any) => !m.deleted_at);

  const scrollToMessage = (id: number) => {
    const el = msgRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(id);
      window.setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1600);
    }
  };

  const startReply = (msg: any) => {
    setReplyTo({ id: msg.id, sender_name: msg.sender_name, content: msg.content });
    composerRef.current?.focus();
  };

  const copyMessageText = async (msg: any) => {
    try {
      await navigator.clipboard.writeText(msg.content || '');
      notify('Message copied.', 'info');
    } catch {
      notify('Could not copy that message.', 'error');
    }
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, activeChannelId]);

  const convertMentions = (text: string) => {
    // Match @Full Name for multi-word names — longest names first
    let out = text;
    const sorted = [...members].sort((a: any, b: any) => b.name.length - a.name.length);
    for (const m of sorted) {
      out = out.split(`@${m.name}`).join(`@[${m.name}]`);
    }
    return out;
  };

  const handleSend = async () => {
    if ((!content.trim() && !pendingFile) || !socket || uploading) return;
    if (!canPostInChannel) return;
    const finalContent = convertMentions(content);
    const replyToId = replyTo?.id || null;
    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (pendingFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('sender_id', currentUser.id.toString());
      formData.append('sender_name', currentUser.name);
      formData.append('content', finalContent);
      if (activeChannelId) formData.append('channel_id', activeChannelId.toString());
      if (replyToId) formData.append('reply_to_id', replyToId.toString());
      try {
        const response = await apiFetch('/api/messages/upload', { method: 'POST', body: formData });
        if (response.ok) {
          setContent('');
          setReplyTo(null);
          clearPending();
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          notify('Could not send that file.', 'error');
        }
      } catch (error) {
        console.error('Upload error:', error);
        notify('Could not send that file.', 'error');
      } finally {
        setUploading(false);
      }
      return;
    }

    // Optimistic: show the message instantly, reconcile when the server echoes it.
    const optimisticMsg = {
      id: clientId,
      client_id: clientId,
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: finalContent,
      channel_id: activeChannelId,
      reply_to_id: replyToId,
      reply_sender_name: replyTo?.sender_name || null,
      reply_content: replyTo?.content || null,
      timestamp: new Date().toISOString(),
      pending: true,
    };
    setMessages(prev => {
      const next = [...prev, optimisticMsg];
      if (activeChannelId != null) msgCache.current.set(activeChannelId, next);
      return next;
    });
    socket.send(JSON.stringify({
      type: 'chat',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: finalContent,
      channel_id: activeChannelId,
      reply_to_id: replyToId,
      client_id: clientId,
    }));
    setContent('');
    setReplyTo(null);
  };

  const handleForward = async (targetChannelId: number) => {
    if (!forwardMsg || !socket) return;
    const target = (channels || []).find((c: any) => c.id === targetChannelId);
    socket.send(JSON.stringify({
      type: 'chat',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: forwardMsg.content || '',
      channel_id: targetChannelId,
      is_forwarded: 1,
      forwarded_from: `${forwardMsg.sender_name || 'Unknown'} · #${activeChannel?.name || 'general'}`,
      file_path: forwardMsg.file_path || null,
      file_name: forwardMsg.file_name || null,
      file_size: forwardMsg.file_size || null,
    }));
    setForwardMsg(null);
    if (targetChannelId !== activeChannelId) {
      setActiveChannelId(targetChannelId);
      notify(`Forwarded to #${target?.name || 'channel'}.`, 'info');
    }
  };

  const clearPending = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  };

  const queueFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { notify('Files must be under 10 MB.', 'error'); return; }
    clearPending();
    setPendingFile(file);
    if (file.type.startsWith('image/')) setPendingPreview(URL.createObjectURL(file));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      queueFile(files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) queueFile(files[0]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    queueFile(e.target.files?.[0] || undefined);
  };

  const handleDeleteMessage = async (msgId: number) => {
    try {
      const res = await apiFetch(`/api/messages/${msgId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        console.error('Failed to delete message');
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleCreateChannelSubmit = async () => {
    const name = newChannelName.trim();
    if (!name) return;
    const catId = creatingIn === 'uncat' ? null : creatingIn;
    const ch = await handleCreateChannel(name, newChannelTopic.trim(), catId);
    if (ch) {
      setNewChannelName('');
      setNewChannelTopic('');
      setCreatingIn(null);
      setCreatingChannel(false);
      setShowChannelsMobile(false);
    }
  };

  const handleCreateCategorySubmit = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const cat = await handleCreateCategory(name);
    if (cat) {
      setNewCategoryName('');
      setCreatingCategory(false);
    }
  };

  const handleRenameCategorySubmit = async () => {
    if (renamingCat == null) return;
    const name = renameCatName.trim();
    if (!name) return;
    const cat = await handleRenameCategory(renamingCat, name);
    if (cat) {
      setRenamingCat(null);
      setRenameCatName('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && replyTo) {
      e.preventDefault();
      setReplyTo(null);
      return;
    }
    if (e.key === 'Tab' && showMentions && filteredMentions.length > 0) {
      e.preventDefault();
      const m = filteredMentions[0];
      const parts = content.split(' ');
      parts.pop();
      setContent([...parts, `@${m.name} `].join(' '));
      setShowMentions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onContentChange = (e: any) => {
    const val = e.target.value;
    setContent(val);
    const lastWord = val.split(' ').pop();
    if (lastWord.startsWith('@')) {
      setMentionSearch(lastWord.slice(1));
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const filteredMentions = members.filter((m: any) => m.name.toLowerCase().includes(mentionSearch.toLowerCase()));

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
    return text.split(/(@\[[^\]]+\])/).map((part: string, i: number) => {
      if (part.startsWith('@[') && part.endsWith(']')) {
        const name = part.slice(2, -1);
        return (
          <span key={i} className="font-bold text-accent bg-accent/10 rounded px-1 py-0.5">
            @{name}
          </span>
        );
      }
      return part;
    });
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
    <div className="mx-1 mb-2 p-3 rounded-xl bg-primary border border-white/10 space-y-2 flex-shrink-0">
      <input
        value={newChannelName}
        onChange={(e) => setNewChannelName(e.target.value)}
        placeholder="channel-name"
        maxLength={40}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannelSubmit(); }}
        className="w-full bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
      />
      <input
        value={newChannelTopic}
        onChange={(e) => setNewChannelTopic(e.target.value)}
        placeholder="Topic (optional)"
        maxLength={140}
        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateChannelSubmit(); }}
        className="w-full bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
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
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-white hover:bg-white/[0.06] transition-colors"
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
            isActive ? 'bg-white/[0.08] text-white font-semibold' : 'text-text-muted hover:bg-white/[0.04] hover:text-white',
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
                onClick={(e) => { e.stopPropagation(); setMoveMenuFor(moveMenuFor === c.id ? null : c.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setMoveMenuFor(moveMenuFor === c.id ? null : c.id); } }}
                className="p-1 rounded text-text-muted/60 hover:text-white"
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
            <div className="absolute right-1 top-9 z-50 w-48 rounded-xl border border-white/10 bg-secondary shadow-2xl p-1">
              <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted/60">Move to</p>
              {sortedCats.map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={async () => { setMoveMenuFor(null); await handleMoveChannel(c.id, cat.id); }}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors',
                    c.category_id === cat.id ? 'text-accent font-semibold' : 'text-text-muted hover:bg-white/[0.06] hover:text-white'
                  )}
                >
                  {cat.name}
                </button>
              ))}
              <button
                onClick={async () => { setMoveMenuFor(null); await handleMoveChannel(c.id, null); }}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors',
                  c.category_id == null ? 'text-accent font-semibold' : 'text-text-muted hover:bg-white/[0.06] hover:text-white'
                )}
              >
                Ungrouped
              </button>
              <div className="my-1 border-t border-white/[0.06]" />
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
                className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-text-muted hover:bg-white/[0.06] hover:text-white transition-colors flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                {c.post_restricted ? 'Open posting to everyone' : 'Admin-only posting'}
              </button>
            </div>
          </>
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
                className="p-1 rounded text-text-muted/60 hover:text-white"
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
            className="p-1 rounded text-text-muted/60 hover:text-white"
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
            className="p-1.5 -mr-1 rounded-md text-text-muted hover:text-white hover:bg-white/[0.07] transition-colors"
            title="New category"
            aria-label="New category"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        )}
      </div>
      {creatingCategory && isAdmin && (
        <div className="mx-3 mb-2 p-3 rounded-xl bg-primary border border-white/10 space-y-2 flex-shrink-0">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Category name"
            maxLength={40}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategorySubmit(); }}
            className="w-full bg-secondary border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60"
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
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-white hover:bg-white/[0.06] transition-colors"
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
                  className="flex-1 min-w-0 bg-secondary border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent/60"
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
          <div key={m.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors">
            <AvatarWithPresence user={m} size="sm" presence={m.presence} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate leading-tight">{m.name}</p>
              <p className="text-[11px] text-text-muted truncate">{PRESENCE_META[m.presence]?.label || 'Offline'}</p>
            </div>
          </div>
        ))}
        {offlineMembers.length > 0 && (
          <p className="px-2.5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted/60">
            Offline — {offlineMembers.length}
          </p>
        )}
        {offlineMembers.map((m: any) => (
          <div key={m.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg opacity-60 hover:opacity-90 hover:bg-white/[0.04] transition-all">
            <AvatarWithPresence user={m} size="sm" presence={m.presence} />
            <p className="text-sm font-medium text-text-muted truncate flex-1">{m.name}</p>
          </div>
        ))}
      </div>
    </div>
  );

  let lastDay = '';
  const canDelete = (msg: any) => msg.sender_id === currentUser.id || isAdmin;
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
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted/70">{day}</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
        )}
        <div
          ref={(el) => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
          onClick={() => { if (isTouchDevice) setActiveMsgId((id) => (id === msg.id ? null : msg.id)); }}
          className={cn(
            'group relative flex gap-3 px-4 py-1.5 transition-colors',
            flashed ? 'bg-accent/15' : 'hover:bg-white/[0.03]'
          )}
        >
          {/* action bar — hover on desktop, tap-to-toggle on touch devices */}
          <div className={cn(
            'absolute -top-3 right-4 z-10 items-center rounded-lg border border-white/10 bg-secondary shadow-xl overflow-hidden',
            activeMsgId === msg.id ? 'flex' : 'hidden group-hover:flex'
          )}>
            <button onClick={(e) => { e.stopPropagation(); setActiveMsgId(null); startReply(msg); }} title="Reply (R)" aria-label="Reply to message" className="p-2 text-text-muted hover:text-white hover:bg-white/[0.07] transition-colors">
              <Reply className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setActiveMsgId(null); setForwardMsg(msg); }} title="Forward" aria-label="Forward message" className="p-2 text-text-muted hover:text-white hover:bg-white/[0.07] transition-colors">
              <Forward className="w-4 h-4" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setActiveMsgId(null); copyMessageText(msg); }} title="Copy text" aria-label="Copy message text" className="p-2 text-text-muted hover:text-white hover:bg-white/[0.07] transition-colors">
              <Copy className="w-4 h-4" />
            </button>
            {canDelete(msg) && (
              <button onClick={(e) => { e.stopPropagation(); setActiveMsgId(null); handleDeleteMessage(msg.id); }} title="Delete" aria-label="Delete message" className="p-2 text-text-muted hover:text-rose-400 hover:bg-white/[0.07] transition-colors">
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
              <button onClick={(e) => { e.stopPropagation(); scrollToMessage(msg.reply_to_id); }} className="flex items-center gap-1.5 mb-1 text-xs text-text-muted hover:text-white transition-colors max-w-full" title="Jump to original">
                <Reply className="w-3 h-3 rotate-180 flex-shrink-0 text-text-muted/60" />
                <span className="font-bold truncate">{msg.reply_sender_name}</span>
                <span className="truncate opacity-70">{(msg.reply_content || '').slice(0, 90)}</span>
              </button>
            )}
            {msg.reply_to_id && replyGone && (
              <p className="text-xs text-text-muted/50 italic mb-1">Original message was deleted</p>
            )}
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-bold text-white">{senderName}</span>
              <span className="text-[10px] text-text-muted/60">{format(new Date(msg.timestamp), 'HH:mm')}</span>
            </div>
            <div className="text-[15px] text-white/90 leading-relaxed break-words">
              {msg.file_path && (
                <div className="flex flex-col gap-2 mb-1.5 mt-1">
                  {isImageFile(msg.file_path) && (
                    <a href={msg.file_path} target="_blank" rel="noopener noreferrer">
                      <img
                        src={msg.file_path}
                        alt={msg.file_name || 'uploaded'}
                        className="rounded-lg max-w-xs max-h-64 object-cover border border-white/10 shadow-sm hover:opacity-95 transition-opacity"
                      />
                    </a>
                  )}
                  {!isImageFile(msg.file_path) && (
                    <div className="flex flex-col gap-1 p-3 rounded-xl border min-w-[200px] max-w-xs bg-white/5 border-white/10">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
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
                        href={msg.file_path}
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
            </div>
          </div>
        </div>
      </div>
    );
  });

  const teamHeader = (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => (teams || []).length > 1 && setShowTeamMenu(!showTeamMenu)}
        className="w-full flex items-center gap-2 px-4 h-12 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
        title={activeTeamName || 'My team'}
      >
        <span className="font-bold text-[15px] text-white truncate flex-1 text-left">{activeTeamName || 'My team'}</span>
        {(teams || []).length > 1 && <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform', showTeamMenu && 'rotate-180')} />}
      </button>
      {showTeamMenu && (teams || []).length > 1 && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setShowTeamMenu(false)} aria-label="Close team menu" />
          <div className="absolute left-2 right-2 top-full mt-1 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50">
            <div className="max-h-64 overflow-y-auto custom-scrollbar py-1.5">
              {(teams || []).map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => { setShowTeamMenu(false); onSwitchTeam?.(t.id); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-white/5',
                    t.name === activeTeamName ? 'text-white font-bold' : 'text-white/70'
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
      <div className="hidden md:flex w-60 flex-shrink-0 border-r border-white/[0.06] bg-secondary/40 flex-col min-h-0">
        {teamHeader}
        <div className="flex-1 min-h-0 flex flex-col">{channelList}</div>
      </div>
      {showChannelsMobile && (
        <div className="md:hidden absolute inset-y-0 left-0 w-64 z-30 bg-secondary border-r border-white/10 flex flex-col min-h-0">
          <div className="flex items-center justify-between pl-4 pr-2 h-12 border-b border-white/[0.06] flex-shrink-0">
            <span className="text-sm font-bold text-white truncate">{activeTeamName || 'Channels'}</span>
            <button onClick={() => setShowChannelsMobile(false)} className="p-2 text-text-muted hover:text-white" aria-label="Close channels">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col">{channelList}</div>
        </div>
      )}

      {/* Center: conversation */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="h-12 px-3 sm:px-4 border-b border-white/[0.06] flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowChannelsMobile(true)} className="md:hidden p-2 -ml-1 text-text-muted hover:text-white" aria-label="Open channels">
            <Hash className="w-5 h-5" />
          </button>
          <Hash className="w-5 h-5 text-text-muted/70 flex-shrink-0" />
          <h3 className="text-[15px] font-bold text-white truncate">{activeChannel?.name || 'general'}</h3>
          {activeChannel?.topic && (
            <p className="hidden sm:block text-xs text-text-muted truncate border-l border-white/10 pl-2 ml-1">{activeChannel.topic}</p>
          )}
          <div className="flex-1" />
          <button onClick={() => setShowMemberList(!showMemberList)} className="hidden lg:block p-2 text-text-muted hover:text-white transition-colors" aria-label="Toggle member list" title="Toggle member list">
            <Users className={cn('w-5 h-5', showMemberList && 'text-accent')} />
          </button>
          <button onClick={() => setShowMembersMobile(!showMembersMobile)} className="lg:hidden p-2 text-text-muted hover:text-white" aria-label="Toggle members">
            <Users className="w-5 h-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-3 min-h-0">
          {visibleMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="w-16 h-16 rounded-full bg-white/[0.05] flex items-center justify-center">
                <Hash className="w-8 h-8 text-text-muted/50" />
              </div>
              <div>
                <p className="text-white font-bold">Welcome to #{activeChannel?.name || 'general'}!</p>
                <p className="text-sm text-text-muted mt-1">This is the start of the conversation.</p>
              </div>
            </div>
          ) : messageList}
        </div>

        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1 flex-shrink-0 relative">
          {!canPostInChannel ? (
            <div className="flex items-center gap-2.5 bg-secondary/60 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-text-muted">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>Only admins can post in <span className="font-semibold text-white">#{activeChannel?.name}</span></span>
            </div>
          ) : (
          <>
          {replyTo && (
            <div className="flex items-center gap-2 pl-4 pr-2 py-2 bg-secondary/80 border border-white/10 border-b-0 rounded-t-xl text-xs">
              <Reply className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              <span className="text-text-muted flex-shrink-0">Replying to <span className="font-bold text-white">{replyTo.sender_name}</span></span>
              <span className="text-text-muted/60 truncate flex-1">{(replyTo.content || '').slice(0, 80)}</span>
              <button onClick={() => setReplyTo(null)} className="p-1.5 text-text-muted hover:text-white transition-colors" title="Cancel reply (Esc)">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-2">
              {pendingPreview ? (
                <img src={pendingPreview} alt="attachment preview" className="w-14 h-14 rounded-lg object-cover border border-white/10" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{pendingFile.name}</p>
                <p className="text-[11px] text-text-muted">{formatFileSize(pendingFile.size)} — will send with your message</p>
              </div>
              <button onClick={clearPending} className="p-2 text-text-muted hover:text-rose-400 transition-colors" title="Remove attachment">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {showMentions && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-4 mb-2 glass rounded-xl border border-white/10 overflow-hidden w-56 shadow-2xl z-10">
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
                  className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-accent hover:text-primary transition-colors flex items-center gap-2.5"
                >
                  <Avatar user={m} size="xs" />
                  {m.name}
                </button>
              ))}
            </div>
          )}
          <div className={cn(
            'flex gap-1.5 items-end bg-secondary/60 border border-white/10 px-1.5 py-1.5',
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
              className="h-10 w-10 rounded-lg transition-all active:scale-95 flex items-center justify-center disabled:opacity-50 text-text-muted hover:text-white hover:bg-white/[0.08] flex-shrink-0"
              title="Attach file"
            >
              <FileUp className="w-5 h-5" />
            </button>
            <textarea
              ref={composerRef}
              className="flex-1 bg-transparent px-2 py-2.5 text-sm text-white placeholder:text-text-muted/60 focus:outline-none min-h-[40px] max-h-32 resize-none"
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
        'w-56 flex-shrink-0 border-l border-white/[0.06] bg-secondary/40 flex-col min-h-0',
        showMembersMobile ? 'absolute inset-y-0 right-0 z-30 flex bg-secondary' : (showMemberList ? 'hidden lg:flex' : 'hidden')
      )}>
        {showMembersMobile && (
          <div className="lg:hidden flex items-center justify-between px-4 h-12 border-b border-white/[0.06] flex-shrink-0">
            <span className="text-sm font-bold text-white">Members</span>
            <button onClick={() => setShowMembersMobile(false)} className="p-1.5 text-text-muted hover:text-white" aria-label="Close members">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0">{memberList}</div>
      </div>

      {/* Forward modal */}
      {forwardMsg && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setForwardMsg(null)}>
          <div className="w-full max-w-sm glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10">
              <h3 className="text-base font-bold text-white">Forward message</h3>
              <p className="text-xs text-text-muted mt-1 truncate">"{(forwardMsg.content || forwardMsg.file_name || 'attachment').slice(0, 80)}"</p>
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar py-2">
              {(channels || []).map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => handleForward(c.id)}
                  className="w-full flex items-center gap-2.5 px-5 py-2.5 text-left hover:bg-white/[0.05] transition-colors"
                >
                  <Hash className="w-4 h-4 text-text-muted/70 flex-shrink-0" />
                  <span className={cn('text-sm truncate flex-1', c.id === activeChannelId ? 'text-white font-semibold' : 'text-white/80')}>{c.name}</span>
                  {c.id === activeChannelId && <span className="text-[10px] text-text-muted uppercase tracking-wider">current</span>}
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-white/10 flex justify-end">
              <button onClick={() => setForwardMsg(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:text-white hover:bg-white/[0.06] transition-colors">
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
          <h1 className="text-2xl font-display font-bold text-white tracking-tight text-center">You're not on any teams</h1>
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
              <button onClick={onSignOut} className="w-full text-center text-xs text-text-muted hover:text-white transition-colors">
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
                This cannot be undone. Type your email (<span className="text-white">{user?.email}</span>) to confirm.
              </p>
              <Input value={confirmEmail} onChange={(e: any) => setConfirmEmail(e.target.value)} placeholder="your@email.com" />
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => { setMode('menu'); setConfirmEmail(''); }} className="flex-1">Back</Button>
                <Button
                  onClick={doDelete}
                  disabled={busy || confirmEmail.trim().toLowerCase() !== (user?.email || '').toLowerCase()}
                  className="flex-1 bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-40"
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
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const pickScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      notify('Please choose an image file.', 'error');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      notify('Screenshots must be under 5MB.', 'error');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setScreenshot(f);
    setPreview(URL.createObjectURL(f));
  };

  const clearScreenshot = () => {
    if (preview) URL.revokeObjectURL(preview);
    setScreenshot(null);
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
      if (screenshot) form.append('screenshot', screenshot);
      const res = await apiFetch('/api/feedback', { method: 'POST', body: form });
      if (res.ok) {
        clearScreenshot();
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
      <div className="glass rounded-2xl border border-white/10 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
              <Check className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-lg font-display font-bold text-white mb-2">Feedback sent</h3>
            <p className="text-sm text-text-muted mb-6">Thanks — Sushil reads every note personally.</p>
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-display font-bold text-white">Send feedback</h3>
              <button onClick={onClose} className="p-1.5 text-text-muted hover:text-white transition-colors"><X className="w-5 h-5" /></button>
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
                  className="w-full bg-elevated border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all resize-none"
                />
              </div>
              <div className="space-y-2">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={pickScreenshot} className="hidden" />
                {preview ? (
                  <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-2">
                    <img src={preview} alt="screenshot preview" className="w-14 h-14 rounded-lg object-cover border border-white/10" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{screenshot?.name}</p>
                      <p className="text-[11px] text-text-muted">Will send with your feedback</p>
                    </div>
                    <button type="button" onClick={clearScreenshot} className="p-2 text-text-muted hover:text-rose-400 transition-colors" title="Remove screenshot">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm text-text-muted hover:text-white hover:border-accent/40 transition-colors"
                  >
                    <ImagePlus className="w-4 h-4" /> Attach a screenshot
                  </button>
                )}
                <p className="text-[11px] text-text-muted/80">
                  Reporting a bug or something looks off? Attaching a screenshot is recommended — it shows Sushil exactly what you saw. (Images only, up to 5MB.)
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
  if (!u) return { label: '—', cls: 'bg-white/5 text-text-muted' };
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
  'dismissed': { label: 'Dismissed', cls: 'bg-white/5 text-text-muted' },
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
        apiFetch('/api/owner/ai-overview').then(r => r.json()),
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
    const r = await apiFetch('/api/owner/ai-overview');
    if (r.ok) setAiOverview(await r.json());
  };

  const setFeedbackStatus = async (id: number, status: 'new' | 'resolved') => {
    const res = await apiFetch(`/api/owner/feedback/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) setFeedback(feedback.map(f => f.id === id ? { ...f, status } : f));
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
        <h3 className="text-lg sm:text-xl font-display font-bold text-white flex items-center gap-2">
          <Crown className="w-5 h-5 text-accent" /> Owner Portal
        </h3>
        <p className="text-sm text-text-muted mt-1">Your private command center — every workspace, user, AI flag, and feedback note in one place.</p>
      </div>

      <div className="flex gap-1 sm:gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-full sm:w-fit overflow-x-auto custom-scrollbar">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={cn("px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap capitalize", tab === t.id ? "bg-accent text-primary shadow-lg" : "text-text-muted hover:text-white")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card><p className="text-sm text-text-muted text-center py-8">Loading…</p></Card>
      ) : tab === 'overview' ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {statCards.map((c) => (
              <Card key={c.label} className="!p-4 !gap-2">
                <c.icon className="w-5 h-5 text-accent" />
                <p className="text-2xl font-display font-bold text-white">{c.value}</p>
                <p className="text-xs text-text-muted">{c.label}</p>
              </Card>
            ))}
          </div>
          <Card title="Workspaces" subtitle="Every team on Control Point and how active each one is">
            <div className="space-y-2">
              {(overview?.teams || []).map((t: any) => (
                <div key={t.id} className="glass rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{t.name}</p>
                    <p className="text-[11px] text-text-muted">Code {t.access_code}{t.number ? ` · #${t.number}` : ''}</p>
                  </div>
                  <div className="flex gap-4 text-xs text-text-muted ml-auto">
                    <span><b className="text-white">{t.member_count}</b> members</span>
                    <span><b className="text-white">{t.message_count}</b> messages</span>
                    <span><b className="text-white">{t.task_count}</b> tasks</span>
                    <span><b className="text-white">{t.feedback_count}</b> feedback</span>
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
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent/50"
              />
            </div>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="all">All teams</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {filteredUsers.map((u: any) => {
              const st = aiStatusOf(u);
              return (
                <div key={u.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5">
                  <Avatar user={u} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate flex items-center gap-2">
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="!p-4 !gap-2">
              <Zap className="w-5 h-5 text-accent" />
              <p className="text-2xl font-display font-bold text-white">{aiOverview?.today?.messages || 0}</p>
              <p className="text-xs text-text-muted">AI messages today</p>
            </Card>
            <Card className="!p-4 !gap-2">
              <MessageSquare className="w-5 h-5 text-accent" />
              <p className="text-2xl font-display font-bold text-white">{fmtTokens(aiOverview?.today?.tokens || 0)}</p>
              <p className="text-xs text-text-muted">Tokens today</p>
            </Card>
            <Card className="!p-4 !gap-2">
              <Users className="w-5 h-5 text-accent" />
              <p className="text-2xl font-display font-bold text-white">{aiOverview?.today?.users || 0}</p>
              <p className="text-xs text-text-muted">People used AI today</p>
            </Card>
            <Card className="!p-4 !gap-2">
              <Flag className="w-5 h-5 text-rose-400" />
              <p className="text-2xl font-display font-bold text-white">{openFlagCount}</p>
              <p className="text-xs text-text-muted">Open misuse flags</p>
            </Card>
          </div>
          <Card title="Heaviest AI users" subtitle="Last 7 days by tokens — spot runaway usage at a glance">
            <div className="space-y-1">
              {(aiOverview?.top || []).map((t: any, i: number) => (
                <div key={t.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5">
                  <span className="text-xs font-bold text-text-muted w-5 text-center">{i + 1}</span>
                  <Avatar user={t} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{t.name}</p>
                    <p className="text-[11px] text-text-muted truncate">{t.email}{t.team_name ? ` · ${t.team_name}` : ''}</p>
                  </div>
                  <div className="text-right text-xs text-text-muted flex-shrink-0">
                    <p><b className="text-white">{fmtTokens(t.tokens)}</b> tokens</p>
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
              <li><b className="text-white">Homework-like</b> — messages matching homework/essay/quiz patterns get flagged for your review.</li>
              <li><b className="text-white">Spam burst</b> — 12+ AI messages within 10 minutes.</li>
              <li><b className="text-white">Excessive use</b> — 80+ AI messages in a day.</li>
              <li>Flags never block anyone by themselves — you decide: dismiss, warn, time out, or disable AI.</li>
            </ul>
          </Card>
        </>
      ) : tab === 'flags' ? (
        <div className="space-y-3">
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
            {(['open', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFlagFilter(f); reloadFlags(f); }}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all", flagFilter === f ? "bg-accent text-primary" : "text-text-muted hover:text-white")}
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
                    <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full", f.status === 'new' ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-text-muted")}>{f.status}</span>
                  </div>
                  <p className="text-sm text-white whitespace-pre-wrap">{f.message}</p>
                  {f.screenshot_url && (
                    <a href={f.screenshot_url} target="_blank" rel="noreferrer" className="block mt-2">
                      <img src={f.screenshot_url} alt="feedback screenshot" className="max-h-40 rounded-lg border border-white/10 object-contain hover:border-accent/40 transition-colors" />
                    </a>
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
        />
      )}
    </div>
  );
}

function FlagCard({ flag, onAction, onManageUser }: { flag: any; onAction: (id: number, action: string, note: string, timeoutHours?: number) => Promise<void>; onManageUser: (id: number) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const reason = FLAG_REASONS[flag.reason] || { label: flag.reason, cls: 'bg-white/5 text-text-muted' };
  const status = FLAG_STATUSES[flag.status] || { label: flag.status, cls: 'bg-white/5 text-text-muted' };

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
          <button onClick={() => flag.member_id && onManageUser(flag.member_id)} className="text-sm font-bold text-white truncate hover:text-accent transition-colors text-left">
            {flag.user_name || 'Unknown user'}
          </button>
          <p className="text-[11px] text-text-muted truncate">{flag.user_email}{flag.team_name ? ` · ${flag.team_name}` : ''}</p>
        </div>
      </div>
      <p className="text-sm text-white/90 bg-white/5 border border-white/10 rounded-xl px-3 py-2 whitespace-pre-wrap">“{flag.excerpt}”</p>
      {flag.reviewer_note && (
        <p className="text-[11px] text-text-muted">Your note: {flag.reviewer_note}</p>
      )}
      {flag.status === 'open' && (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional — recorded with warn/timeout/disable)…"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent/50"
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

function OwnerUserDrawer({ userId, onClose, onChanged }: { userId: number; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dailyLimit, setDailyLimit] = useState('');
  const [replyMax, setReplyMax] = useState('');
  const [warnNote, setWarnNote] = useState('');
  const [busy, setBusy] = useState(false);

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
      <div className="relative w-full max-w-md h-full bg-[#0b0b0d] border-l border-white/10 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-display font-bold text-white">Manage user</h4>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-text-muted hover:text-white transition-colors">
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
                <p className="text-base font-bold text-white truncate">{u.name}</p>
                <p className="text-xs text-text-muted truncate">{u.email}</p>
                <p className="text-xs text-text-muted">{u.team_name || 'No team'} · {u.role} · {u.account_type}</p>
              </div>
              <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full whitespace-nowrap", st.cls)}>{st.label}</span>
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <span key={c} className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 text-text-muted">via {c}</span>
                ))}
                {(data?.siblings?.length || 0) > 0 && (
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/5 text-text-muted">
                    {data.siblings.length + 1} teams total
                  </span>
                )}
              </div>
            )}

            <Card title="AI access" subtitle="Kill switch, timeouts, and token budgets" className="!gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">AI enabled</p>
                  <p className="text-[11px] text-text-muted">Turn off to block all Bruno / NavGPT replies</p>
                </div>
                <button
                  disabled={busy}
                  onClick={() => patchAi({ ai_disabled: u.ai_disabled !== 1 }, u.ai_disabled === 1 ? 'AI re-enabled' : 'AI disabled for user')}
                  className={cn("relative w-11 h-6 rounded-full transition-colors flex-shrink-0", u.ai_disabled === 1 ? "bg-white/10" : "bg-emerald-500")}
                >
                  <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all", u.ai_disabled === 1 ? "left-0.5" : "left-[22px]")} />
                </button>
              </div>

              <div>
                <p className="text-sm font-bold text-white mb-1.5">Timeout AI</p>
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs font-bold text-white mb-1">Daily token limit</p>
                  <div className="flex gap-1.5">
                    <input
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Unlimited"
                      inputMode="numeric"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                    />
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => patchAi({ ai_daily_token_limit: dailyLimit || null }, 'Daily limit saved')}>Set</Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-white mb-1">Max tokens / reply</p>
                  <div className="flex gap-1.5">
                    <input
                      value={replyMax}
                      onChange={(e) => setReplyMax(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Default"
                      inputMode="numeric"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                    />
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => patchAi({ ai_max_tokens_reply: replyMax || null }, 'Reply cap saved')}>Set</Button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-text-muted">Blank = no limit. Limits apply to Bruno / NavGPT chat; blocked users see your message in the chat.</p>
            </Card>

            <Card title="Warn user" subtitle="Warnings are logged and visible here" className="!gap-2">
              <div className="flex gap-2">
                <input
                  value={warnNote}
                  onChange={(e) => setWarnNote(e.target.value)}
                  placeholder="Reason for the warning…"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:border-accent/50"
                />
                <Button variant="secondary" size="sm" disabled={busy} onClick={doWarn}>
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
                  const rs = FLAG_STATUSES[f.status] || { label: f.status, cls: 'bg-white/5 text-text-muted' };
                  const rr = FLAG_REASONS[f.reason] || { label: f.reason, cls: 'bg-white/5 text-text-muted' };
                  return (
                    <div key={f.id} className="text-xs bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={cn("text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full", rr.cls)}>{rr.label}</span>
                        <span className={cn("text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full", rs.cls)}>{rs.label}</span>
                        <span className="text-[10px] text-text-muted ml-auto">{f.created_at ? format(new Date(f.created_at), 'MMM d') : ''}</span>
                      </div>
                      <p className="text-white/80 line-clamp-2">“{f.excerpt}”</p>
                    </div>
                  );
                })}
              </Card>
            )}

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

function ProfileView({ currentUser, onRefresh, setLoading, hasScope, setColorVersion }: any) {
  const [name, setName] = useState(currentUser?.name || '');
  const [role, setRole] = useState(currentUser?.role || '');
  const [accentColor, setAccentColor] = useState(currentUser?.accent_color || '');
  const [primaryColor, setPrimaryColor] = useState(currentUser?.primary_color || '');
  const [textColor, setTextColor] = useState(currentUser?.text_color || '');

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setRole(currentUser.role || '');
      setAccentColor(currentUser.accent_color || '');
      setPrimaryColor(currentUser.primary_color || '');
      setTextColor(currentUser.text_color || '');
    }
  }, [currentUser]);

  // Apply color changes in real-time to the page
  useEffect(() => {
    const root = document.documentElement;
    if (validHex(accentColor)) root.style.setProperty('--color-accent', accentColor.trim());
    else root.style.removeProperty('--color-accent');
    if (validHex(primaryColor)) root.style.setProperty('--color-primary', primaryColor.trim());
    else root.style.removeProperty('--color-primary');
    if (validHex(textColor)) root.style.setProperty('--color-text-base', textColor.trim());
    else root.style.removeProperty('--color-text-base');
    
    // Trigger re-render of all components to pick up new CSS variables
    setColorVersion((v) => v + 1);
  }, [accentColor, primaryColor, textColor, setColorVersion]);

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
      const res = await fetch(`/api/profile/avatar${sid ? `?sessionId=${encodeURIComponent(sid)}` : ''}`, {
        method: 'POST',
        body: fd
      });
      if (res.ok) {
        await onRefresh();
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
      if (res.ok) await onRefresh();
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
          primary_color: primaryColor || null,
          text_color: textColor || null
        })
      });
      if (res.ok) {
        await onRefresh();
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
    setPrimaryColor('');
    setTextColor('');
  };

  const isAdmin = hasScope('admin');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-xl font-display font-bold text-white">My Profile</h3>
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
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-muted uppercase">Interface (Navy)</label>
              <div className="flex gap-2">
                <input type="color" className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" value={primaryColor || '#09090B'} onChange={(e) => setPrimaryColor(e.target.value)} />
                <Input value={primaryColor} onChange={(e: any) => setPrimaryColor(e.target.value)} placeholder="#09090B" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-muted uppercase">Text Color</label>
              <div className="flex gap-2">
                <input type="color" className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" value={textColor || '#F8FAFC'} onChange={(e) => setTextColor(e.target.value)} />
                <Input value={textColor} onChange={(e: any) => setTextColor(e.target.value)} placeholder="#F8FAFC" />
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                const res = await apiFetch('/api/theme/reset', { method: 'POST' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Could not reset theme');
                setAccentColor(''); setPrimaryColor(''); setTextColor('');
                const root = document.documentElement;
                root.style.removeProperty('--color-accent');
                root.style.removeProperty('--color-primary');
                root.style.removeProperty('--color-text-base');
                setColorVersion((v: number) => v + 1);
                onRefresh();
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
          <p className="text-sm text-text-muted">Email: <span className="text-white">{currentUser?.email}</span></p>
          <p className="text-sm text-text-muted">Account Type: <span className="text-accent">{currentUser?.is_board ? 'Board Member' : 'Team Member'}</span></p>
          <p className="text-sm text-text-muted">Administrative Scopes: <span className="text-white">
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

function SettingsView({ settings, members, teams, onRefresh, currentUser, navGptQualified, navGptActive, isOwner }: any) {
  const [criteria, setCriteria] = useState(settings.excuse_criteria || '');
  const [maxTokensNews, setMaxTokensNews] = useState(settings.max_tokens_news || '1024');
  const [maxTokensAttendance, setMaxTokensAttendance] = useState(settings.max_tokens_attendance || '1024');
  const [maxTokensExcuse, setMaxTokensExcuse] = useState(settings.max_tokens_excuse || '512');
  const [maxTokensSummary, setMaxTokensSummary] = useState(settings.max_tokens_summary || '1024');
  const [maxTokensChat, setMaxTokensChat] = useState(settings.max_tokens_chat || '1024');
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
      onRefresh();
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
      try {
        const res = await apiFetch(`/api/messages/${messageId}?silent=true`, { method: 'DELETE' });
        if (res.ok) {
          await fetchAllMessages();
          notify('Message permanently deleted.', 'success');
        } else {
          notify('Failed to delete message.', 'error');
        }
      } catch (error) {
        console.error('Delete error:', error);
        notify('Error deleting message: ' + error, 'error');
      }
    }
  };

  const handleUpdateMessage = async () => {
    if (!editingMessage) return;
    try {
      const res = await apiFetch(`/api/messages/${editingMessage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingMessage.content })
      });
      if (res.ok) {
        setEditingMessage(null);
        await fetchAllMessages();
        notify('Message updated.', 'success');
      } else {
        notify('Failed to update message.', 'error');
      }
    } catch (error) {
      console.error('Update error:', error);
      notify('Error updating message: ' + error, 'error');
    }
  };

  useEffect(() => {
    fetchStorageUsage();
    fetchAllMessages();
  }, []);

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
      ] : []),
    ];

    for (const payload of payloads) {
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    onRefresh();
    notify('Settings saved', 'success');
  };

  const updateMember = async (id: number, data: any) => {
    await apiFetch(`/api/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    onRefresh();
    setShowMemberEdit(null);
  };

  return (
    <div className="max-w-4xl space-y-8">
      <Card title="FTC Team Connection" icon={Trophy} subtitle="Link your FTC team number to pull live stats, OPR rankings, and event history">
        <div className="space-y-4">
          {myTeam?.ftc_team_number ? (
            <div className="flex flex-wrap items-center gap-3 p-4 bg-accent/10 border border-accent/30 rounded-2xl">
              <span className="bg-accent text-accent-ink font-display font-bold px-3 py-1 rounded-xl">#{myTeam.ftc_team_number}</span>
              <p className="text-sm text-white/80 flex-1">Connected — stats appear on the dashboard and Team Stats page.</p>
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
            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-2">
              <p className="text-white font-bold">Team {ftcVerified.number} — {ftcVerified.name}</p>
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

      {navGptQualified && (
        <Card title="Chatbot Persona" icon={Bot} subtitle="Who answers in the team chatbot">
          <div className="flex items-center gap-4">
            <button
              type="button"
              role="switch"
              aria-checked={!!navGptActive}
              aria-label="NavGPT ❤️"
              disabled={savingPersona}
              onClick={async () => {
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
                  onRefresh();
                } catch (e: any) {
                  notify(e.message || 'Could not update persona', 'error');
                } finally {
                  setSavingPersona(false);
                }
              }}
              className={cn(
                'relative w-12 h-7 rounded-full transition-colors flex-shrink-0',
                navGptActive ? 'bg-accent' : 'bg-white/15 hover:bg-white/20'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all',
                  navGptActive ? 'left-6' : 'left-1'
                )}
              />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white">NavGPT ❤️</p>
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
      
      <Card title="Message Management" icon={Mail}>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Silently edit or delete messages.</p>
          <div className="max-h-96 overflow-y-auto glass p-2 rounded-xl">
            {loadingMessages ? <p>Loading messages...</p> : (
              allMessages.map((msg: any) => (
                <div key={msg.id} className="p-2 border-b border-white/10">
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
      </Card>

      <Card title="AI Absence Evaluation" icon={Settings}>
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Define the criteria the AI should use to determine if an absence is excused.</p>
          <textarea 
            className="w-full bg-primary border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/50 transition-colors h-48 text-sm"
            placeholder="e.g. Excused if: sick with doctor note, family emergency, school event. Unexcused if: forgot, overslept, gaming..."
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
          <Button onClick={handleSave}>Save Settings</Button>
        </div>
      </Card>

      {isOwner && (
      <Card title="AI Configuration (Max Tokens)" icon={Bolt}>
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
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Name</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Board</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Scopes</th>
                    <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {members.map((m: any) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 text-white">{m.name}</td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => updateMember(m.id, { ...m, is_board: m.is_board ? 0 : 1 })}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase",
                            m.is_board ? "bg-accent/20 text-accent" : "bg-slate-800 text-text-muted/70"
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
          <Card title={`Edit Scopes: ${showMemberEdit.name}`} className="w-full max-w-md">
            <div className="space-y-4">
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
                        active ? "bg-accent border-accent text-primary" : "border-white/10 text-text-muted"
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowMemberEdit(null)}>Cancel</Button>
                <Button onClick={() => updateMember(showMemberEdit.id, showMemberEdit)}>Save Changes</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

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
              This cannot be undone. Type your email (<span className="text-white">{currentUser?.email}</span>) to confirm.
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
                className="bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-40"
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
