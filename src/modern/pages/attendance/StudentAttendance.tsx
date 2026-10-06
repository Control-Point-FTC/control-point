// Member attendance (no `attendance` scope): a check-in card (scan the
// projected QR or type the day code), personal stats and history.
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarCheck, Camera, CheckCircle2, Loader2, ScanLine } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Button, Card, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label,
} from '../../../components/ui-kit';
import { parseLocalDate, useStudentCheckin } from '../../../components/attendance/useAttendanceController';
import { useQrScanner } from '../../../components/attendance/useQrScanner';
import { Page, PageHeader, Section, EmptyState } from '../../ui/page';
import { AnimatedValue } from '../../AnimatedValue';
import { StatusPill } from './status';

function Scanner({ onToken }: { onToken: (t: string) => void }) {
  const error = useQrScanner('m-qr-reader', onToken);
  return error ? (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Camera className="size-10 text-muted-foreground" />
      <p className="text-sm">{error}</p>
    </div>
  ) : (
    <div id="m-qr-reader" className="aspect-square w-full overflow-hidden rounded-xl bg-black" />
  );
}

export function StudentAttendance({ attendance, currentUser, refresh, onRefresh }: any) {
  const s = useStudentCheckin({ attendance, currentUser, refresh, onRefresh });
  const [scanOpen, setScanOpen] = useState(false);

  const stats = useMemo(() => {
    const marked = s.myRecords.filter((r: any) => r.status && r.status !== '-');
    const here = marked.filter((r: any) => r.status === 'P' || r.status === 'L').length;
    let streak = 0;
    for (const r of marked) { if (r.status === 'P' || r.status === 'L') streak++; else break; }
    return { rate: marked.length ? Math.round((here / marked.length) * 100) : null, here, total: marked.length, streak };
  }, [s.myRecords]);

  const months = useMemo(() => {
    const out: { label: string; items: any[] }[] = [];
    for (const r of s.myRecords.slice(0, 60)) {
      const label = parseLocalDate(r.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(r); else out.push({ label, items: [r] });
    }
    return out;
  }, [s.myRecords]);

  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Page className="max-w-[880px]">
      <PageHeader eyebrow={todayLabel} title="Attendance" description="Check in when you arrive, and keep an eye on your record." />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Card className={cn('relative mb-8 overflow-hidden p-6 sm:p-8', s.checkedIn && 'border-success/40')}>
          <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent/10 blur-3xl" />
          {s.checkedIn ? (
            <div className="relative flex items-center gap-4">
              <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-success/15 text-success">
                <CheckCircle2 className="size-7" />
              </motion.span>
              <div>
                <p className="text-lg font-semibold">You’re checked in</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">Today · <StatusPill status={s.todayRecord?.status} /></p>
              </div>
            </div>
          ) : (
            <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="text-lg font-semibold">Not checked in yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Scan the QR your admin is projecting, or type today’s code.</p>
                <form
                  className="mt-5 flex max-w-sm items-end gap-2"
                  onSubmit={(e) => { e.preventDefault(); void s.submitCode(); }}
                >
                  <div className="grid flex-1 gap-1.5">
                    <Label htmlFor="day-code" className="text-xs text-muted-foreground">Day code</Label>
                    <Input
                      id="day-code"
                      value={s.code}
                      onChange={(e) => s.setCode(e.target.value)}
                      autoComplete="off"
                      inputMode="text"
                      placeholder="ABC123"
                      className="h-11 font-mono text-lg uppercase tracking-[0.3em]"
                    />
                  </div>
                  <Button type="submit" variant="outline" className="h-11" disabled={s.codeBusy || !s.code.trim()}>
                    {s.codeBusy ? <Loader2 className="animate-spin" /> : 'Check in'}
                  </Button>
                </form>
              </div>
              <Button size="lg" className="h-12 px-6" onClick={() => setScanOpen(true)}><ScanLine /> Scan QR</Button>
            </div>
          )}
        </Card>
      </motion.div>

      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { label: 'Attendance', value: stats.rate == null ? '—' : `${stats.rate}%`, hint: stats.total ? `${stats.here} of ${stats.total} days` : 'No records yet' },
          { label: 'Streak', value: stats.streak, hint: 'days in a row' },
          { label: 'Checked in', value: stats.here, hint: 'this season' },
        ].map((it) => (
          <div key={it.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{it.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums"><AnimatedValue value={it.value} /></p>
            <p className="truncate text-xs text-muted-foreground">{it.hint}</p>
          </div>
        ))}
      </div>

      <Section title="My history">
        {months.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="No attendance records yet" description="Your check-ins will show up here." />
        ) : (
          <div className="space-y-6">
            {months.map((g) => (
              <div key={g.label}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{g.label}</p>
                <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                  {g.items.map((r: any) => (
                    <li key={r.date} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-sm">{parseLocalDate(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <StatusPill status={r.status} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan the check-in QR</DialogTitle>
            <DialogDescription>Point your camera at the code your admin is projecting.</DialogDescription>
          </DialogHeader>
          {scanOpen && <Scanner onToken={(t) => { setScanOpen(false); void s.checkinWithToken(t); }} />}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
