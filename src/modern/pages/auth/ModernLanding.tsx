// Modern landing page (phase 9b). A different page from Classic, not a reskin:
// a sticky glass bar, a centred hero over a live "product window" (animated
// attendance ring, task progress, the next event and a cash-flow line), a
// bento grid of what's inside, a three-step timeline, an FAQ and a closing
// call to action. Same two exits as Classic: Sign in and Get started.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView } from 'motion/react';
import {
  ArrowRight, Bot, CalendarCheck, CalendarDays, CheckSquare, LineChart, MessageSquare, QrCode, ShieldCheck, Users, Wallet,
} from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button,
} from '../../../components/ui-kit';
import { BrandLogo } from '../../../components/BrandMark';
import { SignedOutModern } from '../../signedOut';

const ease = [0.2, 0.8, 0.2, 1] as const;
const inView = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, ease },
};

// ---------------------------------------------------------------------------
// Product window

function Ring({ value }: { value: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true });
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg ref={ref} viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden="true">
      <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-foreground/10" />
      <motion.circle
        cx="40" cy="40" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
        className="stroke-accent"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: seen ? c * (1 - value) : c }}
        transition={{ duration: 1.2, ease, delay: 0.3 }}
      />
    </svg>
  );
}

function MockTile({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease, delay: 0.5 + delay }}
      className={cn('min-w-0 rounded-xl border border-border bg-card p-4', className)}
    >
      {children}
    </motion.div>
  );
}

function ProductWindow() {
  const tasks = [
    { t: 'Tune arm PID', done: true },
    { t: 'Order mecanum wheels', done: true },
    { t: 'Engineering portfolio draft', done: false },
  ];
  return (
    <div className="relative mx-auto mt-14 max-w-5xl">
      <div aria-hidden="true" className="absolute -inset-x-6 -top-6 bottom-0 rounded-[2rem] bg-gradient-to-b from-accent/20 via-accent/5 to-transparent blur-2xl" />
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease, delay: 0.25 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        role="img"
        aria-label="A Control Point workspace: attendance, tasks, the next event and the budget"
      >
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-3" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="mx-auto hidden rounded-md bg-background px-3 py-1 text-[11px] text-muted-foreground sm:block">tryctrlpoint.org</span>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4" aria-hidden="true">
          <MockTile className="flex items-center gap-4">
            <div className="relative">
              <Ring value={0.86} />
              <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-semibold">86%</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Attendance</p>
              <p className="font-display text-lg font-semibold">This week</p>
              <p className="text-xs text-success">+6% vs last</p>
            </div>
          </MockTile>
          <MockTile delay={0.08} className="lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Build board</p>
              <p className="text-xs text-muted-foreground">2 of 3</p>
            </div>
            <ul className="mt-2 grid gap-1.5">
              {tasks.map((x, i) => (
                <motion.li
                  key={x.t}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className={cn('flex size-4 shrink-0 items-center justify-center rounded border', x.done ? 'border-accent bg-accent text-accent-ink' : 'border-input')}>
                    {x.done && <svg viewBox="0 0 12 12" className="size-3"><path d="M2.5 6.5l2 2 5-5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}
                  </span>
                  <span className={cn('truncate', x.done && 'text-muted-foreground line-through')}>{x.t}</span>
                </motion.li>
              ))}
            </ul>
          </MockTile>
          <MockTile delay={0.16} className="sm:col-span-2 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Next up</p>
            <p className="mt-1 font-display text-lg font-semibold leading-tight">League meet #3</p>
            <p className="mt-1 text-xs text-muted-foreground">Sat · 8:00 AM</p>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
              <CalendarDays className="size-3" /> 4 days
            </span>
          </MockTile>
          <MockTile delay={0.24} className="sm:col-span-2 lg:col-span-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Net balance</p>
                <p className="font-display text-2xl font-semibold tabular-nums">$2,480</p>
              </div>
              <p className="text-xs text-muted-foreground">Last 6 months</p>
            </div>
            <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="mt-3 h-14 w-full">
              <defs>
                <linearGradient id="lp-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                </linearGradient>
                {/* Drawn left to right by widening a clip (works with the non-scaling stroke). */}
                <clipPath id="lp-reveal">
                  <motion.rect x="0" y="0" height="60" initial={{ width: 0 }} animate={{ width: 300 }} transition={{ duration: 1.4, ease, delay: 0.9 }} />
                </clipPath>
              </defs>
              <g clipPath="url(#lp-reveal)">
                <path d="M0 48 L50 40 L100 44 L150 28 L200 32 L250 16 L300 10 L300 60 L0 60 Z" fill="url(#lp-fill)" />
                <path d="M0 48 L50 40 L100 44 L150 28 L200 32 L250 16 L300 10" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </g>
            </svg>
          </MockTile>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bento

const BENTO = [
  { icon: QrCode, title: 'Scan-in attendance', body: 'Put a QR code on the screen at practice. Members scan it with their phone, and trends build up all season.', span: 'lg:col-span-2' },
  { icon: CheckSquare, title: 'Task boards', body: 'Assign build work, set due dates and see what is blocked.' },
  { icon: LineChart, title: 'Scouting', body: 'OPR, match predictions and alliance shortlists from live FTC data.' },
  { icon: Wallet, title: 'Budget and inventory', body: 'Dues, sponsors, spending and parts, all in one ledger.' },
  { icon: MessageSquare, title: 'Team chat', body: 'Channels, @mentions and announcements, so updates stop getting lost in group texts.' },
  { icon: Bot, title: 'Bruno, your AI helper', body: 'Ask about your schedule, tasks or rules. Bruno knows your workspace.', span: 'lg:col-span-2' },
  { icon: CalendarDays, title: 'Shared calendar', body: 'Practices, meets and deadlines on one calendar the whole team actually checks.', span: 'lg:col-span-2' },
  { icon: ShieldCheck, title: 'Roles that fit', body: 'Captains, mentors and members each see and do exactly what their role allows.', span: 'lg:col-span-2' },
];

function Bento() {
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {BENTO.map((b, i) => (
        <motion.div
          key={b.title}
          {...inView}
          transition={{ ...inView.transition, delay: (i % 4) * 0.06 }}
          whileHover={{ y: -3 }}
          className={cn('group relative overflow-hidden rounded-2xl border border-border bg-card p-6', b.span)}
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
          <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background">
            <b.icon className="size-5 text-accent" />
          </span>
          <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">{b.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps

const STEPS = [
  { icon: Users, title: 'Create your workspace', body: 'Sign up as the team admin. Your FTC number fills in the team name.' },
  { icon: QrCode, title: 'Share one code', body: 'Members join with your access code. You set their roles.' },
  { icon: CalendarCheck, title: 'Run your season', body: 'Practices, tasks, scouting and money, all in one place.' },
];

function Steps() {
  return (
    <ol className="relative mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
      <motion.span
        aria-hidden="true"
        className="absolute left-5 top-5 hidden h-px origin-left bg-gradient-to-r from-accent via-accent/40 to-transparent md:block md:right-5"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease }}
      />
      {STEPS.map((s, i) => (
        <motion.li key={s.title} {...inView} transition={{ ...inView.transition, delay: 0.15 + i * 0.12 }} className="relative">
          <span className="relative z-10 inline-flex size-10 items-center justify-center rounded-full border border-accent/40 bg-background font-display text-sm font-semibold text-accent">
            {i + 1}
          </span>
          <h3 className="mt-4 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
            <s.icon className="size-4 text-muted-foreground" /> {s.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
        </motion.li>
      ))}
    </ol>
  );
}

const FAQ = [
  { q: 'Who is Control Point for?', a: 'Robotics teams, built around FIRST Tech Challenge. Admins (coaches, mentors or captains) create the workspace, and members join with a code.' },
  { q: 'Do members need their own accounts?', a: 'Yes. Each person signs up (with email, or a Google, Discord or GitHub account where available) and joins your workspace with the access code. Their role decides what they can see and change.' },
  { q: 'Does it work on phones?', a: 'Yes. Every screen works on a phone, including QR check-in and the task board.' },
  { q: 'Can I keep the look I am used to?', a: 'Yes. Control Point has a Classic look and this Modern one. You can switch any time in Settings, and your choice is saved to your account.' },
];

// ---------------------------------------------------------------------------

function useScrolled() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return scrolled;
}

export function ModernLanding({ onSignIn, onGetStarted, onClassic }: { onSignIn: () => void; onGetStarted: () => void; onClassic: () => void }) {
  const scrolled = useScrolled();
  return (
    <SignedOutModern>
      <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
        <header className={cn('fixed inset-x-0 top-0 z-40 border-b transition-colors', scrolled ? 'border-border bg-background/80 backdrop-blur-lg' : 'border-transparent')}>
          <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6" aria-label="Main">
            <a href="#top" className="flex min-h-11 items-center gap-2.5">
              <BrandLogo className="size-8 rounded-lg" />
              <span className="font-display text-base font-semibold tracking-tight">Control Point</span>
            </a>
            <div className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
              <a href="#features" className="rounded-lg px-3 py-2 hover:text-foreground">Features</a>
              <a href="#how" className="rounded-lg px-3 py-2 hover:text-foreground">How it works</a>
              <a href="#faq" className="rounded-lg px-3 py-2 hover:text-foreground">FAQ</a>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" onClick={onSignIn} className="h-11">Sign in</Button>
              <Button onClick={onGetStarted} className="h-11 max-[360px]:px-3">Get started</Button>
            </div>
          </nav>
        </header>

        {/* The bar is fixed (body is the scroller here, so sticky would not hold). */}
        <main id="top" className="pt-16">
          <section className="relative px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] [background-image:linear-gradient(to_right,color-mix(in_srgb,var(--sh-foreground)_6%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_srgb,var(--sh-foreground)_6%,transparent)_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="relative mx-auto max-w-3xl text-center">
              <motion.a
                href="#features"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease }}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs text-muted-foreground hover:text-foreground"
              >
                <span className="size-1.5 rounded-full bg-success" /> Built for FIRST Tech Challenge teams <ArrowRight className="size-3.5" />
              </motion.a>
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease, delay: 0.05 }}
                className="mt-6 font-display text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-6xl"
              >
                Your whole team,{' '}
                <span className="bg-gradient-to-r from-accent to-sky-400 bg-clip-text text-transparent">one workspace.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease, delay: 0.12 }}
                className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg"
              >
                Attendance, tasks, scouting, budget and chat for your robotics team, so you can stop juggling six apps and spend the season building.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease, delay: 0.18 }}
                className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center"
              >
                <Button size="lg" onClick={onGetStarted} className="group h-12 px-6">
                  Create your workspace <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button size="lg" variant="outline" onClick={onSignIn} className="h-12 px-6">I have an account</Button>
              </motion.div>
            </div>
            <ProductWindow />
          </section>

          <section id="features" className="scroll-mt-20 border-t border-border px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-6xl">
              <motion.div {...inView} className="max-w-2xl">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">What's inside</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Everything a season needs</h2>
                <p className="mt-3 text-muted-foreground">One place for the spreadsheets, group chats, paper sign-in sheets and scattered docs.</p>
              </motion.div>
              <Bento />
            </div>
          </section>

          <section id="how" className="scroll-mt-20 border-t border-border bg-muted/40 px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-6xl">
              <motion.div {...inView} className="max-w-2xl">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">How it works</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Up and running before practice</h2>
              </motion.div>
              <Steps />
            </div>
          </section>

          <section id="faq" className="scroll-mt-20 border-t border-border px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.4fr]">
              <motion.div {...inView}>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-accent">FAQ</p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Questions, answered</h2>
              </motion.div>
              <motion.div {...inView} transition={{ ...inView.transition, delay: 0.08 }}>
                <Accordion type="single" collapsible className="w-full">
                  {FAQ.map((f) => (
                    <AccordionItem key={f.q} value={f.q}>
                      <AccordionTrigger className="min-h-11 text-left">{f.q}</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </motion.div>
            </div>
          </section>

          <section className="px-4 pb-20 sm:px-6">
            <motion.div {...inView} className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border bg-card px-6 py-14 text-center sm:px-12">
              <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
              <h2 className="relative font-display text-3xl font-semibold tracking-tight sm:text-4xl">Ready for your season?</h2>
              <p className="relative mx-auto mt-3 max-w-md text-muted-foreground">Set up your workspace in a couple of minutes. It's free.</p>
              <Button size="lg" onClick={onGetStarted} className="relative mt-7 h-12 px-6">Get started <ArrowRight /></Button>
            </motion.div>
          </section>
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
            <span className="flex items-center gap-2"><BrandLogo className="size-5 rounded" /> Control Point · Mission control for robotics teams</span>
            <nav className="flex flex-wrap items-center justify-center gap-x-4" aria-label="Footer">
              <a href="/privacy" className="inline-flex min-h-11 items-center hover:text-foreground">Privacy</a>
              <a href="/terms" className="inline-flex min-h-11 items-center hover:text-foreground">Terms</a>
              <button type="button" onClick={onClassic} className="inline-flex min-h-11 items-center hover:text-foreground">Use the Classic look</button>
            </nav>
          </div>
        </footer>
      </div>
    </SignedOutModern>
  );
}
