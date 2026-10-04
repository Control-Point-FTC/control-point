import { useEffect, useRef, useState } from "react";
import { motion, useInView, animate } from "motion/react";
import {
  Bolt, Users, CalendarCheck, CheckSquare, CalendarDays, Wallet,
  MessageSquare, ArrowRight, Zap, ShieldCheck, Smartphone, Cloud,
  Menu, X,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

const features = [
  {
    icon: Users,
    title: "Roster & roles",
    body: "Every member, mentor, and lead in one place — with role-based permissions so the right people see the right things.",
  },
  {
    icon: CalendarCheck,
    title: "Attendance tracking",
    body: "One-tap session check-ins with trends over time. Know exactly who's showing up, all season long.",
  },
  {
    icon: CheckSquare,
    title: "Task boards",
    body: "Kanban boards for build season: assign work, set due dates, and watch the robot come together.",
  },
  {
    icon: CalendarDays,
    title: "Team calendar",
    body: "Meetings, competitions, and deadlines on a shared calendar everyone actually checks.",
  },
  {
    icon: Wallet,
    title: "Budget clarity",
    body: "Track dues, sponsors, and spending in real time. No more mystery spreadsheets.",
  },
  {
    icon: MessageSquare,
    title: "Built-in messaging",
    body: "Team chat with @mentions and announcements — no more lost updates in group texts.",
  },
];

const stats = [
  { value: 14, label: "views in one workspace" },
  { value: 6, label: "core tools included" },
  { value: 1, label: "shared source of truth" },
  { value: 0, label: "spreadsheets to juggle" },
];

function Stat({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <div ref={ref} className="text-center">
      <div className="font-display text-4xl sm:text-5xl font-bold text-accent volt-text-glow tabular-nums">
        {display}
      </div>
      <div className="mt-2 text-[13px] font-medium text-text-muted">{label}</div>
    </div>
  );
}

const steps = [
  {
    n: "01",
    title: "Create your workspace",
    body: "Sign up in under a minute. Your team gets its own private command center.",
  },
  {
    n: "02",
    title: "Add your people",
    body: "Invite members and mentors, assign roles, and set permissions in a few clicks.",
  },
  {
    n: "03",
    title: "Run your season",
    body: "Track attendance, ship tasks, plan events, and manage the budget — all from Control Point.",
  },
];

function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "w-11 h-11 rounded-2xl" : "w-9 h-9 rounded-xl";
  const icon = size === "lg" ? "w-6 h-6" : "w-5 h-5";
  return (
    <div className={`${box} bg-accent flex items-center justify-center gold-glow shrink-0`}>
      <Bolt className={`${icon} text-accent-ink`} strokeWidth={2.75} />
    </div>
  );
}

/* Mouse-reactive hero: tracks the cursor over the hero section and drives
   CSS vars (--mx/--my cursor px, --rx/--ry tilt, --p1/--p2 parallax) via rAF.
   Pure CSS consumes them, so there are no React re-renders per mousemove.
   Disabled for touch devices and prefers-reduced-motion. */
function useHeroMouse() {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
    let raf = 0;
    const reset = () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--p1x", "0px"); el.style.setProperty("--p1y", "0px");
      el.style.setProperty("--p2x", "0px"); el.style.setProperty("--p2y", "0px");
    };
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const nx = x / r.width - 0.5;
        const ny = y / r.height - 0.5;
        el.style.setProperty("--mx", `${x.toFixed(1)}px`);
        el.style.setProperty("--my", `${y.toFixed(1)}px`);
        el.style.setProperty("--ry", `${(nx * 8).toFixed(2)}deg`);
        el.style.setProperty("--rx", `${(-ny * 8).toFixed(2)}deg`);
        el.style.setProperty("--p1x", `${(nx * -24).toFixed(1)}px`);
        el.style.setProperty("--p1y", `${(ny * -24).toFixed(1)}px`);
        el.style.setProperty("--p2x", `${(nx * 36).toFixed(1)}px`);
        el.style.setProperty("--p2y", `${(ny * 36).toFixed(1)}px`);
        el.classList.add("hero-hot");
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.classList.remove("hero-hot");
      reset();
    };
    el.addEventListener("mousemove", onMove, { passive: true });
    el.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);
  return ref;
}

function HeroMock() {  return (
    <div className="relative mx-auto mt-16 max-w-4xl animate-float-slow">
      <div className="absolute -inset-8 bg-accent/10 blur-3xl rounded-full pointer-events-none" />
      <div className="relative rounded-2xl border border-text-base/10 bg-secondary/90 shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-text-base/10 px-4 py-3">
          <span className="w-3 h-3 rounded-full bg-text-base/15" />
          <span className="w-3 h-3 rounded-full bg-text-base/15" />
          <span className="w-3 h-3 rounded-full bg-accent/80" />
          <span className="ml-3 text-xs text-text-muted font-mono">control-point — dashboard</span>
        </div>
        <div className="flex">
          <div className="hidden sm:flex w-44 shrink-0 flex-col gap-1 border-r border-text-base/10 p-3">
            {["Dashboard", "Teams & Members", "Attendance", "Tasks", "Calendar", "Budget"].map((t, i) => (
              <div
                key={t}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  i === 0 ? "bg-accent text-accent-ink" : "text-text-muted"
                }`}
              >
                {t}
              </div>
            ))}
          </div>
          <div className="flex-1 p-4 sm:p-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { k: "Members", v: "24" },
                { k: "Attendance", v: "92%" },
                { k: "Open tasks", v: "18" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-text-base/10 bg-elevated p-3 sm:p-4">
                  <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold">{s.k}</div>
                  <div className="font-display text-xl sm:text-2xl font-bold text-accent">{s.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-text-base/10 bg-elevated p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-text-muted">This week</span>
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[10px] font-bold text-accent">3 events</span>
              </div>
              <div className="space-y-2">
                {[
                  ["Build session", "Tue 6–9 PM"],
                  ["Qualifier @ Newark", "Sat 8 AM"],
                  ["Sponsor call", "Sun 2 PM"],
                ].map(([t, d]) => (
                  <div key={t} className="flex items-center justify-between rounded-lg bg-text-base/[0.03] px-3 py-2">
                    <span className="text-xs font-semibold text-text-base">{t}</span>
                    <span className="text-[11px] text-text-muted font-mono">{d}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ onSignIn, onGetStarted }: { onSignIn: () => void; onGetStarted: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const heroRef = useHeroMouse();
  return (
    <div className="theme-dark min-h-screen bg-primary text-text-base overflow-x-clip">
      {/* nav */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-text-base/[0.06] bg-primary/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display text-lg font-bold tracking-tight">Control Point</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-text-muted">
            <a href="#features" className="hover:text-text-base transition-colors">Features</a>
            <a href="#how" className="hover:text-text-base transition-colors">How it works</a>
          </nav>
          <div className="hidden md:flex items-center gap-2.5">
            <button onClick={onSignIn} className="rounded-xl px-4 py-2 text-sm font-semibold text-text-muted hover:text-text-base hover:bg-text-base/5 transition-all">
              Sign in
            </button>
            <button
              onClick={onGetStarted}
              className="btn-accent-primary rounded-xl px-4 py-2 text-sm font-bold transition-all hover:brightness-105 active:scale-95"
            >
              Get started
            </button>
          </div>
          <button
            className="md:hidden rounded-xl p-2 text-text-muted hover:text-text-base hover:bg-text-base/5 transition-all"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-text-base/[0.06] bg-primary/95 backdrop-blur-xl px-4 py-4 space-y-1">
            <a href="#features" onClick={() => setMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-medium text-text-muted hover:text-text-base hover:bg-text-base/5 transition-all">
              Features
            </a>
            <a href="#how" onClick={() => setMenuOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-medium text-text-muted hover:text-text-base hover:bg-text-base/5 transition-all">
              How it works
            </a>
            <div className="flex gap-2.5 pt-2">
              <button onClick={onSignIn} className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-text-muted hover:text-text-base hover:bg-text-base/5 transition-all border border-text-base/10">
                Sign in
              </button>
              <button
                onClick={onGetStarted}
                className="btn-accent-primary flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-all active:scale-95"
              >
                Get started
              </button>
            </div>
          </div>
        )}
      </header>

      {/* hero */}
      <section ref={heroRef} className="reactive-hero relative pt-36 pb-20 sm:pt-44">
        <div className="hero-grid absolute inset-0" />
        <div className="hero-grid-spot absolute inset-0" aria-hidden="true" />
        <div className="hero-glow absolute inset-0" />
        <div className="hero-mouse-glow absolute inset-0" aria-hidden="true" />
        {/* depth orbs — drift at different parallax rates */}
        <div className="hero-orb-1 pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-accent/[0.07] blur-3xl" aria-hidden="true" />
        <div className="hero-orb-2 pointer-events-none absolute -right-20 top-24 h-80 w-80 rounded-full bg-accent/[0.05] blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <span className="eyebrow">
              <Zap className="w-3.5 h-3.5 text-accent" />
              Built for robotics teams
            </span>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.08 }}
            className="mx-auto mt-6 max-w-3xl font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.02] tracking-tight"
          >
            Mission control for your <span className="font-serif italic font-normal text-accent volt-text-glow">robotics team</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.16 }}
            className="mx-auto mt-6 max-w-xl text-base sm:text-lg text-text-muted leading-relaxed"
          >
            Roster, attendance, tasks, calendar, budget, and team chat — one fast,
            focused workspace that keeps your whole season on track.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.24 }}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button
              onClick={onGetStarted}
              className="btn-accent-primary gold-glow group flex items-center gap-2 rounded-2xl px-7 py-3.5 font-bold text-[15px] transition-all hover:brightness-105 active:scale-95 w-full sm:w-auto justify-center"
            >
              Start running your team
              <ArrowRight className="w-4.5 h-4.5 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={onSignIn}
              className="btn-accent-outline rounded-2xl px-7 py-3.5 font-bold text-[15px] transition-all active:scale-95 w-full sm:w-auto"
            >
              Sign in
            </button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }}
            className="hero-tilt"
          >
            <div className="hero-tilt-inner">
              <HeroMock />
            </div>
          </motion.div>
        </div>
      </section>

      {/* trust strip */}
      <section className="border-y border-text-base/[0.06] bg-secondary/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 sm:px-6 py-6 text-[13px] font-semibold text-text-muted">
          <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-accent" /> Role-based access</span>
          <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-accent" /> Real-time updates</span>
          <span className="flex items-center gap-2"><Cloud className="w-4 h-4 text-accent" /> Cloud-hosted</span>
          <span className="flex items-center gap-2"><Smartphone className="w-4 h-4 text-accent" /> Works on any device</span>
        </div>
      </section>

      {/* stat band */}
      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {stats.map((s) => (
              <Stat key={s.label} value={s.value} label={s.label} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <span className="eyebrow">Everything in one place</span>
            <h2 className="mt-5 font-display text-4xl sm:text-5xl font-bold tracking-tight">
              Stop juggling <span className="text-accent">six apps</span>
            </h2>
            <p className="mt-4 text-text-muted leading-relaxed">
              Spreadsheets, group chats, paper sign-in sheets, scattered docs — Control Point
              replaces the chaos with a single source of truth for your team.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div key={f.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: (i % 3) * 0.08 }}>
                <div className="feature-card h-full">
                  <div className="mb-5 inline-flex rounded-2xl bg-accent/12 p-3">
                    <f.icon className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-display text-lg font-bold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="relative border-y border-text-base/[0.06] bg-secondary/40 py-24 sm:py-32 overflow-hidden">
        <div className="hero-glow absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
            <span className="eyebrow">Up and running fast</span>
            <h2 className="mt-5 font-display text-4xl sm:text-5xl font-bold tracking-tight">
              Live before your next <span className="text-accent">build session</span>
            </h2>
          </motion.div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <motion.div key={s.n} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.1 }}>
                <div className="relative h-full rounded-3xl border border-text-base/10 bg-primary/60 p-8">
                  <div className="font-display text-5xl font-bold text-accent/25">{s.n}</div>
                  <h3 className="mt-4 font-display text-xl font-bold">{s.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-text-muted">{s.body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 py-24">
        <motion.div {...fadeUp} className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-accent px-6 py-16 sm:px-16 sm:py-20 text-center">
          <div className="hero-grid absolute inset-0 opacity-[0.15]" style={{ filter: "invert(1)" }} />
          <div className="relative">
            <Bolt className="mx-auto w-10 h-10 text-accent-ink" strokeWidth={2.5} />
            <h2 className="mt-5 font-display text-4xl sm:text-5xl font-bold tracking-tight text-accent-ink">
              Ready to run your season?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] font-medium text-accent-ink/70">
              Set up your workspace today — free, fast, and built for teams that build robots.
            </p>
            <button
              onClick={onGetStarted}
              className="group mt-8 inline-flex items-center gap-2 rounded-2xl bg-accent-ink px-8 py-4 font-bold text-[15px] text-accent transition-all hover:scale-[1.03] active:scale-95"
            >
              Get started free
              <ArrowRight className="w-4.5 h-4.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* footer */}
      <footer className="border-t border-text-base/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 py-8">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-display font-bold">Control Point</span>
          </div>
          <p className="text-xs text-text-muted">Mission control for robotics teams.</p>
          <div className="flex items-center gap-5 text-xs text-text-muted">
            <a href="privacy" className="hover:text-text-base transition-colors">Privacy Policy</a>
            <a href="terms" className="hover:text-text-base transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
