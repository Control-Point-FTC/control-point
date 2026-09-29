import React, { useState, useEffect, useMemo } from 'react';
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
  Mail,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
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
  Calendar,
  User,
  UserCircle,
  Zap,
  Trash2,
  FileUp,
  FileText,
  MapPin,
  Download,
  Bolt,
  Code2,
  Check,
  ShieldCheck,
  GraduationCap,
  KeyRound,
  Copy,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import Markdown from 'react-markdown';
import BuildHelperChat from './components/BuildHelperChat';
import { format } from 'date-fns';

import { Team, Member, AttendanceRecord, Task, BudgetItem, OutreachEvent, Communication, CalendarEvent } from './types';
import { fetchFTCNews, streamFTCNews, getAttendanceInsights, streamAttendanceInsights, getActivitySummary, streamActivitySummary } from './services/aiService';
import { apiFetch } from './services/api';
import { CodeView } from './components/CodeView';
import Landing from './Landing';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to get CSS variable values
function getCSSVariable(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
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

const RoleScreen = ({ onBack, onSelect, googleEnabled }: { onBack: () => void; onSelect: (mode: 'admin' | 'student') => void; googleEnabled: boolean }) => (
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
      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-text-muted">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <a href="/api/auth/google?intent=signup" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-elevated px-3 py-3 text-sm font-semibold text-white hover:border-accent/60 hover:bg-white/5 transition-all">
            <GoogleIcon /> Continue with Google
          </a>
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
            <>
              <div className="space-y-1.5">{label('Team name')}<Input required value={teamName} onChange={(e: any) => setTeamName(e.target.value)} placeholder="e.g. Circuit Breakers" /></div>
              <div className="space-y-1.5">{label('Team number (optional)')}<Input value={teamNumber} onChange={(e: any) => setTeamNumber(e.target.value)} placeholder="e.g. 12345" /></div>
            </>
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

// After Google OAuth: the identity is verified, now collect the role-specific details
const GoogleSignupScreen = ({ token, intent, onBack, onDone }: {
  token: string; intent: 'admin_signup' | 'student_signup' | 'signup';
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
      const res = await apiFetch('/api/auth/google/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, teamName, teamNumber, accessCode, role: needsRole ? pickedRole : undefined }),
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
            <GoogleIcon /> Signed in with Google — one more step.
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
            <>
              <div className="space-y-1.5">{label('Team name')}<Input required value={teamName} onChange={(e: any) => setTeamName(e.target.value)} placeholder="e.g. Circuit Breakers" /></div>
              <div className="space-y-1.5">{label('Team number (optional)')}<Input value={teamNumber} onChange={(e: any) => setTeamNumber(e.target.value)} placeholder="e.g. 12345" /></div>
            </>
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
const CodeRevealScreen = ({ team, onEnter }: { team: { name: string; access_code: string }; onEnter: () => void }) => {
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
            <span className="text-white font-semibold">{team.name}</span> is set up. Share this access code with your students — they'll enter it when they sign up to join automatically.
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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // Auth State
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authScreen, setAuthScreen] = useState<'landing' | 'login' | 'role' | 'signup-admin' | 'signup-student' | 'code-reveal'>('landing');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupTeam, setSignupTeam] = useState<{ id: number; name: string; access_code: string } | null>(null);

  // Data State
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [budget, setBudget] = useState<BudgetItem[]>([]);
  const [outreach, setOutreach] = useState<OutreachEvent[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [documentation, setDocumentation] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [hiddenDates, setHiddenDates] = useState<string[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [news, setNews] = useState<string>("");
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

  // helper that uses our service; can force a refresh bypassing the 24h cache
  // this implementation streams the response so the UI updates as tokens arrive
  const updateNews = async (force: boolean = false) => {
    const CACHE_KEY = 'ftcNewsCache';
    const TS_KEY = 'ftcNewsTimestamp';

    // check local cache first
    if (!force && typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY);
      const ts = localStorage.getItem(TS_KEY);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (age < 24 * 60 * 60 * 1000) {
          setNews(cached);
          return;
        }
      }
    }

    setIsAiLoading(true);
    setAiLoadingTarget('news');
    setNews(""); // Clear old news to show "Thinking..."
    try {
      let aggregate = '';
      let receivedFirstChunk = false;
      await streamFTCNews(force, (chunk) => {
        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
        }
        aggregate += chunk;
        setNews(aggregate);
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CACHE_KEY, aggregate);
        localStorage.setItem(TS_KEY, Date.now().toString());
      }
    } catch (err) {
      console.error('Error updating news:', err);
      setNews('Failed to fetch latest news. Please check your connection.');
    } finally {
      setIsAiLoading(false);
      setAiLoadingTarget(null);
    }
  };

  // WebSocket
  const [socket, setSocket] = useState<WebSocket | null>(null);

  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleSignup, setGoogleSignup] = useState<{ token: string; intent: 'admin_signup' | 'student_signup' | 'signup' } | null>(null);

  // Handle Google OAuth callback (?google_session= / ?google_error= / ?google_signup=)
  useEffect(() => {
    apiFetch('/api/auth/config')
      .then(r => r.json())
      .then(d => setGoogleEnabled(!!d.googleEnabled))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const gs = params.get('google_session');
    const ge = params.get('google_error');
    const gsu = params.get('google_signup');
    const gi = params.get('intent');
    if (ge) {
      setGoogleError(ge === 'not_invited'
        ? 'This Google account is not registered yet — create an account to get started.'
        : 'Google sign-in failed. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (gsu && (gi === 'admin_signup' || gi === 'student_signup' || gi === 'signup')) {
      setGoogleSignup({ token: gsu, intent: gi });
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
            setGoogleError('Google sign-in failed. Please try again.');
          }
        })
        .catch(() => setGoogleError('Google sign-in failed. Please try again.'))
        .finally(() => window.history.replaceState({}, '', window.location.pathname));
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
          .catch(() => {});
      }
    }
  }, []);

  // Apply custom colors
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      const myTeam = teams.find(t => t.id === currentUser.team_id);
      
      const accent = currentUser.accent_color || myTeam?.accent_color || '#F5B700';
      const primary = currentUser.primary_color || myTeam?.primary_color || '#111111';
      const text = currentUser.text_color || myTeam?.text_color || '#F8FAFC'; // slate-100 default

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
      root.style.setProperty('--color-accent', '#F5B700');
      root.style.setProperty('--color-primary', '#111111');
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
          setMessages(prev => [...prev, msg]);
        } else if (msg.type === 'message_deleted') {
          if (msg.deleted_permanently) {
            // Remove message completely for permanent deletion
            setMessages(prev => prev.filter(m => m.id !== msg.id));
          } else {
            // Soft delete - mark as deleted
            setMessages(prev => 
              prev.map(m => m.id === msg.id ? { ...m, deleted_at: msg.deleted_at } : m)
            );
          }
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

      const [t, m, a, tk, b, o, inv, c, msgs, s, h, d, ev] = await Promise.all([
        fetchJson('/api/teams'),
        fetchJson('/api/members'),
        fetchJson('/api/attendance'),
        fetchJson('/api/tasks'),
        fetchJson('/api/budget'),
        fetchJson('/api/outreach'),
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
    }
  };

  const persistSession = (sid: string, user: any) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('sessionId', sid);
    setSessionId(sid);
    setCurrentUser(user);
    setIsLoggedIn(true);
  };

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
      alert(data.error || "Login failed");
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

  const hasScope = (scope: string) => {
    if (!currentUser) return false;
    if (isAdmin) return true;
    if (currentUser.role === 'President') return true;
    if (scope === 'admin' && currentUser.is_board) return true;
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

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'teams', label: 'Teams & Members', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: CalendarCheck, scope: 'attendance' },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'budget', label: 'Budget', icon: Wallet, scope: 'budget' },
    { id: 'inventory', label: 'Inventory', icon: Zap, scope: 'inventory' },
    { id: 'outreach', label: 'Outreach', icon: Globe },
    { id: 'code', label: 'Code', icon: Code2, scope: 'code' },
    { id: 'comm', label: 'Communication', icon: Mail },
    { id: 'chat', label: 'Messaging', icon: MessageSquare },
    { id: 'scout', label: 'AI Scout', icon: Newspaper },
    { id: 'profile', label: 'My Profile', icon: UserCircle },
    { id: 'settings', label: 'Admin Settings', icon: Settings, scope: 'admin' },
    { id: 'owner', label: 'Owner', icon: Crown, ownerOnly: true },
  ];

  // Students get a focused personal workspace; admins get everything
  const studentTabIds = ['dashboard', 'attendance', 'tasks', 'calendar', 'budget', 'inventory', 'outreach', 'comm', 'chat', 'profile'];
  const visibleTabs = navItems.filter((t) => {
    if ((t as any).ownerOnly) return isOwner;
    if (isAdmin) return !t.scope || hasScope(t.scope);
    return studentTabIds.includes(t.id);
  });

  // Keep students (and scope-restricted users) on tabs they can actually see
  useEffect(() => {
    if (isLoggedIn && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [isLoggedIn, currentUser]);

  // Owner status drives the Owner tab; only Sushil's email(s) qualify
  useEffect(() => {
    if (isLoggedIn) {
      apiFetch('/api/owner/me').then(r => r.json()).then(d => setIsOwner(!!d.isOwner)).catch(() => setIsOwner(false));
    } else {
      setIsOwner(false);
    }
  }, [isLoggedIn]);

  const renderContent = () => {
    const viewProps = {
      teams, members, attendance, tasks, budget, outreach, inventory, communications, events,
      messages, settings, hiddenDates, currentUser, onRefresh: fetchData, setLoading,
      insights, news, summary, socket, hasScope,
      isAiLoading, setIsAiLoading, ThinkingIndicator, aiLoadingTarget,
      colorVersion, setColorVersion,
      // give child views a way to explicitly refresh the AI news cache
      refreshNews: () => updateNews(true),
      updateInsights,
      updateSummary: () => updateSummary(true)
    };
    switch (activeTab) {
      case 'dashboard': return isAdmin
        ? <DashboardView {...viewProps} teams={teams} data={{ attendance, tasks, budget, outreach, insights, news, summary, members }} />
        : <StudentDashboardView {...viewProps} />;
      case 'teams': return <TeamsView {...viewProps} />;
      case 'attendance': return <AttendanceView {...viewProps} />;
      case 'tasks': return <TasksView {...viewProps} />;
      case 'calendar': return <CalendarView {...viewProps} />;
      case 'budget': return <BudgetView {...viewProps} />;
      case 'inventory': return <InventoryView {...viewProps} />;
      case 'outreach': return <OutreachView {...viewProps} />;
      case 'code': return <CodeView {...viewProps} />;
      case 'comm': return <CommunicationView {...viewProps} />;
      case 'chat': return <ChatView {...viewProps} />;
      case 'scout': return <ScoutView {...viewProps} />;
      case 'profile': return <ProfileView {...viewProps} />;
      case 'settings': return <SettingsView {...viewProps} />;
      case 'owner': return <OwnerView {...viewProps} />;
      default: return null;
    }
  };

  if (!isLoggedIn) {
    // A brand-new Google user just finished OAuth — collect their last signup
    // step first. This must come before the landing screen or the callback
    // bounces them back to the homepage.
    if (googleSignup) {
      return (
        <GoogleSignupScreen
          token={googleSignup.token}
          intent={googleSignup.intent}
          onBack={() => { setGoogleSignup(null); setAuthScreen('landing'); }}
          onDone={(data) => {
            persistSession(data.sessionId, data.user);
            setGoogleSignup(null);
            if (data?.team) setSignupTeam(data.team);
          }}
        />
      );
    }
    if (authScreen === 'landing') {
      return <Landing onSignIn={() => setAuthScreen('login')} onGetStarted={() => setAuthScreen('role')} />;
    }
    if (authScreen === 'role') {
      return <RoleScreen googleEnabled={googleEnabled} onBack={() => setAuthScreen('landing')} onSelect={(m) => setAuthScreen(m === 'admin' ? 'signup-admin' : 'signup-student')} />;
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
      <div className="min-h-screen bg-primary flex items-center justify-center p-4 relative overflow-hidden">
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
            {googleError && !needsSetup && (
              <p className="text-sm text-rose-400 text-center mt-4">{googleError}</p>
            )}
            {googleEnabled && !needsSetup && (
              <>
                <div className="flex items-center gap-3 mt-6">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-text-muted">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
                <a href="/api/auth/google?intent=login" className="block mt-6">
                  <Button variant="secondary" className="w-full py-3" type="button">
                    <GoogleIcon />
                    Continue with Google
                  </Button>
                </a>
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

  return (
    <div className="flex h-screen overflow-hidden bg-primary">
      {signupTeam && <CodeRevealScreen team={signupTeam} onEnter={() => setSignupTeam(null)} />}
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && window.innerWidth <= 768 && (
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
          width: isSidebarOpen ? 280 : 80
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "bg-secondary border-r border-white/5 flex flex-col z-40",
          window.innerWidth <= 768 ? "fixed inset-y-0 left-0 shadow-xl" : "relative"
        )}
        style={{
          transform: window.innerWidth <= 768 && !isSidebarOpen ? 'translateX(-100%)' : 'translateX(0)',
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
          {isSidebarOpen && (
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">Workspace</p>
          )}
          {visibleTabs.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={!isSidebarOpen ? item.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative text-sm",
                  isActive
                    ? "bg-accent text-accent-ink font-bold shadow-[0_4px_16px_rgba(255,199,0,0.3)]"
                    : "text-text-muted hover:bg-white/[0.06] hover:text-white font-medium"
                )}
              >
                <item.icon className={cn("w-[18px] h-[18px] shrink-0", isActive ? "text-accent-ink" : "text-accent/80 group-hover:text-accent")} strokeWidth={2.25} />
                {isSidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 sm:p-4 border-t border-white/[0.06] flex-shrink-0 space-y-1.5">
          <div className={cn("flex items-center gap-3 rounded-xl bg-white/[0.04] border border-white/[0.06]", isSidebarOpen ? "p-2.5" : "p-2 justify-center")}>
            <button
              onClick={() => setActiveTab('profile')}
              className="hover:ring-2 hover:ring-accent/50 transition-all rounded-full flex-shrink-0"
              title="My profile"
            >
              <Avatar user={currentUser} size="md" />
            </button>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white truncate leading-tight">{currentUser?.name}</p>
                <p className="text-[11px] text-text-muted truncate">{currentUser?.role}</p>
              </div>
            )}
            {isSidebarOpen && (
              <button onClick={handleLogout} className="p-2 text-text-muted hover:text-rose-400 transition-colors flex-shrink-0" title="Sign out">
                <LogOut className="w-4 h-4" />
              </button>
            )}
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
      <main className="flex-1 overflow-y-auto bg-primary custom-scrollbar relative h-screen">
        <header className="sticky top-0 z-20 glass px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-text-muted hover:text-white md:hidden flex-shrink-0"
              title="Toggle sidebar"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg sm:text-xl md:text-2xl font-display font-bold text-white capitalize truncate">{activeTab.replace('-', ' ')}</h2>
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
                    className="absolute right-0 mt-2 w-80 glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50"
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
            {currentUser && (
              <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                <Avatar user={currentUser} size="sm" />
                <div className="hidden sm:block">
                  <p className="text-xs font-bold text-white">{currentUser.name}</p>
                  <p className="text-[10px] text-text-muted">{currentUser.role}</p>
                </div>
                <button onClick={handleLogout} className="ml-2 p-1 text-text-muted/70 hover:text-rose-400 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 flex flex-col flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
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
      </main>
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      <CookieConsent />
      <BuildHelperChat />
    </div>
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

function DashboardView({ data, currentUser, onRefresh, settings, setLoading, insights, updateInsights, isAiLoading, setIsAiLoading, ThinkingIndicator, updateSummary, colorVersion, teams }: any) {
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
        if (reason) alert('Absence logged. An admin can mark it excused from the Attendance view.');
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
  const accentColor = getCSSVariable('--color-accent') || '#F5B700';
  const secondaryColor = getCSSVariable('--color-secondary') || '#1A1A1A';

  const myTeam = (teams || []).find((t: any) => t.id === currentUser?.team_id);

  const copyAccessCode = async () => {
    if (!myTeam?.access_code) return;
    try { await navigator.clipboard.writeText(myTeam.access_code); } catch { /* clipboard unavailable */ }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const regenerateCode = async () => {
    if (!confirm('Generate a new access code? The old code will stop working.')) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/teams/regenerate-code', { method: 'POST' });
      if (res.ok) onRefresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 pb-8 sm:pb-20">
      {myTeam && (
        <Card className="lg:col-span-3" icon={KeyRound} title="Team Access Code" subtitle="Share this with students so they can join your workspace">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <p className="text-xl sm:text-2xl font-mono font-bold text-accent tracking-[0.15em] break-all">{myTeam.access_code}</p>
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={copyAccessCode} className="text-sm">
                {copiedCode ? <><Check className="w-4 h-4 text-emerald-400" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
              </Button>
              <Button variant="ghost" onClick={regenerateCode} className="text-sm">Regenerate</Button>
            </div>
          </div>
        </Card>
      )}
      <Card title="Club Health" icon={TrendingUp} className="lg:col-span-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-text-muted uppercase font-bold mb-1">Attendance {todayAttendance.length > 0 ? '(Today)' : '(Avg)'}</p>
            <p className="text-2xl sm:text-3xl font-display font-bold text-accent">{attendanceRate}%</p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-text-muted uppercase font-bold mb-1">Budget</p>
            <p className="text-2xl sm:text-3xl font-display font-bold text-emerald-400 truncate">${totalBudget.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-xs text-text-muted uppercase font-bold mb-1">Active Tasks</p>
            <p className="text-2xl sm:text-3xl font-display font-bold text-blue-400">{activeTasks}</p>
          </div>
        </div>
        
        <div className="mt-6 h-64 min-h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: secondaryColor, border: '1px solid #ffffff20', borderRadius: '12px' }}
                itemStyle={{ color: accentColor }}
              />
              <Line type="monotone" dataKey="count" stroke={accentColor} strokeWidth={3} dot={{ fill: accentColor, strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-8 pt-8 border-t border-white/5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Attendance Insights</h4>
            </div>
            <Button variant="outline" size="sm" onClick={() => updateInsights()} disabled={isAiLoading}>
              <Zap className="w-3 h-3 mr-1" /> {insights ? "Refresh Insights" : "Generate Insights"}
            </Button>
          </div>
          <div className="text-sm text-white/80 leading-relaxed prose prose-invert max-w-none">
            {isAiLoading && !insights ? (
              <ThinkingIndicator />
            ) : insights ? (
              <Markdown>{insights}</Markdown>
            ) : (
              <p className="text-xs text-text-muted/70 italic">Click generate to analyze attendance patterns and club health.</p>
            )}
          </div>
        </div>
      </Card>

      <Card title="Personal Status" icon={User} className="md:col-span-1">
        <div className="space-y-4">
          {myStatus ? (
            <div className={cn(
              "p-4 rounded-xl border flex flex-col gap-2 transition-all",
              myStatus.status === 'P' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
              myStatus.status === 'A' ? "bg-rose-500/10 border-rose-500/30 text-rose-400" :
              myStatus.status === 'L' ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
              "bg-blue-500/10 border-blue-500/30 text-blue-400"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4" />
                  <span className="text-sm font-bold">Today: {
                    myStatus.status === 'P' ? 'Present' : 
                    myStatus.status === 'A' ? 'Absent' : 
                    myStatus.status === 'E' ? 'Excused' : 
                    myStatus.status === 'L' ? 'Late' : 'Other'
                  }</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleSelfReport('-')} className="p-1 h-auto text-[10px] opacity-50 hover:opacity-100">Reset</Button>
              </div>
              {myStatus.reason && <p className="text-xs italic opacity-80">"{myStatus.reason}"</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">Mark your status for today's session:</p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => handleSelfReport('P')} variant="outline" className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10" disabled={isAiLoading}>
                  <CheckSquare className="w-4 h-4" /> I'm Here
                </Button>
                <Button onClick={() => handleSelfReport('L')} variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10" disabled={isAiLoading}>
                  <Clock className="w-4 h-4" /> I'm Late
                </Button>
              </div>
              <Button onClick={() => setShowOut(true)} variant="secondary" className="w-full" disabled={isAiLoading}>
                <LogOut className="w-4 h-4" /> Log Absence
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card title="Upcoming Tasks" className="md:col-span-1">
        <div className="space-y-3">
          {data.tasks.filter((t: any) => t.status !== 'done').slice(0, 5).map((task: any) => (
            <div key={task.id} className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-white">{task.title}</p>
                <p className="text-[10px] text-text-muted">Due: {task.due_date}</p>
              </div>
              <div className={cn(
                "w-2 h-2 rounded-full",
                task.status === 'todo' ? 'bg-slate-500' : 'bg-blue-400'
              )} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="AI Activity Summary" icon={Zap} className="md:col-span-2">
        <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
          <p className="text-[10px] text-text-muted/70 uppercase font-bold tracking-widest">Recent Activity</p>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-accent px-2" onClick={updateSummary} disabled={isAiLoading}>
            <Clock className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </div>
        <div className="text-sm text-white/80 leading-relaxed prose prose-invert max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
          {isAiLoading && !data.summary ? (
            <ThinkingIndicator />
          ) : (
            <Markdown>{data.summary || "No summary available."}</Markdown>
          )}
        </div>
      </Card>

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
    </div>
  );
}

// Personal dashboard for students: my tasks, my attendance, upcoming events
function StudentDashboardView({ teams, members, attendance, tasks, events, currentUser, onRefresh, setLoading }: any) {
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
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: task.status === 'done' ? 'todo' : 'done' })
      });
      if (res.ok) onRefresh();
    } finally {
      setLoading(false);
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
  );
}

function TeamsView({ teams, members, onRefresh, currentUser, hasScope }: any) {
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [newTeam, setNewTeam] = useState<any>({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
  const [newMember, setNewMember] = useState({ team_id: '', name: '', role: '', email: '', is_board: false, scopes: [] });

  const isAdmin = hasScope('admin');

  const handleResetPassword = async (email: string) => {
    if (!confirm(`Reset password for ${email}? They will need to set it up again on next login.`)) return;
    await apiFetch('/api/auth/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    alert('Password reset successfully.');
  };

  const handleAddTeam = async () => {
    const url = editingTeam ? `/api/teams/${editingTeam.id}` : '/api/teams';
    const method = editingTeam ? 'PATCH' : 'POST';
    await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTeam)
    });
    setShowAddTeam(false);
    setEditingTeam(null);
    setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
    onRefresh();
  };

  const handleDeleteTeam = async (id: number) => {
    if (!confirm("Are you sure? This will delete the team.")) return;
    await apiFetch(`/api/teams/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleDeleteMember = async (id: number) => {
    if (!confirm("Are you sure? This will delete the member.")) return;
    await apiFetch(`/api/members/${id}`, { method: 'DELETE' });
    onRefresh();
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
        <Button onClick={() => {
          setNewTeam({ name: '', number: '', accent_color: '', primary_color: '', text_color: '' });
          setShowAddTeam(true);
        }}><Plus className="w-4 h-4" /> Add Team</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {teams.map((team: any) => (
          <Card key={team.id} title={`${team.name} #${team.number}`} icon={Award}>
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-2 mb-4">
                <p className="text-xs text-text-muted uppercase font-bold">Members</p>
                <div className="flex flex-wrap gap-2">
                  {members.filter((m: any) => m.team_id === team.id).map((m: any) => (
                    <div key={m.id} className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs text-white">
                      {m.name}
                    </div>
                  ))}
                </div>
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
              {isAdmin && (
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
                    variant="outline" 
                    size="sm" 
                    className="h-8 w-8 p-0 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                    onClick={() => handleDeleteTeam(team.id)}
                  >
                    <Trash2 className="w-3 h-3" />
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
                <td className="px-6 py-4 text-sm text-white font-medium">{m.name}</td>
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
                        onClick={() => handleDeleteMember(m.id)}
                        className="p-2 text-text-muted/70 hover:text-rose-400 transition-colors"
                        title="Delete Member"
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
                    <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.accent_color || '#F5B700'} onChange={(e) => setNewTeam({...newTeam, accent_color: e.target.value})} />
                    <Input placeholder="Accent Color (Yellow)" value={newTeam.accent_color} onChange={(e: any) => setNewTeam({...newTeam, accent_color: e.target.value})} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="color" className="w-8 h-8 rounded bg-transparent border-none cursor-pointer" value={newTeam.primary_color || '#111111'} onChange={(e) => setNewTeam({...newTeam, primary_color: e.target.value})} />
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

function StudentCheckinView({ attendance, currentUser, onRefresh }: any) {
  const [checkingIn, setCheckingIn] = useState(false);
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

  const handleCheckin = async () => {
    setCheckingIn(true);
    try {
      const res = await apiFetch('/api/attendance/checkin', { method: 'POST' });
      if (res.ok) {
        await onRefresh();
      } else {
        alert('Could not check in \u2014 try again.');
      }
    } finally {
      setCheckingIn(false);
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
            <h4 className="text-xl font-display font-bold text-white mb-4">Not checked in yet</h4>
            <Button onClick={handleCheckin} disabled={checkingIn} className="px-8 py-3 text-base">
              <CalendarCheck className="w-5 h-5" /> {checkingIn ? 'Checking in...' : 'Check In'}
            </Button>
          </>
        )}
      </Card>
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

function AttendanceView({ members, attendance, onRefresh, setLoading, hasScope, insights, updateInsights, isAiLoading, ThinkingIndicator, currentUser }: any) {
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
  const visibleDates = useMemo(() => {
    const dates: string[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + calendarStart * 14);
    
    for (let i = 0; i < 14; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = format(d, 'yyyy-MM-dd');
      if (!hiddenDates.includes(dateStr)) {
        dates.push(dateStr);
      }
    }
    return dates;
  }, [calendarStart, hiddenDates]);

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
        alert('Failed to save attendance');
      }
    } catch (error) {
      setSavingStatus('idle');
      alert('Error saving attendance');
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
    const checkDate = new Date();
    checkDate.setDate(checkDate.getDate() - 365); // Check past year too for cleanup
    
    for (let i = 0; i < 730; i++) { // Check ~2 years
      checkDate.setDate(checkDate.getDate() + 1);
      if (checkDate.getDay() === dayIndex) {
        const dateStr = format(checkDate, 'yyyy-MM-dd');
        if (!newHidden.includes(dateStr)) {
          newHidden.push(dateStr);
        }
      }
    }
    
    setHiddenDates(newHidden);
    // Save all hidden dates
    for (const date of newHidden) {
      if (!hiddenDates.includes(date)) {
        await apiFetch('/api/hidden-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date })
        }).catch(console.error);
      }
    }
  };

  const unhideByDayOfWeek = async (dayIndex: number) => {
    const newHidden = hiddenDates.filter(dateStr => {
      return new Date(dateStr).getDay() !== dayIndex;
    });
    
    setHiddenDates(newHidden);
    // Delete all removed dates
    for (const date of hiddenDates) {
      if (!newHidden.includes(date)) {
        await apiFetch(`/api/hidden-dates/${date}`, { method: 'DELETE' }).catch(console.error);
      }
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
    setHiddenDates(newHidden);
    for (const date of newHidden) {
      if (!hiddenDates.includes(date)) {
        await apiFetch('/api/hidden-dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date })
        }).catch(console.error);
      }
    }
  };

  const unhideAll = async () => {
    setHiddenDates([]);
    for (const date of hiddenDates) {
      await apiFetch(`/api/hidden-dates/${date}`, { method: 'DELETE' }).catch(console.error);
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
        <p className="text-sm text-text-muted mt-1">Mark who's here each day — click a cell to cycle status. Students check themselves in from their own view.</p>
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
            {format(new Date(new Date().getTime() + calendarStart * 14 * 24 * 60 * 60 * 1000), 'MMM dd')} - {format(new Date(new Date().getTime() + (calendarStart * 14 + 13) * 24 * 60 * 60 * 1000), 'MMM dd')}
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
                      const isHidden = hiddenDates.some(d => new Date(d).getDay() === idx);
                      if (isHidden) {
                        unhideByDayOfWeek(idx);
                      } else {
                        hideByDayOfWeek(idx);
                      }
                    }}
                    className={cn(
                      "py-2 rounded-lg text-[10px] font-bold uppercase transition-all",
                      hiddenDates.some(d => new Date(d).getDay() === idx)
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
                      {format(new Date(date), 'MMM dd')}
                      <div className="text-[8px] text-slate-600">{format(new Date(date), 'EEE')}</div>
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

function CalendarView({ events, teams, onRefresh, currentUser }: any) {
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
    if (!editingId || !confirm('Delete this event?')) return;
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
          <Button onClick={() => openNew(todayKey)}><Plus className="w-4 h-4" /> New Event</Button>
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
                  onClick={() => openNew(key)}
                  className={cn(
                    'min-h-[92px] rounded-xl border p-1.5 cursor-pointer transition-colors',
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
                        onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                        className={cn('w-full text-left text-[11px] px-1.5 py-0.5 rounded-md border truncate', typeStyle[e.event_type] || typeStyle.other)}
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

function TasksView({ tasks, teams, members, onRefresh, currentUser, hasScope }: any) {
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isBoardTask, setIsBoardTask] = useState(false);
  const [newTask, setNewTask] = useState({ team_id: '', title: '', description: '', assigned_to: '', due_date: '' });
  const [filterTeam, setFilterTeam] = useState('all');

  const isAdmin = hasScope('admin');

  const handleAddTask = async () => {
    await apiFetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTask, is_board: isBoardTask ? 1 : 0 })
    });
    setShowAddTask(false);
    onRefresh();
  };

  const filteredTasks = tasks.filter((t: any) => {
    const boardCheck = t.is_board ? isAdmin : true;
    const teamCheck = filterTeam === 'all' || t.team_id?.toString() === filterTeam;
    return boardCheck && teamCheck;
  });

  const updateStatus = async (id: number, status: string) => {
    await apiFetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    onRefresh();
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm("Delete this task?")) return;
    await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
    onRefresh();
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
        <Button onClick={() => setShowAddTask(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> New Task</Button>
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
                      {isAdmin && (
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
                <Button onClick={handleAddTask}>Create Task</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function BudgetView({ budget, teams, onRefresh, hasScope }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ team_id: '', type: 'expense', amount: '', category: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });

  const handleAdd = async () => {
    await apiFetch('/api/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({...newItem, amount: parseFloat(newItem.amount)})
    });
    setShowAdd(false);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    await apiFetch(`/api/budget/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const totalIncome = budget.filter((i: any) => i.type === 'income').reduce((acc: number, i: any) => acc + i.amount, 0);
  const totalExpense = budget.filter((i: any) => i.type === 'expense').reduce((acc: number, i: any) => acc + i.amount, 0);

  const isAdmin = hasScope('budget');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Budget</h3>
        <p className="text-sm text-text-muted mt-1">Team money at a glance — income, expenses, and every transaction. Students can view; only admins can add or edit entries.</p>
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
        {isAdmin && <Button onClick={() => setShowAdd(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log Transaction</Button>}
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
                <Button onClick={handleAdd}>Log Entry</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function InventoryView({ inventory, members, teams, onRefresh }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [revLink, setRevLink] = useState('');
  const [isLoadingRev, setIsLoadingRev] = useState(false);
  const [newPart, setNewPart] = useState({ 
    team_id: '', name: '', part_number: '', sku: '', quantity: '1', assigned_to: '', 
    location: '', category: '', description: '', cost: '' 
  });

  const handleAdd = async () => {
    if (!newPart.name || !newPart.sku) {
      alert('Name and SKU are required');
      return;
    }
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
        alert('Error: ' + err.error);
      }
    } catch (error) {
      alert('Error adding part: ' + error);
    }
  };

  const handleUpdate = async () => {
    if (!showEdit) return;
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
        alert('Error: ' + err.error);
      }
    } catch (error) {
      alert('Error updating part: ' + error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this part?')) return;
    await apiFetch(`/api/inventory/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleImportRev = async () => {
    if (!revLink.trim()) {
      alert('Please enter a REV Robotics link');
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
        alert('Product imported! Review and save when ready.');
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (error) {
      alert('Error importing from REV: ' + error);
    } finally {
      setIsLoadingRev(false);
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
            <Button onClick={() => setShowAdd(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Part</Button>
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
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Team</th>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Assigned To</th>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase">Cost</th>
                  <th className="px-4 py-3 text-xs font-bold text-text-muted uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredParts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-text-muted/70">No parts found</td>
                  </tr>
                ) : (
                  filteredParts.map((part: any) => (
                    <tr key={part.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-white font-medium">{part.name}</td>
                      <td className="px-4 py-3 text-sm text-accent font-mono">{part.sku}</td>
                      <td className="px-4 py-3 text-sm text-text-muted">{part.part_number || '—'}</td>
                      <td className="px-4 py-3 text-sm text-white"><span className="bg-white/10 px-2 py-1 rounded">{part.quantity}</span></td>
                      <td className="px-4 py-3 text-sm text-text-muted">{part.category || '—'}</td>
                      <td className="px-4 py-3 text-sm text-text-muted">{teams.find((t: any) => t.id === part.team_id)?.name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-text-muted">{part.assigned_member_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-blue-400">${(part.cost * part.quantity).toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                      <td className="px-4 py-3 text-right flex gap-2 justify-end">
                        <button onClick={() => setShowEdit(part)} className="text-slate-600 hover:text-accent transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(part.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
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
                <Input placeholder="Category" value={newPart.category} onChange={(e: any) => setNewPart({...newPart, category: e.target.value})} />
                <Input placeholder="Cost per Unit" type="number" step="0.01" value={newPart.cost} onChange={(e: any) => setNewPart({...newPart, cost: e.target.value})} />
                <Select 
                  options={[
                    { label: 'Not Assigned', value: '' },
                    ...members.map((m: any) => ({ label: m.name, value: m.id }))
                  ]}
                  value={newPart.assigned_to}
                  onChange={(e: any) => setNewPart({...newPart, assigned_to: e.target.value})}
                />
              </div>
              <Input placeholder="Description" value={newPart.description} onChange={(e: any) => setNewPart({...newPart, description: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button onClick={handleAdd}>Add Part</Button>
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
                <Input placeholder="Category" value={showEdit.category || ''} onChange={(e: any) => setShowEdit({...showEdit, category: e.target.value})} />
                <Input placeholder="Cost per Unit" type="number" step="0.01" value={showEdit.cost} onChange={(e: any) => setShowEdit({...showEdit, cost: e.target.value})} />
                <Select 
                  options={[
                    { label: 'Not Assigned', value: '' },
                    ...members.map((m: any) => ({ label: m.name, value: m.id }))
                  ]}
                  value={showEdit.assigned_to || ''}
                  onChange={(e: any) => setShowEdit({...showEdit, assigned_to: e.target.value})}
                />
              </div>
              <Input placeholder="Description" value={showEdit.description || ''} onChange={(e: any) => setShowEdit({...showEdit, description: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowEdit(null)}>Cancel</Button>
                <Button onClick={handleUpdate}>Save Changes</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function OutreachView({ outreach, onRefresh }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [newEvent, setNewEvent] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '', location: '' });

  const handleAdd = async () => {
    await apiFetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({...newEvent, hours: parseInt(newEvent.hours)})
    });
    setShowAdd(false);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this event?")) return;
    await apiFetch(`/api/outreach/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const openEdit = (event: any) => {
    setEditing({ ...event, hours: String(event.hours ?? ''), date: (event.date || '').slice(0, 10) });
    setShowAdd(true);
  };

  const handleSave = async () => {
    const payload = { ...editing, hours: parseInt(editing.hours) || 0 };
    const res = await apiFetch(`/api/outreach/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      setShowAdd(false);
      setEditing(null);
      onRefresh();
    } else {
      alert('Could not save changes.');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">Outreach Log</h3>
          <p className="text-sm text-text-muted mt-1">Track community events and service hours — demos, workshops, volunteering.</p>
        </div>
        <Button onClick={() => { setEditing(null); setNewEvent({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '', location: '' }); setShowAdd(true); }} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log Event</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {(outreach || []).map((event: any) => (
          <Card key={event.id} title={event.title} icon={Globe}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-text-muted">{event.location} • {event.date}</p>
                <p className="text-sm text-white/80 mt-2">{event.description}</p>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
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

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card title={editing ? "Edit Outreach Event" : "Log Outreach Event"} className="w-full max-w-md">
            <div className="space-y-4">
              <Input placeholder="Event Title" value={editing ? editing.title : newEvent.title} onChange={(e: any) => editing ? setEditing({...editing, title: e.target.value}) : setNewEvent({...newEvent, title: e.target.value})} />
              <textarea
                className="w-full bg-primary border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-accent/50 transition-colors h-24"
                placeholder="Description"
                value={editing ? editing.description : newEvent.description}
                onChange={(e: any) => editing ? setEditing({...editing, description: e.target.value}) : setNewEvent({...newEvent, description: e.target.value})}
              />
              <Input placeholder="Location" value={editing ? editing.location : newEvent.location} onChange={(e: any) => editing ? setEditing({...editing, location: e.target.value}) : setNewEvent({...newEvent, location: e.target.value})} />
              <Input placeholder="Hours" type="number" value={editing ? editing.hours : newEvent.hours} onChange={(e: any) => editing ? setEditing({...editing, hours: e.target.value}) : setNewEvent({...newEvent, hours: e.target.value})} />
              <Input type="date" value={editing ? editing.date : newEvent.date} onChange={(e: any) => editing ? setEditing({...editing, date: e.target.value}) : setNewEvent({...newEvent, date: e.target.value})} />
              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => { setShowAdd(false); setEditing(null); }}>Cancel</Button>
                <Button onClick={editing ? handleSave : handleAdd}>{editing ? 'Save Changes' : 'Log Event'}</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ScoutView({ news, refreshNews, isAiLoading, ThinkingIndicator }: any) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-white">AI Scout: FTC &amp; REV News</h3>
          <p className="text-sm text-text-muted mt-1">Fresh robotics headlines, collected automatically for your team.</p>
        </div>
        <Button onClick={refreshNews} variant="outline" disabled={isAiLoading} className="w-full sm:w-auto"><Clock className="w-4 h-4 mr-1" /> Refresh News</Button>
      </div>

      <Card className="min-h-[500px]">
        <div className="prose prose-invert max-w-none">
          {isAiLoading && !news ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <ThinkingIndicator />
              <p className="text-text-muted">Scouring the web for FTC updates...</p>
            </div>
          ) : news ? (
            <Markdown>{news}</Markdown>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-text-muted">No news available. Click refresh to scout for updates.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function CommunicationView({ communications, onRefresh }: any) {
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
    if (!confirm("Delete this log?")) return;
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
        <Button onClick={() => setShowAdd(true)} className="w-full sm:w-auto"><Plus className="w-4 h-4" /> Log New Message</Button>
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
              <button onClick={() => handleDelete(comm.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
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

function ChatView({ messages, members, currentUser, socket }: any) {
  const [content, setContent] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

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
    const finalContent = convertMentions(content);

    if (pendingFile) {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('sender_id', currentUser.id.toString());
      formData.append('sender_name', currentUser.name);
      formData.append('content', finalContent);
      try {
        const response = await apiFetch('/api/messages/upload', { method: 'POST', body: formData });
        if (response.ok) {
          setContent('');
          clearPending();
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          alert('Could not send that file.');
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert('Could not send that file.');
      } finally {
        setUploading(false);
      }
      return;
    }

    socket.send(JSON.stringify({
      type: 'chat',
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      content: finalContent
    }));
    setContent('');
  };

  const clearPending = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
  };

  const queueFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('Files must be under 10 MB.'); return; }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  return (
    <div
      className="flex flex-col h-[calc(100vh-200px)] sm:h-[calc(100vh-180px)] glass rounded-2xl overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-20 bg-accent/10 border-2 border-dashed border-accent rounded-2xl flex items-center justify-center pointer-events-none">
          <p className="text-accent font-bold">Drop to attach</p>
        </div>
      )}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5">
        <h3 className="text-lg sm:text-xl font-display font-bold text-white">Team Chat</h3>
        <p className="text-sm text-text-muted mt-0.5">Real-time messaging for the whole team — @mention anyone to ping them.</p>
      </div>
      <div ref={scrollRef} className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-3 sm:space-y-4 custom-scrollbar">
        {messages.map((msg: any) => (
          <div key={msg.id} className={cn("flex flex-col group", msg.sender_id === currentUser.id ? "items-end" : "items-start")}>
            <div className="flex items-center gap-2 mb-1">
              <Avatar user={{ name: msg.sender_name || members.find((m: any) => m.id === msg.sender_id)?.name, avatar_url: members.find((m: any) => m.id === msg.sender_id)?.avatar_url }} size="xs" />
              <span className="text-[10px] font-bold text-text-muted/70">{msg.sender_name || members.find((m: any) => m.id === msg.sender_id)?.name}</span>
              <span className="text-[10px] text-slate-600">{format(new Date(msg.timestamp), 'HH:mm')}</span>
              {msg.sender_id === currentUser.id && !msg.deleted_at && (
                <button
                  onClick={() => handleDeleteMessage(msg.id)}
                  className="text-[10px] text-text-muted/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete message"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            {msg.deleted_at ? (
              <div className={cn(
                "px-4 py-2 rounded-2xl max-w-[80%] text-sm italic",
                "bg-white/5 text-text-muted border border-white/5"
              )}>
                {msg.sender_name || members.find((m: any) => m.id === msg.sender_id)?.name} unsent a message
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-w-[80%]">
                {msg.file_path && (
                  <div className="flex flex-col gap-2 mb-1">
                    {isImageFile(msg.file_path) && (
                      <img 
                        src={msg.file_path} 
                        alt={msg.file_name || "uploaded"} 
                        className="rounded-lg max-w-xs max-h-64 object-cover border border-white/5 shadow-sm"
                      />
                    )}
                    <div className={cn(
                      "flex flex-col gap-1 p-3 rounded-2xl border min-w-[200px] max-w-xs",
                      msg.sender_id === currentUser.id ? "bg-accent/10 border-accent/20" : "bg-white/5 border-white/10"
                    )}>
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
                        className="mt-2 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 hover:bg-accent/20 transition-colors text-xs text-accent font-medium"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                    </div>
                  </div>
                )}
                {msg.content && (
                  <div className={cn(
                    "px-4 py-2 rounded-2xl text-sm",
                    msg.sender_id === currentUser.id ? "bg-accent text-primary font-medium" : "bg-white/5 text-white border border-white/5"
                  )}>
                    {msg.content.split(/(@\[[^\]]+\])/).map((part: string, i: number) => {
                      if (part.startsWith('@[') && part.endsWith(']')) {
                        const name = part.slice(2, -1);
                        return <span key={i} className="font-bold underline decoration-accent decoration-2 underline-offset-2">@{name}</span>;
                      }
                      return part;
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="p-3 sm:p-4 border-t border-white/5 bg-secondary/30 relative">
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
          <div className="absolute bottom-full left-4 mb-2 glass rounded-xl border border-white/10 overflow-hidden w-48 shadow-2xl">
            {filteredMentions.slice(0, 5).map((m: any) => (
              <button 
                key={m.id}
                onClick={() => {
                  const parts = content.split(' ');
                  parts.pop();
                  setContent([...parts, `@${m.name} `].join(' '));
                  setShowMentions(false);
                }}
                className="w-full text-left px-4 py-2 text-xs text-white/80 hover:bg-accent hover:text-primary transition-colors"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
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
            className="h-10 sm:h-12 w-10 sm:w-12 p-0 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 bg-slate-800 text-white hover:bg-slate-700 flex-shrink-0"
            title="Attach file"
          >
            <FileUp className="w-4 sm:w-5 h-4 sm:h-5" />
          </button>
          <textarea
            className="flex-1 bg-primary border border-white/10 rounded-xl px-3 sm:px-4 py-2 text-sm text-white focus:outline-none focus:border-accent/50 transition-colors h-10 sm:h-12 resize-none"
            placeholder="Type a message... use @ to mention, paste or drop images"
            value={content}
            onChange={onContentChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={uploading}
          />
          <Button onClick={handleSend} disabled={uploading} className="h-10 sm:h-12 w-10 sm:w-12 p-0 flex-shrink-0"><Send className="w-4 sm:w-5 h-4 sm:h-5" /></Button>
        </div>
      </div>
    </div>
  );
}

// Feedback: any signed-in user can send a note straight to Sushil
function FeedbackModal({ onClose }: any) {
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message: message.trim() })
      });
      if (res.ok) setSent(true);
      else alert('Could not send feedback — try again.');
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
function OwnerView(_props: any) {
  const [tab, setTab] = useState<'overview' | 'feedback' | 'users'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [o, f, u] = await Promise.all([
          apiFetch('/api/owner/overview').then(r => r.json()),
          apiFetch('/api/owner/feedback').then(r => r.json()),
          apiFetch('/api/owner/users').then(r => r.json()),
        ]);
        setOverview(o); setFeedback(Array.isArray(f) ? f : []); setUsers(Array.isArray(u) ? u : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setFeedbackStatus = async (id: number, status: 'new' | 'resolved') => {
    const res = await apiFetch(`/api/owner/feedback/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) setFeedback(feedback.map(f => f.id === id ? { ...f, status } : f));
  };

  const totals = overview?.totals || {};
  const statCards = [
    { label: 'Workspaces', value: totals.teams || 0, icon: Users },
    { label: 'Users', value: totals.users || 0, icon: UserCircle },
    { label: 'Messages', value: totals.messages || 0, icon: MessageSquare },
    { label: 'Feedback notes', value: totals.feedback || 0, icon: MessageSquareHeart },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h3 className="text-lg sm:text-xl font-display font-bold text-white flex items-center gap-2">
          <Crown className="w-5 h-5 text-accent" /> Owner Portal
        </h3>
        <p className="text-sm text-text-muted mt-1">Your private view of how Control Point is being used — every workspace, user, and feedback note in one place.</p>
      </div>

      <div className="flex gap-1 sm:gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-full sm:w-fit overflow-x-auto custom-scrollbar">
        {(['overview', 'feedback', 'users'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap capitalize", tab === t ? "bg-accent text-primary shadow-lg" : "text-text-muted hover:text-white")}
          >
            {t}{t === 'feedback' && (totals.new_feedback > 0) && ` (${totals.new_feedback})`}
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
      ) : tab === 'feedback' ? (
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
      ) : (
        <Card title="Users" subtitle="Everyone signed up, newest first">
          <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {users.map((u: any) => (
              <div key={u.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5">
                <Avatar user={u} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{u.name}</p>
                  <p className="text-[11px] text-text-muted truncate">{u.email}{u.team_name ? ` · ${u.team_name}` : ''}</p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex-shrink-0">{u.account_type}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AccountManager({ currentUser }: any) {
  const hasPassword = !!currentUser?.password;

  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [delPassword, setDelPassword] = useState('');
  const [delBusy, setDelBusy] = useState(false);

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
      if (!res.ok) { alert('Could not export your data.'); return; }
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

  const deleteAccount = async () => {
    if (confirmEmail.trim().toLowerCase() !== (currentUser?.email || '').toLowerCase()) {
      alert('Type your email address exactly to confirm.');
      return;
    }
    if (!window.confirm('This is permanent. Delete your account and all of your personal data?')) return;
    setDelBusy(true);
    try {
      const res = await apiFetch('/api/auth/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hasPassword ? { password: delPassword } : {})
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('sessionId');
        window.location.reload();
      } else {
        alert(data.error || 'Could not delete your account.');
      }
    } finally {
      setDelBusy(false);
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

      <Card title="Danger Zone" icon={ShieldCheck} subtitle="Irreversible actions" className="border-rose-500/25">
        {!showDelete ? (
          <div>
            <p className="text-sm text-text-muted mb-3">
              Permanently delete your account and all of your personal data (profile, attendance, messages, feedback, notifications, avatar). Team-level data like tasks and budgets stays with the team.
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
            {hasPassword && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-text-muted uppercase">Your password</label>
                <Input type="password" value={delPassword} onChange={(e: any) => setDelPassword(e.target.value)} autoComplete="current-password" />
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => { setShowDelete(false); setConfirmEmail(''); setDelPassword(''); }}>
                Cancel
              </Button>
              <Button
                onClick={deleteAccount}
                disabled={delBusy || confirmEmail.trim().toLowerCase() !== (currentUser?.email || '').toLowerCase() || (hasPassword && !delPassword)}
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
    if (accentColor) root.style.setProperty('--color-accent', accentColor);
    if (primaryColor) root.style.setProperty('--color-primary', primaryColor);
    if (textColor) root.style.setProperty('--color-text-base', textColor);
    
    // Trigger re-render of all components to pick up new CSS variables
    setColorVersion((v) => v + 1);
  }, [accentColor, primaryColor, textColor, setColorVersion]);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB.'); return; }
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
        alert('Could not upload that picture.');
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
        alert('Profile updated successfully!');
      } else {
        alert('Could not save your profile.');
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
                <input type="color" className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" value={accentColor || '#F5B700'} onChange={(e) => setAccentColor(e.target.value)} />
                <Input value={accentColor} onChange={(e: any) => setAccentColor(e.target.value)} placeholder="#F5B700" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-text-muted uppercase">Interface (Navy)</label>
              <div className="flex gap-2">
                <input type="color" className="w-10 h-10 rounded-lg bg-transparent border-none cursor-pointer" value={primaryColor || '#111111'} onChange={(e) => setPrimaryColor(e.target.value)} />
                <Input value={primaryColor} onChange={(e: any) => setPrimaryColor(e.target.value)} placeholder="#111111" />
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
            onClick={() => {
              setAccentColor(''); setPrimaryColor(''); setTextColor('');
              const root = document.documentElement;
              root.style.removeProperty('--color-accent');
              root.style.removeProperty('--color-primary');
              root.style.removeProperty('--color-text-base');
              alert('Theme reset. Save to make it permanent.');
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

function SettingsView({ settings, members, onRefresh, currentUser }: any) {
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

  const isPresident = currentUser?.role === 'President';

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
    if (confirm('Are you sure you want to permanently delete this message? This cannot be undone.')) {
      try {
        const res = await apiFetch(`/api/messages/${messageId}?silent=true`, { method: 'DELETE' });
        if (res.ok) {
          await fetchAllMessages();
          alert('Message permanently deleted.');
        } else {
          alert('Failed to delete message.');
        }
      } catch (error) {
        console.error('Delete error:', error);
        alert('Error deleting message: ' + error);
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
        alert('Message updated.');
      } else {
        alert('Failed to update message.');
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('Error updating message: ' + error);
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
      { key: 'max_tokens_news', value: maxTokensNews },
      { key: 'max_tokens_attendance', value: maxTokensAttendance },
      { key: 'max_tokens_excuse', value: maxTokensExcuse },
      { key: 'max_tokens_summary', value: maxTokensSummary },
      { key: 'max_tokens_chat', value: maxTokensChat },
    ];

    for (const payload of payloads) {
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    onRefresh();
    alert('Settings saved');
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
    </div>
  );
}
